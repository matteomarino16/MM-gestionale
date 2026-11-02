import { z } from "zod";
import { optionalEmail, optionalText } from "@/lib/validation/common";

const PROVINCE_RE = /^[A-Z]{2}$/;

export const clientInputSchema = z
  .object({
    type: z.enum(["PERSON", "COMPANY", "OTHER"], { error: "Seleziona la tipologia" }),
    firstName: optionalText(100),
    lastName: optionalText(100),
    companyName: optionalText(200),
    vatNumber: optionalText(20).transform((v) => (v ? v.replace(/\s/g, "").toUpperCase() : null)),
    taxCode: optionalText(20).transform((v) => (v ? v.replace(/\s/g, "").toUpperCase() : null)),
    email: optionalEmail,
    pec: optionalEmail,
    phone: optionalText(40),
    address: optionalText(200),
    postalCode: optionalText(10),
    city: optionalText(100),
    province: optionalText(2).transform((v) => (v ? v.toUpperCase() : null)),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Codice paese ISO di 2 lettere (es. IT)")
      .default("IT"),
    billingAddress: optionalText(500),
    notes: optionalText(5000),
  })
  .superRefine((v, ctx) => {
    if (v.type === "COMPANY" && !v.companyName) {
      ctx.addIssue({ code: "custom", path: ["companyName"], message: "Inserisci la ragione sociale" });
    }
    if (!v.companyName && !v.firstName && !v.lastName) {
      ctx.addIssue({ code: "custom", path: ["lastName"], message: "Inserisci almeno nome, cognome o ragione sociale" });
    }
    if (v.province && !PROVINCE_RE.test(v.province)) {
      ctx.addIssue({ code: "custom", path: ["province"], message: "Sigla di 2 lettere (es. MI)" });
    }
    if (v.country === "IT" && v.vatNumber && !/^(IT)?\d{11}$/.test(v.vatNumber)) {
      ctx.addIssue({ code: "custom", path: ["vatNumber"], message: "Partita IVA italiana: 11 cifre" });
    }
    if (v.country === "IT" && v.taxCode && !/^([A-Z0-9]{16}|\d{11})$/.test(v.taxCode)) {
      ctx.addIssue({ code: "custom", path: ["taxCode"], message: "Codice fiscale: 16 caratteri (o 11 cifre per le aziende)" });
    }
    if (v.postalCode && v.country === "IT" && !/^\d{5}$/.test(v.postalCode)) {
      ctx.addIssue({ code: "custom", path: ["postalCode"], message: "CAP di 5 cifre" });
    }
  });

export type ClientInput = z.infer<typeof clientInputSchema>;

/** Nome visualizzato: ragione sociale se presente, altrimenti "Nome Cognome". */
export function computeDisplayName(v: Pick<ClientInput, "companyName" | "firstName" | "lastName">): string {
  if (v.companyName) return v.companyName;
  return [v.firstName, v.lastName].filter(Boolean).join(" ");
}
