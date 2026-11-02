import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Decimal } from "decimal.js";
import { PencilIcon, PlusIcon } from "lucide-react";
import { DetailList } from "@/components/common/detail-list";
import { ExpiryBadge } from "@/components/common/expiry-badge";
import { MoneyStat } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { SettlementBadge } from "@/components/finance/settlement-badge";
import { PageHeader } from "@/components/layout/page-header";
import { CancelServiceButton } from "@/components/services/cancel-service-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/dal";
import { annualizedAmount, cycleMargin, nextExpiry } from "@/lib/calculations/renewal-period";
import { prisma } from "@/lib/db/client";
import { formatCivilDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import {
  DOCUMENT_KIND_LABELS,
  FREQUENCY_LABELS,
  INTERVAL_UNIT_LABELS,
  RENEWAL_STATUS_LABELS,
  RENEWAL_STATUS_TONES,
  SERVICE_STATUS_LABELS,
  SERVICE_STATUS_TONES,
  SERVICE_TYPE_LABELS,
} from "@/lib/labels";
import { civilFromDb } from "@/lib/timezone/civil-date";
import { appToday } from "@/lib/today";
import { uuid } from "@/lib/validation/common";
import { serviceFinanceSummary } from "@/modules/finance/summary";
import { getServiceDetail } from "@/modules/services/service";

export const metadata: Metadata = { title: "Scheda servizio" };

export default async function ServiceDetailPage({ params }: PageProps<"/servizi/[id]">) {
  await requireUser();
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const detail = await getServiceDetail(prisma, id.data);
  if (!detail) notFound();
  const { service, receivables, payables, documents, history } = detail;
  const finance = await serviceFinanceSummary(prisma, service.id);
  const today = appToday();
  const openRenewal = service.renewals.find((r) => r.status !== "COMPLETED" && r.status !== "CANCELLED");

  const margin = cycleMargin(service.clientPrice.toString(), service.providerCost.toString());
  const yearlyMargin = annualizedAmount(margin, service);
  const following = service.expiryDate ? nextExpiry(civilFromDb(service.expiryDate), service) : null;
  const frequency =
    service.frequency === "CUSTOM"
      ? `Ogni ${service.customIntervalValue} ${INTERVAL_UNIT_LABELS[service.customIntervalUnit!]}`
      : FREQUENCY_LABELS[service.frequency];
  const vat = new Decimal(service.clientPrice.toString()).times(service.vatRate.toString()).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return (
    <>
      <PageHeader
        title={service.name}
        description={`${SERVICE_TYPE_LABELS[service.type]} · ${service.client.displayName}`}
        actions={
          <>
            <Link href={`/servizi/${service.id}/modifica`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <PencilIcon /> Modifica
            </Link>
            {service.status !== "CANCELLED" && <CancelServiceButton id={service.id} name={service.name} />}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge tone={SERVICE_STATUS_TONES[service.status]}>{SERVICE_STATUS_LABELS[service.status]}</StatusBadge>
        {service.autoRenew && <StatusBadge tone="info">Rinnovo automatico</StatusBadge>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MoneyStat label="Prezzo per ciclo" value={service.clientPrice.toFixed(2)} hint={`+ IVA ${formatNumber(service.vatRate)}% (${formatMoney(vat.toFixed(2))})`} />
        <MoneyStat label="Costo per ciclo" value={service.providerCost.toFixed(2)} />
        <MoneyStat label="Margine per ciclo" value={margin} tone="positive" hint={yearlyMargin ? `${formatMoney(yearlyMargin)} / anno (stima)` : "Una tantum"} />
        <MoneyStat label="Ricavi attribuiti" value={finance.agreedRevenue} hint={`Incassato ${formatMoney(finance.collected)}`} />
        <MoneyStat label="Costi attribuiti" value={finance.costs} hint={`Pagato ${formatMoney(finance.paidCosts)}`} />
        <MoneyStat label="Margine gestionale" value={finance.margin} tone="positive" hint="Su crediti e costi registrati" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Dettagli</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                ["Cliente", <Link key="c" href={`/clienti/${service.client.id}`} className="hover:underline">{service.client.displayName}</Link>],
                ["Fornitore", service.provider ? <Link key="p" href={`/fornitori/${service.provider.id}`} className="hover:underline">{service.provider.name}</Link> : null],
                ["Rif. fornitore", service.providerRef],
                ["Dominio", service.domain],
                ["Inizio", formatCivilDate(service.startDate)],
                ["Scadenza", <ExpiryBadge key="e" date={service.expiryDate} today={today} muted={service.status !== "ACTIVE"} />],
                ["Frequenza", frequency],
                ["Scadenza successiva", following ? `${formatCivilDate(following)} (dopo il rinnovo)` : null],
                ["Valuta", service.currency],
              ]}
            />
            {service.description && <p className="mt-4 text-sm whitespace-pre-wrap">{service.description}</p>}
            {service.notes && (
              <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Note</div>
                {service.notes}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cicli di rinnovo</CardTitle>
          </CardHeader>
          <CardContent>
            {service.renewals.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {service.frequency === "NONE" ? "Servizio una tantum: nessun rinnovo previsto." : "Nessun ciclo di rinnovo: indica una scadenza per pianificarlo."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ciclo</TableHead>
                    <TableHead>Scadenza</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Costo prev. / eff.</TableHead>
                    <TableHead className="text-right">Prezzo</TableHead>
                    <TableHead>Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {service.renewals.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums">#{r.cycleNumber}</TableCell>
                      <TableCell>
                        <ExpiryBadge date={r.expiryDate} today={today} muted={r.status === "COMPLETED" || r.status === "CANCELLED"} />
                        {r.newExpiryDate && <div className="text-xs text-muted-foreground">Rinnovato fino al {formatCivilDate(r.newExpiryDate)}</div>}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {formatMoney(r.expectedProviderCost)}
                        <div className="text-xs text-muted-foreground">{r.actualProviderCost ? formatMoney(r.actualProviderCost) : "—"}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(r.clientPrice)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={RENEWAL_STATUS_TONES[r.status]}>{RENEWAL_STATUS_LABELS[r.status]}</StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 lg:col-start-2">
          <CardHeader>
            <CardTitle>Crediti e costi collegati</CardTitle>
            {service.status !== "CANCELLED" && (
              <CardAction className="flex flex-wrap gap-2">
                <Link href={`/entrate/nuovo?${openRenewal ? `rinnovo=${openRenewal.id}` : `servizio=${service.id}`}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                  <PlusIcon /> Credito
                </Link>
                <Link href={`/uscite/nuovo?${openRenewal ? `rinnovo=${openRenewal.id}` : `servizio=${service.id}`}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                  <PlusIcon /> Costo
                </Link>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {receivables.length === 0 && payables.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nessun credito o costo registrato per questo servizio.</p>
            ) : (
              <ul className="divide-y text-sm">
                {receivables.map((r) => (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      <StatusBadge tone="success" className="mr-2">Entrata</StatusBadge>
                      <Link href={`/entrate/${r.id}`} className="hover:underline">
                        {r.description}
                      </Link>
                      <span className="block text-xs text-muted-foreground">Scadenza {formatCivilDate(r.dueDate)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{formatMoney(r.amountDue)}</span>
                      <SettlementBadge status={r.status} dueDate={r.dueDate} today={today} />
                    </span>
                  </li>
                ))}
                {payables.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      <StatusBadge tone="warning" className="mr-2">Uscita</StatusBadge>
                      <Link href={`/uscite/${p.id}`} className="hover:underline">
                        {p.description}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {p.provider?.name} · scadenza {formatCivilDate(p.dueDate)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{formatMoney(p.amountDue)}</span>
                      <SettlementBadge status={p.status} dueDate={p.dueDate} today={today} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {documents.length > 0 && (
              <ul className="divide-y border-t pt-2 text-sm">
                {documents.map((d) => (
                  <li key={d.id} className="flex justify-between py-2">
                    <span>{d.originalName}</span>
                    <span className="text-muted-foreground">{DOCUMENT_KIND_LABELS[d.kind]}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:row-start-2">
          <CardHeader>
            <CardTitle>Storico</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna operazione registrata.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {history.map((h) => (
                  <li key={h.id.toString()}>
                    <span className="text-muted-foreground">{formatDateTime(h.createdAt)}</span>
                    <div>{h.summary ?? h.action}</div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
