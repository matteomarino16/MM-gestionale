import { Decimal } from "decimal.js";
import type { PaymentDirection, PaymentMethod, Prisma } from "@/generated/prisma/client";
import type { DisplayStatus } from "@/lib/calculations/amounts";
import type { Period } from "@/lib/calculations/period";
import type { DbTx } from "@/lib/db/client";
import { paged, type ListParams } from "@/lib/list-params";
import { civilToDb, type CivilDate } from "@/lib/timezone/civil-date";

export const RECEIVABLE_SORTS = ["dueDate", "amount", "residual", "createdAt"] as const;
export type ReceivableSort = (typeof RECEIVABLE_SORTS)[number];
export const PAYABLE_SORTS = RECEIVABLE_SORTS;
export const PAYMENT_SORTS = ["paidOn", "amount"] as const;
export type PaymentSort = (typeof PAYMENT_SORTS)[number];

/** Filtro di stato: un singolo stato, "aperti" (da pagare + parziali) o tutti. */
export type StatusFilter = DisplayStatus | "OPEN_ANY" | "ALL";

function dateRange(period: Period | undefined): Prisma.DateTimeNullableFilter | undefined {
  if (!period || (!period.from && !period.to)) return undefined;
  return { ...(period.from ? { gte: civilToDb(period.from) } : {}), ...(period.to ? { lte: civilToDb(period.to) } : {}) };
}

function statusWhere(status: StatusFilter, today: CivilDate): Prisma.ReceivableWhereInput & Prisma.PayableWhereInput {
  const todayDb = civilToDb(today);
  switch (status) {
    case "ALL":
      return {};
    case "OPEN_ANY":
      return { status: { in: ["OPEN", "PARTIAL"] } };
    case "OVERDUE":
      return { status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: todayDb } };
    case "OPEN":
    case "PARTIAL":
      // "Da pagare" e "parziale" escludono gli scaduti, mostrati a parte.
      return { status, OR: [{ dueDate: null }, { dueDate: { gte: todayDb } }] };
    default:
      return { status };
  }
}

type Totals = { amountDue: string; paid: string; residual: string; count: number };

function totals(agg: { _sum: { amountDue: Decimal.Value | { toString(): string } | null; paidAmount: { toString(): string } | null }; _count: number }): Totals {
  const due = new Decimal(agg._sum.amountDue?.toString() ?? "0");
  const paid = new Decimal(agg._sum.paidAmount?.toString() ?? "0");
  return { amountDue: due.toFixed(2), paid: paid.toFixed(2), residual: due.minus(paid).toFixed(2), count: agg._count };
}

function orderBy(sort: ReceivableSort, dir: "asc" | "desc") {
  switch (sort) {
    case "amount":
      return [{ amountDue: dir }, { id: "asc" as const }];
    case "createdAt":
      return [{ createdAt: dir }];
    case "residual":
      // Il residuo non è una colonna: ordinamento per dovuto e poi per pagato (inverso).
      return [{ amountDue: dir }, { paidAmount: dir === "asc" ? ("desc" as const) : ("asc" as const) }];
    default:
      return [{ dueDate: { sort: dir, nulls: "last" as const } }, { createdAt: "asc" as const }];
  }
}

export type ReceivableFilters = { status: StatusFilter; clientId?: string; serviceId?: string; period?: Period; today: CivilDate };

export async function listReceivables(db: DbTx, params: ListParams<ReceivableSort>, f: ReceivableFilters) {
  const contains = params.q ? { contains: params.q, mode: "insensitive" as const } : undefined;
  const where: Prisma.ReceivableWhereInput = {
    AND: [
      statusWhere(f.status, f.today),
      f.clientId ? { clientId: f.clientId } : {},
      f.serviceId ? { OR: [{ serviceId: f.serviceId }, { renewal: { serviceId: f.serviceId } }] } : {},
      dateRange(f.period) ? { dueDate: dateRange(f.period) } : {},
      contains
        ? { OR: [{ description: contains }, { notes: contains }, { client: { displayName: contains } }, { service: { name: contains } }] }
        : {},
    ],
  };
  const [count, agg, items] = await Promise.all([
    db.receivable.count({ where }),
    db.receivable.aggregate({ where, _sum: { amountDue: true, paidAmount: true }, _count: true }),
    db.receivable.findMany({
      where,
      orderBy: orderBy(params.sort, params.dir),
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { client: { select: { id: true, displayName: true } }, service: { select: { id: true, name: true } } },
    }),
  ]);
  return { ...paged(items, count, params.page, params.pageSize), totals: totals(agg) };
}

export type PayableFilters = {
  status: StatusFilter;
  providerId?: string;
  serviceId?: string;
  categoryId?: string;
  period?: Period;
  today: CivilDate;
};

