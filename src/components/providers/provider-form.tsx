"use client";

import type { Provider } from "@/generated/prisma/client";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField, FormSection } from "@/components/forms/form-field";
import { SubmitBar } from "@/components/forms/submit-bar";
import { useFormAction } from "@/components/forms/use-form-action";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/action-result";

type Values = Pick<Provider, "id" | "name" | "website" | "email" | "phone" | "accountRef" | "notes">;

export function ProviderForm({
  action,
  provider,
  cancelHref,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  provider?: Values;
  cancelHref: string;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {provider && <input type="hidden" name="id" value={provider.id} />}
      <FormAlert state={state} />
      <FormSection title="Fornitore">
        <FormField id="name" label="Nome" required errors={err("name")}>
          <Input id="name" name="name" defaultValue={provider?.name ?? ""} aria-invalid={!!err("name")} />
        </FormField>
        <FormField id="website" label="Sito web" errors={err("website")}>
          <Input id="website" name="website" type="url" placeholder="https://" defaultValue={provider?.website ?? ""} />
        </FormField>
        <FormField id="email" label="Email" errors={err("email")}>
          <Input id="email" name="email" type="email" defaultValue={provider?.email ?? ""} />
        </FormField>
        <FormField id="phone" label="Telefono" errors={err("phone")}>
          <Input id="phone" name="phone" type="tel" defaultValue={provider?.phone ?? ""} />
        </FormField>
        <FormField id="accountRef" label="Codice cliente / account" hint="Il tuo identificativo presso il fornitore" errors={err("accountRef")}>
          <Input id="accountRef" name="accountRef" defaultValue={provider?.accountRef ?? ""} />
        </FormField>
        <FormField id="notes" label="Note" errors={err("notes")} className="sm:col-span-2">
          <Textarea id="notes" name="notes" rows={3} defaultValue={provider?.notes ?? ""} />
        </FormField>
      </FormSection>
      <SubmitBar pending={pending} label={provider ? "Salva modifiche" : "Crea fornitore"} cancelHref={cancelHref} />
    </form>
  );
}
