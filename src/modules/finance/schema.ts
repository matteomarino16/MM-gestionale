import { z } from "zod";
import {
  money,
  optionalCivilDate,
  optionalMoney,
  optionalText,
  optionalUuid,
  percent,
  requiredText,
  uuid,
} from "@/lib/validation/common";
import { isCivilDate, type CivilDate } from "@/lib/timezone/civil-date";

export const receivableInputSchema = z.object({
  clientId: uuid,
  serviceId: optionalUuid,
  renewalId: optionalUuid,
  projectId: optionalUuid,
  description: requiredText("Descrizione", 300),
  netAmount: money({ label: "Importo concordato" }),
  vatRate: percent("Aliquota IVA"),
  withholdingRate: percent("Ritenuta d'acconto"),
  dueDate: optionalCivilDate("Scadenza del pagamento"),
  notes: optionalText(5000),
});
export type ReceivableInput = z.infer<typeof receivableInputSchema>;

export const payableInputSchema = z.object({
  providerId: optionalUuid,
  serviceId: optionalUuid,
  renewalId: optionalUuid,
  projectId: optionalUuid,
  categoryId: optionalUuid,
  description: requiredText("Descrizione", 300),
  expectedAmount: money({ label: "Importo previsto" }),
  actualAmount: optionalMoney({ label: "Importo effettivo" }),
  vatRate: percent("Aliquota IVA"),
  dueDate: optionalCivilDate("Data prevista"),
  notes: optionalText(5000),
});
export type PayableInput = z.infer<typeof payableInputSchema>;

export const PAYMENT_METHODS = ["BANK_TRANSFER", "CASH", "CARD", "PAYPAL", "STRIPE", "CHECK", "DIRECT_DEBIT", "OTHER"] as const;

export const paymentInputSchema = z.object({
  targetId: uuid,
  amount: money({ label: "Importo" }).refine((v) => Number(v) > 0, "L'importo deve essere maggiore di zero"),
  paidOn: z
    .string({ error: "Data obbligatoria" })
    .trim()
    .refine((v) => isCivilDate(v), "Data non valida")
    .transform((v) => v as CivilDate),
  method: z.enum(PAYMENT_METHODS, { error: "Seleziona il metodo" }),
  reference: optionalText(200),
  notes: optionalText(2000),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const voidPaymentSchema = z.object({
  paymentId: uuid,
  reason: requiredText("Motivo dello storno", 500),
});

export const categoryInputSchema = z.object({ name: requiredText("Nome", 80) });
