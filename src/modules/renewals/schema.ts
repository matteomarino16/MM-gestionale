import { z } from "zod";
import { isCivilDate, type CivilDate } from "@/lib/timezone/civil-date";
import { optionalCivilDate, optionalMoney, optionalText, uuid } from "@/lib/validation/common";

/** Stati intermedi impostabili a mano; COMPLETED e CANCELLED hanno azioni dedicate. */
export const MANUAL_RENEWAL_STATUSES = ["PLANNED", "PROVIDER_PAYMENT_DUE", "CLIENT_REQUESTED", "CLIENT_PAID", "PROVIDER_PAID"] as const;

const civil = (label: string) =>
  z
    .string({ error: `${label} obbligatoria` })
    .trim()
    .refine((v) => isCivilDate(v), `${label} non valida`)
    .transform((v) => v as CivilDate);

export const renewalStatusSchema = z.object({ id: uuid, status: z.enum(MANUAL_RENEWAL_STATUSES) });

export const completeRenewalSchema = z.object({
  id: uuid,
  renewedAt: civil("Data del rinnovo"),
  newExpiryDate: civil("Nuova scadenza"),
  actualProviderCost: optionalMoney({ label: "Costo effettivo" }),
  notes: optionalText(2000),
});
export type CompleteRenewalInput = z.infer<typeof completeRenewalSchema>;

export const renewalDetailsSchema = z.object({
  id: uuid,
  plannedRenewalDate: optionalCivilDate("Data prevista del rinnovo"),
  expectedProviderCost: optionalMoney({ label: "Costo previsto" }),
  clientPrice: optionalMoney({ label: "Prezzo al cliente" }),
  notes: optionalText(2000),
});
export type RenewalDetailsInput = z.infer<typeof renewalDetailsSchema>;

export const skipRenewalSchema = z.object({ id: uuid, reason: optionalText(500) });
