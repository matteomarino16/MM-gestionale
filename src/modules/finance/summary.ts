import { Decimal } from "decimal.js";
import type { DbTx } from "@/lib/db/client";
import { civilToDb, todayIn } from "@/lib/timezone/civil-date";
import { getEnv } from "@/lib/env";

/**
 * Indicatori economici gestionali (non contabili) calcolati dal database.
 * Tutte le somme sono eseguite in PostgreSQL su NUMERIC e restituite come stringhe decimali.
 */
export type FinanceSummary = {
  /** Ricavi concordati (imponibile) dei crediti non annullati. */
  agreedRevenue: string;
  /** Incassi effettivi (pagamenti in entrata non stornati). */
  collected: string;
  /** Crediti residui: dovuto − incassato, crediti aperti o parziali. */
  outstanding: string;
  /** Parte dei crediti residui con scadenza passata. */
  overdue: string;
  /** Costi attribuiti (imponibile effettivo o, in mancanza, previsto) dei debiti non annullati. */
  costs: string;
  /** Pagamenti effettivi ai fornitori. */
  paidCosts: string;
  /** Debiti residui verso fornitori. */
  payableOutstanding: string;
  /** Margine gestionale = ricavi concordati − costi attribuiti. */
  margin: string;
};

type Row = Record<string, Decimal | string | null>;

const dec = (v: Decimal | string | null | undefined) => new Decimal(v?.toString() ?? "0");

/** Riepilogo per cliente: crediti del cliente; costi dei debiti legati ai suoi servizi o commesse. */
export async function clientFinanceSummary(db: DbTx, clientId: string, today = todayIn(getEnv().APP_TIMEZONE)): Promise<FinanceSummary> {
  const todayDb = civilToDb(today);
  const [r] = await db.$queryRaw<Row[]>`
    SELECT
      COALESCE(SUM(r."netAmount") FILTER (WHERE r.status <> 'CANCELLED'), 0) AS "agreedRevenue",
      COALESCE(SUM(r."amountDue" - r."paidAmount") FILTER (WHERE r.status IN ('OPEN','PARTIAL')), 0) AS "outstanding",
      COALESCE(SUM(r."amountDue" - r."paidAmount") FILTER (WHERE r.status IN ('OPEN','PARTIAL') AND r."dueDate" < ${todayDb}), 0) AS "overdue"
    FROM "Receivable" r WHERE r."clientId" = ${clientId}::uuid`;
  const [c] = await db.$queryRaw<Row[]>`
    SELECT COALESCE(SUM(p.amount), 0) AS "collected"
    FROM "Payment" p JOIN "Receivable" r ON r.id = p."receivableId"
    WHERE r."clientId" = ${clientId}::uuid AND p."voidedAt" IS NULL`;
  const [k] = await db.$queryRaw<Row[]>`
    SELECT
      COALESCE(SUM(COALESCE(pa."actualAmount", pa."expectedAmount")) FILTER (WHERE pa.status <> 'CANCELLED'), 0) AS "costs",
      COALESCE(SUM(pa."amountDue" - pa."paidAmount") FILTER (WHERE pa.status IN ('OPEN','PARTIAL')), 0) AS "payableOutstanding",
      COALESCE(SUM(pa."paidAmount"), 0) AS "paidCosts"
    FROM "Payable" pa
    WHERE pa."serviceId" IN (SELECT id FROM "Service" WHERE "clientId" = ${clientId}::uuid)
       OR pa."projectId" IN (SELECT id FROM "Project" WHERE "clientId" = ${clientId}::uuid)`;

  const agreedRevenue = dec(r.agreedRevenue);
  const costs = dec(k.costs);
  return {
    agreedRevenue: agreedRevenue.toFixed(2),
    collected: dec(c.collected).toFixed(2),
    outstanding: dec(r.outstanding).toFixed(2),
    overdue: dec(r.overdue).toFixed(2),
    costs: costs.toFixed(2),
    paidCosts: dec(k.paidCosts).toFixed(2),
    payableOutstanding: dec(k.payableOutstanding).toFixed(2),
    margin: agreedRevenue.minus(costs).toFixed(2),
  };
}

/** Riepilogo per servizio: crediti e debiti collegati al servizio (anche tramite i suoi rinnovi). */
export async function serviceFinanceSummary(db: DbTx, serviceId: string, today = todayIn(getEnv().APP_TIMEZONE)): Promise<FinanceSummary> {
  const todayDb = civilToDb(today);
  const [r] = await db.$queryRaw<Row[]>`
    SELECT
      COALESCE(SUM(r."netAmount") FILTER (WHERE r.status <> 'CANCELLED'), 0) AS "agreedRevenue",
      COALESCE(SUM(r."amountDue" - r."paidAmount") FILTER (WHERE r.status IN ('OPEN','PARTIAL')), 0) AS "outstanding",
      COALESCE(SUM(r."amountDue" - r."paidAmount") FILTER (WHERE r.status IN ('OPEN','PARTIAL') AND r."dueDate" < ${todayDb}), 0) AS "overdue",
      COALESCE(SUM(r."paidAmount"), 0) AS "collected"
    FROM "Receivable" r
    WHERE r."serviceId" = ${serviceId}::uuid
       OR r."renewalId" IN (SELECT id FROM "ServiceRenewal" WHERE "serviceId" = ${serviceId}::uuid)`;
  const [k] = await db.$queryRaw<Row[]>`
    SELECT
      COALESCE(SUM(COALESCE(pa."actualAmount", pa."expectedAmount")) FILTER (WHERE pa.status <> 'CANCELLED'), 0) AS "costs",
      COALESCE(SUM(pa."amountDue" - pa."paidAmount") FILTER (WHERE pa.status IN ('OPEN','PARTIAL')), 0) AS "payableOutstanding",
      COALESCE(SUM(pa."paidAmount"), 0) AS "paidCosts"
    FROM "Payable" pa
    WHERE pa."serviceId" = ${serviceId}::uuid
       OR pa."renewalId" IN (SELECT id FROM "ServiceRenewal" WHERE "serviceId" = ${serviceId}::uuid)`;
  const agreedRevenue = dec(r.agreedRevenue);
  const costs = dec(k.costs);
  return {
    agreedRevenue: agreedRevenue.toFixed(2),
    collected: dec(r.collected).toFixed(2),
    outstanding: dec(r.outstanding).toFixed(2),
    overdue: dec(r.overdue).toFixed(2),
    costs: costs.toFixed(2),
    paidCosts: dec(k.paidCosts).toFixed(2),
    payableOutstanding: dec(k.payableOutstanding).toFixed(2),
    margin: agreedRevenue.minus(costs).toFixed(2),
  };
}
