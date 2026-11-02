import type { Metadata } from "next";
import Link from "next/link";
import { toServiceOptions } from "@/components/finance/link-options";
import { ReceivableForm } from "@/components/finance/receivable-form";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { param } from "@/lib/list-params";
import { uuid } from "@/lib/validation/common";
import { clientOptions } from "@/modules/clients/service";
import { createReceivableAction } from "@/modules/finance/actions";
import { receivableDefaults } from "@/modules/finance/form-values";
import { serviceLinkOptions } from "@/modules/finance/ledger";

export const metadata: Metadata = { title: "Nuovo credito" };

const id = (v: string | undefined) => {
  const r = uuid.safeParse(v);
  return r.success ? r.data : undefined;
};

export default async function NewReceivablePage({ searchParams }: PageProps<"/entrate/nuovo">) {
  await requireUser();
  const sp = await searchParams;
  const values = await receivableDefaults(prisma, {
    clientId: id(param(sp, "cliente")),
    serviceId: id(param(sp, "servizio")),
    renewalId: id(param(sp, "rinnovo")),
  });
  const [clients, services] = await Promise.all([clientOptions(prisma, values.clientId || undefined), serviceLinkOptions(prisma)]);
  const cancelHref = values.serviceId ? `/servizi/${values.serviceId}` : values.clientId ? `/clienti/${values.clientId}` : "/entrate";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nuovo credito" description="Importo concordato con un cliente, da incassare" />
      <Card>
        <CardContent>
          {clients.length === 0 ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">Per registrare un credito serve almeno un cliente.</p>
              <Link href="/clienti/nuovo" className={buttonVariants()}>
                Crea un cliente
              </Link>
            </div>
          ) : (
            <ReceivableForm
              action={createReceivableAction}
              values={values}
              clients={clients.map((c) => ({ id: c.id, name: c.displayName }))}
              services={toServiceOptions(services)}
              cancelHref={cancelHref}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
