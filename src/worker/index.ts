/**
 * Worker dei promemoria per l'esecuzione locale o su un server sempre acceso.
 *
 *   npm run worker            # ciclo continuo (default ogni 60 s)
 *   npm run worker -- --once  # un solo ciclo, utile da cron di sistema
 *
 * È sicuro avviarne più istanze: la coda usa FOR UPDATE SKIP LOCKED e chiavi univoche.
 * Su Vercel lo stesso ciclo è eseguito dal cron /api/cron/reminders.
 */
import "dotenv/config";
import { hostname } from "node:os";
import { parseArgs } from "node:util";
import { createPrismaClient } from "@/lib/db/client";
import { runReminderTick } from "@/modules/reminders/engine";

const { values } = parseArgs({
  options: { once: { type: "boolean", default: false }, interval: { type: "string", default: "60" } },
});
const intervalMs = Math.max(10, Number(values.interval) || 60) * 1000;
const workerId = `worker:${hostname()}:${process.pid}`;
const db = createPrismaClient();

let stopping = false;
let wake: (() => void) | undefined;

function log(message: string, extra?: Record<string, unknown>) {
  // Nessun dato sensibile nei log: solo conteggi e messaggi d'errore.
  console.log(JSON.stringify({ t: new Date().toISOString(), worker: workerId, message, ...extra }));
}

async function tick() {
  try {
    const summary = await runReminderTick(db, { workerId });
    log("ciclo completato", summary);
  } catch (err) {
    // Un errore (es. database non raggiungibile) non ferma il worker: si riprova al ciclo successivo.
    log("ciclo fallito", { error: err instanceof Error ? err.message : String(err) });
  }
}

async function main() {
  log("avvio", { intervalSeconds: intervalMs / 1000 });
  if (values.once) {
    await tick();
    return;
  }
  while (!stopping) {
    await tick();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, intervalMs);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log("arresto richiesto", { signal });
    stopping = true;
    wake?.();
  });
}

main()
  .catch((err) => {
    log("errore fatale", { error: err instanceof Error ? err.message : String(err) });
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    log("arrestato");
  });
