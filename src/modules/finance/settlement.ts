import { Decimal } from "decimal.js";
import { DomainError } from "@/lib/action-result";
import { settlementStatus } from "@/lib/calculations/amounts";
import type { DbTx } from "@/lib/db/client";

/** Blocca la riga del credito/debito: i pagamenti concorrenti sulla stessa risorsa vengono serializzati. */
export async function lockReceivable(tx: DbTx, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Receivable" WHERE id = ${id}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new DomainError("Credito non trovato.");
}

export async function lockPayable(tx: DbTx, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Payable" WHERE id = ${id}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new DomainError("Debito non trovato.");
}

/** Ricalcola pagato e stato dalla somma dei movimenti non stornati (fonte di verità). */
export async function recomputeReceivable(tx: DbTx, id: string) {
  const r = await tx.receivable.findUniqueOrThrow({ where: { id }, select: { amountDue: true, status: true } });
  const agg = await tx.payment.aggregate({ where: { receivableId: id, voidedAt: null }, _sum: { amount: true } });
  const paid = new Decimal(agg._sum.amount?.toString() ?? "0");
  if (paid.greaterThan(r.amountDue.toString())) throw new DomainError("Il totale pagato supererebbe l'importo dovuto.");
  const status = r.status === "CANCELLED" ? "CANCELLED" : settlementStatus(r.amountDue.toString(), paid);
  return tx.receivable.update({ where: { id }, data: { paidAmount: paid.toFixed(2), status } });
}

export async function recomputePayable(tx: DbTx, id: string) {
  const p = await tx.payable.findUniqueOrThrow({ where: { id }, select: { amountDue: true, status: true } });
  const agg = await tx.payment.aggregate({ where: { payableId: id, voidedAt: null }, _sum: { amount: true } });
  const paid = new Decimal(agg._sum.amount?.toString() ?? "0");
  if (paid.greaterThan(p.amountDue.toString())) throw new DomainError("Il totale pagato supererebbe l'importo dovuto.");
  const status = p.status === "CANCELLED" ? "CANCELLED" : settlementStatus(p.amountDue.toString(), paid);
  return tx.payable.update({ where: { id }, data: { paidAmount: paid.toFixed(2), status } });
}
