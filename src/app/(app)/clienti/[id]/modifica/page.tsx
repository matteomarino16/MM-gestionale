import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { uuid } from "@/lib/validation/common";
import { updateClientAction } from "@/modules/clients/actions";

export const metadata: Metadata = { title: "Modifica cliente" };

export default async function EditClientPage({ params }: PageProps<"/clienti/[id]/modifica">) {
  await requireUser();
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const client = await prisma.client.findUnique({ where: { id: id.data } });
  if (!client) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Modifica ${client.displayName}`} />
      <Card>
        <CardContent>
          <ClientForm action={updateClientAction} client={client} cancelHref={`/clienti/${client.id}`} />
        </CardContent>
      </Card>
    </div>
  );
}
