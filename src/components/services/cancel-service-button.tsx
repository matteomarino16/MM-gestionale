"use client";

import { BanIcon } from "lucide-react";
import { ConfirmAction } from "@/components/common/confirm-action";
import { cancelServiceAction } from "@/modules/services/actions";

export function CancelServiceButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmAction
      trigger={
        <>
          <BanIcon /> Annulla servizio
        </>
      }
      title="Annullare il servizio?"
      description={`${name} verrà segnato come annullato e il ciclo di rinnovo aperto sarà chiuso. Lo storico di rinnovi, crediti e costi resta conservato. Potrai riattivarlo modificandone lo stato.`}
      confirmLabel="Annulla servizio"
      action={() => cancelServiceAction(id)}
    />
  );
}
