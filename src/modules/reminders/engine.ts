import { hostname } from "node:os";
import { Decimal } from "decimal.js";
import type { NotificationChannel, Prisma, ReminderTarget } from "@/generated/prisma/client";
import { purgeOldLoginAttempts } from "@/lib/auth/rate-limit";
import { purgeExpiredSessions } from "@/lib/auth/session";
import type { Db, DbTx } from "@/lib/db/client";
import { formatCivilDate, formatMoney } from "@/lib/format";
import { RENEWAL_STATUS_LABELS } from "@/lib/labels";
import { civilFromDb, diffDays, todayIn } from "@/lib/timezone/civil-date";
import { describeDaysLeft, notificationType, planReminders, type PlannedEvent, type RuleSpec } from "./planner";

const MAX_ATTEMPTS = 5;
/** Un evento "in lavorazione" da più di così è considerato abbandonato (worker interrotto). */
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const CLAIM_BATCH = 50;

type Recipient = { userId: string; reminderTime: string; pushEnabled: boolean };

/** Destinatario delle notifiche: l'amministratore (il gestionale è monoutente). */
async function recipient(db: DbTx): Promise<Recipient | null> {
  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" }, include: { preference: true } });
  if (!user) return null;
  return {
    userId: user.id,
    reminderTime: user.preference?.reminderTime ?? "09:00",
    pushEnabled: user.preference?.pushNotifications ?? true,
  };
}

async function rulesByTarget(db: DbTx): Promise<Record<ReminderTarget, RuleSpec[]>> {
  const rules = await db.reminderRule.findMany({ where: { enabled: true } });
  const out: Record<ReminderTarget, RuleSpec[]> = { RENEWAL: [], RECEIVABLE: [] };
  for (const r of rules) {
    out[r.target].push({ id: r.id, key: r.key, offsetDays: r.offsetDays, repeatEveryDays: r.repeatEveryDays, maxRepeats: r.maxRepeats, channels: r.channels });
  }
  return out;
}

export type PlanSummary = { planned: number; created: number; cancelled: number; archived: number };

/**
 * Fase di pianificazione (idempotente): genera gli eventi per tutte le scadenze aperte e
 * annulla quelli diventati obsoleti (risorsa chiusa, scadenza modificata, regola disattivata).
 */
export async function planAll(db: Db, now = new Date()): Promise<PlanSummary> {
  const who = await recipient(db);
  if (!who) return { planned: 0, created: 0, cancelled: 0, archived: 0 };
  const rules = await rulesByTarget(db);

  const [renewals, receivables] = await Promise.all([
    db.serviceRenewal.findMany({
      where: { status: { notIn: ["COMPLETED", "CANCELLED"] }, service: { status: "ACTIVE" } },
      select: { id: true, expiryDate: true, deadlineRevision: true, service: { select: { timezone: true } } },
    }),
    db.receivable.findMany({
      where: { status: { in: ["OPEN", "PARTIAL"] }, dueDate: { not: null } },
      select: { id: true, dueDate: true, deadlineRevision: true, timezone: true },
    }),
  ]);

  const events: (PlannedEvent & { target: ReminderTarget; resourceId: string; revision: number })[] = [];
  for (const r of renewals) {
    const planned = planReminders({
      target: "RENEWAL",
      resourceId: r.id,
      revision: r.deadlineRevision,
      deadline: civilFromDb(r.expiryDate),
      timeZone: r.service.timezone,
      reminderTime: who.reminderTime,
      rules: rules.RENEWAL,
      now,
    });
    events.push(...planned.map((e) => ({ ...e, target: "RENEWAL" as const, resourceId: r.id, revision: r.deadlineRevision })));
  }
  for (const r of receivables) {
    const planned = planReminders({
      target: "RECEIVABLE",
      resourceId: r.id,
      revision: r.deadlineRevision,
      deadline: civilFromDb(r.dueDate!),
      timeZone: r.timezone,
      reminderTime: who.reminderTime,
      rules: rules.RECEIVABLE,
      now,
    });
    events.push(...planned.map((e) => ({ ...e, target: "RECEIVABLE" as const, resourceId: r.id, revision: r.deadlineRevision })));
  }

  let created = 0;
  for (let i = 0; i < events.length; i += 500) {
    const res = await db.reminderEvent.createMany({
      data: events.slice(i, i + 500).map((e) => ({
        dedupeKey: e.dedupeKey,
        target: e.target,
        resourceId: e.resourceId,
        deadlineRevision: e.revision,
        ruleId: e.ruleId,
        occurrence: e.occurrence,
        channel: e.channel,
        scheduledFor: e.scheduledFor,
      })),
      // INSERT … ON CONFLICT DO NOTHING sulla dedupeKey UNIQUE: più worker possono pianificare insieme.
      skipDuplicates: true,
    });
    created += res.count;
  }

  const cancelled = await removeStaleEvents(db);
  const archived = await archiveSettledNotifications(db);
  return { planned: events.length, created, cancelled, archived };
}

