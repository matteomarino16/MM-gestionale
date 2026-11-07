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
import { registerIncomingPaymentAction } from "@/modules/finance/actions";
import { getReceivableDetail } from "@/modules/finance/receivables";

export const metadata: Metadata = { title: "Credito" };

export default async function ReceivableDetailPage({ params }: PageProps<"/entrate/[id]">) {
  await requireUser();
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const detail = await getReceivableDetail(prisma, id.data);
  if (!detail) notFound();
  const { receivable: r, history } = detail;
  const today = appToday();
  const residual = new Decimal(r.amountDue.toString()).minus(r.paidAmount.toString()).toFixed(2);
  const open = r.status === "OPEN" || r.status === "PARTIAL";
  const activePayments = r.payments.filter((p) => !p.voidedAt).length;

  return (
    <>
      <PageHeader
        title={r.description}
        description={`Credito verso ${r.client.displayName}`}
        actions={
          <>
            {r.status !== "CANCELLED" && (
              <Link href={`/entrate/${r.id}/modifica`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <PencilIcon /> Modifica
              </Link>
            )}
            {r.status !== "PAID" && (
              <SettlementActions kind="receivable" id={r.id} cancelled={r.status === "CANCELLED"} hasPayments={activePayments > 0} />
            )}
          </>
        }
      />
      <div className="mb-4">
        <SettlementBadge status={r.status} dueDate={r.dueDate} today={today} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyStat label="Importo concordato" value={r.netAmount.toFixed(2)} hint="Imponibile" />
        <MoneyStat label="Dovuto" value={r.amountDue.toFixed(2)} hint={`IVA ${formatMoney(r.vatAmount)}${r.withholdingAmount.greaterThan(0) ? ` · ritenuta ${formatMoney(r.withholdingAmount)}` : ""}`} />
        <MoneyStat label="Incassato" value={r.paidAmount.toFixed(2)} hint={`${activePayments} moviment${activePayments === 1 ? "o" : "i"}`} />
        <MoneyStat label="Residuo" value={r.status === "CANCELLED" ? "0.00" : residual} tone="warning" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Dettagli</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                ["Cliente", <Link key="c" href={`/clienti/${r.client.id}`} className="hover:underline">{r.client.displayName}</Link>],
                ["Servizio", r.service && <Link key="s" href={`/servizi/${r.service.id}`} className="hover:underline">{r.service.name}</Link>],
                ["Rinnovo", r.renewal && `Ciclo #${r.renewal.cycleNumber} · scadenza ${formatCivilDate(r.renewal.expiryDate)} · ${RENEWAL_STATUS_LABELS[r.renewal.status]}`],
                ["Scadenza pagamento", formatCivilDate(r.dueDate)],
                ["IVA", `${formatNumber(r.vatRate)}%`],
                ["Ritenuta", `${formatNumber(r.withholdingRate)}%`],
                !!r.cancelledAt && ["Annullato il", formatDateTime(r.cancelledAt)],
              ]}
            />
            {r.notes && <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">{r.notes}</p>}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {open && (
            <Card>
              <CardHeader>
                <CardTitle>Registra incasso</CardTitle>
                <CardDescription>Ogni incasso è un movimento separato; per i pagamenti parziali indica l&apos;importo ricevuto.</CardDescription>
              </CardHeader>
              <CardContent>
                <PaymentForm action={registerIncomingPaymentAction} targetId={r.id} residual={residual} today={today} submitLabel="Registra incasso" />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Incassi</CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentsTable payments={r.payments} emptyLabel="Nessun incasso registrato." />
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
