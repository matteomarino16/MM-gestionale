import { getEnv } from "@/lib/env";

/**
 * Protezione CSRF per i Route Handler che modificano dati (le Server Action di
 * Next.js verificano già Origin/Host). Il cookie SameSite=Lax è una seconda difesa.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([new URL(getEnv().APP_URL).origin]);
  try {
    const host = request.headers.get("host");
    if (host) allowed.add(`${new URL(request.url).protocol}//${host}`);
  } catch {
    // URL non valido: si usa solo APP_URL.
  }
  return allowed.has(origin);
}