/**
 * Rimuove dalla coda gli eventi mai inviati che non hanno più senso (risorsa chiusa o
 * sospesa, scadenza modificata, regola disattivata). Si eliminano invece di annullarli:
 * se la risorsa torna attiva (servizio riattivato, pagamento stornato) il pianificatore
 * li ricrea con la stessa chiave. Le notifiche già emesse restano nello storico.
 */
export async function removeStaleEvents(db: DbTx): Promise<number> {
  const renewals = await db.$executeRaw`
    DELETE FROM "ReminderEvent" e
     WHERE e.status = 'PENDING' AND e.target = 'RENEWAL'
       AND NOT EXISTS (
         SELECT 1 FROM "ServiceRenewal" r JOIN "Service" s ON s.id = r."serviceId"
          WHERE r.id = e."resourceId" AND r."deadlineRevision" = e."deadlineRevision"
            AND r.status NOT IN ('COMPLETED', 'CANCELLED') AND s.status = 'ACTIVE')`;
  const receivables = await db.$executeRaw`
    DELETE FROM "ReminderEvent" e
     WHERE e.status = 'PENDING' AND e.target = 'RECEIVABLE'
       AND NOT EXISTS (
         SELECT 1 FROM "Receivable" r
          WHERE r.id = e."resourceId" AND r."deadlineRevision" = e."deadlineRevision"
            AND r.status IN ('OPEN', 'PARTIAL') AND r."dueDate" IS NOT NULL)`;
  const disabled = await db.$executeRaw`
    DELETE FROM "ReminderEvent" e
     USING "ReminderRule" rr
     WHERE e."ruleId" = rr.id AND e.status = 'PENDING' AND rr.enabled = false`;
  return renewals + receivables + disabled;
}

/** Le notifiche non lette di risorse ormai chiuse (credito saldato, rinnovo completato) vengono archiviate. */
export async function archiveSettledNotifications(db: DbTx): Promise<number> {
  const a = await db.$executeRaw`
    UPDATE "Notification" n SET status = 'ARCHIVED'
     WHERE n.status = 'UNREAD' AND n."receivableId" IS NOT NULL
       AND EXISTS (SELECT 1 FROM "Receivable" r WHERE r.id = n."receivableId" AND r.status IN ('PAID', 'CANCELLED'))`;
  const b = await db.$executeRaw`
    UPDATE "Notification" n SET status = 'ARCHIVED'
     WHERE n.status = 'UNREAD' AND n."renewalId" IS NOT NULL
       AND EXISTS (SELECT 1 FROM "ServiceRenewal" r WHERE r.id = n."renewalId" AND r.status IN ('COMPLETED', 'CANCELLED'))`;
  return a + b;
}

type ClaimedEvent = {
  id: string;
  dedupeKey: string;
  target: ReminderTarget;
  resourceId: string;
  deadlineRevision: number;
  channel: NotificationChannel;
  attempts: number;
  scheduledFor: Date;
};

/**
 * Acquisizione sicura dei lavori: FOR UPDATE SKIP LOCKED evita che due worker prendano lo
 * stesso evento; gli eventi bloccati da un worker interrotto tornano disponibili dopo il timeout.
 */
export async function claimDueEvents(db: DbTx, workerId: string, now = new Date(), limit = CLAIM_BATCH): Promise<ClaimedEvent[]> {
  const staleBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  return db.$queryRaw<ClaimedEvent[]>`
    UPDATE "ReminderEvent" e
       SET status = 'PROCESSING', "lockedAt" = ${now}, "lockedBy" = ${workerId}, attempts = e.attempts + 1, "updatedAt" = now()
     WHERE e.id IN (
       SELECT id FROM "ReminderEvent"
        WHERE (status = 'PENDING' AND "scheduledFor" <= ${now})
           OR (status = 'PROCESSING' AND "lockedAt" < ${staleBefore})
        ORDER BY "scheduledFor"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
    RETURNING e.id, e."dedupeKey", e.target::text AS target, e."resourceId", e."deadlineRevision",
              e.channel::text AS channel, e.attempts, e."scheduledFor"`;
}

