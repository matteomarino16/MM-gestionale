import { hash, verify } from "@node-rs/argon2";

// Argon2id (algorithm 2) con parametri superiori al minimo OWASP (m=19 MiB, t=2).
const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La password deve contenere almeno ${PASSWORD_MIN_LENGTH} caratteri.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `La password non può superare ${PASSWORD_MAX_LENGTH} caratteri.`;
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 3) {
    return "La password deve combinare almeno tre tra: minuscole, maiuscole, numeri, simboli.";
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifica contro un hash fittizio quando l'utente non esiste, così il tempo di
 * risposta non rivela quali email sono registrate.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("dummy-password-for-timing-equalization");
  await verifyPassword(await dummyHash, password);
  return false;
}
