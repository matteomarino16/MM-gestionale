"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SimpleActionResult } from "@/components/common/confirm-action";
import { DomainError, domainErrorState, zodFieldErrors, type FormState } from "@/lib/action-result";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { appToday } from "@/lib/today";
import { formDataToObject, uuid } from "@/lib/validation/common";
import { createCategory, renameCategory, setCategoryActive } from "./categories";
import { cancelPayable, createPayable, restorePayable, updatePayable } from "./payables";
import { registerPayment, voidPayment } from "./payments";
import { cancelReceivable, createReceivable, restoreReceivable, updateReceivable } from "./receivables";
import { categoryInputSchema, payableInputSchema, paymentInputSchema, receivableInputSchema, voidPaymentSchema } from "./schema";

/** Le voci economiche compaiono in molte pagine: si invalidano tutte quelle interessate. */
function revalidateFinance(extra: (string | null | undefined)[] = []) {
  for (const p of ["/entrate", "/uscite", "/pagamenti", "/dashboard", "/clienti", "/servizi", "/fornitori", ...extra]) {
    if (!p) continue;
    // Le schede di clienti, servizi e fornitori mostrano i saldi: si invalida l'intero ramo.
    if (p === "/clienti" || p === "/servizi" || p === "/fornitori") revalidatePath(p, "layout");
    else revalidatePath(p);
  }
}

async function simple(fn: () => Promise<unknown>, message: string, paths: string[] = []): Promise<SimpleActionResult> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    throw err;
  }
  revalidateFinance(paths);
  return { ok: true, message };
}

// ───────────── Crediti ─────────────

export async function createReceivableAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = receivableInputSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  let id: string;
  try {
    id = (await createReceivable(prisma, user.id, parsed.data)).id;
  } catch (err) {
    return domainErrorState(err);
  }
  revalidateFinance();
  redirect(`/entrate/${id}`);
}

export async function updateReceivableAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return { error: "Credito non valido." };
  const parsed = receivableInputSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  try {
    await updateReceivable(prisma, user.id, id.data, parsed.data);
  } catch (err) {
    return domainErrorState(err);
  }
  revalidateFinance([`/entrate/${id.data}`]);
  redirect(`/entrate/${id.data}`);
}

export async function cancelReceivableAction(id: string): Promise<SimpleActionResult> {
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Credito non valido." };
  return simple(() => cancelReceivable(prisma, user.id, parsed.data), "Credito annullato", [`/entrate/${parsed.data}`]);
}

export async function restoreReceivableAction(id: string): Promise<SimpleActionResult> {
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Credito non valido." };
  return simple(() => restoreReceivable(prisma, user.id, parsed.data), "Credito ripristinato", [`/entrate/${parsed.data}`]);
}

// ───────────── Debiti ─────────────

export async function createPayableAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = payableInputSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  let id: string;
  try {
    id = (await createPayable(prisma, user.id, parsed.data)).id;
  } catch (err) {
    return domainErrorState(err);
  }
  revalidateFinance();
  redirect(`/uscite/${id}`);
}

export async function updatePayableAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return { error: "Costo non valido." };
  const parsed = payableInputSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  try {
    await updatePayable(prisma, user.id, id.data, parsed.data);
  } catch (err) {
    return domainErrorState(err);
  }
  revalidateFinance([`/uscite/${id.data}`]);
  redirect(`/uscite/${id.data}`);
}

export async function cancelPayableAction(id: string): Promise<SimpleActionResult> {
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Costo non valido." };
  return simple(() => cancelPayable(prisma, user.id, parsed.data), "Costo annullato", [`/uscite/${parsed.data}`]);
}

export async function restorePayableAction(id: string): Promise<SimpleActionResult> {
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Costo non valido." };
  return simple(() => restorePayable(prisma, user.id, parsed.data), "Costo ripristinato", [`/uscite/${parsed.data}`]);
}

// ───────────── Pagamenti ─────────────

async function paymentAction(direction: "IN" | "OUT", formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = paymentInputSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  try {
    await registerPayment(prisma, user.id, direction, parsed.data, appToday());
  } catch (err) {
    return domainErrorState(err);
  }
  revalidateFinance([direction === "IN" ? `/entrate/${parsed.data.targetId}` : `/uscite/${parsed.data.targetId}`]);
  return { success: direction === "IN" ? "Incasso registrato" : "Pagamento registrato" };
}

export async function registerIncomingPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return paymentAction("IN", formData);
}

export async function registerOutgoingPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return paymentAction("OUT", formData);
}

export async function voidPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = voidPaymentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  let res: { receivableId: string | null; payableId: string | null };
  try {
    res = await voidPayment(prisma, user.id, parsed.data.paymentId, parsed.data.reason);
  } catch (err) {
    return domainErrorState(err);
  }
  revalidateFinance([res.receivableId && `/entrate/${res.receivableId}`, res.payableId && `/uscite/${res.payableId}`].filter(Boolean) as string[]);
  return { success: "Movimento stornato" };
}

// ───────────── Categorie di costo ─────────────

export async function createCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = categoryInputSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  try {
    await createCategory(prisma, user.id, parsed.data.name);
  } catch (err) {
    return domainErrorState(err);
  }
  revalidatePath("/uscite/categorie");
  return { success: "Categoria creata" };
}

export async function renameCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return { error: "Categoria non valida." };
  const parsed = categoryInputSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return zodFieldErrors(parsed.error);
  try {
    await renameCategory(prisma, user.id, id.data, parsed.data.name);
  } catch (err) {
    return domainErrorState(err);
  }
  revalidatePath("/uscite/categorie");
  return { success: "Categoria rinominata" };
}

export async function setCategoryActiveAction(id: string, active: boolean): Promise<SimpleActionResult> {
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Categoria non valida." };
  const res = await simple(() => setCategoryActive(prisma, user.id, parsed.data, active), active ? "Categoria riattivata" : "Categoria disattivata");
  revalidatePath("/uscite/categorie");
  return res;
}
