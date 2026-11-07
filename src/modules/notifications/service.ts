import type { NotificationStatus, Prisma } from "@/generated/prisma/client";
import type { DbTx } from "@/lib/db/client";
import { paged, type ListParams } from "@/lib/list-params";

export function unreadCount(db: DbTx, userId: string) {
  return db.notification.count({ where: { userId, status: "UNREAD" } });
}

export async function listNotifications(db: DbTx, userId: string, params: ListParams<"date">, status: NotificationStatus | "ACTIVE" | "ALL") {
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(status === "ACTIVE" ? { status: { in: ["UNREAD", "READ"] } } : status === "ALL" ? {} : { status }),
  };
  const [total, items] = await Promise.all([
    db.notification.count({ where }),
    db.notification.findMany({
      where,
      orderBy: [{ scheduledFor: params.dir }, { createdAt: params.dir }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { client: { select: { displayName: true } } },
    }),
  ]);
  return paged(items, total, params.page, params.pageSize);
}

/** Cambia lo stato solo di notifiche dell'utente indicato. */
export async function setNotificationStatus(db: DbTx, userId: string, ids: string[], status: NotificationStatus) {
  const res = await db.notification.updateMany({
    where: { userId, id: { in: ids } },
    data: { status, readAt: status === "UNREAD" ? null : new Date() },
  });
  return res.count;
}

export async function markAllRead(db: DbTx, userId: string) {
  const res = await db.notification.updateMany({ where: { userId, status: "UNREAD" }, data: { status: "READ", readAt: new Date() } });
  return res.count;
}
