"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SimpleActionResult } from "@/components/common/confirm-action";
import { DomainError, domainErrorState, zodFieldErrors, type FormState } from "@/lib/action-result";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { formDataToObject, uuid } from "@/lib/validation/common";
import { providerInputSchema } from "./schema";
import { createProvider, deleteProvider, setProviderActive, updateProvider } from "./service";

export async function createProviderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = providerInputSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  let id: string;
  try {
    id = (await createProvider(prisma, user.id, parsed.data)).id;
  } catch (err) {
    return domainErrorState(err);
  }
  revalidatePath("/fornitori");
  redirect(`/fornitori/${id}`);
}

export async function updateProviderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return { error: "Fornitore non valido." };
  const parsed = providerInputSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  try {
    await updateProvider(prisma, user.id, id.data, parsed.data);
  } catch (err) {
    return domainErrorState(err);
  }
  revalidatePath("/fornitori");
  redirect(`/fornitori/${id.data}`);
}

async function run(fn: () => Promise<void>, message: string): Promise<SimpleActionResult> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath("/fornitori");
  return { ok: true, message };
}

export async function setProviderActiveAction(id: string, active: boolean): Promise<SimpleActionResult> {
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Fornitore non valido." };
  const res = await run(() => setProviderActive(prisma, user.id, parsed.data, active), active ? "Fornitore riattivato" : "Fornitore disattivato");
  revalidatePath(`/fornitori/${parsed.data}`);
  return res;
}

export async function deleteProviderAction(id: string): Promise<SimpleActionResult> {
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Fornitore non valido." };
  const res = await run(() => deleteProvider(prisma, user.id, parsed.data), "Fornitore eliminato");
  if (res.ok) redirect("/fornitori");
  return res;
}
