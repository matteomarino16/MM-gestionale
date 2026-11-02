import { Alert, AlertDescription } from "@/components/ui/alert";
import type { FormState } from "@/lib/action-result";

export function FormAlert({ state }: { state: FormState }) {
  if (!state?.error) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{state.error}</AlertDescription>
    </Alert>
  );
}
