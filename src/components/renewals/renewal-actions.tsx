"use client";

import { useState } from "react";
import { CheckCircle2Icon, Loader2Icon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { useFormAction } from "@/components/forms/use-form-action";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { RENEWAL_STATUS_LABELS } from "@/lib/labels";
import { MANUAL_RENEWAL_STATUSES } from "@/modules/renewals/schema";
import { completeRenewalAction, setRenewalStatusAction, skipRenewalAction, updateRenewalDetailsAction } from "@/modules/renewals/actions";

const ok = (s: { success?: string }) => toast.success(s.success);

export function RenewalStatusForm({ id, status }: { id: string; status: string }) {
  const { state, pending, onSubmit } = useFormAction(setRenewalStatusAction, { onSuccess: ok });
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <FormAlert state={state} />
      <div className="flex flex-wrap gap-2">
        <NativeSelect name="status" defaultValue={status} aria-label="Stato del rinnovo" className="min-w-56 flex-1">
          {MANUAL_RENEWAL_STATUSES.map((s) => (
            <NativeSelectOption key={s} value={s}>
              {RENEWAL_STATUS_LABELS[s]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Aggiorna stato
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Lo stato è operativo: il rinnovo risulta effettuato solo con la conferma qui sotto, anche se il cliente ha già pagato.
      </p>
    </form>
  );
}

export function CompleteRenewalForm({ id, today, suggestedExpiry, expectedCost }: { id: string; today: string; suggestedExpiry: string; expectedCost: string }) {
  const { state, pending, onSubmit } = useFormAction(completeRenewalAction, { onSuccess: ok });
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <FormAlert state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id="renewedAt" label="Rinnovato il" required errors={err("renewedAt")}>
          <Input id="renewedAt" name="renewedAt" type="date" defaultValue={today} max={today} />
        </FormField>
        <FormField id="newExpiryDate" label="Nuova scadenza" required errors={err("newExpiryDate")}>
          <Input id="newExpiryDate" name="newExpiryDate" type="date" defaultValue={suggestedExpiry} />
        </FormField>
        <FormField id="actualProviderCost" label="Costo effettivo (€)" hint="Imponibile pagato al fornitore" errors={err("actualProviderCost")}>
          <Input id="actualProviderCost" name="actualProviderCost" inputMode="decimal" placeholder={expectedCost} />
        </FormField>
        <FormField id="completeNotes" label="Note" errors={err("notes")} className="sm:col-span-3">
          <Input id="completeNotes" name="notes" placeholder="Es. numero ordine del rinnovo" />
        </FormField>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : <CheckCircle2Icon />}
        Conferma rinnovo effettuato
      </Button>
    </form>
  );
}

export function SkipRenewalButton({ id, serviceName }: { id: string; serviceName: string }) {
  const [open, setOpen] = useState(false);
  const { state, pending, onSubmit } = useFormAction(skipRenewalAction, {
    onSuccess: (s) => {
      toast.success(s.success);
      setOpen(false);
    },
  });
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
        <XCircleIcon /> Non rinnovare
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Non rinnovare {serviceName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Il ciclo verrà annullato e il servizio segnato come scaduto; i promemoria si fermano. Lo storico resta conservato. Per rinnovare
              in seguito basterà riattivare il servizio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input type="hidden" name="id" value={id} />
          <FormAlert state={state} />
          <FormField id="skip-reason" label="Motivo (facoltativo)">
            <Textarea id="skip-reason" name="reason" rows={2} />
          </FormField>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Annulla</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Non rinnovare
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RenewalDetailsForm({
  id,
  plannedRenewalDate,
  expectedProviderCost,
  clientPrice,
  notes,
}: {
  id: string;
  plannedRenewalDate: string;
  expectedProviderCost: string;
  clientPrice: string;
  notes: string;
}) {
  const { state, pending, onSubmit } = useFormAction(updateRenewalDetailsAction, { onSuccess: ok });
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <FormAlert state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id="plannedRenewalDate" label="Rinnovo previsto il" errors={err("plannedRenewalDate")}>
          <Input id="plannedRenewalDate" name="plannedRenewalDate" type="date" defaultValue={plannedRenewalDate} />
        </FormField>
        <FormField id="expectedProviderCost" label="Costo previsto (€)" errors={err("expectedProviderCost")}>
          <Input id="expectedProviderCost" name="expectedProviderCost" inputMode="decimal" defaultValue={expectedProviderCost} />
        </FormField>
        <FormField id="clientPrice" label="Prezzo al cliente (€)" errors={err("clientPrice")}>
          <Input id="clientPrice" name="clientPrice" inputMode="decimal" defaultValue={clientPrice} />
        </FormField>
        <FormField id="renewalNotes" label="Note" errors={err("notes")} className="sm:col-span-3">
          <Textarea id="renewalNotes" name="notes" rows={2} defaultValue={notes} />
        </FormField>
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Salva
      </Button>
    </form>
  );
}