type NotificationDraft = Omit<Prisma.NotificationUncheckedCreateInput, "userId" | "dedupeKey" | "scheduledFor">;

/** Rilegge lo stato attuale della risorsa: null se il promemoria non è più pertinente. */
async function buildNotification(tx: DbTx, ev: ClaimedEvent, now: Date): Promise<NotificationDraft | null> {
  if (ev.target === "RENEWAL") {
    const r = await tx.serviceRenewal.findUnique({
      where: { id: ev.resourceId },
      include: { service: { include: { client: { select: { id: true, displayName: true } } } } },
    });
    if (!r || r.deadlineRevision !== ev.deadlineRevision || r.status === "COMPLETED" || r.status === "CANCELLED" || r.service.status !== "ACTIVE") {
      return null;
    }
    const deadline = civilFromDb(r.expiryDate);
    const daysLeft = diffDays(todayIn(r.service.timezone, now), deadline);
    const when = describeDaysLeft(daysLeft);
    const title =
      daysLeft > 0 ? `Rinnovo ${r.service.name} ${when}` : daysLeft === 0 ? `Rinnovo ${r.service.name}: scade oggi` : `Rinnovo ${r.service.name} scaduto ${when}`;
    return {
      type: notificationType("RENEWAL", daysLeft),
      title,
      body: `${r.service.client.displayName} · scadenza ${formatCivilDate(r.expiryDate)}. Prezzo al cliente ${formatMoney(r.clientPrice)}, costo fornitore ${formatMoney(r.expectedProviderCost)}. Stato: ${RENEWAL_STATUS_LABELS[r.status]}.`,
      eventDate: r.expiryDate,
      clientId: r.service.client.id,
      serviceId: r.serviceId,
      renewalId: r.id,
      amount: r.clientPrice,
      link: `/rinnovi/${r.id}`,
    };
  }

  const c = await tx.receivable.findUnique({ where: { id: ev.resourceId }, include: { client: { select: { id: true, displayName: true } } } });
  if (!c || c.deadlineRevision !== ev.deadlineRevision || (c.status !== "OPEN" && c.status !== "PARTIAL") || !c.dueDate) return null;
  const residual = new Decimal(c.amountDue.toString()).minus(c.paidAmount.toString()).toFixed(2);
  const daysLeft = diffDays(todayIn(c.timezone, now), civilFromDb(c.dueDate));
  const when = describeDaysLeft(daysLeft);
  const title =
    daysLeft > 0 ? `Pagamento atteso ${when}: ${c.description}` : daysLeft === 0 ? `Pagamento in scadenza oggi: ${c.description}` : `Pagamento scaduto ${when}: ${c.description}`;
  return {
    type: notificationType("RECEIVABLE", daysLeft),
    title,
    body: `${c.client.displayName} · residuo ${formatMoney(residual)}${c.status === "PARTIAL" ? ` su ${formatMoney(c.amountDue)}` : ""} · scadenza ${formatCivilDate(c.dueDate)}.`,
    eventDate: c.dueDate,
    clientId: c.client.id,
    serviceId: c.serviceId,
    receivableId: c.id,
    amount: residual,
    link: `/entrate/${c.id}`,
  };
}

