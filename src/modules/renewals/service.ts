import { Decimal } from "decimal.js";
import type { Prisma, RenewalStatus, SettlementStatus } from "@/generated/prisma/client";
import { DomainError } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { nextExpiry } from "@/lib/calculations/renewal-period";
import type { Db, DbTx } from "@/lib/db/client";
import { formatCivilDate } from "@/lib/format";
import { RENEWAL_STATUS_LABELS } from "@/lib/labels";
import { paged, type ListParams } from "@/lib/list-params";
import { addDays, civilFromDb, civilToDb, compareCivil, type CivilDate } from "@/lib/timezone/civil-date";
import type { CompleteRenewalInput, RenewalDetailsInput } from "./schema";

const FINAL: RenewalStatus[] = ["COMPLETED", "CANCELLED"];

async function lockRenewal(tx: DbTx, id: string) {
  const r = await tx.serviceRenewal.findUnique({ where: { id }, select: { serviceId: true } });
  if (!r) throw new DomainError("Rinnovo non trovato.");
  // Lock sul servizio: serializza completamenti, modifiche del servizio e creazione dei cicli.
  await tx.$queryRaw`SELECT id FROM "Service" WHERE id = ${r.serviceId}::uuid FOR UPDATE`;
  return tx.serviceRenewal.findUniqueOrThrow({ where: { id }, include: { service: true } });
}

function assertOpen(status: RenewalStatus) {
  if (FINAL.includes(status)) throw new DomainError("Il rinnovo è già chiuso: lo storico non si modifica.");
}

/** Aggiorna lo stato operativo (richiesto al cliente, pagato al fornitore, …). Non completa mai il rinnovo. */
export async function setRenewalStatus(db: Db, userId: string, id: string, status: RenewalStatus) {
  if (FINAL.includes(status)) throw new DomainError("Usa le azioni dedicate per completare o annullare il rinnovo.");
  await db.$transaction(async (tx) => {
    const r = await lockRenewal(tx, id);
    assertOpen(r.status);
    if (r.status === status) return;
    await tx.serviceRenewal.update({ where: { id }, data: { status } });
    await audit(tx, {
      userId,
      action: "renewal.status_changed",
      entityType: "Service",
      entityId: r.serviceId,
      summary: `Rinnovo #${r.cycleNumber}: ${RENEWAL_STATUS_LABELS[r.status]} → ${RENEWAL_STATUS_LABELS[status]}`,
      data: { renewalId: id },
    });
  });
}

export async function updateRenewalDetails(db: Db, userId: string, input: RenewalDetailsInput) {
  await db.$transaction(async (tx) => {
    const r = await lockRenewal(tx, input.id);
    assertOpen(r.status);
    await tx.serviceRenewal.update({
      where: { id: input.id },
      data: {
        plannedRenewalDate: input.plannedRenewalDate ? civilToDb(input.plannedRenewalDate) : null,
        ...(input.expectedProviderCost !== null ? { expectedProviderCost: input.expectedProviderCost } : {}),
        ...(input.clientPrice !== null ? { clientPrice: input.clientPrice } : {}),
        notes: input.notes,
      },
    });
    await audit(tx, { userId, action: "renewal.updated", entityType: "Service", entityId: r.serviceId, summary: `Rinnovo #${r.cycleNumber} aggiornato`, data: { renewalId: input.id } });
  });
}

/**
 * Conferma esplicita del rinnovo presso il fornitore: chiude il ciclo (che resta nello
 * storico), aggiorna la scadenza del servizio e apre il ciclo successivo.
 */
export async function completeRenewal(db: Db, userId: string, input: CompleteRenewalInput, today: CivilDate) {
  return db.$transaction(async (tx) => {
    const r = await lockRenewal(tx, input.id);
    assertOpen(r.status);
    if (compareCivil(input.renewedAt, today) > 0) {
      throw new DomainError("La data del rinnovo non può essere futura.", { renewedAt: ["Data futura"] });
    }
    const currentExpiry = civilFromDb(r.expiryDate);
    if (compareCivil(input.newExpiryDate, currentExpiry) <= 0) {
      throw new DomainError("La nuova scadenza deve essere successiva a quella attuale.", { newExpiryDate: ["Deve essere dopo il " + formatCivilDate(r.expiryDate)] });
    }

    await tx.serviceRenewal.update({
      where: { id: r.id },
      data: {
        status: "COMPLETED",
        renewedAt: civilToDb(input.renewedAt),
        newExpiryDate: civilToDb(input.newExpiryDate),
        actualProviderCost: input.actualProviderCost ?? r.actualProviderCost,
        notes: input.notes ?? r.notes,
      },
    });

    const reactivate = r.service.status === "EXPIRED";
    const service = await tx.service.update({
      where: { id: r.serviceId },
      data: { expiryDate: civilToDb(input.newExpiryDate), ...(reactivate ? { status: "ACTIVE" } : {}) },
    });

    let next: { id: string } | null = null;
    if (service.status === "ACTIVE" && service.frequency !== "NONE") {
      next = await tx.serviceRenewal.create({
        data: {
          serviceId: service.id,
          cycleNumber: r.cycleNumber + 1,
          expiryDate: civilToDb(input.newExpiryDate),
          expectedProviderCost: service.providerCost,
          clientPrice: service.clientPrice,
        },
        select: { id: true },
      });
    }

    await audit(tx, {
      userId,
      action: "renewal.completed",
      entityType: "Service",
      entityId: service.id,
      summary: `Rinnovo #${r.cycleNumber} completato: nuova scadenza ${formatCivilDate(input.newExpiryDate)}${next ? ` (aperto ciclo #${r.cycleNumber + 1})` : ""}`,
      data: { renewalId: r.id, nextRenewalId: next?.id ?? null },
    });
    return { nextRenewalId: next?.id ?? null };
  });
}

/** "Non rinnovare": il ciclo viene annullato e il servizio segnato come scaduto. */
export async function skipRenewal(db: Db, userId: string, id: string, reason: string | null) {
  await db.$transaction(async (tx) => {
    const r = await lockRenewal(tx, id);
    assertOpen(r.status);
    await tx.serviceRenewal.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), notes: reason ? (r.notes ? `${r.notes}\n${reason}` : reason) : r.notes },
    });
    await tx.service.update({ where: { id: r.serviceId }, data: { status: "EXPIRED" } });
    await audit(tx, {
      userId,
      action: "renewal.skipped",
      entityType: "Service",
      entityId: r.serviceId,
      summary: `Rinnovo #${r.cycleNumber} non effettuato: servizio segnato come scaduto${reason ? ` (${reason})` : ""}`,
      data: { renewalId: id },
    });
  });
}

