import type { RenewalStatus } from "@/generated/prisma/enums";
import { formatCivilDate } from "@/lib/format";
import { RENEWAL_STATUS_LABELS } from "@/lib/labels";

export type RenewalOption = { id: string; label: string };
export type ServiceOption = { id: string; name: string; clientId: string; providerId: string | null; renewals: RenewalOption[] };

/** Converte i servizi con i loro cicli in opzioni serializzabili per i form. */
export function toServiceOptions(
  services: {
    id: string;
    name: string;
    clientId: string;
    providerId: string | null;
    renewals: { id: string; cycleNumber: number; expiryDate: Date; status: RenewalStatus }[];
  }[],
): ServiceOption[] {
  return services.map((s) => ({
    id: s.id,
    name: s.name,
    clientId: s.clientId,
    providerId: s.providerId,
    renewals: s.renewals.map((r) => ({
      id: r.id,
      label: `Ciclo #${r.cycleNumber} · scadenza ${formatCivilDate(r.expiryDate)} · ${RENEWAL_STATUS_LABELS[r.status]}`,
    })),
  }));
}
