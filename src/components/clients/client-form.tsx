"use client";

import { useState } from "react";
import type { Client } from "@/generated/prisma/client";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField, FormSection } from "@/components/forms/form-field";
import { SubmitBar } from "@/components/forms/submit-bar";
import { useFormAction } from "@/components/forms/use-form-action";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CLIENT_TYPE_LABELS, options } from "@/lib/labels";
import type { FormState } from "@/lib/action-result";

type ClientValues = Pick<
  Client,
  | "id"
  | "type"
  | "firstName"
  | "lastName"
  | "companyName"
  | "vatNumber"
  | "taxCode"
  | "email"
  | "pec"
  | "phone"
  | "address"
  | "postalCode"
  | "city"
  | "province"
  | "country"
  | "billingAddress"
  | "notes"
>;

export function ClientForm({
  action,
  client,
  cancelHref,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  client?: ClientValues;
  cancelHref: string;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  const [type, setType] = useState(client?.type ?? "PERSON");
  const err = (k: string) => state?.fieldErrors?.[k];
  const text = (name: keyof ClientValues, label: string, props: React.ComponentProps<typeof Input> & { required?: boolean; hint?: string; className?: string } = {}) => {
    const { required, hint, className, ...rest } = props;
    return (
      <FormField id={name} label={label} required={required} hint={hint} errors={err(name)} className={className}>
        <Input
          id={name}
          name={name}
          defaultValue={(client?.[name] as string | null | undefined) ?? (name === "country" ? "IT" : "")}
          aria-invalid={!!err(name)}
          {...rest}
        />
      </FormField>
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {client && <input type="hidden" name="id" value={client.id} />}
      <FormAlert state={state} />

      <FormSection title="Anagrafica" description="Nome e cognome si possono inserire anche senza un'azienda.">
        <FormField id="type" label="Tipologia" required errors={err("type")}>
          <NativeSelect id="type" name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-full">
            {options(CLIENT_TYPE_LABELS).map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        {text("companyName", "Ragione sociale", { required: type === "COMPANY", hint: type === "PERSON" ? "Facoltativa per le persone fisiche" : undefined })}
        {text("firstName", "Nome", { autoComplete: "off" })}
        {text("lastName", "Cognome", { autoComplete: "off" })}
      </FormSection>

      <FormSection title="Dati fiscali" description="Facoltativi quando non applicabili.">
        {text("vatNumber", "Partita IVA", { inputMode: "numeric" })}
        {text("taxCode", "Codice fiscale", { className: "uppercase" })}
      </FormSection>

      <FormSection title="Contatti">
        {text("email", "Email", { type: "email" })}
        {text("pec", "PEC", { type: "email" })}
        {text("phone", "Telefono", { type: "tel" })}
      </FormSection>

      <FormSection title="Indirizzo">
        {text("address", "Indirizzo", { className: "sm:col-span-2" })}
        {text("postalCode", "CAP", { inputMode: "numeric" })}
        {text("city", "Città")}
        {text("province", "Provincia", { maxLength: 2, hint: "Sigla, es. MI" })}
        {text("country", "Paese", { maxLength: 2, hint: "Codice ISO, es. IT" })}
        <FormField id="billingAddress" label="Indirizzo di fatturazione" hint="Se diverso dall'indirizzo principale" errors={err("billingAddress")} className="sm:col-span-2">
          <Textarea id="billingAddress" name="billingAddress" rows={2} defaultValue={client?.billingAddress ?? ""} />
        </FormField>
      </FormSection>

      <FormSection title="Note interne">
        <FormField id="notes" label="Note" errors={err("notes")} className="sm:col-span-2">
          <Textarea id="notes" name="notes" rows={4} defaultValue={client?.notes ?? ""} />
        </FormField>
      </FormSection>

      <SubmitBar pending={pending} label={client ? "Salva modifiche" : "Crea cliente"} cancelHref={cancelHref} />
    </form>
  );
}
