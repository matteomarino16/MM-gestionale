import type { Metadata } from "next";
import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { createClientAction } from "@/modules/clients/actions";

export const metadata: Metadata = { title: "Nuovo cliente" };

export default async function NewClientPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nuovo cliente" />
      <Card>
        <CardContent>
          <ClientForm action={createClientAction} cancelHref="/clienti" />
        </CardContent>
      </Card>
    </div>
  );
}
