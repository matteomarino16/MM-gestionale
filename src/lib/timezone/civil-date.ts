import { TZDate } from "@date-fns/tz";

/**
 * Data civile "YYYY-MM-DD" (scadenze, date di pagamento): non ha fuso orario.
 * In PostgreSQL è una colonna DATE; Prisma la espone come Date a mezzanotte UTC,
 * quindi la conversione usa sempre i componenti UTC e mai l'ora locale.
 */
export type CivilDate = string & { readonly __civil: unique symbol };

const CIVIL_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCivilDate(value: string): value is CivilDate {
  const m = CIVIL_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function parseCivilDate(value: string): CivilDate {
  if (!isCivilDate(value)) throw new Error(`Data non valida: ${value}`);
  return value;
}

function fromParts(y: number, m: number, d: number): CivilDate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` as CivilDate;
}

function parts(date: CivilDate): [number, number, number] {
  const m = CIVIL_RE.exec(date)!;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Colonna DATE letta da Prisma → data civile. */
export function civilFromDb(value: Date): CivilDate {
  return fromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

/** Data civile → valore da scrivere in una colonna DATE con Prisma. */
export function civilToDb(date: CivilDate): Date {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Somma giorni di calendario (non multipli di 24 ore). */
export function addDays(date: CivilDate, days: number): CivilDate {
  const [y, m, d] = parts(date);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return fromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Somma mesi; se il giorno non esiste nel mese di arrivo si usa l'ultimo giorno (31/01 + 1 mese = 28/29 febbraio). */
export function addMonths(date: CivilDate, months: number): CivilDate {
  const [y, m, d] = parts(date);
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return fromParts(ty, tm, Math.min(d, lastDay));
}

export function compareCivil(a: CivilDate, b: CivilDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Differenza in giorni di calendario (b - a). */
export function diffDays(a: CivilDate, b: CivilDate): number {
  return Math.round((civilToDb(b).getTime() - civilToDb(a).getTime()) / 86_400_000);
}

/** Data civile odierna nel fuso indicato. */
export function todayIn(timeZone: string, now: Date = new Date()): CivilDate {
  const z = new TZDate(now.getTime(), timeZone);
  return fromParts(z.getFullYear(), z.getMonth() + 1, z.getDate());
}

/**
 * Istante corrispondente all'ora locale `time` (HH:MM) della data civile nel fuso
 * indicato, tenendo conto di ora legale/solare.
 */
export function zonedInstant(date: CivilDate, time: string, timeZone: string): Date {
  const tm = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!tm) throw new Error(`Orario non valido: ${time}`);
  const [y, m, d] = parts(date);
  const z = new TZDate(y, m - 1, d, Number(tm[1]), Number(tm[2]), 0, timeZone);
  return new Date(z.getTime());
}
