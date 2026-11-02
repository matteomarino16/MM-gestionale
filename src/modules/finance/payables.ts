import { Decimal } from "decimal.js";
import { DomainError } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { payableAmounts, settlementStatus } from "@/lib/calculations/amounts";
import type { Db, DbTx } from "@/lib/db/client";
import { formatMoney } from "@/lib/format";
import { civilToDb } from "@/lib/timezone/civil-date";
import type { PayableInput } from "./schema";
import { lockPayable, recomputePayable } from "./settlement";

async function resolveLinks(tx: DbTx, input: PayableInput) {
  let serviceId = input.serviceId;
  if (input.renewalId) {
    const renewal = await tx.serviceRenewal.findUnique({ where: { id: input.renewalId }, select: { serviceId: true } });
    if (!renewal) throw new DomainError("Rinnovo non trovato.", { renewalId: ["Rinnovo non trovato"] });
    if (serviceId && serviceId !== renewal.serviceId) {
      throw new DomainError("Il rinnovo non appartiene al servizio selezionato.", { renewalId: ["Non coerente con il servizio"] });
    }
    serviceId = renewal.serviceId;
  }
  if (serviceId && !(await tx.service.findUnique({ where: { id: serviceId }, select: { id: true } }))) {
    throw new DomainError("Servizio non trovato.", { serviceId: ["Servizio non trovato"] });
  }
  if (input.providerId && !(await tx.provider.findUnique({ where: { id: input.providerId }, select: { id: true } }))) {
    throw new DomainError("Fornitore non trovato.", { providerId: ["Fornitore non trovato"] });
  }
  if (input.categoryId && !(await tx.expenseCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } }))) {
    throw new DomainError("Categoria non trovata.", { categoryId: ["Categoria non trovata"] });
  }
  if (!input.providerId && !serviceId && !input.categoryId) {
    throw new DomainError("Indica almeno fornitore, servizio o categoria di costo.", { providerId: ["Obbligatorio se mancano servizio e categoria"] });
  }
  return { serviceId, renewalId: input.renewalId, projectId: input.projectId, providerId: input.providerId, categoryId: input.categoryId };
}

function data(input: PayableInput, links: Awaited<ReturnType<typeof resolveLinks>>) {
  return {
    ...links,
    description: input.description,
    expectedAmount: input.expectedAmount,
    actualAmount: input.actualAmount,
    vatRate: input.vatRate,
    ...payableAmounts(input.expectedAmount, input.actualAmount, input.vatRate),
    dueDate: input.dueDate ? civilToDb(input.dueDate) : null,
    notes: input.notes,
  };
}

export async function createPayable(db: Db, userId: string, input: PayableInput) {
  return db.$transaction(async (tx) => {
    const p = await tx.payable.create({ data: data(input, await resolveLinks(tx, input)) });
    await audit(tx, {
      userId,
      action: "payable.created",
      entityType: "Payable",
      entityId: p.id,
      summary: `Costo registrato: ${p.description} (${formatMoney(p.amountDue)})`,
      data: { providerId: p.providerId, serviceId: p.serviceId },
    });
    return p;
  });
}

export async function updatePayable(db: Db, userId: string, id: string, input: PayableInput) {
  return db.$transaction(async (tx) => {
    await lockPayable(tx, id);
    const before = await tx.payable.findUniqueOrThrow({ where: { id } });
    if (before.status === "CANCELLED") throw new DomainError("Il costo è annullato: ripristinalo per modificarlo.");
    const next = data(input, await resolveLinks(tx, input));
    const paid = new Decimal(before.paidAmount.toString());
    if (paid.greaterThan(next.amountDue)) {
      throw new DomainError(`Il nuovo importo dovuto è inferiore a quanto già pagato (${formatMoney(paid.toFixed(2))}).`, {
        expectedAmount: ["Inferiore al già pagato"],
      });
    }
    // Lo stato va aggiornato nello stesso UPDATE: i vincoli CHECK legano stato, pagato e dovuto.
    await tx.payable.update({ where: { id }, data: { ...next, status: settlementStatus(next.amountDue, paid) } });
    const p = await recomputePayable(tx, id);
    await audit(tx, { userId, action: "payable.updated", entityType: "Payable", entityId: id, summary: "Costo modificato", data: { providerId: p.providerId, serviceId: p.serviceId } });
    return p;
  });
}

export async function cancelPayable(db: Db, userId: string, id: string) {
  await db.$transaction(async (tx) => {
    await lockPayable(tx, id);
    const p = await tx.payable.findUniqueOrThrow({ where: { id } });
    if (p.status === "CANCELLED") return;
    if (new Decimal(p.paidAmount.toString()).greaterThan(0)) {
      throw new DomainError("Il costo ha pagamenti registrati: stornali prima di annullarlo.");
    }
    await tx.payable.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await audit(tx, { userId, action: "payable.cancelled", entityType: "Payable", entityId: id, summary: `Costo annullato: ${p.description}` });
  });
}

export async function restorePayable(db: Db, userId: string, id: string) {
  await db.$transaction(async (tx) => {
    await lockPayable(tx, id);
    const p = await tx.payable.findUniqueOrThrow({ where: { id } });
    if (p.status !== "CANCELLED") return;
    await tx.payable.update({ where: { id }, data: { status: "OPEN", cancelledAt: null } });
    await recomputePayable(tx, id);
    await audit(tx, { userId, action: "payable.restored", entityType: "Payable", entityId: id, summary: `Costo ripristinato: ${p.description}` });
  });
}

export async function getPayableDetail(db: DbTx, id: string) {
  const payable = await db.payable.findUnique({
    where: { id },
    include: {
      provider: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, client: { select: { id: true, displayName: true } } } },
      renewal: { select: { id: true, cycleNumber: true, expiryDate: true, status: true } },
      category: { select: { id: true, name: true } },
      payments: { orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }] },
    },
  });
  if (!payable) return null;
  const history = await db.auditLog.findMany({
    where: { OR: [{ entityType: "Payable", entityId: id }, { entityType: "Payment", entityId: { in: payable.payments.map((p) => p.id) } }] },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return { payable, history };
}
