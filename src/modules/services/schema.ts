import { z } from "zod";
import {
  checkbox,
  money,
  optionalCivilDate,
  optionalText,
  optionalUuid,
  percent,
  requiredText,
  uuid,
} from "@/lib/validation/common";
import { compareCivil } from "@/lib/timezone/civil-date";

const SERVICE_TYPES = [
  "DOMAIN_REGISTRATION",
  "DOMAIN_RENEWAL",
  "HOSTING",
  "VPS_SERVER",
  "PEC",
  "EMAIL",
  "SSL_CERTIFICATE",
  "SOFTWARE_LICENSE",
  "PLUGIN_THEME",
  "WEBSITE",
  "MAINTENANCE",
  "SUPPORT",
  "SEO_DIGITAL",
  "CONSULTING",
  "OTHER",
] as const;

const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** Normalizza un dominio: rimuove protocollo e percorso, minuscolo, IDN in punycode. */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `http://${s}`;
  try {
    const host = new URL(s).hostname.replace(/\.$/, "");
    return HOST_RE.test(host) ? host : null;
  } catch {
    return null;
  }
}

export const serviceInputSchema = z
  .object({
    clientId: uuid,
    providerId: optionalUuid,
    name: requiredText("Nome", 200),
    type: z.enum(SERVICE_TYPES, { error: "Seleziona la tipologia" }),
    description: optionalText(2000),
    domain: optionalText(253).transform((v, ctx) => {
      if (!v) return null;
      const d = normalizeDomain(v);
      if (!d) {
        ctx.addIssue({ code: "custom", message: "Dominio non valido (es. esempio.it)" });
        return z.NEVER;
      }
      return d;
    }),
    providerRef: optionalText(200),
    startDate: optionalCivilDate("Data di inizio"),
    expiryDate: optionalCivilDate("Data di scadenza"),
    frequency: z.enum(["NONE", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "BIENNIAL", "CUSTOM"], {
      error: "Seleziona la frequenza",
    }),
    customIntervalValue: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v, ctx) => {
        if (!v) return null;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 3650) {
          ctx.addIssue({ code: "custom", message: "Numero intero tra 1 e 3650" });
          return z.NEVER;
        }
        return n;
      }),
    customIntervalUnit: z
      .enum(["DAY", "MONTH", ""])
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),
    providerCost: money({ label: "Costo fornitore" }),
    clientPrice: money({ label: "Prezzo al cliente" }),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Codice valuta di 3 lettere (es. EUR)")
      .default("EUR"),
    vatRate: percent("Aliquota IVA"),
    status: z.enum(["ACTIVE", "SUSPENDED", "EXPIRED", "CANCELLED"]).default("ACTIVE"),
    autoRenew: checkbox,
    notes: optionalText(5000),
  })
  .superRefine((v, ctx) => {
    if (v.frequency === "CUSTOM") {
      if (!v.customIntervalValue) ctx.addIssue({ code: "custom", path: ["customIntervalValue"], message: "Indica ogni quanto si rinnova" });
      if (!v.customIntervalUnit) ctx.addIssue({ code: "custom", path: ["customIntervalUnit"], message: "Indica l'unità" });
    }
    if (v.startDate && v.expiryDate && compareCivil(v.expiryDate, v.startDate) < 0) {
      ctx.addIssue({ code: "custom", path: ["expiryDate"], message: "La scadenza non può precedere l'inizio" });
    }
    if (v.frequency !== "NONE" && v.status === "ACTIVE" && !v.expiryDate) {
      ctx.addIssue({ code: "custom", path: ["expiryDate"], message: "Per un servizio ricorrente attivo indica la scadenza" });
    }
  })
  .transform((v) =>
    v.frequency === "CUSTOM" ? v : { ...v, customIntervalValue: null, customIntervalUnit: null },
  );

export type ServiceInput = z.infer<typeof serviceInputSchema>;
