import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PERIOD_LABELS, PERIOD_PRESETS, type Period } from "@/lib/calculations/period";

/** Campi del filtro periodo, da inserire in un ListToolbar (form GET). */
export function PeriodFilter({ period, label = "Periodo" }: { period: Period; label?: string }) {
  const custom = period.preset === "custom";
  return (
    <>
      <NativeSelect name="periodo" defaultValue={custom ? "all" : period.preset} aria-label={label}>
        {PERIOD_PRESETS.filter((p) => p !== "custom").map((p) => (
          <NativeSelectOption key={p} value={p}>
            {PERIOD_LABELS[p]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Input type="date" name="dal" defaultValue={custom ? (period.from ?? "") : ""} aria-label="Dal" className="w-auto" />
      <Input type="date" name="al" defaultValue={custom ? (period.to ?? "") : ""} aria-label="Al" className="w-auto" />
    </>
  );
}

export function describePeriod(period: Period): string {
  const fmt = (d: string) => d.split("-").reverse().join("/");
  if (period.preset === "all") return "Tutto il periodo";
  if (period.from && period.to && period.from === period.to) return fmt(period.from);
  if (period.from && period.to) return `${fmt(period.from)} – ${fmt(period.to)}`;
  if (period.from) return `Dal ${fmt(period.from)}`;
  if (period.to) return `Fino al ${fmt(period.to)}`;
  return "Tutto il periodo";
}
