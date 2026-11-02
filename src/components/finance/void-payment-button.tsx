"use client";

import { useState } from "react";
import { Loader2Icon, Undo2Icon } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { voidPaymentAction } from "@/modules/finance/actions";

/** Storno con motivazione obbligatoria: il movimento resta visibile nello storico. */
export function VoidPaymentButton({ paymentId, description }: { paymentId: string; description: string }) {
  const [open, setOpen] = useState(false);
  const { state, pending, onSubmit } = useFormAction(voidPaymentAction, {
    onSuccess: (s) => {
      toast.success(s.success);
      setOpen(false);
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
        <Undo2Icon /> Storna
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Stornare il movimento?</AlertDialogTitle>
            <AlertDialogDescription>
              {description}. Il movimento resterà nello storico ma non sarà più conteggiato nei saldi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input type="hidden" name="paymentId" value={paymentId} />
          <FormAlert state={state} />
          <FormField id={`void-${paymentId}`} label="Motivo" required errors={state?.fieldErrors?.reason}>
            <Textarea id={`void-${paymentId}`} name="reason" rows={2} placeholder="Es. bonifico respinto, importo errato" />
          </FormField>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Annulla</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Storna
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
