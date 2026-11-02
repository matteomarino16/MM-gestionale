import type { DbTx } from "@/lib/db/client";
import { clientSearchWhere } from "@/modules/clients/service";
import { serviceSearchWhere } from "@/modules/services/service";

export const SEARCH_MIN_LENGTH = 2;

/** Ricerca globale su clienti, servizi/domini, fornitori e descrizioni economiche. */
export async function globalSearch(db: DbTx, rawQuery: string, limit = 10) {
  const q = rawQuery.trim().slice(0, 100);
  if (q.length < SEARCH_MIN_LENGTH) return null;
  const contains = { contains: q, mode: "insensitive" as const };

  const [clients, services, providers, receivables, payables] = await Promise.all([
    db.client.findMany({
      where: clientSearchWhere(q),
      orderBy: [{ status: "asc" }, { displayName: "asc" }],
      take: limit,
      select: { id: true, displayName: true, email: true, city: true, status: true, type: true },
    }),
    db.service.findMany({
      where: serviceSearchWhere(q),
      orderBy: [{ status: "asc" }, { expiryDate: { sort: "asc", nulls: "last" } }],
      take: limit,
      select: {
        id: true,
        name: true,
        domain: true,
        type: true,
        status: true,
        expiryDate: true,
        client: { select: { displayName: true } },
      },
    }),
    db.provider.findMany({
      where: { OR: [{ name: contains }, { email: contains }, { website: contains }, { accountRef: contains }] },
      orderBy: { name: "asc" },
      take: limit,
      select: { id: true, name: true, active: true },
    }),
    db.receivable.findMany({
      where: { OR: [{ description: contains }, { notes: contains }] },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, description: true, amountDue: true, status: true, client: { select: { id: true, displayName: true } } },
    }),
    db.payable.findMany({
      where: { OR: [{ description: contains }, { notes: contains }] },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, description: true, amountDue: true, status: true, provider: { select: { id: true, name: true } } },
    }),
  ]);

  return { q, clients, services, providers, receivables, payables };
}
