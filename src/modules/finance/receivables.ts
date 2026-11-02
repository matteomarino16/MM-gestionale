import { Decimal } from "decimal.js";
import { DomainError } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { receivableAmounts, settlementStatus } from "@/lib/calculations/amounts";
import type { Db, DbTx } from "@/lib/db/client";
import { formatMoney } from "@/lib/format";
import { civilToDb } from "@/lib/timezone/civil-date";
import type { ReceivableInput } from "./schema";
import { lockReceivable, recomputeReceivable } from "./settlement";

/** Verifica che servizio, rinnovo e commessa appartengano al cliente; deduce il servizio dal rinnovo. */
async function resolveLinks(tx: DbTx, input: ReceivableInput) {
  let serviceId = input.serviceId;
  if (input.renewalId) {
    const renewal = await tx.serviceRenewal.findUnique({ where: { id: input.renewalId }, select: { serviceId: true } });
    if (!renewal) throw new DomainError("Rinnovo non trovato.", { renewalId: ["Rinnovo non trovato"] });
    if (serviceId && serviceId !== renewal.serviceId) {
      throw new DomainError("Il rinnovo non appartiene al servizio selezionato.", { renewalId: ["Non coerente con il servizio"] });
    }
    serviceId = renewal.serviceId;
  }
  if (serviceId) {
    const s = await tx.service.findUnique({ where: { id: serviceId }, select: { clientId: true } });
    if (!s) throw new DomainError("Servizio non trovato.", { serviceId: ["Servizio non trovato"] });
    if (s.clientId !== input.clientId) {
      throw new DomainError("Il servizio non appartiene al cliente selezionato.", { serviceId: ["Non coerente con il cliente"] });
    }
  }
  if (input.projectId) {
    const p = await tx.project.findUnique({ where: { id: input.projectId }, select: { clientId: true } });
    if (!p || p.clientId !== input.clientId) throw new DomainError("Commessa non valida per il cliente.", { projectId: ["Non valida"] });
  }
  const client = await tx.client.findUnique({ where: { id: input.clientId }, select: { id: true } });
  if (!client) throw new DomainError("Cliente non trovato.", { clientId: ["Cliente non trovato"] });
  return { serviceId, renewalId: input.renewalId, projectId: input.projectId };
}

function data(input: ReceivableInput, links: Awaited<ReturnType<typeof resolveLinks>>) {
  const amounts = receivableAmounts(input.netAmount, input.vatRate, input.withholdingRate);
  return {
    clientId: input.clientId,
    ...links,
    description: input.description,
    vatRate: input.vatRate,
    withholdingRate: input.withholdingRate,
    ...amounts,
    dueDate: input.dueDate ? civilToDb(input.dueDate) : null,
    notes: input.notes,
  };
}

export async function createReceivable(db: Db, userId: string, input: ReceivableInput) {
  return db.$transaction(async (tx) => {
    const links = await resolveLinks(tx, input);
    const r = await tx.receivable.create({ data: data(input, links) });
    await audit(tx, {
      userId,
      action: "receivable.created",
      entityType: "Receivable",
      entityId: r.id,
      summary: `Credito registrato: ${r.description} (${formatMoney(r.amountDue)})`,
      data: { clientId: r.clientId, serviceId: r.serviceId },
    });
    return r;
  });
}

export async function updateReceivable(db: Db, userId: string, id: string, input: ReceivableInput) {
  return db.$transaction(async (tx) => {
    await lockReceivable(tx, id);
    const before = await tx.receivable.findUniqueOrThrow({ where: { id } });
    if (before.status === "CANCELLED") throw new DomainError("Il credito è annullato: ripristinalo per modificarlo.");
    const paid = new Decimal(before.paidAmount.toString());
    if (paid.greaterThan(0) && input.clientId !== before.clientId) {
      throw new DomainError("Il credito ha già pagamenti: non è possibile cambiarne il cliente.", { clientId: ["Non modificabile"] });
    }
    const links = await resolveLinks(tx, input);
    const next = data(input, links);
    if (paid.greaterThan(next.amountDue)) {
      throw new DomainError(`Il nuovo importo dovuto è inferiore a quanto già incassato (${formatMoney(paid.toFixed(2))}).`, {
        netAmount: ["Inferiore al già incassato"],
      });
    }
    const dueChanged = (before.dueDate?.getTime() ?? null) !== (next.dueDate?.getTime() ?? null);
    await tx.receivable.update({
      where: { id },
      // Lo stato va aggiornato nello stesso UPDATE: i vincoli CHECK legano stato, pagato e dovuto.
      data: { ...next, status: settlementStatus(next.amountDue, paid), ...(dueChanged ? { deadlineRevision: { increment: 1 } } : {}) },
    });
    const r = await recomputeReceivable(tx, id);
    await audit(tx, {
      userId,
      action: "receivable.updated",
      entityType: "Receivable",
      entityId: id,
      summary: dueChanged ? "Credito modificato (scadenza aggiornata)" : "Credito modificato",
      data: { clientId: r.clientId, serviceId: r.serviceId },
    });
    return r;
  });
}

/** Annulla un credito senza incassi. Con incassi registrati occorre prima stornarli. */
export async function cancelReceivable(db: Db, userId: string, id: string) {
  await db.$transaction(async (tx) => {
    await lockReceivable(tx, id);
    const r = await tx.receivable.findUniqueOrThrow({ where: { id } });
    if (r.status === "CANCELLED") return;
    if (new Decimal(r.paidAmount.toString()).greaterThan(0)) {
      throw new DomainError("Il credito ha incassi registrati: stornali prima di annullarlo.");
    }
    await tx.receivable.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await audit(tx, { userId, action: "receivable.cancelled", entityType: "Receivable", entityId: id, summary: `Credito annullato: ${r.description}`, data: { clientId: r.clientId } });
  });
}

export async function restoreReceivable(db: Db, userId: string, id: string) {
  await db.$transaction(async (tx) => {
    await lockReceivable(tx, id);
    const r = await tx.receivable.findUniqueOrThrow({ where: { id } });
    if (r.status !== "CANCELLED") return;
    // Nuova revisione: i promemoria verranno ricalcolati da zero.
    await tx.receivable.update({ where: { id }, data: { status: "OPEN", cancelledAt: null, deadlineRevision: { increment: 1 } } });
    await recomputeReceivable(tx, id);
    await audit(tx, { userId, action: "receivable.restored", entityType: "Receivable", entityId: id, summary: `Credito ripristinato: ${r.description}`, data: { clientId: r.clientId } });
  });
}

export async function getReceivableDetail(db: DbTx, id: string) {
  const receivable = await db.receivable.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, displayName: true } },
      service: { select: { id: true, name: true } },
      renewal: { select: { id: true, cycleNumber: true, expiryDate: true, status: true } },
      project: { select: { id: true, title: true } },
      payments: { orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }] },
    },
  });
  if (!receivable) return null;
  const history = await db.auditLog.findMany({
    where: { OR: [{ entityType: "Receivable", entityId: id }, { entityType: "Payment", entityId: { in: receivable.payments.map((p) => p.id) } }] },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return { receivable, history };
}
