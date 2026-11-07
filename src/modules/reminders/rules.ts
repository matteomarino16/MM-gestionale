import { z } from "zod";
import { DomainError } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import type { Db } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";

export const ruleInputSchema = z
  .object({
    target: z.enum(["RENEWAL", "RECEIVABLE"]),
    label: z.string().trim().min(1, "Descrizione obbligatoria").max(120),
    when: z.enum(["before", "on", "after"]),
    days: z.coerce.number().int().min(0).max(365).default(0),
    repeatEveryDays: z
      .union([z.literal(""), z.coerce.number().int().min(1, "Minimo 1 giorno").max(365)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    maxRepeats: z
      .union([z.literal(""), z.coerce.number().int().min(1).max(100)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    push: z.union([z.literal("on"), z.literal("")]).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.when !== "on" && v.days === 0) ctx.addIssue({ code: "custom", path: ["days"], message: "Indica almeno 1 giorno" });
  })
  .transform((v) => ({
    target: v.target,
    label: v.label,
    offsetDays: v.when === "before" ? -v.days : v.when === "after" ? v.days : 0,
    repeatEveryDays: v.repeatEveryDays,
    maxRepeats: v.repeatEveryDays ? v.maxRepeats : null,
    push: v.push === "on",
  }));
export type RuleInput = z.infer<typeof ruleInputSchema>;

/** Chiave stabile usata nelle chiavi di idempotenza (es. "30d", "due", "after-3d-every-7d"). */
export function ruleKey(input: Pick<RuleInput, "offsetDays" | "repeatEveryDays">): string {
  const base = input.offsetDays < 0 ? `${-input.offsetDays}d` : input.offsetDays === 0 ? "due" : `after-${input.offsetDays}d`;
  return input.repeatEveryDays ? `${base}-every-${input.repeatEveryDays}d` : base;
}

export async function createRule(db: Db, userId: string, input: RuleInput) {
  try {
    const rule = await db.reminderRule.create({
      data: {
        target: input.target,
        key: ruleKey(input),
        label: input.label,
        offsetDays: input.offsetDays,
        repeatEveryDays: input.repeatEveryDays,
        maxRepeats: input.maxRepeats,
        channels: input.push ? ["DASHBOARD", "PUSH"] : ["DASHBOARD"],
      },
    });
    await audit(db, { userId, action: "reminder_rule.created", entityType: "ReminderRule", entityId: rule.id, summary: `Regola promemoria creata: ${rule.label}` });
    return rule;
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError("Esiste già una regola con gli stessi giorni.", { days: ["Regola già presente"] });
    throw err;
  }
}

/** Le regole non si modificano (le chiavi degli avvisi già emessi devono restare valide): si attivano o disattivano. */
export async function setRuleEnabled(db: Db, userId: string, id: string, enabled: boolean) {
  const res = await db.reminderRule.updateMany({ where: { id }, data: { enabled } });
  if (res.count === 0) throw new DomainError("Regola non trovata.");
  await audit(db, { userId, action: enabled ? "reminder_rule.enabled" : "reminder_rule.disabled", entityType: "ReminderRule", entityId: id });
}

export async function setRulePush(db: Db, userId: string, id: string, push: boolean) {
  const res = await db.reminderRule.updateMany({ where: { id }, data: { channels: push ? ["DASHBOARD", "PUSH"] : ["DASHBOARD"] } });
  if (res.count === 0) throw new DomainError("Regola non trovata.");
  await audit(db, { userId, action: "reminder_rule.channels", entityType: "ReminderRule", entityId: id, summary: push ? "Push attivato" : "Push disattivato" });
}

export const preferenceSchema = z.object({
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Orario non valido (HH:MM)"),
});

export async function updateReminderTime(db: Db, userId: string, reminderTime: string) {
  await db.userPreference.upsert({ where: { userId }, create: { userId, reminderTime }, update: { reminderTime } });
  // Gli avvisi in coda (mai inviati) si eliminano: il ciclo successivo li ripianifica al nuovo orario.
  const res = await db.reminderEvent.deleteMany({ where: { status: "PENDING" } });
  await audit(db, { userId, action: "preferences.reminder_time", entityType: "UserPreference", entityId: userId, summary: `Orario promemoria: ${reminderTime}` });
  return res.count;
}
