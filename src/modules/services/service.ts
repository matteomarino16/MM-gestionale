import type { Prisma, ServiceStatus, ServiceType } from "@/generated/prisma/client";
import { DomainError } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import type { Db, DbTx } from "@/lib/db/client";
import { paged, type ListParams } from "@/lib/list-params";
import { addDays, civilFromDb, civilToDb, type CivilDate } from "@/lib/timezone/civil-date";
import type { ServiceInput } from "./schema";

export const SERVICE_SORTS = ["expiry", "name", "client", "price"] as const;
export type ServiceSort = (typeof SERVICE_SORTS)[number];

const OPEN_RENEWAL: Prisma.ServiceRenewalWhereInput = { status: { notIn: ["COMPLETED", "CANCELLED"] } };

function toData(input: ServiceInput) {
  return {
    ...input,
    startDate: input.startDate ? civilToDb(input.startDate) : null,
    expiryDate: input.expiryDate ? civilToDb(input.expiryDate) : null,
  };
}

/** Un servizio ha un ciclo di rinnovo aperto se è attivo, ricorrente e con scadenza. */
function needsOpenCycle(s: { status: ServiceStatus; frequency: string; expiryDate: Date | null }): boolean {
  return s.status === "ACTIVE" && s.frequency !== "NONE" && s.expiryDate !== null;
}

async function lockService(tx: DbTx, id: string) {
  // Serializza le modifiche concorrenti allo stesso servizio (creazione cicli, cambi di scadenza).
  await tx.$queryRaw`SELECT id FROM "Service" WHERE id = ${id}::uuid FOR UPDATE`;
}

async function assertClientUsable(tx: DbTx, clientId: string, currentClientId?: string) {
  const client = await tx.client.findUnique({ where: { id: clientId }, select: { status: true } });
  if (!client) throw new DomainError("Cliente non trovato.", { clientId: ["Cliente non trovato"] });
  if (client.status === "ARCHIVED" && clientId !== currentClientId) {
    throw new DomainError("Il cliente è archiviato: ripristinalo prima di associargli servizi.", { clientId: ["Cliente archiviato"] });
  }
}

async function assertProviderUsable(tx: DbTx, providerId: string | null, currentProviderId?: string | null) {
  if (!providerId) return;
  const p = await tx.provider.findUnique({ where: { id: providerId }, select: { active: true } });
  if (!p) throw new DomainError("Fornitore non trovato.", { providerId: ["Fornitore non trovato"] });
  if (!p.active && providerId !== currentProviderId) {
    throw new DomainError("Il fornitore è disattivato.", { providerId: ["Fornitore disattivato"] });
  }
}

export async function createService(db: Db, userId: string, input: ServiceInput) {
  return db.$transaction(async (tx) => {
    await assertClientUsable(tx, input.clientId);
    await assertProviderUsable(tx, input.providerId);
    const service = await tx.service.create({ data: toData(input) });
    if (needsOpenCycle(service)) {
      await tx.serviceRenewal.create({
        data: {
          serviceId: service.id,
          cycleNumber: 1,
          expiryDate: service.expiryDate!,
          expectedProviderCost: service.providerCost,
          clientPrice: service.clientPrice,
        },
      });
    }
    await audit(tx, {
      userId,
      action: "service.created",
      entityType: "Service",
      entityId: service.id,
      summary: `Servizio creato: ${service.name}`,
    });
    return service;
  });
}

export async function updateService(db: Db, userId: string, id: string, input: ServiceInput) {
  return db.$transaction(async (tx) => {
    await lockService(tx, id);
    const before = await tx.service.findUnique({ where: { id } });
    if (!before) throw new DomainError("Servizio non trovato.");

    if (input.clientId !== before.clientId) {
      const [receivables, completed] = await Promise.all([
        tx.receivable.count({ where: { OR: [{ serviceId: id }, { renewal: { serviceId: id } }] } }),
        tx.serviceRenewal.count({ where: { serviceId: id, status: "COMPLETED" } }),
      ]);
      if (receivables > 0 || completed > 0) {
        throw new DomainError("Il servizio ha già rinnovi o crediti registrati: non è possibile cambiarne il cliente.", {
          clientId: ["Non modificabile"],
        });
      }
    }
    await assertClientUsable(tx, input.clientId, before.clientId);
    await assertProviderUsable(tx, input.providerId, before.providerId);

    const service = await tx.service.update({ where: { id }, data: toData(input) });
    const open = await tx.serviceRenewal.findFirst({ where: { serviceId: id, ...OPEN_RENEWAL } });
    const notes: string[] = [];

    if (needsOpenCycle(service)) {
      if (open) {
        const data: Prisma.ServiceRenewalUpdateInput = {};
        if (open.expiryDate.getTime() !== service.expiryDate!.getTime()) {
          // La revisione invalida i promemoria calcolati sulla scadenza precedente.
          data.expiryDate = service.expiryDate!;
          data.deadlineRevision = { increment: 1 };
          notes.push(`scadenza del rinnovo spostata al ${civilFromDb(service.expiryDate!)}`);
        }
        if (open.status === "PLANNED") {
          data.expectedProviderCost = service.providerCost;
          data.clientPrice = service.clientPrice;
        }
        if (Object.keys(data).length) await tx.serviceRenewal.update({ where: { id: open.id }, data });
      } else {
        const last = await tx.serviceRenewal.aggregate({ where: { serviceId: id }, _max: { cycleNumber: true } });
        await tx.serviceRenewal.create({
          data: {
            serviceId: id,
            cycleNumber: (last._max.cycleNumber ?? 0) + 1,
            expiryDate: service.expiryDate!,
            expectedProviderCost: service.providerCost,
            clientPrice: service.clientPrice,
          },
        });
        notes.push("aperto un nuovo ciclo di rinnovo");
      }
    } else if (open) {
      await tx.serviceRenewal.update({
        where: { id: open.id },
        data: { status: "CANCELLED", cancelledAt: new Date(), notes: appendNote(open.notes, "Annullato per modifica del servizio") },
      });
      notes.push("annullato il ciclo di rinnovo aperto");
    }

    await audit(tx, {
      userId,
      action: "service.updated",
      entityType: "Service",
      entityId: id,
      summary: ["Servizio modificato", ...notes].join(": "),
    });
    return service;
  });
}

