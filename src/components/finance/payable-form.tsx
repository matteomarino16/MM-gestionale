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
import { payableAmounts } from "@/lib/calculations/amounts";
import { formatMoney } from "@/lib/format";
import { parseItalianDecimal } from "@/lib/validation/common";
import type { ServiceOption } from "./link-options";

export type PayableFormValues = {
  id?: string;
  providerId: string;
  categoryId: string;
  serviceId: string;
  renewalId: string;
  description: string;
  expectedAmount: string;
  actualAmount: string;
  vatRate: string;
  dueDate: string;
  notes: string;
};

export function PayableForm({
  action,
  values,
  providers,
  categories,
  services,
  clientNames,
  cancelHref,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  values: PayableFormValues;
  providers: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  services: ServiceOption[];
  clientNames: Record<string, string>;
  cancelHref: string;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  const err = (k: string) => state?.fieldErrors?.[k];
  const [providerId, setProviderId] = useState(values.providerId);
  const [serviceId, setServiceId] = useState(values.serviceId);
  const [renewalId, setRenewalId] = useState(values.renewalId);
  const [expected, setExpected] = useState(values.expectedAmount);
  const [actual, setActual] = useState(values.actualAmount);
  const [vat, setVat] = useState(values.vatRate);

  const renewals = services.find((s) => s.id === serviceId)?.renewals ?? [];
  const e = parseItalianDecimal(expected || "0");
  const a = actual.trim() ? parseItalianDecimal(actual) : null;
  const v = parseItalianDecimal(vat || "0");
  const preview = e !== null && v !== null && (a !== null || !actual.trim()) ? payableAmounts(e, a, v) : null;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <FormAlert state={state} />

      <FormSection title="Fornitore e collegamenti" description="Indica almeno fornitore, servizio o categoria.">
        <FormField id="providerId" label="Fornitore" errors={err("providerId")}>
          <NativeSelect id="providerId" name="providerId" value={providerId} onChange={(ev) => setProviderId(ev.target.value)} className="w-full">
            <NativeSelectOption value="">Nessun fornitore</NativeSelectOption>
            {providers.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="categoryId" label="Categoria di costo" errors={err("categoryId")}>
          <NativeSelect id="categoryId" name="categoryId" defaultValue={values.categoryId} className="w-full">
            <NativeSelectOption value="">Nessuna categoria</NativeSelectOption>
            {categories.map((c) => (
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
            onChange={(ev) => {
              setServiceId(ev.target.value);
              setRenewalId("");
              const svc = services.find((s) => s.id === ev.target.value);
              if (svc?.providerId && !providerId) setProviderId(svc.providerId);
            }}
            className="w-full"
          >
            <NativeSelectOption value="">Nessun servizio</NativeSelectOption>
            {services.map((s) => (
              <NativeSelectOption key={s.id} value={s.id}>
                {s.name} — {clientNames[s.clientId] ?? ""}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="renewalId" label="Ciclo di rinnovo" errors={err("renewalId")}>
          <NativeSelect id="renewalId" name="renewalId" value={renewalId} onChange={(ev) => setRenewalId(ev.target.value)} className="w-full" disabled={renewals.length === 0}>
            <NativeSelectOption value="">{renewals.length ? "Nessun ciclo specifico" : "Nessun ciclo disponibile"}</NativeSelectOption>
            {renewals.map((r) => (
              <NativeSelectOption key={r.id} value={r.id}>
                {r.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
      </FormSection>

      <FormSection title="Importi" description="Imponibili, IVA esclusa. L'importo effettivo, se indicato, sostituisce quello previsto.">
        <FormField id="description" label="Descrizione" required errors={err("description")} className="sm:col-span-2">
          <Input id="description" name="description" defaultValue={values.description} aria-invalid={!!err("description")} />
        </FormField>
        <FormField id="expectedAmount" label="Importo previsto (€)" required errors={err("expectedAmount")}>
          <Input id="expectedAmount" name="expectedAmount" inputMode="decimal" value={expected} onChange={(ev) => setExpected(ev.target.value)} placeholder="0,00" aria-invalid={!!err("expectedAmount")} />
        </FormField>
        <FormField id="actualAmount" label="Importo effettivo (€)" hint="Da compilare a consuntivo" errors={err("actualAmount")}>
          <Input id="actualAmount" name="actualAmount" inputMode="decimal" value={actual} onChange={(ev) => setActual(ev.target.value)} />
        </FormField>
        <FormField id="vatRate" label="IVA (%)" required errors={err("vatRate")}>
          <Input id="vatRate" name="vatRate" inputMode="decimal" value={vat} onChange={(ev) => setVat(ev.target.value)} />
        </FormField>
        <FormField id="dueDate" label="Data prevista di pagamento" errors={err("dueDate")}>
          <Input id="dueDate" name="dueDate" type="date" defaultValue={values.dueDate} />
        </FormField>
        <div className="rounded-lg bg-muted/50 p-3 text-sm sm:col-span-2" aria-live="polite">
          {preview ? (
            <span>
              IVA <span className="tabular-nums">{formatMoney(preview.vatAmount)}</span> · Totale da pagare{" "}
              <strong className="tabular-nums">{formatMoney(preview.amountDue)}</strong>
            </span>
          ) : (
            <span className="text-muted-foreground">Inserisci importi validi per vedere il totale.</span>
          )}
        </div>
        <FormField id="notes" label="Note" errors={err("notes")} className="sm:col-span-2">
          <Textarea id="notes" name="notes" rows={3} defaultValue={values.notes} />
        </FormField>
      </FormSection>

      <SubmitBar pending={pending} label={values.id ? "Salva modifiche" : "Registra costo"} cancelHref={cancelHref} />
    </form>
  );
}
