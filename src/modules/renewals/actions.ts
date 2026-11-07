"use server";

import { revalidatePath } from "next/cache";
import { DomainError, domainErrorState, zodFieldErrors, type FormState } from "@/lib/action-result";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { appToday } from "@/lib/today";
import { formDataToObject } from "@/lib/validation/common";
import { completeRenewalSchema, renewalDetailsSchema, renewalStatusSchema, skipRenewalSchema } from "./schema";
import { completeRenewal, setRenewalStatus, skipRenewal, updateRenewalDetails } from "./service";

function revalidate(id: string) {
  revalidatePath("/rinnovi");
  revalidatePath(`/rinnovi/${id}`);
  revalidatePath("/servizi", "layout");
  revalidatePath("/clienti", "layout");
  revalidatePath("/dashboard");
}

async function run(id: string, fn: () => Promise<unknown>, success: string): Promise<FormState> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof DomainError) return domainErrorState(err);
    throw err;
  }
  revalidate(id);
  return { success };
}

export async function setRenewalStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = renewalStatusSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  return run(parsed.data.id, () => setRenewalStatus(prisma, user.id, parsed.data.id, parsed.data.status), "Stato aggiornato");
}

export async function updateRenewalDetailsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = renewalDetailsSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  return run(parsed.data.id, () => updateRenewalDetails(prisma, user.id, parsed.data), "Dati del rinnovo salvati");
}

export async function completeRenewalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = completeRenewalSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  return run(parsed.data.id, () => completeRenewal(prisma, user.id, parsed.data, appToday()), "Rinnovo completato: aperto il ciclo successivo");
}

export async function skipRenewalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = skipRenewalSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  return run(parsed.data.id, () => skipRenewal(prisma, user.id, parsed.data.id, parsed.data.reason), "Rinnovo non effettuato");
}
