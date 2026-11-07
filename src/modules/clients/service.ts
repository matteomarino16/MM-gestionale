import { Decimal } from "decimal.js";
import type { ClientStatus, ClientType, Prisma } from "@/generated/prisma/client";
import { DomainError } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import type { Db, DbTx } from "@/lib/db/client";
import { paged, type ListParams, type Paged } from "@/lib/list-params";
import { computeDisplayName, type ClientInput } from "./schema";

export const CLIENT_SORTS = ["name", "city", "createdAt"] as const;
export type ClientSort = (typeof CLIENT_SORTS)[number];

function toData(input: ClientInput) {
  return { ...input, displayName: computeDisplayName(input) };
}

export async function createClient(db: Db, userId: string, input: ClientInput) {
  return db.$transaction(async (tx) => {
    const client = await tx.client.create({ data: toData(input) });
    await audit(tx, {
      userId,
      action: "client.created",
      entityType: "Client",
      entityId: client.id,
      summary: `Cliente creato: ${client.displayName}`,
    });
    return client;
  });
}

export async function updateClient(db: Db, userId: string, id: string, input: ClientInput) {
  return db.$transaction(async (tx) => {
    const before = await tx.client.findUnique({ where: { id } });
    if (!before) throw new DomainError("Cliente non trovato.");
    const client = await tx.client.update({ where: { id }, data: toData(input) });
    const changed = (Object.keys(input) as (keyof ClientInput)[]).filter((k) => before[k] !== client[k]);
    await audit(tx, {
      userId,
      action: "client.updated",
      entityType: "Client",
      entityId: id,
      summary: changed.length ? `Modificati: ${changed.join(", ")}` : "Nessuna modifica",
      data: { changed },
    });
    return client;
  });
}

export async function setClientArchived(db: Db, userId: string, id: string, archived: boolean) {
  return db.$transaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id }, select: { status: true, displayName: true } });
    if (!client) throw new DomainError("Cliente non trovato.");
    const target: ClientStatus = archived ? "ARCHIVED" : "ACTIVE";
    if (client.status === target) return;
    await tx.client.update({
      where: { id },
      data: { status: target, archivedAt: archived ? new Date() : null },
    });
    await audit(tx, {
      userId,
      action: archived ? "client.archived" : "client.restored",
      entityType: "Client",
      entityId: id,
      summary: archived ? "Cliente archiviato" : "Cliente ripristinato",
    });
  });
}

export type ClientFilters = { status?: ClientStatus | "ALL"; type?: ClientType };

export function clientSearchWhere(q: string): Prisma.ClientWhereInput {
  const contains = { contains: q, mode: "insensitive" as const };
  return {
    OR: [
      { displayName: contains },
      { firstName: contains },
      { lastName: contains },
      { companyName: contains },
      { email: contains },
      { pec: contains },
      { phone: contains },
      { vatNumber: contains },
      { taxCode: contains },
      { city: contains },
      { services: { some: { OR: [{ domain: contains }, { name: contains }] } } },
    ],
  };
}

export type ClientListItem = {
  id: string;
  displayName: string;
  type: ClientType;
  status: ClientStatus;
  email: string | null;
  phone: string | null;
  city: string | null;
  province: string | null;
  activeServices: number;
  outstanding: string;
  createdAt: Date;
};

export async function listClients(
  db: DbTx,
  params: ListParams<ClientSort>,
  filters: ClientFilters = {},
): Promise<Paged<ClientListItem>> {
  const status = filters.status ?? "ACTIVE";
  const where: Prisma.ClientWhereInput = {
    ...(status !== "ALL" ? { status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(params.q ? clientSearchWhere(params.q) : {}),
  };
  const orderBy: Prisma.ClientOrderByWithRelationInput[] =
    params.sort === "city"
      ? [{ city: { sort: params.dir, nulls: "last" } }, { displayName: "asc" }]
      : params.sort === "createdAt"
        ? [{ createdAt: params.dir }]
        : [{ displayName: params.dir }];

  const [total, rows] = await Promise.all([
    db.client.count({ where }),
    db.client.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        id: true,
        displayName: true,
        type: true,
        status: true,
        email: true,
        phone: true,
        city: true,
        province: true,
        createdAt: true,
        _count: { select: { services: { where: { status: "ACTIVE" } } } },
      },
    }),
  ]);

  const ids = rows.map((r) => r.id);
  const balances = ids.length
    ? await db.receivable.groupBy({
        by: ["clientId"],
        where: { clientId: { in: ids }, status: { in: ["OPEN", "PARTIAL"] } },
        _sum: { amountDue: true, paidAmount: true },
      })
    : [];
  const balanceMap = new Map(
    balances.map((b) => [
      b.clientId,
      new Decimal(b._sum.amountDue?.toString() ?? "0").minus(b._sum.paidAmount?.toString() ?? "0").toFixed(2),
    ]),
  );

  return paged(
    rows.map(({ _count, ...r }) => ({ ...r, activeServices: _count.services, outstanding: balanceMap.get(r.id) ?? "0.00" })),
    total,
    params.page,
    params.pageSize,
  );
}

