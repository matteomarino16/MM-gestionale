/** Rifiuta di operare su un database il cui nome non contiene "test": i test lo svuotano. */
export function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL non impostata (vedi .env.example).");
  const dbName = new URL(url).pathname.slice(1);
  if (!/test/i.test(dbName)) {
    throw new Error(`Il database di test "${dbName}" deve contenere "test" nel nome.`);
  }
  return url;
}
