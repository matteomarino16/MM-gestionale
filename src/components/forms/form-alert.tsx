"use client";

import { RotateCwIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/action-result";

export function FormAlert({ state }: { state: FormState }) {
  if (!state?.error) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription className="space-y-2">
        <p>{state.error}</p>
        {state.reload && (
          <Button type="button" size="sm" variant="outline" onClick={() => window.location.reload()}>
            <RotateCwIcon /> Ricarica la pagina
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
