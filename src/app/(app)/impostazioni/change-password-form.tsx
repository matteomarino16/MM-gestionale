"use client";

import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { FieldError } from "@/components/forms/field-error";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormAction } from "@/components/forms/use-form-action";
import { changePasswordAction } from "@/modules/auth/actions";

export function ChangePasswordForm() {
  const { state, pending, onSubmit } = useFormAction(changePasswordAction, {
    onSuccess: (s, form) => {
      toast.success(s.success);
      form.reset();
    },
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Password attuale</Label>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
        <FieldError errors={state?.fieldErrors?.currentPassword} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">Nuova password</Label>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={12} />
        <p className="text-xs text-muted-foreground">
          Almeno 12 caratteri, combinando tre tra minuscole, maiuscole, numeri e simboli.
        </p>
        <FieldError errors={state?.fieldErrors?.newPassword} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Conferma nuova password</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
        <FieldError errors={state?.fieldErrors?.confirmPassword} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Aggiorna password
      </Button>
    </form>
  );
}
