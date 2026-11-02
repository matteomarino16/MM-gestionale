import { Decimal } from "decimal.js";
import type { PaymentDirection } from "@/generated/prisma/client";
import { DomainError } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import type { Db } from "@/lib/db/client";
import { formatMoney } from "@/lib/format";
import { civilToDb, compareCivil, type CivilDate } from "@/lib/timezone/civil-date";
import type { PaymentInput } from "./schema";
import { lockPayable, lockReceivable, recomputePayable, recomputeReceivable } from "./settlement";

/**
 * Registra un movimento di cassa su un credito (IN) o un debito (OUT).
 * Il saldo non viene mai sovrascritto: si ricalcola dalla somma dei movimenti.
 */
export async function registerPayment(db: Db, userId: string, direction: PaymentDirection, input: PaymentInput, today: CivilDate) {
  if (compareCivil(input.paidOn, today) > 0) {
    throw new DomainError("La data del pagamento non può essere futura.", { paidOn: ["Data futura"] });
  }
  return db.$transaction(async (tx) => {
    const amount = new Decimal(input.amount);
    let target: { status: string; amountDue: { toString(): string }; paidAmount: { toString(): string }; currency: string; description: string };
    if (direction === "IN") {
      await lockReceivable(tx, input.targetId);
      target = await tx.receivable.findUniqueOrThrow({ where: { id: input.targetId } });
    } else {
      await lockPayable(tx, input.targetId);
      target = await tx.payable.findUniqueOrThrow({ where: { id: input.targetId } });
    }
    if (target.status === "CANCELLED") throw new DomainError("Non si possono registrare pagamenti su una voce annullata.");
    const residual = new Decimal(target.amountDue.toString()).minus(target.paidAmount.toString());
    if (residual.lessThanOrEqualTo(0)) throw new DomainError("La voce risulta già saldata.");
    if (amount.greaterThan(residual)) {
      throw new DomainError(`L'importo supera il residuo da pagare (${formatMoney(residual.toFixed(2))}).`, { amount: ["Superiore al residuo"] });
    }

    const payment = await tx.payment.create({
      data: {
        direction,
        receivableId: direction === "IN" ? input.targetId : null,
        payableId: direction === "OUT" ? input.targetId : null,
        amount: amount.toFixed(2),
        currency: target.currency,
        paidOn: civilToDb(input.paidOn),
        method: input.method,
        reference: input.reference,
        notes: input.notes,
      },
    });
    const updated = direction === "IN" ? await recomputeReceivable(tx, input.targetId) : await recomputePayable(tx, input.targetId);
    await audit(tx, {
      userId,
      action: direction === "IN" ? "payment.received" : "payment.sent",
      entityType: "Payment",
      entityId: payment.id,
      summary: `${direction === "IN" ? "Incasso" : "Pagamento"} di ${formatMoney(payment.amount)} su "${target.description}" — residuo ${formatMoney(
        new Decimal(updated.amountDue.toString()).minus(updated.paidAmount.toString()).toFixed(2),
      )}`,
      data: { targetId: input.targetId },
    });
    return { payment, target: updated };
  });
}

/** Storno: il movimento resta nello storico ma esce dai totali; il saldo si ricalcola. */
export async function voidPayment(db: Db, userId: string, paymentId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw new DomainError("Pagamento non trovato.");
    if (p.receivableId) await lockReceivable(tx, p.receivableId);
    if (p.payableId) await lockPayable(tx, p.payableId);
    // Riletto dopo il lock: uno storno concorrente potrebbe averlo già annullato.
    const fresh = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (fresh.voidedAt) throw new DomainError("Il pagamento è già stato stornato.");
    await tx.payment.update({ where: { id: paymentId }, data: { voidedAt: new Date(), voidReason: reason } });
    if (p.receivableId) await recomputeReceivable(tx, p.receivableId);
    if (p.payableId) await recomputePayable(tx, p.payableId);
    await audit(tx, {
      userId,
      action: "payment.voided",
      entityType: "Payment",
      entityId: paymentId,
      summary: `Stornato movimento di ${formatMoney(p.amount)}: ${reason}`,
      data: { targetId: p.receivableId ?? p.payableId },
    });
    return { receivableId: p.receivableId, payableId: p.payableId };
  });
}
