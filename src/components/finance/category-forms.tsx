"use client";

import { PowerIcon } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/common/confirm-action";
import { FieldError } from "@/components/forms/field-error";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCategoryAction, renameCategoryAction, setCategoryActiveAction } from "@/modules/finance/actions";

export function NewCategoryForm() {
  const { state, pending, onSubmit } = useFormAction(createCategoryAction, {
    onSuccess: (s, form) => {
      toast.success(s.success);
      form.reset();
    },
  });
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-2">
      <div className="min-w-56 flex-1">
        <Input name="name" placeholder="Nuova categoria" aria-label="Nome della nuova categoria" />
        <FieldError errors={state?.fieldErrors?.name} />
      </div>
      <Button type="submit" disabled={pending}>
        Aggiungi
      </Button>
    </form>
  );
}

export function CategoryRow({ id, name, active, count }: { id: string; name: string; active: boolean; count: number }) {
  const { state, pending, onSubmit } = useFormAction(renameCategoryAction, { onSuccess: (s) => toast.success(s.success) });
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2">
      <form onSubmit={onSubmit} className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
        <input type="hidden" name="id" value={id} />
        <div className="min-w-48 flex-1">
          <Input name="name" defaultValue={name} aria-label={`Nome categoria ${name}`} className={active ? "" : "text-muted-foreground"} />
          <FieldError errors={state?.fieldErrors?.name} />
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          Rinomina
        </Button>
      </form>
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {count} cost{count === 1 ? "o" : "i"}
        <ConfirmAction
          trigger={
            <>
              <PowerIcon /> {active ? "Disattiva" : "Riattiva"}
            </>
          }
          title={active ? "Disattivare la categoria?" : "Riattivare la categoria?"}
          description={active ? "Non sarà proposta per i nuovi costi; quelli esistenti restano invariati." : "Tornerà selezionabile nei costi."}
          confirmLabel={active ? "Disattiva" : "Riattiva"}
          variant={active ? "destructive" : "default"}
          action={() => setCategoryActiveAction(id, !active)}
        />
      </span>
    </li>
  );
}
