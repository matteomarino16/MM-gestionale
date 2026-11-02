import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ProviderForm } from "@/components/providers/provider-form";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { uuid } from "@/lib/validation/common";
import { updateProviderAction } from "@/modules/providers/actions";

export const metadata: Metadata = { title: "Modifica fornitore" };

export default async function EditProviderPage({ params }: PageProps<"/fornitori/[id]/modifica">) {
  await requireUser();
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const provider = await prisma.provider.findUnique({ where: { id: id.data } });
  if (!provider) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Modifica ${provider.name}`} />
      <Card>
        <CardContent>
          <ProviderForm action={updateProviderAction} provider={provider} cancelHref={`/fornitori/${provider.id}`} />
        </CardContent>
      </Card>
    </div>
  );
}