/** Proposta per la nuova scadenza: un periodo dopo quella attuale. */
export function suggestedNewExpiry(expiry: Date, spec: Parameters<typeof nextExpiry>[1]): CivilDate | null {
  try {
    return nextExpiry(civilFromDb(expiry), spec);
  } catch {
    return null;
  }
}

// ───────────── Stato dei pagamenti collegati ─────────────

export type PaymentSide = { state: "NONE" | SettlementStatus; due: string; paid: string };

function side(rows: { status: SettlementStatus; amountDue: Prisma.Decimal; paidAmount: Prisma.Decimal }[]): PaymentSide {
  const active = rows.filter((r) => r.status !== "CANCELLED");
  if (active.length === 0) return { state: "NONE", due: "0.00", paid: "0.00" };
  const due = active.reduce((s, r) => s.plus(r.amountDue.toString()), new Decimal(0));
  const paid = active.reduce((s, r) => s.plus(r.paidAmount.toString()), new Decimal(0));
  const state: SettlementStatus = paid.isZero() ? "OPEN" : paid.greaterThanOrEqualTo(due) ? "PAID" : "PARTIAL";
  return { state, due: due.toFixed(2), paid: paid.toFixed(2) };
}

export const RENEWAL_SORTS = ["expiry", "service", "client"] as const;
export type RenewalSort = (typeof RENEWAL_SORTS)[number];

export type RenewalFilters = {
  view: "open" | "completed" | "cancelled" | "all";
  status?: RenewalStatus;
  clientId?: string;
  withinDays?: number;
  today: CivilDate;
};

export async function listRenewals(db: DbTx, params: ListParams<RenewalSort>, f: RenewalFilters) {
  const contains = params.q ? { contains: params.q, mode: "insensitive" as const } : undefined;
  const where: Prisma.ServiceRenewalWhereInput = {
    AND: [
      f.view === "open" ? { status: { notIn: FINAL } } : f.view === "completed" ? { status: "COMPLETED" } : f.view === "cancelled" ? { status: "CANCELLED" } : {},
      f.status ? { status: f.status } : {},
      f.clientId ? { service: { clientId: f.clientId } } : {},
      f.withinDays !== undefined ? { expiryDate: { lte: civilToDb(addDays(f.today, f.withinDays)) } } : {},
      contains ? { OR: [{ service: { name: contains } }, { service: { domain: contains } }, { service: { client: { displayName: contains } } }] } : {},
    ],
  };
  const orderBy: Prisma.ServiceRenewalOrderByWithRelationInput[] =
    params.sort === "service"
      ? [{ service: { name: params.dir } }]
      : params.sort === "client"
        ? [{ service: { client: { displayName: params.dir } } }, { expiryDate: "asc" }]
        : [{ expiryDate: params.dir }];

  const [total, rows] = await Promise.all([
    db.serviceRenewal.count({ where }),
    db.serviceRenewal.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        service: { select: { id: true, name: true, type: true, autoRenew: true, provider: { select: { name: true } }, client: { select: { id: true, displayName: true } } } },
        receivables: { select: { status: true, amountDue: true, paidAmount: true } },
        payables: { select: { status: true, amountDue: true, paidAmount: true } },
      },
    }),
  ]);
  return paged(
    rows.map(({ receivables, payables, ...r }) => ({ ...r, client: side(receivables), provider: side(payables) })),
    total,
    params.page,
    params.pageSize,
  );
}

export async function getRenewalDetail(db: DbTx, id: string) {
  const renewal = await db.serviceRenewal.findUnique({
    where: { id },
    include: {
      service: { include: { client: { select: { id: true, displayName: true } }, provider: { select: { id: true, name: true } } } },
      receivables: { orderBy: { createdAt: "desc" } },
      payables: { orderBy: { createdAt: "desc" }, include: { provider: { select: { name: true } } } },
    },
  });
  if (!renewal) return null;
  const [events, notifications, others] = await Promise.all([
    db.reminderEvent.findMany({
      where: { target: "RENEWAL", resourceId: id, channel: "DASHBOARD" },
      orderBy: { scheduledFor: "asc" },
      include: { rule: { select: { label: true } } },
    }),
    db.notification.findMany({ where: { renewalId: id }, orderBy: { createdAt: "desc" } }),
    db.serviceRenewal.findMany({ where: { serviceId: renewal.serviceId, id: { not: id } }, orderBy: { cycleNumber: "desc" } }),
  ]);
  return { renewal, client: side(renewal.receivables), provider: side(renewal.payables), events, notifications, others };
}
