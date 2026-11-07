import { z } from "zod";

/** Stato restituito dalle Server Action dei form. */
export type FormState =
  | {
      error?: string;
      success?: string;
      /** L'azione non è raggiungibile (es. nuova versione pubblicata): serve ricaricare la pagina. */
      reload?: boolean;
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

/** Errore lato client nel chiamare una Server Action (rete assente o versione dell'app cambiata). */
export const STALE_ACTION_STATE: NonNullable<FormState> = {
  error: "Non è stato possibile completare l'operazione: probabilmente l'app è stata aggiornata o la connessione è assente. Ricarica la pagina e riprova; i dati inseriti non sono stati salvati.",
  reload: true,
};

/** Gli errori interni di Next.js (redirect, notFound) vanno lasciati propagare. */
export function isNextControlFlowError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}
