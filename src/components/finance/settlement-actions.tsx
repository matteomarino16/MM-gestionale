"use client";

import { BanIcon, RotateCcwIcon } from "lucide-react";
import { ConfirmAction } from "@/components/common/confirm-action";
import { cancelPayableAction, cancelReceivableAction, restorePayableAction, restoreReceivableAction } from "@/modules/finance/actions";

/** Annulla / ripristina un credito o un debito con conferma. */
export function SettlementActions({ kind, id, cancelled, hasPayments }: { kind: "receivable" | "payable"; id: string; cancelled: boolean; hasPayments: boolean }) {
  const noun = kind === "receivable" ? "il credito" : "il costo";
  if (cancelled) {
    return (
      <ConfirmAction
        trigger={
          <>
            <RotateCcwIcon /> Ripristina
          </>
        }
        title={`Ripristinare ${noun}?`}
        description="Tornerà tra le voci aperte e nei calcoli economici."
        confirmLabel="Ripristina"
        variant="default"
        action={() => (kind === "receivable" ? restoreReceivableAction(id) : restorePayableAction(id))}
      />
    );
  }
  return (
    <ConfirmAction
      trigger={
        <>
          <BanIcon /> Annulla
        </>
      }
      title={`Annullare ${noun}?`}
      description={
        hasPayments
          ? "Ci sono pagamenti registrati: per annullare occorre prima stornarli."
          : "La voce resterà nello storico ma sarà esclusa da saldi, promemoria e margini. Potrai ripristinarla."
      }
      confirmLabel={`Annulla ${kind === "receivable" ? "credito" : "costo"}`}
      action={() => (kind === "receivable" ? cancelReceivableAction(id) : cancelPayableAction(id))}
    />
  );
}