export async function getClientDetail(db: DbTx, id: string) {
  const client = await db.client.findUnique({ where: { id } });
  if (!client) return null;

  const [services, projects, quotes, receivables, payments, payables, documents, tasks] = await Promise.all([
    db.service.findMany({
      where: { clientId: id },
      orderBy: [{ status: "asc" }, { expiryDate: { sort: "asc", nulls: "last" } }],
      include: {
        provider: { select: { id: true, name: true } },
        renewals: { where: { status: { notIn: ["COMPLETED", "CANCELLED"] } }, take: 1 },
      },
    }),
    db.project.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" } }),
    db.quote.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" } }),
    db.receivable.findMany({
      where: { clientId: id },
      orderBy: [{ dueDate: { sort: "desc", nulls: "last" } }],
      take: 50,
      include: { service: { select: { id: true, name: true } } },
    }),
    db.payment.findMany({
      where: { receivable: { clientId: id } },
      orderBy: { paidOn: "desc" },
      take: 50,
      include: { receivable: { select: { id: true, description: true } } },
    }),
    db.payable.findMany({
      where: { OR: [{ service: { clientId: id } }, { project: { clientId: id } }] },
      orderBy: [{ dueDate: { sort: "desc", nulls: "last" } }],
      take: 50,
      include: { provider: { select: { id: true, name: true } }, service: { select: { id: true, name: true } } },
    }),
    db.document.findMany({ where: { clientId: id, deletedAt: null }, orderBy: { createdAt: "desc" } }),
    db.task.findMany({ where: { clientId: id }, orderBy: [{ completedAt: { sort: "asc", nulls: "first" } }, { dueDate: "asc" }] }),
  ]);

  const serviceIds = services.map((s) => s.id);
  const history = await db.auditLog.findMany({
    where: {
      OR: [
        { entityType: "Client", entityId: id },
        ...(serviceIds.length ? [{ entityType: "Service", entityId: { in: serviceIds } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return { client, services, projects, quotes, receivables, payments, payables, documents, tasks, history };
}

/** Elenco minimo per i menu di selezione (es. form servizio). */
export function clientOptions(db: DbTx, includeId?: string) {
  return db.client.findMany({
    where: { OR: [{ status: "ACTIVE" }, ...(includeId ? [{ id: includeId }] : [])] },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true },
  });
}

/** Dati economici o documenti che impediscono l'eliminazione definitiva del cliente. */
export async function clientDeletionBlockers(db: DbTx, id: string) {
  const [receivables, payables, documents] = await Promise.all([
    db.receivable.count({ where: { clientId: id } }),
    db.payable.count({ where: { OR: [{ service: { clientId: id } }, { project: { clientId: id } }, { renewal: { service: { clientId: id } } }] } }),
    db.document.count({ where: { OR: [{ clientId: id }, { service: { clientId: id } }, { project: { clientId: id } }] } }),
  ]);
  return { receivables, payables, documents, blocked: receivables + payables + documents > 0 };
}

/**
 * Elimina definitivamente un cliente insieme a servizi, rinnovi, commesse, preventivi,
 * attività e notifiche. Consentito solo se non esistono crediti, costi, pagamenti o
 * documenti: lo storico economico non si cancella mai (in quel caso si archivia).
 */
export async function deleteClient(db: Db, userId: string, id: string) {
  await db.$transaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id }, select: { displayName: true } });
    if (!client) throw new DomainError("Cliente non trovato.");
    // Blocca i servizi del cliente: nessun credito/costo può essere aggiunto durante l'eliminazione.
    await tx.$queryRaw`SELECT id FROM "Service" WHERE "clientId" = ${id}::uuid FOR UPDATE`;
    const blockers = await clientDeletionBlockers(tx, id);
    if (blockers.blocked) {
      throw new DomainError(
        "Il cliente ha crediti, costi, pagamenti o documenti registrati: per non perdere lo storico economico non può essere eliminato. Puoi archiviarlo.",
      );
    }

    const services = await tx.service.findMany({ where: { clientId: id }, select: { id: true } });
    const serviceIds = services.map((s) => s.id);
    const renewals = await tx.serviceRenewal.findMany({ where: { serviceId: { in: serviceIds } }, select: { id: true } });
    const renewalIds = renewals.map((r) => r.id);

    await tx.reminderEvent.deleteMany({ where: { target: "RENEWAL", resourceId: { in: renewalIds } } });
    await tx.notification.deleteMany({
      where: { OR: [{ clientId: id }, { serviceId: { in: serviceIds } }, { renewalId: { in: renewalIds } }] },
    });
    await tx.task.deleteMany({ where: { OR: [{ clientId: id }, { serviceId: { in: serviceIds } }, { project: { clientId: id } }] } });
    await tx.quote.deleteMany({ where: { clientId: id } });
    await tx.serviceRenewal.deleteMany({ where: { id: { in: renewalIds } } });
    await tx.service.deleteMany({ where: { id: { in: serviceIds } } });
    await tx.project.deleteMany({ where: { clientId: id } });
    await tx.client.delete({ where: { id } });

    await audit(tx, {
      userId,
      action: "client.deleted",
      entityType: "Client",
      entityId: id,
      summary: `Cliente eliminato: ${client.displayName} (${serviceIds.length} servizi)`,
    });
  });
}
