import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Inserisce solo la configurazione di base (regole promemoria, categorie di costo):
    // nessun dato fittizio.
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Le migrazioni usano la connessione diretta se disponibile (Neon: DATABASE_URL_UNPOOLED),
    // perché il pooler non supporta i lock usati da `prisma migrate`.
    url: process.env["DATABASE_URL_UNPOOLED"] ?? process.env["DATABASE_URL"],
  },
});
