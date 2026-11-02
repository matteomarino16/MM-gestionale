import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ServiceForm } from "@/components/services/service-form";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { uuid } from "@/lib/validation/common";
import { clientOptions } from "@/modules/clients/service";
import { providerOptions } from "@/modules/providers/service";
import { updateServiceAction } from "@/modules/services/actions";
import { serviceToFormValues } from "@/modules/services/serialize";

export const metadata: Metadata = { title: "Modifica servizio" };

export default async function EditServicePage({ params }: PageProps<"/servizi/[id]/modifica">) {
  await requireUser();
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const service = await prisma.service.findUnique({ where: { id: id.data } });
  if (!service) notFound();
  const [clients, providers] = await Promise.all([clientOptions(prisma, service.clientId), providerOptions(prisma, service.providerId)]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Modifica ${service.name}`} />
      <Card>
        <CardContent>
          <ServiceForm
            action={updateServiceAction}
            service={serviceToFormValues(service)}
            clients={clients.map((c) => ({ id: c.id, name: c.displayName }))}
            providers={providers}
            cancelHref={`/servizi/${service.id}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
