"use client";

import { useState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField, FormSection } from "@/components/forms/form-field";
import { SubmitBar } from "@/components/forms/submit-bar";
import { useFormAction } from "@/components/forms/use-form-action";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/action-result";
import { receivableAmounts } from "@/lib/calculations/amounts";
import { formatMoney } from "@/lib/format";
import { parseItalianDecimal } from "@/lib/validation/common";
import type { ServiceOption } from "./link-options";

export type ReceivableFormValues = {
  id?: string;
  clientId: string;
  serviceId: string;
  renewalId: string;
  description: string;
  netAmount: string;
  vatRate: string;
  withholdingRate: string;
  dueDate: string;
  notes: string;
};

export function ReceivableForm({
  action,
  values,
  clients,
  services,
  cancelHref,
  lockClient,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  values: ReceivableFormValues;
  clients: { id: string; name: string }[];
  services: ServiceOption[];
  cancelHref: string;
  /** Con pagamenti registrati il cliente non è modificabile. */
  lockClient?: boolean;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  const err = (k: string) => state?.fieldErrors?.[k];
  const [clientId, setClientId] = useState(values.clientId);
  const [serviceId, setServiceId] = useState(values.serviceId);
  const [renewalId, setRenewalId] = useState(values.renewalId);
  const [net, setNet] = useState(values.netAmount);
  const [vat, setVat] = useState(values.vatRate);
  const [wh, setWh] = useState(values.withholdingRate);

  const clientServices = services.filter((s) => s.clientId === clientId);
  const renewals = clientServices.find((s) => s.id === serviceId)?.renewals ?? [];
  const n = parseItalianDecimal(net || "0");
  const v = parseItalianDecimal(vat || "0");
  const w = parseItalianDecimal(wh || "0");
  const preview = n !== null && v !== null && w !== null ? receivableAmounts(n, v, w) : null;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <FormAlert state={state} />

      <FormSection title="Cliente e collegamenti" description="Il credito può riferirsi a un servizio e a uno specifico ciclo di rinnovo.">
        <FormField id="clientId" label="Cliente" required errors={err("clientId")}>
          {lockClient && <input type="hidden" name="clientId" value={clientId} />}
          <NativeSelect
            id="clientId"
            name={lockClient ? undefined : "clientId"}
            value={clientId}
            disabled={lockClient}
            onChange={(e) => {
              setClientId(e.target.value);
              setServiceId("");
              setRenewalId("");
            }}
            className="w-full"
            aria-invalid={!!err("clientId")}
          >
            <NativeSelectOption value="" disabled>
              Seleziona un cliente
            </NativeSelectOption>
            {clients.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="serviceId" label="Servizio" errors={err("serviceId")}>
          <NativeSelect
            id="serviceId"
            name="serviceId"
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setRenewalId("");
            }}
            className="w-full"
            disabled={!clientId}
          >
            <NativeSelectOption value="">Nessun servizio</NativeSelectOption>
            {clientServices.map((s) => (
              <NativeSelectOption key={s.id} value={s.id}>
                {s.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="renewalId" label="Ciclo di rinnovo" errors={err("renewalId")} className="sm:col-span-2">
          <NativeSelect id="renewalId" name="renewalId" value={renewalId} onChange={(e) => setRenewalId(e.target.value)} className="w-full" disabled={renewals.length === 0}>
            <NativeSelectOption value="">{renewals.length ? "Nessun ciclo specifico" : "Nessun ciclo disponibile"}</NativeSelectOption>
            {renewals.map((r) => (
              <NativeSelectOption key={r.id} value={r.id}>
                {r.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
      </FormSection>

      <FormSection title="Importi" description="Imponibile concordato; IVA e ritenuta sono calcolate dal sistema.">
        <FormField id="description" label="Descrizione" required errors={err("description")} className="sm:col-span-2">
          <Input id="description" name="description" defaultValue={values.description} aria-invalid={!!err("description")} />
        </FormField>
        <FormField id="netAmount" label="Importo concordato (€)" required hint="Imponibile, IVA esclusa" errors={err("netAmount")}>
          <Input id="netAmount" name="netAmount" inputMode="decimal" value={net} onChange={(e) => setNet(e.target.value)} placeholder="0,00" aria-invalid={!!err("netAmount")} />
        </FormField>
        <FormField id="dueDate" label="Scadenza del pagamento" errors={err("dueDate")}>
          <Input id="dueDate" name="dueDate" type="date" defaultValue={values.dueDate} />
        </FormField>
        <FormField id="vatRate" label="IVA (%)" required errors={err("vatRate")}>
          <Input id="vatRate" name="vatRate" inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} />
        </FormField>
        <FormField id="withholdingRate" label="Ritenuta d'acconto (%)" hint="0 se non applicabile" errors={err("withholdingRate")}>
          <Input id="withholdingRate" name="withholdingRate" inputMode="decimal" value={wh} onChange={(e) => setWh(e.target.value)} />
        </FormField>
        <div className="rounded-lg bg-muted/50 p-3 text-sm sm:col-span-2" aria-live="polite">
          {preview ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Imponibile</dt>
                <dd className="tabular-nums">{formatMoney(preview.netAmount)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">IVA</dt>
                <dd className="tabular-nums">{formatMoney(preview.vatAmount)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ritenuta</dt>
                <dd className="tabular-nums">− {formatMoney(preview.withholdingAmount)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Dovuto dal cliente</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(preview.amountDue)}</dd>
              </div>
            </dl>
          ) : (
            <span className="text-muted-foreground">Inserisci importi validi per vedere il totale.</span>
          )}
        </div>
        <FormField id="notes" label="Note" errors={err("notes")} className="sm:col-span-2">
          <Textarea id="notes" name="notes" rows={3} defaultValue={values.notes} />
        </FormField>
      </FormSection>

      <SubmitBar pending={pending} label={values.id ? "Salva modifiche" : "Registra credito"} cancelHref={cancelHref} />
    </form>
  );
}
