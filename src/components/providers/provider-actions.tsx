"use client";

import { PowerIcon, Trash2Icon } from "lucide-react";
import { ConfirmAction } from "@/components/common/confirm-action";
import { deleteProviderAction, setProviderActiveAction } from "@/modules/providers/actions";

export function ProviderActions({ id, name, active, deletable }: { id: string; name: string; active: boolean; deletable: boolean }) {
  return (
    <>
      <ConfirmAction
        trigger={
          <>
            <PowerIcon /> {active ? "Disattiva" : "Riattiva"}
          </>
        }
        title={active ? "Disattivare il fornitore?" : "Riattivare il fornitore?"}
        description={
          active
            ? `${name} non sarà più proposto nei nuovi servizi. Servizi e costi esistenti restano invariati.`
            : `${name} tornerà selezionabile nei servizi.`
        }
        confirmLabel={active ? "Disattiva" : "Riattiva"}
        variant={active ? "destructive" : "default"}
        action={() => setProviderActiveAction(id, !active)}
      />
      {deletable && (
        <ConfirmAction
          trigger={
            <>
              <Trash2Icon /> Elimina
            </>
          }
          title="Eliminare il fornitore?"
          description={`${name} non è collegato a servizi o costi e verrà eliminato definitivamente.`}
          confirmLabel="Elimina"
          action={() => deleteProviderAction(id)}
        />
      )}
    </>
  );
}
