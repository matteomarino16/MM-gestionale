"use client";

import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react";
import { ConfirmAction } from "@/components/common/confirm-action";
import { setClientArchivedAction } from "@/modules/clients/actions";

export function ClientArchiveButton({ id, archived, name }: { id: string; archived: boolean; name: string }) {
  return archived ? (
    <ConfirmAction
      trigger={
        <>
          <ArchiveRestoreIcon /> Ripristina
        </>
      }
      title="Ripristinare il cliente?"
      description={`${name} tornerà tra i clienti attivi.`}
      confirmLabel="Ripristina"
      variant="default"
      action={() => setClientArchivedAction(id, false)}
    />
  ) : (
    <ConfirmAction
      trigger={
        <>
          <ArchiveIcon /> Archivia
        </>
      }
      title="Archiviare il cliente?"
      description={`${name} non comparirà più tra i clienti attivi. Servizi, pagamenti e storico restano conservati e il cliente potrà essere ripristinato.`}
      confirmLabel="Archivia"
      action={() => setClientArchivedAction(id, true)}
    />
  );
}
