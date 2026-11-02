"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SimpleActionResult } from "@/components/common/confirm-action";
import { DomainError, domainErrorState, zodFieldErrors, type FormState } from "@/lib/action-result";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { formDataToObject, uuid } from "@/lib/validation/common";
import { serviceInputSchema } from "./schema";
import { cancelService, createService, updateService } from "./service";

function revalidate(serviceId?: string, clientId?: string) {
  revalidatePath("/servizi");
  revalidatePath("/dashboard");
  if (serviceId) revalidatePath(`/servizi/${serviceId}`);
  if (clientId) revalidatePath(`/clienti/${clientId}`);
}

export async function createServiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = serviceInputSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  let id: string;
  try {
    id = (await createService(prisma, user.id, parsed.data)).id;
  } catch (err) {
    return domainErrorState(err);
  }
  revalidate(id, parsed.data.clientId);
  redirect(`/servizi/${id}`);
}

export async function updateServiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return { error: "Servizio non valido." };
  const parsed = serviceInputSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  try {
    await updateService(prisma, user.id, id.data, parsed.data);
  } catch (err) {
    return domainErrorState(err);
  }
  revalidate(id.data, parsed.data.clientId);
  redirect(`/servizi/${id.data}`);
}

export async function cancelServiceAction(id: string): Promise<SimpleActionResult> {
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Servizio non valido." };
  try {
    await cancelService(prisma, user.id, parsed.data);
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    throw err;
  }
  revalidate(parsed.data);
  return { ok: true, message: "Servizio annullato" };
}
