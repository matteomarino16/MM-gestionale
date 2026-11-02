"use client";

import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { FormState } from "@/lib/action-result";
import { formatNumber } from "@/lib/format";
import { options, PAYMENT_METHOD_LABELS } from "@/lib/labels";

/** Registra un incasso (credito) o un pagamento (debito). Il residuo è proposto come importo. */
export function PaymentForm({
  action,
  targetId,
  residual,
  today,
  submitLabel,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  targetId: string;
  residual: string;
  today: string;
  submitLabel: string;
}) {
  const { state, pending, onSubmit } = useFormAction(action, {
    onSuccess: (s, form) => {
      toast.success(s.success);
      form.reset();
    },
  });
  const err = (k: string) => state?.fieldErrors?.[k];

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <input type="hidden" name="targetId" value={targetId} />
      <FormAlert state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="pay-amount" label="Importo (€)" required errors={err("amount")}>
          <Input id="pay-amount" name="amount" inputMode="decimal" defaultValue={formatNumber(residual)} key={residual} aria-invalid={!!err("amount")} />
        </FormField>
        <FormField id="pay-date" label="Data" required errors={err("paidOn")}>
          <Input id="pay-date" name="paidOn" type="date" defaultValue={today} max={today} />
        </FormField>
        <FormField id="pay-method" label="Metodo" errors={err("method")}>
          <NativeSelect id="pay-method" name="method" defaultValue="BANK_TRANSFER" className="w-full">
            {options(PAYMENT_METHOD_LABELS).map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="pay-ref" label="Riferimento" hint="CRO, ID transazione…" errors={err("reference")}>
          <Input id="pay-ref" name="reference" />
        </FormField>
        <FormField id="pay-notes" label="Note" errors={err("notes")} className="sm:col-span-2">
          <Input id="pay-notes" name="notes" />
        </FormField>
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
