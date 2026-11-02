import { StatusBadge } from "@/components/common/status-badge";
import type { SettlementStatus } from "@/generated/prisma/enums";
import { displayStatus } from "@/lib/calculations/amounts";
import { SETTLEMENT_STATUS_LABELS, SETTLEMENT_STATUS_TONES } from "@/lib/labels";
import { civilFromDb, type CivilDate } from "@/lib/timezone/civil-date";

export function SettlementBadge({ status, dueDate, today }: { status: SettlementStatus; dueDate: Date | null; today: CivilDate }) {
  const s = displayStatus(status, dueDate ? civilFromDb(dueDate) : null, today);
  return <StatusBadge tone={SETTLEMENT_STATUS_TONES[s]}>{SETTLEMENT_STATUS_LABELS[s]}</StatusBadge>;
}
