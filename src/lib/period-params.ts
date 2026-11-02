import { PERIOD_PRESETS, periodRange, type Period, type PeriodPreset } from "@/lib/calculations/period";
import { param, pickEnum, type SearchParams } from "@/lib/list-params";
import { isCivilDate, type CivilDate } from "@/lib/timezone/civil-date";

/** Legge il periodo da ?periodo=…&dal=…&al=… ; date esplicite → intervallo personalizzato. */
export function parsePeriod(sp: SearchParams, today: CivilDate, fallback: PeriodPreset): Period {
  const from = param(sp, "dal");
  const to = param(sp, "al");
  const validFrom = from && isCivilDate(from) ? (from as CivilDate) : null;
  const validTo = to && isCivilDate(to) ? (to as CivilDate) : null;
  if (validFrom || validTo) return periodRange("custom", today, { from: validFrom, to: validTo });
  const preset = pickEnum(param(sp, "periodo"), PERIOD_PRESETS) ?? fallback;
  return periodRange(preset === "custom" ? fallback : preset, today);
}
