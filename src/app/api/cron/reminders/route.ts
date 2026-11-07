import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { runReminderTick } from "@/modules/reminders/engine";

// Il ciclo legge dati sempre aggiornati: nessuna cache.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Invocato dal cron di Vercel (vercel.json), che invia "Authorization: Bearer $CRON_SECRET".
 * Senza CRON_SECRET configurato l'endpoint è disattivato.
 */
export async function GET(request: Request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return Response.json({ error: "Cron non configurato" }, { status: 503 });
  if (!authorized(request, secret)) return Response.json({ error: "Non autorizzato" }, { status: 401 });

  const summary = await runReminderTick(prisma, { workerId: "vercel-cron" });
  return Response.json({ ok: true, ...summary }, { headers: { "Cache-Control": "no-store" } });
}
