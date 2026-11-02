import { DomainError } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import type { Db, DbTx } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";

export function listCategories(db: DbTx) {
  return db.expenseCategory.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { _count: { select: { payables: true } } } });
}

export function categoryOptions(db: DbTx, includeId?: string | null) {
  return db.expenseCategory.findMany({
    where: { OR: [{ active: true }, ...(includeId ? [{ id: includeId }] : [])] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function createCategory(db: Db, userId: string, name: string) {
  try {
    const c = await db.expenseCategory.create({ data: { name } });
    await audit(db, { userId, action: "category.created", entityType: "ExpenseCategory", entityId: c.id, summary: `Categoria creata: ${name}` });
    return c;
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError("Esiste già una categoria con questo nome.", { name: ["Nome già in uso"] });
    throw err;
  }
}

export async function renameCategory(db: Db, userId: string, id: string, name: string) {
  try {
    await db.expenseCategory.update({ where: { id }, data: { name } });
    await audit(db, { userId, action: "category.renamed", entityType: "ExpenseCategory", entityId: id, summary: `Categoria rinominata: ${name}` });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError("Esiste già una categoria con questo nome.", { name: ["Nome già in uso"] });
    throw err;
  }
}

export async function setCategoryActive(db: Db, userId: string, id: string, active: boolean) {
  const res = await db.expenseCategory.updateMany({ where: { id }, data: { active } });
  if (res.count === 0) throw new DomainError("Categoria non trovata.");
  await audit(db, { userId, action: active ? "category.activated" : "category.deactivated", entityType: "ExpenseCategory", entityId: id });
}