/** Elabora un evento acquisito: crea (una sola volta) la notifica logica e le consegne push. */
export async function processEvent(db: Db, ev: ClaimedEvent, now = new Date()): Promise<"done" | "cancelled"> {
  return db.$transaction(async (tx) => {
    const draft = await buildNotification(tx, ev, now);
    if (!draft) {
      // Non più pertinente al momento dell'invio: si rimuove (verrà ripianificato se la risorsa torna attiva).
      await tx.reminderEvent.delete({ where: { id: ev.id } });
      return "cancelled";
    }
    const who = await recipient(tx);
    if (!who) throw new Error("Nessun utente destinatario");

    // La notifica logica è unica per (risorsa, revisione, regola, occorrenza): i due canali la condividono.
    const notificationKey = ev.dedupeKey.slice(0, ev.dedupeKey.lastIndexOf(":"));
    await tx.notification.createMany({
      data: [{ ...draft, dedupeKey: notificationKey, userId: who.userId, scheduledFor: ev.scheduledFor }],
      skipDuplicates: true,
    });
    const notification = await tx.notification.findUniqueOrThrow({ where: { dedupeKey: notificationKey }, select: { id: true } });

    if (ev.channel === "PUSH" && who.pushEnabled) {
      const subs = await tx.pushSubscription.findMany({ where: { userId: who.userId, enabled: true, revokedAt: null }, select: { id: true } });
      if (subs.length) {
        // UNIQUE(notificationId, subscriptionId): una consegna per dispositivo, anche se l'evento viene rielaborato.
        await tx.notificationDelivery.createMany({
          data: subs.map((s) => ({ notificationId: notification.id, subscriptionId: s.id, nextAttemptAt: now })),
          skipDuplicates: true,
        });
      }
    }

    await tx.reminderEvent.update({
      where: { id: ev.id },
      data: { status: "DONE", processedAt: now, notificationId: notification.id, lockedAt: null, lockedBy: null, lastError: null },
    });
    return "done";
  });
}

/** Errore durante l'elaborazione: nuovo tentativo con backoff esponenziale, poi FAILED. */
async function failEvent(db: Db, ev: ClaimedEvent, err: unknown, now: Date) {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  const giveUp = ev.attempts >= MAX_ATTEMPTS;
  await db.reminderEvent.update({
    where: { id: ev.id },
    data: {
      status: giveUp ? "FAILED" : "PENDING",
      scheduledFor: giveUp ? undefined : new Date(now.getTime() + 2 ** ev.attempts * 60_000),
      lastError: message,
      lockedAt: null,
      lockedBy: null,
    },
  });
}

export type TickSummary = PlanSummary & { processed: number; notified: number; skipped: number; failed: number };

/** Un ciclo completo del worker: pianificazione, elaborazione degli eventi dovuti, manutenzione. */
export async function runReminderTick(db: Db, opts: { workerId?: string; now?: Date; maxBatches?: number } = {}): Promise<TickSummary> {
  const now = opts.now ?? new Date();
  const workerId = opts.workerId ?? `${hostname()}:${process.pid}`;
  await heartbeat(db, workerId, now);

  const plan = await planAll(db, now);
  let notified = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;
  for (let batch = 0; batch < (opts.maxBatches ?? 10); batch++) {
    const claimed = await claimDueEvents(db, workerId, now);
    if (claimed.length === 0) break;
    for (const ev of claimed) {
      processed++;
      try {
        const res = await processEvent(db, ev, now);
        if (res === "done") notified++;
        else skipped++;
      } catch (err) {
        failed++;
        await failEvent(db, ev, err, now);
      }
    }
  }

  await purgeExpiredSessions(db, now);
  await purgeOldLoginAttempts(db, now);
  return { ...plan, processed, notified, skipped, failed };
}

async function heartbeat(db: DbTx, workerId: string, now: Date) {
  await db.workerHeartbeat.upsert({
    where: { workerId },
    create: { workerId, hostname: hostname(), pid: process.pid, startedAt: now, lastSeen: now },
    update: { lastSeen: now },
  });
}

/**
 * Esegue un ciclo solo se l'ultimo eseguito da `slot` è più vecchio di `minIntervalMs`.
 * L'aggiornamento condizionale è atomico: richieste concorrenti non avviano due cicli.
 */
export async function runTickIfDue(db: Db, slot: string, minIntervalMs: number, now = new Date()): Promise<TickSummary | null> {
  const threshold = new Date(now.getTime() - minIntervalMs);
  const rows = await db.$queryRaw<{ workerId: string }[]>`
    INSERT INTO "WorkerHeartbeat" ("workerId", hostname, pid, "startedAt", "lastSeen")
    VALUES (${slot}, ${hostname()}, ${process.pid}, ${now}, ${now})
    ON CONFLICT ("workerId") DO UPDATE SET "lastSeen" = EXCLUDED."lastSeen"
     WHERE "WorkerHeartbeat"."lastSeen" < ${threshold}
    RETURNING "workerId"`;
  if (rows.length === 0) return null;
  return runReminderTick(db, { workerId: slot, now });
}
