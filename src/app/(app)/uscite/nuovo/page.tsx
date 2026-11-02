import type { Metadata } from "next";
import { toServiceOptions } from "@/components/finance/link-options";
import { PayableForm } from "@/components/finance/payable-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { param } from "@/lib/list-params";
import { uuid } from "@/lib/validation/common";
import { createPayableAction } from "@/modules/finance/actions";
import { payableDefaults } from "@/modules/finance/form-values";
import { payableFormData } from "@/modules/finance/payable-form-data";

export const metadata: Metadata = { title: "Nuovo costo" };

const id = (v: string | undefined) => {
  const r = uuid.safeParse(v);
  return r.success ? r.data : undefined;
};

export default async function NewPayablePage({ searchParams }: PageProps<"/uscite/nuovo">) {
  await requireUser();
  const sp = await searchParams;
  const values = await payableDefaults(prisma, {
    providerId: id(param(sp, "fornitore")),
    serviceId: id(param(sp, "servizio")),
    renewalId: id(param(sp, "rinnovo")),
  });
  const data = await payableFormData(prisma, { providerId: values.providerId || null });
  const cancelHref = values.serviceId ? `/servizi/${values.serviceId}` : values.providerId ? `/fornitori/${values.providerId}` : "/uscite";
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nuovo costo" description="Costo previsto o sostenuto verso un fornitore" />
      <Card>
        <CardContent>
          <PayableForm action={createPayableAction} values={values} {...data} services={toServiceOptions(data.services)} cancelHref={cancelHref} />
        </CardContent>
      </Card>
    </div>
  );
}
