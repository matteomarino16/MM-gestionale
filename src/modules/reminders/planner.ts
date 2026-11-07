import type { NotificationChannel, NotificationType, ReminderTarget } from "@/generated/prisma/enums";
import { addDays, type CivilDate, zonedInstant } from "@/lib/timezone/civil-date";

export type RuleSpec = {
  id: string;
  key: string;
  offsetDays: number;
  repeatEveryDays: number | null;
  maxRepeats: number | null;
  channels: NotificationChannel[];
};

export type PlanInput = {
  target: ReminderTarget;
  resourceId: string;
  revision: number;
  /** Scadenza (data civile) a cui si riferiscono le regole. */
  deadline: CivilDate;
  timeZone: string;
  /** Ora locale di invio, "HH:MM". */
  reminderTime: string;
  rules: RuleSpec[];
  now: Date;
  /** Quanto in avanti pianificare (gli eventi futuri restano in coda finché non sono dovuti). */
  horizonMs?: number;
  /** Eventi passati da meno di questo intervallo sono considerati "in orario", non arretrati. */
  graceMs?: number;
};

export type PlannedEvent = {
  dedupeKey: string;
  notificationKey: string;
  ruleId: string;
  ruleKey: string;
  occurrence: number;
  channel: NotificationChannel;
  scheduledFor: Date;
  /** Giorno civile in cui scatta l'avviso. */
  fireDate: CivilDate;
};

const DAY = 86_400_000;
const MAX_OCCURRENCES = 500;

/**
 * Chiave logica della notifica: tipo risorsa, id, revisione della scadenza, regola, occorrenza.
 * Esempio: "renewal:<id>:r2:30d" oppure "receivable:<id>:r1:overdue-weekly:3".
 */
export function notificationKey(target: ReminderTarget, resourceId: string, revision: number, ruleKey: string, occurrence: number) {
  const occ = occurrence > 0 ? `:${occurrence}` : "";
  return `${target.toLowerCase()}:${resourceId}:r${revision}:${ruleKey}${occ}`;
}

/** Chiave dell'evento in coda: la chiave della notifica più il canale di consegna. */
export function eventKey(notification: string, channel: NotificationChannel) {
  return `${notification}:${channel.toLowerCase()}`;
}

/**
 * Calcola gli eventi di promemoria per una scadenza.
 *
 * - Gli anticipi sono in giorni di calendario locale e l'ora è quella preferita nel fuso
 *   della risorsa (corretto con ora legale/solare).
 * - Le regole ripetute generano occorrenze solo fino all'orizzonte.
 * - Recupero dopo un'interruzione: degli avvisi ormai passati (oltre il margine) si tiene
 *   solo il più recente, per non sommergere l'utente di notifiche arretrate; nessuno se
 *   c'è già un avviso più recente dovuto adesso.
 */
export function planReminders(input: PlanInput): PlannedEvent[] {
  const horizon = input.now.getTime() + (input.horizonMs ?? DAY);
  const graceCutoff = input.now.getTime() - (input.graceMs ?? DAY);

  type Occ = { rule: RuleSpec; occurrence: number; fireDate: CivilDate; at: Date };
  const occurrences: Occ[] = [];

  for (const rule of input.rules) {
    const first = addDays(input.deadline, rule.offsetDays);
    const limit = rule.repeatEveryDays ? (rule.maxRepeats ?? MAX_OCCURRENCES) : 0;
    for (let n = 0; n <= Math.min(limit, MAX_OCCURRENCES); n++) {
      const fireDate = n === 0 ? first : addDays(first, n * rule.repeatEveryDays!);
      const at = zonedInstant(fireDate, input.reminderTime, input.timeZone);
      if (at.getTime() > horizon) break;
      occurrences.push({ rule, occurrence: n, fireDate, at });
    }
  }

  const recent = occurrences.filter((o) => o.at.getTime() >= graceCutoff);
  const stale = occurrences.filter((o) => o.at.getTime() < graceCutoff);
  // Tra gli avvisi arretrati si tiene solo l'ultimo (a parità di istante, l'offset maggiore),
  // e solo se non c'è già un avviso più recente dovuto adesso, che lo rende superfluo.
  const recentDue = recent.some((o) => o.at.getTime() <= input.now.getTime());
  const latestStale = recentDue ? undefined : stale.sort((a, b) => b.at.getTime() - a.at.getTime() || b.rule.offsetDays - a.rule.offsetDays)[0];
  const selected = latestStale ? [latestStale, ...recent] : recent;

  return selected.flatMap((o) => {
    const nKey = notificationKey(input.target, input.resourceId, input.revision, o.rule.key, o.occurrence);
    return o.rule.channels.map((channel) => ({
      dedupeKey: eventKey(nKey, channel),
      notificationKey: nKey,
      ruleId: o.rule.id,
      ruleKey: o.rule.key,
      occurrence: o.occurrence,
      channel,
      scheduledFor: o.at,
      fireDate: o.fireDate,
    }));
  });
}

/** Tipo della notifica in base ai giorni mancanti alla scadenza nel momento dell'invio. */
export function notificationType(target: ReminderTarget, daysLeft: number): NotificationType {
  const phase = daysLeft > 0 ? "UPCOMING" : daysLeft === 0 ? "DUE" : "OVERDUE";
  return `${target}_${phase}` as NotificationType;
}

export function describeDaysLeft(daysLeft: number): string {
  if (daysLeft === 0) return "oggi";
  if (daysLeft === 1) return "domani";
  if (daysLeft > 1) return `tra ${daysLeft} giorni`;
  if (daysLeft === -1) return "da 1 giorno";
  return `da ${-daysLeft} giorni`;
}
