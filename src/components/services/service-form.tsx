"use client";

import { useState } from "react";
import { Decimal } from "decimal.js";
import type { Service } from "@/generated/prisma/client";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField, FormSection } from "@/components/forms/form-field";
import { SubmitBar } from "@/components/forms/submit-bar";
import { useFormAction } from "@/components/forms/use-form-action";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/action-result";
import { annualizedAmount } from "@/lib/calculations/renewal-period";
import { formatMoney, formatNumber } from "@/lib/format";
import { FREQUENCY_LABELS, INTERVAL_UNIT_LABELS, options, SERVICE_STATUS_LABELS, SERVICE_TYPE_LABELS } from "@/lib/labels";
import { civilFromDb } from "@/lib/timezone/civil-date";
import { parseItalianDecimal } from "@/lib/validation/common";
import { SERVICE_CATALOG, type ServicePreset } from "@/modules/services/catalog";

type Option = { id: string; name: string };

/** Valori del servizio serializzabili (i Decimal arrivano come stringhe). */
export type ServiceFormValues = Omit<Service, "providerCost" | "clientPrice" | "vatRate" | "createdAt" | "updatedAt"> & {
  providerCost: string;
  clientPrice: string;
  vatRate: string;
};

const money = (v: string | undefined) => (v ? formatNumber(v) : "");

