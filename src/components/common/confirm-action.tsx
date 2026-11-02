"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
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

export type SimpleActionResult = { ok: true; message?: string } | { ok: false; error: string };

/**
 * Pulsante con finestra di conferma per operazioni distruttive o irreversibili.
 * L'azione server riceve l'id della risorsa e restituisce l'esito.
 */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  action,
  variant = "destructive",
  triggerVariant = "outline",
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  action: () => Promise<SimpleActionResult | void>;
  variant?: "destructive" | "default";
  triggerVariant?: "outline" | "destructive" | "ghost" | "default";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const res = await action();
      if (res && !res.ok) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      if (res?.message) toast.success(res.message);
    });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant={triggerVariant} size="sm" />}>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Annulla</AlertDialogCancel>
          <Button variant={variant} onClick={run} disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
