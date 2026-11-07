"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SimpleActionResult } from "@/components/common/confirm-action";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { markAllRead, setNotificationStatus } from "./service";

const idSchema = z.uuid();
const statusSchema = z.enum(["UNREAD", "READ", "ARCHIVED"]);

function refresh() {
  revalidatePath("/notifiche");
  revalidatePath("/dashboard");
}

export async function setNotificationStatusAction(id: string, status: string): Promise<SimpleActionResult> {
  const user = await requireUser();
  const parsedId = idSchema.safeParse(id);
  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedId.success || !parsedStatus.success) return { ok: false, error: "Richiesta non valida." };
  await setNotificationStatus(prisma, user.id, [parsedId.data], parsedStatus.data);
  refresh();
  return { ok: true };
}

export async function markAllReadAction(): Promise<SimpleActionResult> {
  const user = await requireUser();
  const count = await markAllRead(prisma, user.id);
  refresh();
  return { ok: true, message: count ? `${count} notifiche segnate come lette` : "Nessuna notifica da leggere" };
}

/** Apre la scheda collegata segnando la notifica come letta. */
export async function openNotificationAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) redirect("/notifiche");
  const n = await prisma.notification.findFirst({ where: { id: id.data, userId: user.id }, select: { link: true, status: true } });
  if (!n) redirect("/notifiche");
  if (n.status === "UNREAD") await setNotificationStatus(prisma, user.id, [id.data], "READ");
  refresh();
  redirect(safeRedirectPath(n.link, "/notifiche"));
}
