/**
 * Configurazione di base idempotente: regole di promemoria predefinite e
 * categorie di costo. Non inserisce clienti, servizi o importi fittizi.
 */
import "dotenv/config";
import { createPrismaClient } from "@/lib/db/client";
import { seedDefaults } from "@/modules/reminders/defaults";

const db = createPrismaClient();

seedDefaults(db)
  .then((r) => console.log(`Regole promemoria: ${r.rules}, categorie di costo: ${r.categories}`))
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
