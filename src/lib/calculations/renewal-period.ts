import { Decimal } from "decimal.js";
import type { IntervalUnit, RenewalFrequency } from "@/generated/prisma/enums";
import { addDays, addMonths, type CivilDate } from "@/lib/timezone/civil-date";

export type FrequencySpec = {
  frequency: RenewalFrequency;
  customIntervalValue?: number | null;
  customIntervalUnit?: IntervalUnit | null;
};

export type Period = { unit: IntervalUnit; value: number };

const FIXED: Partial<Record<RenewalFrequency, Period>> = {
  MONTHLY: { unit: "MONTH", value: 1 },
  QUARTERLY: { unit: "MONTH", value: 3 },
  SEMIANNUAL: { unit: "MONTH", value: 6 },
  ANNUAL: { unit: "MONTH", value: 12 },
  BIENNIAL: { unit: "MONTH", value: 24 },
};

/** Durata di un ciclo di rinnovo; null per i servizi una tantum. */
export function renewalPeriod(spec: FrequencySpec): Period | null {
  if (spec.frequency === "NONE") return null;
  if (spec.frequency === "CUSTOM") {
    if (!spec.customIntervalValue || spec.customIntervalValue <= 0 || !spec.customIntervalUnit) {
      throw new Error("Frequenza personalizzata senza intervallo valido");
    }
    return { unit: spec.customIntervalUnit, value: spec.customIntervalValue };
  }
  return FIXED[spec.frequency]!;
}

/** Scadenza successiva a un rinnovo, calcolata sul calendario (fine mese gestita). */
export function nextExpiry(expiry: CivilDate, spec: FrequencySpec): CivilDate | null {
  const p = renewalPeriod(spec);
  if (!p) return null;
  return p.unit === "MONTH" ? addMonths(expiry, p.value) : addDays(expiry, p.value);
}

/** Importo per ciclo riportato su base annua (stima); null per i servizi una tantum. */
export function annualizedAmount(amount: string, spec: FrequencySpec): string | null {
  const p = renewalPeriod(spec);
  if (!p) return null;
  const perYear = p.unit === "MONTH" ? new Decimal(12).div(p.value) : new Decimal(365).div(p.value);
  return new Decimal(amount).times(perYear).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/** Margine per ciclo: prezzo al cliente − costo del fornitore (imponibili). */
export function cycleMargin(clientPrice: string, providerCost: string): string {
  return new Decimal(clientPrice).minus(providerCost).toFixed(2);
}
