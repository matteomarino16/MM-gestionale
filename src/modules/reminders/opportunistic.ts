import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/db/client";
import { runTickIfDue } from "./engine";

const MIN_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Su Vercel (piano Hobby) il cron gira una volta al giorno: per avere avvisi sempre
 * aggiornati quando si apre l'app, dopo l'invio della pagina si esegue anche un ciclo,
 * al massimo ogni 10 minuti. Non rallenta la risposta e non è un timer nel browser.
 */
export function scheduleOpportunisticTick() {
  after(async () => {
    try {
      await runTickIfDue(prisma, "web", MIN_INTERVAL_MS);
    } catch (err) {
      console.error("Ciclo promemoria non riuscito:", err instanceof Error ? err.message : err);
    }
  });
}
