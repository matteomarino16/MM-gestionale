"use server";

import { revalidatePath } from "next/cache";
import type { SimpleActionResult } from "@/components/common/confirm-action";
import { DomainError, domainErrorState, zodFieldErrors, type FormState } from "@/lib/action-result";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { formDataToObject, uuid } from "@/lib/validation/common";
import { createRule, preferenceSchema, ruleInputSchema, setRuleEnabled, setRulePush, updateReminderTime } from "./rules";

const PATH = "/impostazioni/promemoria";

export async function createRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = ruleInputSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  try {
    await createRule(prisma, user.id, parsed.data);
  } catch (err) {
    return domainErrorState(err);
  }
  revalidatePath(PATH);
  return { success: "Regola aggiunta" };
}

async function simple(fn: () => Promise<unknown>, message: string): Promise<SimpleActionResult> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath(PATH);
  return { ok: true, message };
}

export async function setRuleEnabledAction(id: string, enabled: boolean): Promise<SimpleActionResult> {
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Regola non valida." };
  return simple(() => setRuleEnabled(prisma, user.id, parsed.data, enabled), enabled ? "Regola attivata" : "Regola disattivata");
}

export async function setRulePushAction(id: string, push: boolean): Promise<SimpleActionResult> {
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Regola non valida." };
  return simple(() => setRulePush(prisma, user.id, parsed.data, push), push ? "Notifica push attivata" : "Notifica push disattivata");
}

export async function updateReminderTimeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = preferenceSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  await updateReminderTime(prisma, user.id, parsed.data.reminderTime);
  revalidatePath(PATH);
  return { success: `I promemoria arriveranno alle ${parsed.data.reminderTime}` };
}
