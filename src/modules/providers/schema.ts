import { z } from "zod";
import { optionalEmail, optionalText, requiredText } from "@/lib/validation/common";

export const providerInputSchema = z.object({
  name: requiredText("Nome", 120),
  website: optionalText(300).refine((v) => v === null || /^https?:\/\/[^\s]+$/i.test(v), "Indirizzo web non valido (inizia con https://)"),
  email: optionalEmail,
  phone: optionalText(40),
  accountRef: optionalText(120),
  notes: optionalText(5000),
});

export type ProviderInput = z.infer<typeof providerInputSchema>;
