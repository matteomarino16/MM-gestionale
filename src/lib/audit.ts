import type { Prisma } from "@/generated/prisma/client";
import type { DbTx } from "@/lib/db/client";

export type AuditEntry = {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  data?: Prisma.InputJsonValue;
  ip?: string | null;
};

/** Registra un'operazione nello storico. Non inserire mai password o segreti in `data`. */
export async function audit(db: DbTx, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary ?? null,
      data: entry.data,
      ip: entry.ip ?? null,
    },
  });
}
