"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { deleteSessionCookie, setSessionCookie } from "@/lib/auth/cookies";
import { getCurrentSession, requireSession } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { getRequestMeta } from "@/lib/auth/request-meta";
import { invalidateSession, invalidateUserSessions } from "@/lib/auth/session";
import type { FormState } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db/client";
import { authenticate, changePassword } from "./service";


const loginSchema = z.object({
  email: z.string().trim().min(1, "Inserisci l'email").max(254).pipe(z.email("Email non valida")),
  password: z.string().min(1, "Inserisci la password").max(256),
  next: z.string().optional(),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const meta = await getRequestMeta();
  const result = await authenticate(prisma, { ...parsed.data, ip: meta.ip, userAgent: meta.userAgent });

  if (!result.ok) {
    if (result.reason === "rate_limited") {
      const minutes = Math.ceil((result.retryAfterSeconds ?? 60) / 60);
      return { error: `Troppi tentativi falliti. Riprova tra ${minutes} minut${minutes === 1 ? "o" : "i"}.` };
    }
    return { error: "Email o password non corretti." };
  }

  await setSessionCookie(result.token, result.absoluteExpiresAt);
  redirect(safeRedirectPath(parsed.data.next));
}

export async function logoutAction(): Promise<void> {
  const session = await getCurrentSession();
  if (session) {
    await invalidateSession(prisma, session.sessionId);
    await audit(prisma, { userId: session.user.id, action: "auth.logout", entityType: "User", entityId: session.user.id });
  }
  await deleteSessionCookie();
  redirect("/login");
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Inserisci la password attuale").max(256),
    newPassword: z.string().max(256),
    confirmPassword: z.string().max(256),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Le due password non coincidono",
  });

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const result = await changePassword(prisma, {
    userId: session.user.id,
    currentSessionId: session.sessionId,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
  });
  if (!result.ok) return { error: result.error };
  return { success: "Password aggiornata. Le altre sessioni sono state chiuse." };
}

const sessionIdSchema = z.string().regex(/^[0-9a-f]{64}$/);

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = sessionIdSchema.safeParse(formData.get("sessionId"));
  if (!id.success) return;
  // Vincolo sull'utente: non si possono revocare sessioni altrui.
  await prisma.session.deleteMany({ where: { id: id.data, userId: session.user.id } });
  await audit(prisma, { userId: session.user.id, action: "auth.session_revoked", entityType: "Session" });
  if (id.data === session.sessionId) {
    await deleteSessionCookie();
    redirect("/login");
  }
  redirect("/impostazioni");
}

export async function revokeOtherSessionsAction(): Promise<void> {
  const session = await requireSession();
  const count = await invalidateUserSessions(prisma, session.user.id, session.sessionId);
  await audit(prisma, {
    userId: session.user.id,
    action: "auth.sessions_revoked",
    entityType: "Session",
    summary: `${count} sessioni chiuse`,
  });
  redirect("/impostazioni");
}
