import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { toServiceOptions } from "@/components/finance/link-options";
import { PayableForm } from "@/components/finance/payable-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { uuid } from "@/lib/validation/common";
import { updatePayableAction } from "@/modules/finance/actions";
import { payableToFormValues } from "@/modules/finance/form-values";
import { payableFormData } from "@/modules/finance/payable-form-data";

export const metadata: Metadata = { title: "Modifica costo" };

export default async function EditPayablePage({ params }: PageProps<"/uscite/[id]/modifica">) {
  await requireUser();
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const p = await prisma.payable.findUnique({ where: { id: id.data } });
  if (!p) notFound();
  if (p.status === "CANCELLED") redirect(`/uscite/${p.id}`);
  const data = await payableFormData(prisma, p);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Modifica costo" description={p.description} />
      <Card>
        <CardContent>
          <PayableForm action={updatePayableAction} values={payableToFormValues(p)} {...data} services={toServiceOptions(data.services)} cancelHref={`/uscite/${p.id}`} />
        </CardContent>
      </Card>
    </div>
  );
}
