import { audit } from "@/lib/audit";
import { verifyAgainstDummy, verifyPassword, hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { checkLoginRateLimit, recordLoginAttempt } from "@/lib/auth/rate-limit";
import { createSession, invalidateUserSessions } from "@/lib/auth/session";
import type { Db } from "@/lib/db/client";

export type AuthenticateResult =
  | { ok: true; userId: string; token: string; absoluteExpiresAt: Date }
  | { ok: false; reason: "invalid" | "rate_limited"; retryAfterSeconds?: number };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function authenticate(
  db: Db,
  input: { email: string; password: string; ip: string; userAgent?: string | null },
): Promise<AuthenticateResult> {
  const email = normalizeEmail(input.email);

  const limit = await checkLoginRateLimit(db, email, input.ip);
  if (!limit.allowed) {
    return { ok: false, reason: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds };
  }

  const user = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  const valid = user ? await verifyPassword(user.passwordHash, input.password) : await verifyAgainstDummy(input.password);

  await recordLoginAttempt(db, email, input.ip, valid);

  if (!user || !valid) {
    await audit(db, { action: "auth.login_failed", entityType: "User", summary: "Tentativo di accesso fallito", ip: input.ip });
    return { ok: false, reason: "invalid" };
  }

  const session = await createSession(db, user.id, { ip: input.ip, userAgent: input.userAgent });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(db, { userId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ip: input.ip });

  return { ok: true, userId: user.id, token: session.token, absoluteExpiresAt: session.absoluteExpiresAt };
}

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

/** Cambia la password e invalida tutte le altre sessioni dell'utente. */
export async function changePassword(
  db: Db,
  input: { userId: string; currentSessionId: string; currentPassword: string; newPassword: string },
): Promise<ChangePasswordResult> {
  const user = await db.user.findUnique({ where: { id: input.userId }, select: { passwordHash: true } });
  if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    return { ok: false, error: "La password attuale non è corretta." };
  }
  const weakness = validatePasswordStrength(input.newPassword);
  if (weakness) return { ok: false, error: weakness };
  if (input.newPassword === input.currentPassword) {
    return { ok: false, error: "La nuova password deve essere diversa da quella attuale." };
  }

  const passwordHash = await hashPassword(input.newPassword);
  await db.user.update({ where: { id: input.userId }, data: { passwordHash } });
  await invalidateUserSessions(db, input.userId, input.currentSessionId);
  await audit(db, { userId: input.userId, action: "auth.password_changed", entityType: "User", entityId: input.userId });
  return { ok: true };
}
