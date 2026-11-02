import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { createTestDb, resetDb } from "../integration/helpers/db";
import { requireTestDatabaseUrl } from "../integration/helpers/test-db-url";
import { hashPassword } from "../../src/lib/auth/password";

export const CREDENTIALS_FILE = "tests/e2e/.auth/credentials.json";

/** Prepara il database di test con un amministratore dalla password casuale. */
export default async function globalSetup() {
  loadEnv({ quiet: true });
  const url = requireTestDatabaseUrl();
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });

  const db = createTestDb();
  try {
    await resetDb(db);
    const email = "e2e-admin@test.local";
    const password = `E2e-${randomBytes(12).toString("base64url")}!9`;
    await db.user.create({
      data: { email, name: "Admin E2E", passwordHash: await hashPassword(password), preference: { create: {} } },
    });
    mkdirSync("tests/e2e/.auth", { recursive: true });
    writeFileSync(CREDENTIALS_FILE, JSON.stringify({ email, password }), { mode: 0o600 });
  } finally {
    await db.$disconnect();
  }
}
