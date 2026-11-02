"use client";

import { useActionState } from "react";
import { Loader2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError } from "@/components/forms/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/modules/auth/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <Card>
      <CardContent>
        <form action={action} className="space-y-4" noValidate>
          <input type="hidden" name="next" value={next} />
          {state?.error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              aria-invalid={!!state?.fieldErrors?.email}
            />
            <FieldError errors={state?.fieldErrors?.email} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={!!state?.fieldErrors?.password}
            />
            <FieldError errors={state?.fieldErrors?.password} />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Accedi
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
