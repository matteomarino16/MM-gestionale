import { createPrismaClient, type Db } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { seedDefaults } from "@/modules/reminders/defaults";
import { requireTestDatabaseUrl } from "./test-db-url";

export function createTestDb(): Db {
  return createPrismaClient(requireTestDatabaseUrl());
}

/** Svuota tutte le tabelle applicative e reinserisce la configurazione di base. */
export async function resetDb(db: Db): Promise<void> {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
    await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
  await seedDefaults(db);
}

export const TEST_PASSWORD = "Test-Password-2026!";

export async function createTestUser(db: Db, email = "admin@test.local") {
  return db.user.create({
    data: { email, name: "Admin Test", passwordHash: await hashPassword(TEST_PASSWORD), preference: { create: {} } },
  });
}