export function ServiceForm({
  action,
  service,
  clients,
  providers,
  defaultClientId,
  cancelHref,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  service?: ServiceFormValues;
  clients: Option[];
  providers: Option[];
  defaultClientId?: string;
  cancelHref: string;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  const err = (k: string) => state?.fieldErrors?.[k];
  const [frequency, setFrequency] = useState(service?.frequency ?? "ANNUAL");
  const [unit, setUnit] = useState(service?.customIntervalUnit ?? "MONTH");
  const [interval, setInterval] = useState(service?.customIntervalValue?.toString() ?? "");
  const [cost, setCost] = useState(money(service?.providerCost));
  const [price, setPrice] = useState(money(service?.clientPrice));
  // Modello dal catalogo: precompila tipologia, nome, descrizione e frequenza (solo nuovi servizi).
  const [preset, setPreset] = useState<ServicePreset | null>(null);
  const applyPreset = (id: string) => {
    const p = SERVICE_CATALOG.find((x) => x.id === id) ?? null;
    setPreset(p);
    if (p) setFrequency(p.frequency);
  };

  const costD = parseItalianDecimal(cost || "0");
  const priceD = parseItalianDecimal(price || "0");
  let preview: { margin: string; yearly: string | null } | null = null;
  if (costD !== null && priceD !== null) {
    const margin = new Decimal(priceD).minus(costD).toFixed(2);
    let yearly: string | null = null;
    try {
      yearly = annualizedAmount(margin, {
        frequency,
        customIntervalValue: Number(interval) || null,
        customIntervalUnit: unit,
      });
    } catch {
      yearly = null;
    }
    preview = { margin, yearly };
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {service && <input type="hidden" name="id" value={service.id} />}
      <input type="hidden" name="currency" value={service?.currency ?? "EUR"} />
      <FormAlert state={state} />

      {!service && (
        <FormSection title="Modello" description="Parti da un servizio del catalogo: tipologia, nome, descrizione e frequenza si compilano da soli.">
          <FormField id="preset" label="Servizio dal catalogo" className="sm:col-span-2">
            <NativeSelect id="preset" value={preset?.id ?? ""} onChange={(e) => applyPreset(e.target.value)} className="w-full">
              <NativeSelectOption value="">Nessun modello (compilo a mano)</NativeSelectOption>
              {(["Progetti", "Servizi ricorrenti"] as const).map((group) => (
                <NativeSelectOptGroup key={group} label={group}>
                  {SERVICE_CATALOG.filter((p) => p.group === group).map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelectOptGroup>
              ))}
            </NativeSelect>
          </FormField>
        </FormSection>
      )}

      <FormSection title="Servizio">
        <FormField id="clientId" label="Cliente" required errors={err("clientId")}>
          <NativeSelect id="clientId" name="clientId" defaultValue={service?.clientId ?? defaultClientId ?? ""} className="w-full" aria-invalid={!!err("clientId")}>
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
        <FormField id="type" label="Tipologia" required errors={err("type")}>
          <NativeSelect key={`type-${preset?.id}`} id="type" name="type" defaultValue={preset?.type ?? service?.type ?? "DOMAIN_RENEWAL"} className="w-full">
            {options(SERVICE_TYPE_LABELS).map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="name" label="Nome" required hint="Es. esempio.it, Hosting WordPress, Manutenzione annuale" errors={err("name")}>
          <Input key={`name-${preset?.id}`} id="name" name="name" defaultValue={preset?.name ?? service?.name ?? ""} aria-invalid={!!err("name")} />
        </FormField>
        <FormField id="domain" label="Dominio" hint="Facoltativo, usato anche nella ricerca" errors={err("domain")}>
          <Input id="domain" name="domain" placeholder="esempio.it" defaultValue={service?.domain ?? ""} autoCapitalize="none" />
        </FormField>
        <FormField id="description" label="Descrizione" errors={err("description")} className="sm:col-span-2">
          <Textarea key={`desc-${preset?.id}`} id="description" name="description" rows={2} defaultValue={preset?.description ?? service?.description ?? ""} />
        </FormField>
      </FormSection>

      <FormSection title="Fornitore">
        <FormField id="providerId" label="Fornitore" errors={err("providerId")}>
          <NativeSelect id="providerId" name="providerId" defaultValue={service?.providerId ?? ""} className="w-full">
            <NativeSelectOption value="">Nessuno / interno</NativeSelectOption>
            {providers.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="providerRef" label="Identificativo presso il fornitore" hint="Es. numero ordine, ID contratto" errors={err("providerRef")}>
          <Input id="providerRef" name="providerRef" defaultValue={service?.providerRef ?? ""} />
        </FormField>
      </FormSection>

      <FormSection title="Durata e rinnovo">
        <FormField id="startDate" label="Data di inizio" errors={err("startDate")}>
          <Input id="startDate" name="startDate" type="date" defaultValue={service?.startDate ? civilFromDb(new Date(service.startDate)) : ""} />
        </FormField>
        <FormField id="expiryDate" label="Data di scadenza" errors={err("expiryDate")}>
          <Input
            id="expiryDate"
            name="expiryDate"
            type="date"
            defaultValue={service?.expiryDate ? civilFromDb(new Date(service.expiryDate)) : ""}
            aria-invalid={!!err("expiryDate")}
          />
        </FormField>
        <FormField id="frequency" label="Frequenza di rinnovo" required errors={err("frequency")}>
          <NativeSelect id="frequency" name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)} className="w-full">
            {options(FREQUENCY_LABELS).map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        {frequency === "CUSTOM" ? (
          <FormField id="customIntervalValue" label="Ogni" required errors={err("customIntervalValue") ?? err("customIntervalUnit")}>
            <div className="flex gap-2">
              <Input
                id="customIntervalValue"
                name="customIntervalValue"
                type="number"
                min={1}
                max={3650}
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="w-24"
              />
              <NativeSelect name="customIntervalUnit" value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} aria-label="Unità">
                {options(INTERVAL_UNIT_LABELS).map((o) => (
                  <NativeSelectOption key={o.value} value={o.value}>
                    {o.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </FormField>
        ) : (
          <div className="hidden sm:block" />
        )}
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox id="autoRenew" name="autoRenew" defaultChecked={service?.autoRenew ?? false} />
          <Label htmlFor="autoRenew" className="font-normal">
            Rinnovo automatico presso il fornitore
          </Label>
        </div>
      </FormSection>

      <FormSection title="Importi per ciclo" description="Imponibili, IVA esclusa. Formato italiano: 1.234,56">
        <FormField id="providerCost" label="Costo del fornitore (€)" hint="Vuoto = nessun costo" errors={err("providerCost")}>
          <Input id="providerCost" name="providerCost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" aria-invalid={!!err("providerCost")} />
        </FormField>
        <FormField id="clientPrice" label="Prezzo al cliente (€)" hint="Vuoto = da definire (0,00 €)" errors={err("clientPrice")}>
          <Input id="clientPrice" name="clientPrice" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" aria-invalid={!!err("clientPrice")} />
        </FormField>
        <FormField id="vatRate" label="Aliquota IVA (%)" required errors={err("vatRate")}>
          <Input id="vatRate" name="vatRate" inputMode="decimal" defaultValue={service ? formatNumber(service.vatRate) : "22"} />
        </FormField>
        <div className="rounded-lg bg-muted/50 p-3 text-sm" aria-live="polite">
          {preview ? (
            <>
              <div>
                Margine per ciclo: <strong className="tabular-nums">{formatMoney(preview.margin)}</strong>
              </div>
              {preview.yearly && (
                <div className="text-muted-foreground">
                  Su base annua: <span className="tabular-nums">{formatMoney(preview.yearly)}</span> (stima)
                </div>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Inserisci importi validi per vedere il margine.</span>
          )}
        </div>
      </FormSection>

      <FormSection title="Stato e note">
        <FormField id="status" label="Stato" errors={err("status")}>
          <NativeSelect id="status" name="status" defaultValue={service?.status ?? "ACTIVE"} className="w-full">
            {options(SERVICE_STATUS_LABELS).map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <div className="hidden sm:block" />
        <FormField id="notes" label="Note" errors={err("notes")} className="sm:col-span-2">
          <Textarea id="notes" name="notes" rows={3} defaultValue={service?.notes ?? ""} />
        </FormField>
      </FormSection>

      <SubmitBar pending={pending} label={service ? "Salva modifiche" : "Crea servizio"} cancelHref={cancelHref} />
    </form>
  );
}
