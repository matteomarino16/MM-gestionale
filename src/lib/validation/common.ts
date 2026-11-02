import { Decimal } from "decimal.js";
import { z } from "zod";
import { isCivilDate, type CivilDate } from "@/lib/timezone/civil-date";

/** Stringa facoltativa: spazi rimossi, stringa vuota → null. */
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Massimo ${max} caratteri`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const requiredText = (label: string, max = 200) =>
  z.string({ error: `${label} obbligatorio` }).trim().min(1, `${label} obbligatorio`).max(max, `Massimo ${max} caratteri`);

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null)
  .refine((v) => v === null || z.email().safeParse(v).success, "Email non valida");

/**
 * Converte un importo inserito dall'utente in stringa decimale canonica.
 * Formato italiano: la virgola è il separatore decimale e il punto quello delle migliaia
 * ("1.234,56"). Senza virgola, un punto seguito da esattamente tre cifre è un separatore
 * delle migliaia ("1.250" = 1250); altrimenti è un separatore decimale ("12.50",
 * tastiere numeriche dei telefoni).
 */
export function parseItalianDecimal(input: string): string | null {
  let s = input.trim().replace(/\s|€/g, "");
  if (s === "") return null;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1 || /^-?\d{1,3}\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return new Decimal(s).toFixed();
}

type MoneyOpts = { label?: string; max?: string; allowNegative?: boolean; maxDecimals?: number };

function decimalField(opts: MoneyOpts & { required: boolean }) {
  const label = opts.label ?? "Importo";
  const max = new Decimal(opts.max ?? "9999999999.99");
  const decimals = opts.maxDecimals ?? 2;
  return z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((raw, ctx) => {
      const str = raw === null || raw === undefined ? "" : String(raw);
      if (str.trim() === "") {
        if (opts.required) {
          ctx.addIssue({ code: "custom", message: `${label} obbligatorio` });
          return z.NEVER;
        }
        return null;
      }
      const parsed = parseItalianDecimal(str);
      if (parsed === null) {
        ctx.addIssue({ code: "custom", message: `${label}: numero non valido` });
        return z.NEVER;
      }
      const d = new Decimal(parsed);
      if (d.decimalPlaces() > decimals) {
        ctx.addIssue({ code: "custom", message: `${label}: massimo ${decimals} decimali` });
        return z.NEVER;
      }
      if (!opts.allowNegative && d.isNegative()) {
        ctx.addIssue({ code: "custom", message: `${label} non può essere negativo` });
        return z.NEVER;
      }
      if (d.abs().greaterThan(max)) {
        ctx.addIssue({ code: "custom", message: `${label}: valore troppo grande` });
        return z.NEVER;
      }
      return d.toFixed(decimals);
    });
}

/** Importo obbligatorio → stringa con 2 decimali (es. "1234.50"). */
export const money = (opts: MoneyOpts = {}) =>
  decimalField({ ...opts, required: true }) as unknown as z.ZodType<string, unknown>;
/** Importo facoltativo → stringa con 2 decimali o null. */
export const optionalMoney = (opts: MoneyOpts = {}) =>
  decimalField({ ...opts, required: false }) as unknown as z.ZodType<string | null, unknown>;
/** Aliquota percentuale 0–100 con al massimo 2 decimali. */
export const percent = (label = "Aliquota") =>
  decimalField({ label, required: true, max: "100" }) as unknown as z.ZodType<string, unknown>;

/** Data da <input type="date"> ("YYYY-MM-DD"); stringa vuota → null. */
export const optionalCivilDate = (label = "Data") =>
  z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (!v) return null;
      if (!isCivilDate(v)) {
        ctx.addIssue({ code: "custom", message: `${label} non valida` });
        return z.NEVER;
      }
      return v as CivilDate;
    });

export const uuid = z.uuid({ error: "Identificativo non valido" });
export const optionalUuid = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid({ error: "Selezione non valida" }).nullable());

/** Checkbox HTML: presente ("on") → true. */
export const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
  .optional()
  .nullable()
  .transform((v) => v === "on" || v === "true");

/** FormData → oggetto semplice (le chiavi ripetute non sono usate nei form). */
export function formDataToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  }
  return out;
}
