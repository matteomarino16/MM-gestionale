import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MAX_FAILURES_PER_EMAIL } from "@/lib/auth/rate-limit";
import { createSession, validateSessionToken } from "@/lib/auth/session";
import { authenticate, changePassword } from "@/modules/auth/service";
import { createTestDb, createTestUser, resetDb, TEST_PASSWORD } from "./helpers/db";

const db = createTestDb();
const HOUR = 3_600_000;
const cfg = { idleMs: 24 * HOUR, absoluteMs: 72 * HOUR };

beforeEach(() => resetDb(db));
afterAll(() => db.$disconnect());

describe("autenticazione", () => {
  it("accede con credenziali corrette (email non sensibile alle maiuscole)", async () => {
    const user = await createTestUser(db);
    const res = await authenticate(db, { email: "  ADMIN@test.local ", password: TEST_PASSWORD, ip: "1.1.1.1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const session = await validateSessionToken(db, res.token);
    expect(session?.user.id).toBe(user.id);
    // Nel DB c'è solo l'hash del token.
    expect(await db.session.count({ where: { id: res.token } })).toBe(0);
  });

  it("rifiuta password errate e utenti inesistenti con lo stesso esito", async () => {
    await createTestUser(db);
    const wrong = await authenticate(db, { email: "admin@test.local", password: "sbagliata", ip: "1.1.1.1" });
    const missing = await authenticate(db, { email: "nessuno@test.local", password: "x", ip: "1.1.1.1" });
    expect(wrong).toEqual({ ok: false, reason: "invalid" });
    expect(missing).toEqual({ ok: false, reason: "invalid" });
  });

  it("blocca dopo troppi tentativi falliti, anche con la password giusta", async () => {
    await createTestUser(db);
    for (let i = 0; i < MAX_FAILURES_PER_EMAIL; i++) {
      await authenticate(db, { email: "admin@test.local", password: "sbagliata", ip: "2.2.2.2" });
    }
    const res = await authenticate(db, { email: "admin@test.local", password: TEST_PASSWORD, ip: "3.3.3.3" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("rate_limited");
      expect(res.retryAfterSeconds).toBeGreaterThan(0);
    }
  });
});

describe("sessioni", () => {
  it("scadono per inattività e vengono eliminate", async () => {
    const user = await createTestUser(db);
    const t0 = new Date("2026-06-01T10:00:00Z");
    const { token } = await createSession(db, user.id, {}, t0, cfg);
    expect(await validateSessionToken(db, token, new Date(t0.getTime() + 23 * HOUR), cfg)).not.toBeNull();
    // La validazione a 23h ha prorogato la scadenza: 23h + 24h.
    expect(await validateSessionToken(db, token, new Date(t0.getTime() + 46 * HOUR), cfg)).not.toBeNull();
    expect(await validateSessionToken(db, token, new Date(t0.getTime() + 71 * HOUR), cfg)).toBeNull();
    expect(await db.session.count()).toBe(0);
  });

  it("non superano mai il limite assoluto", async () => {
    const user = await createTestUser(db);
    const t0 = new Date("2026-06-01T10:00:00Z");
    const { token } = await createSession(db, user.id, {}, t0, cfg);
    for (const h of [20, 40, 60, 71]) {
      expect(await validateSessionToken(db, token, new Date(t0.getTime() + h * HOUR), cfg)).not.toBeNull();
    }
    expect(await validateSessionToken(db, token, new Date(t0.getTime() + 72 * HOUR), cfg)).toBeNull();
  });

  it("rifiuta token sconosciuti o malformati", async () => {
    expect(await validateSessionToken(db, "inesistente")).toBeNull();
    expect(await validateSessionToken(db, "x".repeat(500))).toBeNull();
  });

  it("il cambio password chiude le altre sessioni", async () => {
    const user = await createTestUser(db);
    const a = await createSession(db, user.id);
    const b = await createSession(db, user.id);
    const current = await validateSessionToken(db, a.token);
    const res = await changePassword(db, {
      userId: user.id,
      currentSessionId: current!.sessionId,
      currentPassword: TEST_PASSWORD,
      newPassword: "Nuova-Password-2027",
    });
    expect(res).toEqual({ ok: true });
    expect(await validateSessionToken(db, a.token)).not.toBeNull();
    expect(await validateSessionToken(db, b.token)).toBeNull();
    const login = await authenticate(db, { email: user.email, password: "Nuova-Password-2027", ip: "4.4.4.4" });
    expect(login.ok).toBe(true);
  });
});
