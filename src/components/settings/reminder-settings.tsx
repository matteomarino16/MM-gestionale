"use client";

import { useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { createRuleAction, setRuleEnabledAction, setRulePushAction, updateReminderTimeAction } from "@/modules/reminders/actions";

export function ReminderTimeForm({ value }: { value: string }) {
  const { state, pending, onSubmit } = useFormAction(updateReminderTimeAction, { onSuccess: (s) => toast.success(s.success) });
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <FormField id="reminderTime" label="Orario dei promemoria" hint="Ora italiana (Europe/Rome)" errors={state?.fieldErrors?.reminderTime}>
        <Input id="reminderTime" name="reminderTime" type="time" defaultValue={value} className="w-32" />
      </FormField>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Salva
      </Button>
    </form>
  );
}

export function RuleToggles({ id, enabled, push }: { id: string; enabled: boolean; push: boolean }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else if (res.message) toast.success(res.message);
    });
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <label className="flex items-center gap-2">
        <Checkbox checked={enabled} disabled={pending} onCheckedChange={(v) => run(() => setRuleEnabledAction(id, !!v))} aria-label="Regola attiva" />
        Attiva
      </label>
      <label className="flex items-center gap-2">
        <Checkbox checked={push} disabled={pending || !enabled} onCheckedChange={(v) => run(() => setRulePushAction(id, !!v))} aria-label="Notifica push" />
        Push
      </label>
    </div>
  );
}

export function NewRuleForm() {
  const { state, pending, onSubmit } = useFormAction(createRuleAction, {
    onSuccess: (s, form) => {
      toast.success(s.success);
      form.reset();
    },
  });
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormAlert state={state} />
      <div className="grid gap-3 sm:grid-cols-6">
        <FormField id="rule-target" label="Per" className="sm:col-span-2">
          <NativeSelect id="rule-target" name="target" defaultValue="RENEWAL" className="w-full">
            <NativeSelectOption value="RENEWAL">Rinnovi</NativeSelectOption>
            <NativeSelectOption value="RECEIVABLE">Crediti da incassare</NativeSelectOption>
          </NativeSelect>
        </FormField>
        <FormField id="rule-days" label="Giorni" errors={err("days")}>
          <Input id="rule-days" name="days" type="number" min={0} max={365} defaultValue={3} />
        </FormField>
        <FormField id="rule-when" label="Quando" className="sm:col-span-3">
          <NativeSelect id="rule-when" name="when" defaultValue="before" className="w-full">
            <NativeSelectOption value="before">prima della scadenza</NativeSelectOption>
            <NativeSelectOption value="on">il giorno della scadenza</NativeSelectOption>
            <NativeSelectOption value="after">dopo la scadenza</NativeSelectOption>
          </NativeSelect>
        </FormField>
        <FormField id="rule-label" label="Descrizione" required errors={err("label")} className="sm:col-span-3">
          <Input id="rule-label" name="label" placeholder="Es. 3 giorni prima della scadenza" />
        </FormField>
        <FormField id="rule-repeat" label="Ripeti ogni (giorni)" hint="Facoltativo" errors={err("repeatEveryDays")} className="sm:col-span-2">
          <Input id="rule-repeat" name="repeatEveryDays" type="number" min={1} max={365} />
        </FormField>
        <FormField id="rule-max" label="Max ripetizioni" errors={err("maxRepeats")}>
          <Input id="rule-max" name="maxRepeats" type="number" min={1} max={100} />
        </FormField>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Checkbox id="rule-push" name="push" defaultChecked value="on" />
          <Label htmlFor="rule-push" className="font-normal">
            Invia anche notifica push
          </Label>
        </div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Aggiungi regola
        </Button>
      </div>
    </form>
  );
}