export async function listPayables(db: DbTx, params: ListParams<ReceivableSort>, f: PayableFilters) {
  const contains = params.q ? { contains: params.q, mode: "insensitive" as const } : undefined;
  const where: Prisma.PayableWhereInput = {
    AND: [
      statusWhere(f.status, f.today),
      f.providerId ? { providerId: f.providerId } : {},
      f.categoryId ? { categoryId: f.categoryId } : {},
      f.serviceId ? { OR: [{ serviceId: f.serviceId }, { renewal: { serviceId: f.serviceId } }] } : {},
      dateRange(f.period) ? { dueDate: dateRange(f.period) } : {},
      contains
        ? { OR: [{ description: contains }, { notes: contains }, { provider: { name: contains } }, { service: { name: contains } }] }
        : {},
    ],
  };
  const [count, agg, items] = await Promise.all([
    db.payable.count({ where }),
    db.payable.aggregate({ where, _sum: { amountDue: true, paidAmount: true }, _count: true }),
    db.payable.findMany({
      where,
      orderBy: orderBy(params.sort, params.dir),
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        provider: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    }),
  ]);
  return { ...paged(items, count, params.page, params.pageSize), totals: totals(agg) };
}

export type PaymentFilters = {
  direction?: PaymentDirection;
  method?: PaymentMethod;
  clientId?: string;
  providerId?: string;
  period?: Period;
  includeVoided?: boolean;
};

/** Registro dei movimenti di cassa con totali (esclusi gli stornati). */
export async function listPayments(db: DbTx, params: ListParams<PaymentSort>, f: PaymentFilters) {
  const contains = params.q ? { contains: params.q, mode: "insensitive" as const } : undefined;
  const base: Prisma.PaymentWhereInput = {
    AND: [
      f.direction ? { direction: f.direction } : {},
      f.method ? { method: f.method } : {},
      f.clientId ? { receivable: { clientId: f.clientId } } : {},
      f.providerId ? { payable: { providerId: f.providerId } } : {},
      dateRange(f.period) ? { paidOn: dateRange(f.period) as Prisma.DateTimeFilter } : {},
      contains
        ? {
            OR: [
              { reference: contains },
              { notes: contains },
              { receivable: { description: contains } },
              { receivable: { client: { displayName: contains } } },
              { payable: { description: contains } },
              { payable: { provider: { name: contains } } },
            ],
          }
        : {},
    ],
  };
  const where: Prisma.PaymentWhereInput = f.includeVoided ? base : { AND: [base, { voidedAt: null }] };
  const sums = await db.payment.groupBy({ by: ["direction"], where: { AND: [base, { voidedAt: null }] }, _sum: { amount: true } });
  const inflow = new Decimal(sums.find((s) => s.direction === "IN")?._sum.amount?.toString() ?? "0");
  const outflow = new Decimal(sums.find((s) => s.direction === "OUT")?._sum.amount?.toString() ?? "0");

  const [count, items] = await Promise.all([
    db.payment.count({ where }),
    db.payment.findMany({
      where,
      orderBy: params.sort === "amount" ? [{ amount: params.dir }] : [{ paidOn: params.dir }, { createdAt: params.dir }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        receivable: { select: { id: true, description: true, client: { select: { id: true, displayName: true } } } },
        payable: { select: { id: true, description: true, provider: { select: { id: true, name: true } } } },
      },
    }),
  ]);
  return {
    ...paged(items, count, params.page, params.pageSize),
    totals: { inflow: inflow.toFixed(2), outflow: outflow.toFixed(2), net: inflow.minus(outflow).toFixed(2) },
  };
}

/** Indicatori globali: incassi/pagamenti nel periodo, crediti e debiti residui (alla data odierna). */
export async function financeOverview(db: DbTx, period: Period, today: CivilDate) {
  const range = dateRange(period) as Prisma.DateTimeFilter | undefined;
  const todayDb = civilToDb(today);
  const [cash, recOpen, recOverdue, payOpen, payOverdue] = await Promise.all([
    db.payment.groupBy({ by: ["direction"], where: { voidedAt: null, ...(range ? { paidOn: range } : {}) }, _sum: { amount: true } }),
    db.receivable.aggregate({ where: { status: { in: ["OPEN", "PARTIAL"] } }, _sum: { amountDue: true, paidAmount: true }, _count: true }),
    db.receivable.aggregate({ where: { status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: todayDb } }, _sum: { amountDue: true, paidAmount: true }, _count: true }),
    db.payable.aggregate({ where: { status: { in: ["OPEN", "PARTIAL"] } }, _sum: { amountDue: true, paidAmount: true }, _count: true }),
    db.payable.aggregate({ where: { status: { in: ["OPEN", "PARTIAL"] }, dueDate: { lt: todayDb } }, _sum: { amountDue: true, paidAmount: true }, _count: true }),
  ]);
  const inflow = new Decimal(cash.find((c) => c.direction === "IN")?._sum.amount?.toString() ?? "0");
  const outflow = new Decimal(cash.find((c) => c.direction === "OUT")?._sum.amount?.toString() ?? "0");
  return {
    inflow: inflow.toFixed(2),
    outflow: outflow.toFixed(2),
    cashFlow: inflow.minus(outflow).toFixed(2),
    receivables: totals(recOpen),
    receivablesOverdue: totals(recOverdue),
    payables: totals(payOpen),
    payablesOverdue: totals(payOverdue),
  };
}

/** Voci collegabili nei form: servizi per cliente con i rispettivi cicli di rinnovo. */
export async function serviceLinkOptions(db: DbTx, where: Prisma.ServiceWhereInput = {}) {
  const services = await db.service.findMany({
    where,
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      clientId: true,
      providerId: true,
      status: true,
      renewals: { orderBy: { cycleNumber: "desc" }, take: 6, select: { id: true, cycleNumber: true, expiryDate: true, status: true } },
    },
  });
  return services;
}
