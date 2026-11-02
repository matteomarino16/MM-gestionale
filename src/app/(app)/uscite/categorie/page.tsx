import type { Metadata } from "next";
import { CategoryRow, NewCategoryForm } from "@/components/finance/category-forms";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { listCategories } from "@/modules/finance/categories";

export const metadata: Metadata = { title: "Categorie di costo" };

export default async function CategoriesPage() {
  await requireUser();
  const categories = await listCategories(prisma);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Categorie di costo" description="Usate per classificare le uscite e filtrare i report" />
      <Card>
        <CardHeader>
          <CardTitle>Categorie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <NewCategoryForm />
          <ul className="divide-y">
            {categories.map((c) => (
              <CategoryRow key={c.id} id={c.id} name={c.name} active={c.active} count={c._count.payables} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
