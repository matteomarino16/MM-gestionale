import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ServiceForm } from "@/components/services/service-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { param } from "@/lib/list-params";
import { uuid } from "@/lib/validation/common";
import { clientOptions } from "@/modules/clients/service";
import { providerOptions } from "@/modules/providers/service";
import { createServiceAction } from "@/modules/services/actions";

export const metadata: Metadata = { title: "Nuovo servizio" };

export default async function NewServicePage({ searchParams }: PageProps<"/servizi/nuovo">) {
  await requireUser();
  const cliente = uuid.safeParse(param(await searchParams, "cliente"));
  const defaultClientId = cliente.success ? cliente.data : undefined;
  const [clients, providers] = await Promise.all([clientOptions(prisma), providerOptions(prisma)]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nuovo servizio" />
      <Card>
        <CardContent>
          {clients.length === 0 ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">Per creare un servizio serve almeno un cliente attivo.</p>
              <Link href="/clienti/nuovo" className={buttonVariants()}>
                Crea un cliente
              </Link>
            </div>
          ) : (
            <ServiceForm
              action={createServiceAction}
              clients={clients.map((c) => ({ id: c.id, name: c.displayName }))}
              providers={providers}
              defaultClientId={defaultClientId}
              cancelHref={defaultClientId ? `/clienti/${defaultClientId}` : "/servizi"}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
