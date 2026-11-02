"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { FormState } from "@/lib/action-result";

/**
 * Invia il form a una Server Action senza il reset automatico di React 19,
 * così in caso di errore i valori inseriti restano nei campi.
 * `onSuccess` viene eseguita quando l'azione restituisce `success`.
 */
export function useFormAction(
  action: (prev: FormState, data: FormData) => Promise<FormState>,
  { onSuccess }: { onSuccess?: (state: NonNullable<FormState>, form: HTMLFormElement) => void } = {},
) {
  const [state, setState] = useState<FormState>(undefined);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await action(state, data);
      setState(result);
      if (result?.success) onSuccess?.(result, form);
    });
  };
  return { state, pending, onSubmit };
}
