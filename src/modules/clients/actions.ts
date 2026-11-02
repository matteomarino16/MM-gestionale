"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SimpleActionResult } from "@/components/common/confirm-action";
import { domainErrorState, DomainError, zodFieldErrors, type FormState } from "@/lib/action-result";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { formDataToObject, uuid } from "@/lib/validation/common";
import { clientInputSchema } from "./schema";
import { createClient, setClientArchived, updateClient } from "./service";

export async function createClientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = clientInputSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  let id: string;
  try {
    id = (await createClient(prisma, user.id, parsed.data)).id;
  } catch (err) {
    return domainErrorState(err);
  }
  revalidatePath("/clienti");
  redirect(`/clienti/${id}`);
}

export async function updateClientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return { error: "Cliente non valido." };
  const parsed = clientInputSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  try {
    await updateClient(prisma, user.id, id.data, parsed.data);
  } catch (err) {
    return domainErrorState(err);
  }
  revalidatePath("/clienti");
  redirect(`/clienti/${id.data}`);
}

export async function setClientArchivedAction(id: string, archived: boolean): Promise<SimpleActionResult> {
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Cliente non valido." };
  try {
    await setClientArchived(prisma, user.id, parsed.data, archived);
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath("/clienti");
  revalidatePath(`/clienti/${parsed.data}`);
  return { ok: true, message: archived ? "Cliente archiviato" : "Cliente ripristinato" };
}
