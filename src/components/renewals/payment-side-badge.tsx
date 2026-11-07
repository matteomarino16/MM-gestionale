import { StatusBadge } from "@/components/common/status-badge";
import { CLIENT_PAYMENT_SIDE_LABELS, PAYMENT_SIDE_TONES, PROVIDER_PAYMENT_SIDE_LABELS } from "@/lib/labels";
import type { PaymentSide } from "@/modules/renewals/service";

export function PaymentSideBadge({ side, kind }: { side: PaymentSide; kind: "client" | "provider" }) {
  const labels = kind === "client" ? CLIENT_PAYMENT_SIDE_LABELS : PROVIDER_PAYMENT_SIDE_LABELS;
  return <StatusBadge tone={PAYMENT_SIDE_TONES[side.state]}>{labels[side.state]}</StatusBadge>;
}
