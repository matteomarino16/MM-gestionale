import { civilFromDb, type CivilDate } from "@/lib/timezone/civil-date";

export const LOCALE = "it-IT";
export const DEFAULT_TIMEZONE = "Europe/Rome";

type DecimalLike = { toString(): string };

const currencyFormatters = new Map<string, Intl.NumberFormat>();

/** Formatta un importo (Decimal o stringa decimale) senza passare da calcoli in floating point. */
export function formatMoney(value: DecimalLike | string | null | undefined, currency = "EUR"): string {
  if (value === null || value === undefined) return "—";
  let fmt = currencyFormatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat(LOCALE, { style: "currency", currency, minimumFractionDigits: 2, useGrouping: "always" });
    currencyFormatters.set(currency, fmt);
  }
  // Intl accetta stringhe decimali esatte (Intl.NumberFormat v3).
  return fmt.format(value.toString() as unknown as number);
}

export function formatNumber(value: DecimalLike | string | number, fractionDigits = 2): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: "always",
  }).format(value.toString() as unknown as number);
}

/** Data civile (colonna DATE) in formato DD/MM/YYYY. */
export function formatCivilDate(value: Date | CivilDate | null | undefined): string {
  if (!value) return "—";
  const civil = typeof value === "string" ? value : civilFromDb(value);
  const [y, m, d] = civil.split("-");
  return `${d}/${m}/${y}`;
}

/** Istante (timestamptz) nel fuso indicato: DD/MM/YYYY HH:MM. */
export function formatDateTime(value: Date | null | undefined, timeZone = DEFAULT_TIMEZONE): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
