import { addDays, addMonths, parseCivilDate, type CivilDate } from "@/lib/timezone/civil-date";

export const PERIOD_PRESETS = ["day", "week", "month", "quarter", "year", "custom", "all"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  day: "Oggi",
  week: "Questa settimana",
  month: "Questo mese",
  quarter: "Questo trimestre",
  year: "Quest'anno",
  custom: "Intervallo personalizzato",
  all: "Tutto",
};

/** Intervallo chiuso [from, to] di date civili; null = nessun limite. */
export type Period = { preset: PeriodPreset; from: CivilDate | null; to: CivilDate | null };

function weekday(date: CivilDate): number {
  // 0 = lunedì … 6 = domenica
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Calcola il periodo di calendario che contiene `ref` (settimana da lunedì a domenica). */
export function periodRange(preset: PeriodPreset, ref: CivilDate, custom?: { from?: CivilDate | null; to?: CivilDate | null }): Period {
  const [y, m] = ref.split("-").map(Number);
  const first = (yy: number, mm: number) => parseCivilDate(`${yy}-${String(mm).padStart(2, "0")}-01`);
  switch (preset) {
    case "day":
      return { preset, from: ref, to: ref };
    case "week": {
      const from = addDays(ref, -weekday(ref));
      return { preset, from, to: addDays(from, 6) };
    }
    case "month": {
      const from = first(y, m);
      return { preset, from, to: addDays(addMonths(from, 1), -1) };
    }
    case "quarter": {
      const from = first(y, Math.floor((m - 1) / 3) * 3 + 1);
      return { preset, from, to: addDays(addMonths(from, 3), -1) };
    }
    case "year":
      return { preset, from: first(y, 1), to: parseCivilDate(`${y}-12-31`) };
    case "custom": {
      let from = custom?.from ?? null;
      let to = custom?.to ?? null;
      if (from && to && from > to) [from, to] = [to, from];
      return { preset, from, to };
    }
    case "all":
      return { preset, from: null, to: null };
  }
}
