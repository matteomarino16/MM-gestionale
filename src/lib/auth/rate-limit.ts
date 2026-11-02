import type { Db } from "@/lib/db/client";

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_EMAIL = 5;
export const MAX_FAILURES_PER_IP = 20;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Rate limiting persistente sul login: conta i tentativi falliti nella finestra
 * per email (dall'ultimo accesso riuscito) e per IP.
 */
export async function checkLoginRateLimit(
  db: Db,
  email: string,
  ip: string,
  now = new Date(),
): Promise<RateLimitResult> {
  const windowStart = new Date(now.getTime() - LOGIN_WINDOW_MS);

  const lastSuccess = await db.loginAttempt.findFirst({
    where: { email, success: true, attemptedAt: { gte: windowStart } },
    orderBy: { attemptedAt: "desc" },
    select: { attemptedAt: true },
  });
  const emailSince = lastSuccess?.attemptedAt ?? windowStart;

  const [emailFailures, ipFailures] = await Promise.all([
    db.loginAttempt.findMany({
      where: { email, success: false, attemptedAt: { gt: emailSince } },
      orderBy: { attemptedAt: "asc" },
      select: { attemptedAt: true },
    }),
    db.loginAttempt.findMany({
      where: { ip, success: false, attemptedAt: { gte: windowStart } },
      orderBy: { attemptedAt: "asc" },
      select: { attemptedAt: true },
    }),
  ]);

  const blockedBy = (failures: { attemptedAt: Date }[], max: number) => {
    if (failures.length < max) return null;
    // Sblocco quando il tentativo che fa superare la soglia esce dalla finestra.
    const pivot = failures[failures.length - max].attemptedAt.getTime();
    return Math.max(1, Math.ceil((pivot + LOGIN_WINDOW_MS - now.getTime()) / 1000));
  };

  const retry = Math.max(
    blockedBy(emailFailures, MAX_FAILURES_PER_EMAIL) ?? 0,
    blockedBy(ipFailures, MAX_FAILURES_PER_IP) ?? 0,
  );
  return retry > 0 ? { allowed: false, retryAfterSeconds: retry } : { allowed: true };
}

export async function recordLoginAttempt(db: Db, email: string, ip: string, success: boolean, now = new Date()) {
  await db.loginAttempt.create({ data: { email, ip, success, attemptedAt: now } });
}

export async function purgeOldLoginAttempts(db: Db, now = new Date()) {
  const res = await db.loginAttempt.deleteMany({
    where: { attemptedAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
  });
  return res.count;
}
