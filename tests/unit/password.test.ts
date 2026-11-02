import { describe, expect, it } from "vitest";
import { hashPassword, validatePasswordStrength, verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/tokens";

describe("password", () => {
  it("usa Argon2id e verifica correttamente", async () => {
    const hash = await hashPassword("Correct-Horse-9");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "Correct-Horse-9")).toBe(true);
    expect(await verifyPassword(hash, "correct-horse-9")).toBe(false);
  });

  it("non lancia eccezioni con hash malformati", async () => {
    expect(await verifyPassword("non-un-hash", "x")).toBe(false);
    expect(await verifyAgainstDummy("qualsiasi")).toBe(false);
  });

  it("applica la policy minima", () => {
    expect(validatePasswordStrength("breve")).toMatch(/almeno 12/);
    expect(validatePasswordStrength("tuttominuscolo")).toMatch(/tre tra/);
    expect(validatePasswordStrength("Lunga-Password-1")).toBeNull();
  });
});

describe("token di sessione", () => {
  it("sono casuali e memorizzati solo come hash", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashSessionToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(a)).not.toContain(a);
  });
});
