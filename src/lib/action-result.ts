import { z } from "zod";

/** Stato restituito dalle Server Action dei form. */
export type FormState =
  | {
      error?: string;
      success?: string;
      fieldErrors?: Record<string, string[] | undefined>;
    }
  | undefined;

export function zodFieldErrors(error: z.ZodError): FormState {
  return { error: "Controlla i campi evidenziati.", fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]> };
}

/** Errore di dominio con messaggio destinato all'utente. */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function domainErrorState(err: unknown): FormState {
  if (err instanceof DomainError) return { error: err.message, fieldErrors: err.fieldErrors };
  throw err;
}
