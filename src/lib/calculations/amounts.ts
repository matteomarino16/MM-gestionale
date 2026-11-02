import { Decimal } from "decimal.js";
import type { SettlementStatus } from "@/generated/prisma/enums";

/** Arrotondamento commerciale al centesimo (half-up), come in fattura. */
export function round2(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function percentOf(base: Decimal.Value, rate: Decimal.Value): Decimal {
  return round2(new Decimal(base).times(rate).div(100));
}

export type ReceivableAmounts = {
  netAmount: string;
  vatAmount: string;
  withholdingAmount: string;
  amountDue: string;
};

/**
 * Importi di un credito: dovuto = imponibile + IVA − ritenuta d'acconto.
 * IVA e ritenuta sono calcolate sull'imponibile e arrotondate al centesimo.
 */
export function receivableAmounts(net: Decimal.Value, vatRate: Decimal.Value, withholdingRate: Decimal.Value): ReceivableAmounts {
  const n = round2(net);
  const vat = percentOf(n, vatRate);
  const wh = percentOf(n, withholdingRate);
  return {
    netAmount: n.toFixed(2),
    vatAmount: vat.toFixed(2),
    withholdingAmount: wh.toFixed(2),
    amountDue: n.plus(vat).minus(wh).toFixed(2),
  };
}

export type PayableAmounts = { vatAmount: string; amountDue: string };

/** Importi di un debito: dovuto = (effettivo, se noto, altrimenti previsto) + IVA. */
export function payableAmounts(expected: Decimal.Value, actual: Decimal.Value | null, vatRate: Decimal.Value): PayableAmounts {
  const base = round2(actual ?? expected);
  const vat = percentOf(base, vatRate);
  return { vatAmount: vat.toFixed(2), amountDue: base.plus(vat).toFixed(2) };
}

/** Stato memorizzato in base al pagato; "scaduto" si deriva a parte dalla data. */
export function settlementStatus(amountDue: Decimal.Value, paid: Decimal.Value): Exclude<SettlementStatus, "CANCELLED"> {
  const p = new Decimal(paid);
  if (p.isZero()) return "OPEN";
  return p.greaterThanOrEqualTo(amountDue) ? "PAID" : "PARTIAL";
}

export function residual(amountDue: Decimal.Value, paid: Decimal.Value): string {
  return new Decimal(amountDue).minus(paid).toFixed(2);
}

export type DisplayStatus = SettlementStatus | "OVERDUE";

/** Stato da mostrare: OPEN/PARTIAL con scadenza passata diventano "scaduto". */
export function displayStatus(status: SettlementStatus, dueDate: string | null, today: string): DisplayStatus {
  if ((status === "OPEN" || status === "PARTIAL") && dueDate !== null && dueDate < today) return "OVERDUE";
  return status;
}
