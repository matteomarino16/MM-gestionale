import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { toServiceOptions } from "@/components/finance/link-options";
import { ReceivableForm } from "@/components/finance/receivable-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { uuid } from "@/lib/validation/common";
import { clientOptions } from "@/modules/clients/service";
import { updateReceivableAction } from "@/modules/finance/actions";
import { receivableToFormValues } from "@/modules/finance/form-values";
import { serviceLinkOptions } from "@/modules/finance/ledger";

export const metadata: Metadata = { title: "Modifica credito" };

export default async function EditReceivablePage({ params }: PageProps<"/entrate/[id]/modifica">) {
  await requireUser();
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const r = await prisma.receivable.findUnique({ where: { id: id.data } });
  if (!r) notFound();
  if (r.status === "CANCELLED") redirect(`/entrate/${r.id}`);
  const [clients, services] = await Promise.all([clientOptions(prisma, r.clientId), serviceLinkOptions(prisma)]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Modifica credito" description={r.description} />
      <Card>
        <CardContent>
          <ReceivableForm
            action={updateReceivableAction}
            values={receivableToFormValues(r)}
            clients={clients.map((c) => ({ id: c.id, name: c.displayName }))}
            services={toServiceOptions(services)}
            cancelHref={`/entrate/${r.id}`}
            lockClient={r.paidAmount.greaterThan(0)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
