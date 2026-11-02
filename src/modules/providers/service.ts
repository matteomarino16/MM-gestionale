import { Decimal } from "decimal.js";
import type { Prisma } from "@/generated/prisma/client";
import { DomainError } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import type { Db, DbTx } from "@/lib/db/client";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/db/errors";
import { paged, type ListParams } from "@/lib/list-params";
import type { ProviderInput } from "./schema";

export const PROVIDER_SORTS = ["name", "services", "createdAt"] as const;
export type ProviderSort = (typeof PROVIDER_SORTS)[number];

const DUPLICATE = new DomainError("Esiste già un fornitore con questo nome.", { name: ["Nome già in uso"] });

export async function createProvider(db: Db, userId: string, input: ProviderInput) {
  try {
    return await db.$transaction(async (tx) => {
      const p = await tx.provider.create({ data: input });
      await audit(tx, { userId, action: "provider.created", entityType: "Provider", entityId: p.id, summary: `Fornitore creato: ${p.name}` });
      return p;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw DUPLICATE;
    throw err;
  }
}

export async function updateProvider(db: Db, userId: string, id: string, input: ProviderInput) {
  try {
    return await db.$transaction(async (tx) => {
      const exists = await tx.provider.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new DomainError("Fornitore non trovato.");
      const p = await tx.provider.update({ where: { id }, data: input });
      await audit(tx, { userId, action: "provider.updated", entityType: "Provider", entityId: id, summary: "Fornitore modificato" });
      return p;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw DUPLICATE;
    throw err;
  }
}

export async function setProviderActive(db: Db, userId: string, id: string, active: boolean) {
  await db.$transaction(async (tx) => {
    const res = await tx.provider.updateMany({ where: { id }, data: { active } });
    if (res.count === 0) throw new DomainError("Fornitore non trovato.");
    await audit(tx, {
      userId,
      action: active ? "provider.activated" : "provider.deactivated",
      entityType: "Provider",
      entityId: id,
      summary: active ? "Fornitore riattivato" : "Fornitore disattivato",
    });
  });
}

/** Elimina solo fornitori mai usati: i riferimenti economici e i servizi lo impediscono. */
export async function deleteProvider(db: Db, userId: string, id: string) {
  try {
    await db.$transaction(async (tx) => {
      const p = await tx.provider.findUnique({
        where: { id },
        select: { name: true, _count: { select: { services: true, payables: true } } },
      });
      if (!p) throw new DomainError("Fornitore non trovato.");
      if (p._count.services > 0 || p._count.payables > 0) {
        throw new DomainError("Il fornitore è collegato a servizi o costi: puoi solo disattivarlo.");
      }
      await tx.provider.delete({ where: { id } });
      await audit(tx, { userId, action: "provider.deleted", entityType: "Provider", entityId: id, summary: `Fornitore eliminato: ${p.name}` });
    });
  } catch (err) {
    if (isForeignKeyViolation(err)) throw new DomainError("Il fornitore è collegato ad altri dati: puoi solo disattivarlo.");
    throw err;
  }
}

export async function listProviders(db: DbTx, params: ListParams<ProviderSort>, filters: { active?: boolean | "ALL" } = {}) {
  const active = filters.active ?? true;
  const contains = params.q ? { contains: params.q, mode: "insensitive" as const } : undefined;
  const where: Prisma.ProviderWhereInput = {
    ...(active !== "ALL" ? { active } : {}),
    ...(contains ? { OR: [{ name: contains }, { email: contains }, { website: contains }, { accountRef: contains }] } : {}),
  };
  const orderBy: Prisma.ProviderOrderByWithRelationInput =
    params.sort === "services" ? { services: { _count: params.dir } } : params.sort === "createdAt" ? { createdAt: params.dir } : { name: params.dir };
  const [total, rows] = await Promise.all([
    db.provider.count({ where }),
    db.provider.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { _count: { select: { services: { where: { status: "ACTIVE" } } } } },
    }),
  ]);
  const ids = rows.map((r) => r.id);
  const debts = ids.length
    ? await db.payable.groupBy({
        by: ["providerId"],
        where: { providerId: { in: ids }, status: { in: ["OPEN", "PARTIAL"] } },
        _sum: { amountDue: true, paidAmount: true },
      })
    : [];
  const debtMap = new Map(
    debts.map((d) => [d.providerId, new Decimal(d._sum.amountDue?.toString() ?? "0").minus(d._sum.paidAmount?.toString() ?? "0").toFixed(2)]),
  );
  return paged(
    rows.map(({ _count, ...r }) => ({ ...r, activeServices: _count.services, outstanding: debtMap.get(r.id) ?? "0.00" })),
    total,
    params.page,
    params.pageSize,
  );
}

export async function getProviderDetail(db: DbTx, id: string) {
  const provider = await db.provider.findUnique({ where: { id } });
  if (!provider) return null;
  const [services, payables, history] = await Promise.all([
    db.service.findMany({
      where: { providerId: id },
      orderBy: [{ status: "asc" }, { expiryDate: { sort: "asc", nulls: "last" } }],
      include: { client: { select: { id: true, displayName: true } } },
    }),
    db.payable.findMany({ where: { providerId: id }, orderBy: [{ dueDate: { sort: "desc", nulls: "last" } }], take: 50 }),
    db.auditLog.findMany({ where: { entityType: "Provider", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return { provider, services, payables, history };
}

export function providerOptions(db: DbTx, includeId?: string | null) {
  return db.provider.findMany({
    where: { OR: [{ active: true }, ...(includeId ? [{ id: includeId }] : [])] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
