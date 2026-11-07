"use client";

import { Trash2Icon } from "lucide-react";
import { ConfirmAction } from "@/components/common/confirm-action";
import { deleteClientAction } from "@/modules/clients/actions";

export function ClientDeleteButton({ id, name, services, blocked }: { id: string; name: string; services: number; blocked: boolean }) {
  return (
    <ConfirmAction
      trigger={
        <>
          <Trash2Icon /> Elimina
        </>
      }
      title={blocked ? "Eliminazione non disponibile" : `Eliminare ${name}?`}
      description={
        blocked
          ? `${name} ha crediti, costi, pagamenti o documenti registrati: per non perdere lo storico economico non può essere eliminato. Usa "Archivia" per toglierlo dai clienti attivi.`
          : `Il cliente verrà eliminato definitivamente${services ? ` insieme ai suoi ${services} servizi, ai cicli di rinnovo e alle notifiche collegate` : ""}. L'operazione non si può annullare.`
      }
      confirmLabel={blocked ? "Ho capito" : "Elimina definitivamente"}
      variant={blocked ? "default" : "destructive"}
      triggerVariant="outline"
      action={async () => (blocked ? { ok: true } : deleteClientAction(id))}
    />
  );
}
