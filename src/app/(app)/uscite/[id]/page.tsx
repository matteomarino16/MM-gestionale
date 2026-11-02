import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Decimal } from "decimal.js";
import { PencilIcon } from "lucide-react";
import { DetailList } from "@/components/common/detail-list";
import { MoneyStat } from "@/components/common/stat-card";
import { PaymentForm } from "@/components/finance/payment-form";
import { PaymentsTable } from "@/components/finance/payments-table";
import { SettlementActions } from "@/components/finance/settlement-actions";
import { SettlementBadge } from "@/components/finance/settlement-badge";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { formatCivilDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { RENEWAL_STATUS_LABELS } from "@/lib/labels";
import { appToday } from "@/lib/today";
import { uuid } from "@/lib/validation/common";
import { registerOutgoingPaymentAction } from "@/modules/finance/actions";
import { getPayableDetail } from "@/modules/finance/payables";

export const metadata: Metadata = { title: "Costo" };

export default async function PayableDetailPage({ params }: PageProps<"/uscite/[id]">) {
  await requireUser();
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const detail = await getPayableDetail(prisma, id.data);
  if (!detail) notFound();
  const { payable: p, history } = detail;
  const today = appToday();
  const residual = new Decimal(p.amountDue.toString()).minus(p.paidAmount.toString()).toFixed(2);
  const open = p.status === "OPEN" || p.status === "PARTIAL";
  const activePayments = p.payments.filter((x) => !x.voidedAt).length;

  return (
    <>
      <PageHeader
        title={p.description}
        description={p.provider ? `Costo verso ${p.provider.name}` : "Costo"}
        actions={
          <>
            {p.status !== "CANCELLED" && (
              <Link href={`/uscite/${p.id}/modifica`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <PencilIcon /> Modifica
              </Link>
            )}
            {p.status !== "PAID" && <SettlementActions kind="payable" id={p.id} cancelled={p.status === "CANCELLED"} hasPayments={activePayments > 0} />}
          </>
        }
      />
      <div className="mb-4">
        <SettlementBadge status={p.status} dueDate={p.dueDate} today={today} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyStat label="Previsto" value={p.expectedAmount.toFixed(2)} hint="Imponibile" />
        <MoneyStat label="Dovuto" value={p.amountDue.toFixed(2)} hint={`${p.actualAmount ? "Su importo effettivo" : "Su importo previsto"} · IVA ${formatMoney(p.vatAmount)}`} />
        <MoneyStat label="Pagato" value={p.paidAmount.toFixed(2)} hint={`${activePayments} moviment${activePayments === 1 ? "o" : "i"}`} />
        <MoneyStat label="Residuo" value={p.status === "CANCELLED" ? "0.00" : residual} tone="warning" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Dettagli</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                ["Fornitore", p.provider && <Link key="p" href={`/fornitori/${p.provider.id}`} className="hover:underline">{p.provider.name}</Link>],
                ["Categoria", p.category?.name ?? null],
                ["Servizio", p.service && <Link key="s" href={`/servizi/${p.service.id}`} className="hover:underline">{p.service.name}</Link>],
                ["Cliente", p.service && <Link key="c" href={`/clienti/${p.service.client.id}`} className="hover:underline">{p.service.client.displayName}</Link>],
                ["Rinnovo", p.renewal && `Ciclo #${p.renewal.cycleNumber} · scadenza ${formatCivilDate(p.renewal.expiryDate)} · ${RENEWAL_STATUS_LABELS[p.renewal.status]}`],
                ["Importo effettivo", p.actualAmount ? formatMoney(p.actualAmount) : null],
                ["Data prevista", formatCivilDate(p.dueDate)],
                ["IVA", `${formatNumber(p.vatRate)}%`],
                ["Annullato il", p.cancelledAt && formatDateTime(p.cancelledAt)],
              ]}
            />
            {p.notes && <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">{p.notes}</p>}
          </CardContent>
        </Card>
        <div className="space-y-4 lg:col-span-2">
          {open && (
            <Card>
              <CardHeader>
                <CardTitle>Registra pagamento</CardTitle>
                <CardDescription>Registra solo pagamenti effettivamente eseguiti.</CardDescription>
              </CardHeader>
              <CardContent>
                <PaymentForm action={registerOutgoingPaymentAction} targetId={p.id} residual={residual} today={today} submitLabel="Registra pagamento" />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Pagamenti</CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentsTable payments={p.payments} emptyLabel="Nessun pagamento registrato." />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Storico</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {history.map((h) => (
                  <li key={h.id.toString()}>
                    <span className="text-muted-foreground">{formatDateTime(h.createdAt)}</span> · {h.summary ?? h.action}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
