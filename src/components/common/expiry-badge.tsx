import { StatusBadge } from "@/components/common/status-badge";
import { formatCivilDate } from "@/lib/format";
import { civilFromDb, diffDays, type CivilDate } from "@/lib/timezone/civil-date";

/** Scadenza con indicazione dei giorni mancanti rispetto a oggi (fuso locale). */
export function ExpiryBadge({ date, today, muted }: { date: Date | null; today: CivilDate; muted?: boolean }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const days = diffDays(today, civilFromDb(date));
  const label = formatCivilDate(date);
  if (muted) return <span>{label}</span>;
  if (days < 0)
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {label} <StatusBadge tone="danger">scaduto da {-days} g</StatusBadge>
      </span>
    );
  if (days === 0)
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {label} <StatusBadge tone="danger">oggi</StatusBadge>
      </span>
    );
  if (days <= 30)
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {label} <StatusBadge tone="warning">tra {days} g</StatusBadge>
      </span>
    );
  return <span>{label}</span>;
}
