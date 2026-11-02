import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ProviderForm } from "@/components/providers/provider-form";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { createProviderAction } from "@/modules/providers/actions";

export const metadata: Metadata = { title: "Nuovo fornitore" };

export default async function NewProviderPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nuovo fornitore" />
      <Card>
        <CardContent>
          <ProviderForm action={createProviderAction} cancelHref="/fornitori" />
        </CardContent>
      </Card>
    </div>
  );
}
