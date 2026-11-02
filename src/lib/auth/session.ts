import type { Db } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { generateSessionToken, hashSessionToken } from "./tokens";

const HOUR = 60 * 60 * 1000;
/** Evita una scrittura sul DB a ogni richiesta: lastSeen si aggiorna al massimo ogni 5 minuti. */
const TOUCH_INTERVAL = 5 * 60 * 1000;

export type SessionUser = { id: string; email: string; name: string };
export type ValidatedSession = {
  sessionId: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  user: SessionUser;
};

type SessionConfig = { idleMs: number; absoluteMs: number };

function config(): SessionConfig {
  const env = getEnv();
  return { idleMs: env.SESSION_IDLE_HOURS * HOUR, absoluteMs: env.SESSION_ABSOLUTE_DAYS * 24 * HOUR };
}

export async function createSession(
  db: Db,
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
  now = new Date(),
  cfg: SessionConfig = config(),
): Promise<{ token: string; expiresAt: Date; absoluteExpiresAt: Date }> {
  const token = generateSessionToken();
  const absoluteExpiresAt = new Date(now.getTime() + cfg.absoluteMs);
  const expiresAt = new Date(Math.min(now.getTime() + cfg.idleMs, absoluteExpiresAt.getTime()));
  await db.session.create({
    data: {
      id: hashSessionToken(token),
      userId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      absoluteExpiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
    },
  });
  return { token, expiresAt, absoluteExpiresAt };
}

/**
 * Valida il token del cookie. Le sessioni scadute vengono eliminate.
 * La scadenza per inattività è prorogata (sliding) senza superare il limite assoluto.
 */
export async function validateSessionToken(
  db: Db,
  token: string,
  now = new Date(),
  cfg: SessionConfig = config(),
): Promise<ValidatedSession | null> {
  if (!token || token.length > 128) return null;
  const id = hashSessionToken(token);
  const session = await db.session.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!session) return null;

  if (session.expiresAt <= now || session.absoluteExpiresAt <= now) {
    await db.session.deleteMany({ where: { id } });
    return null;
  }

  let expiresAt = session.expiresAt;
  if (now.getTime() - session.lastSeenAt.getTime() >= TOUCH_INTERVAL) {
    expiresAt = new Date(Math.min(now.getTime() + cfg.idleMs, session.absoluteExpiresAt.getTime()));
    await db.session.update({ where: { id }, data: { lastSeenAt: now, expiresAt } });
  }

  return { sessionId: id, expiresAt, absoluteExpiresAt: session.absoluteExpiresAt, user: session.user };
}

export async function invalidateSession(db: Db, sessionId: string): Promise<void> {
  await db.session.deleteMany({ where: { id: sessionId } });
}

export async function invalidateUserSessions(db: Db, userId: string, exceptSessionId?: string): Promise<number> {
  const res = await db.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
  return res.count;
}

export async function purgeExpiredSessions(db: Db, now = new Date()): Promise<number> {
  const res = await db.session.deleteMany({
    where: { OR: [{ expiresAt: { lte: now } }, { absoluteExpiresAt: { lte: now } }] },
  });
  return res.count;
}
