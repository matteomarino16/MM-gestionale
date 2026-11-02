import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { readSessionCookie } from "./cookies";
import { validateSessionToken, type ValidatedSession } from "./session";

/**
 * Data Access Layer: unico punto in cui si legge la sessione.
 * Ogni pagina, Server Action e Route Handler protetti deve passare da qui
 * (il proxy fa solo un controllo ottimistico sulla presenza del cookie).
 */
export const getCurrentSession = cache(async (): Promise<ValidatedSession | null> => {
  const token = await readSessionCookie();
  if (!token) return null;
  return validateSessionToken(prisma, token);
});

export async function requireSession(): Promise<ValidatedSession> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireUser() {
  return (await requireSession()).user;
}

/** Per i Route Handler: restituisce la sessione o una risposta 401. */
export async function requireApiSession(): Promise<ValidatedSession | Response> {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Non autenticato" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return session;
}
