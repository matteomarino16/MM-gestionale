import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

/**
 * `sslmode=require` (es. Neon) è già trattato da `pg` come verifica completa del certificato,
 * ma genera un avviso a ogni connessione: lo si rende esplicito con `verify-full`.
 */
export function normalizeSslMode(connectionString: string): string {
  return connectionString.replace(/([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/, "$1verify-full");
}

export function createPrismaClient(connectionString: string = getEnv().DATABASE_URL) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: normalizeSslMode(connectionString) }) });
}

export type Db = ReturnType<typeof createPrismaClient>;
/** Client o transazione interattiva: le funzioni di dominio accettano entrambi. */
export type DbTx = Omit<Db, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const globalForPrisma = globalThis as unknown as { prisma?: Db };

function instance(): Db {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createPrismaClient();
  return globalForPrisma.prisma;
}

/**
 * Client condiviso, creato alla prima query e non al caricamento del modulo: la build
 * (che importa le pagine per analizzarle) non richiede DATABASE_URL.
 */
export const prisma: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const client = instance();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