function appendNote(existing: string | null, note: string) {
  return existing ? `${existing}\n${note}` : note;
}

/** Annulla il servizio e l'eventuale ciclo di rinnovo aperto; lo storico resta. */
export async function cancelService(db: Db, userId: string, id: string) {
  await db.$transaction(async (tx) => {
    await lockService(tx, id);
    const s = await tx.service.findUnique({ where: { id }, select: { status: true, name: true } });
    if (!s) throw new DomainError("Servizio non trovato.");
    if (s.status === "CANCELLED") return;
    await tx.service.update({ where: { id }, data: { status: "CANCELLED" } });
    const res = await tx.serviceRenewal.updateMany({
      where: { serviceId: id, ...OPEN_RENEWAL },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await audit(tx, {
      userId,
      action: "service.cancelled",
      entityType: "Service",
      entityId: id,
      summary: res.count ? "Servizio annullato (annullato anche il rinnovo aperto)" : "Servizio annullato",
    });
  });
}

export type ServiceFilters = {
  status?: ServiceStatus | "ALL";
  type?: ServiceType;
  clientId?: string;
  providerId?: string;
  /** Solo servizi attivi con scadenza entro N giorni (incluse quelle passate). */
  expiringWithinDays?: number;
  today?: CivilDate;
};

export function serviceSearchWhere(q: string): Prisma.ServiceWhereInput {
  const contains = { contains: q, mode: "insensitive" as const };
  return {
    OR: [
      { name: contains },
      { domain: contains },
      { description: contains },
      { providerRef: contains },
      { client: { displayName: contains } },
      { provider: { name: contains } },
    ],
  };
}

export async function listServices(db: DbTx, params: ListParams<ServiceSort>, filters: ServiceFilters = {}) {
  const status = filters.status ?? "ACTIVE";
  const where: Prisma.ServiceWhereInput = {
    ...(status !== "ALL" ? { status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.providerId ? { providerId: filters.providerId } : {}),
    ...(filters.expiringWithinDays !== undefined && filters.today
      ? { status: "ACTIVE", expiryDate: { not: null, lte: civilToDb(addDays(filters.today, filters.expiringWithinDays)) } }
      : {}),
    ...(params.q ? serviceSearchWhere(params.q) : {}),
  };
  const orderBy: Prisma.ServiceOrderByWithRelationInput[] =
    params.sort === "name"
      ? [{ name: params.dir }]
      : params.sort === "client"
        ? [{ client: { displayName: params.dir } }, { name: "asc" }]
        : params.sort === "price"
          ? [{ clientPrice: params.dir }, { name: "asc" }]
          : [{ expiryDate: { sort: params.dir, nulls: "last" } }, { name: "asc" }];

  const [total, items] = await Promise.all([
    db.service.count({ where }),
    db.service.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        client: { select: { id: true, displayName: true } },
        provider: { select: { id: true, name: true } },
      },
    }),
  ]);
  return paged(items, total, params.page, params.pageSize);
}

export async function getServiceDetail(db: DbTx, id: string) {
  const service = await db.service.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, displayName: true, status: true } },
      provider: { select: { id: true, name: true } },
      renewals: { orderBy: { cycleNumber: "desc" } },
    },
  });
  if (!service) return null;
  const [receivables, payables, documents, history] = await Promise.all([
    db.receivable.findMany({
      where: { OR: [{ serviceId: id }, { renewal: { serviceId: id } }] },
      orderBy: [{ dueDate: { sort: "desc", nulls: "last" } }],
    }),
    db.payable.findMany({
      where: { OR: [{ serviceId: id }, { renewal: { serviceId: id } }] },
      orderBy: [{ dueDate: { sort: "desc", nulls: "last" } }],
      include: { provider: { select: { name: true } } },
    }),
    db.document.findMany({ where: { serviceId: id, deletedAt: null }, orderBy: { createdAt: "desc" } }),
    db.auditLog.findMany({ where: { entityType: "Service", entityId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return { service, receivables, payables, documents, history };
}
