import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { DetailList } from "@/components/common/detail-list";
import { ExpiryBadge } from "@/components/common/expiry-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { SettlementBadge } from "@/components/finance/settlement-badge";
import { PageHeader } from "@/components/layout/page-header";
import { PaymentSideBadge } from "@/components/renewals/payment-side-badge";
import { CompleteRenewalForm, RenewalDetailsForm, RenewalStatusForm, SkipRenewalButton } from "@/components/renewals/renewal-actions";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { formatCivilDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { REMINDER_EVENT_STATUS_LABELS, RENEWAL_STATUS_LABELS, RENEWAL_STATUS_TONES } from "@/lib/labels";
import { civilFromDb } from "@/lib/timezone/civil-date";
import { appToday } from "@/lib/today";
import { uuid } from "@/lib/validation/common";
import { getRenewalDetail, suggestedNewExpiry } from "@/modules/renewals/service";

export const metadata: Metadata = { title: "Rinnovo" };

export default async function RenewalDetailPage({ params }: PageProps<"/rinnovi/[id]">) {
  await requireUser();
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const detail = await getRenewalDetail(prisma, id.data);
  if (!detail) notFound();
  const { renewal: r, client, provider, events, notifications, others } = detail;
  const today = appToday();
  const open = r.status !== "COMPLETED" && r.status !== "CANCELLED";
  const suggested = suggestedNewExpiry(r.expiryDate, r.service) ?? "";

  return (
    <>
      <PageHeader
        title={`Rinnovo ${r.service.name}`}
        description={`${r.service.client.displayName} · ciclo #${r.cycleNumber}`}
        actions={
          <>
            <Link href={`/servizi/${r.service.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Scheda servizio
            </Link>
            {open && <SkipRenewalButton id={r.id} serviceName={r.service.name} />}
          </>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge tone={RENEWAL_STATUS_TONES[r.status]}>{RENEWAL_STATUS_LABELS[r.status]}</StatusBadge>
        <ExpiryBadge date={r.expiryDate} today={today} muted={!open} />
        {r.service.autoRenew && <StatusBadge tone="info">Rinnovo automatico presso il fornitore</StatusBadge>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {open && (
            <Card>
              <CardHeader>
                <CardTitle>Conferma del rinnovo</CardTitle>
                <CardDescription>
                  Da compilare quando il rinnovo è stato effettuato presso il fornitore. Il ciclo resta nello storico e si apre il successivo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CompleteRenewalForm id={r.id} today={today} suggestedExpiry={suggested} expectedCost={formatNumber(r.expectedProviderCost)} />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cliente</CardTitle>
                <CardAction>
                  <PaymentSideBadge side={client} kind="client" />
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {r.receivables.length === 0 ? (
                  <p className="text-muted-foreground">Pagamento non ancora richiesto al cliente.</p>
                ) : (
                  <ul className="divide-y">
                    {r.receivables.map((x) => (
                      <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <Link href={`/entrate/${x.id}`} className="hover:underline">
                          {x.description}
                        </Link>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums">{formatMoney(x.amountDue)}</span>
                          <SettlementBadge status={x.status} dueDate={x.dueDate} today={today} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {open && (
                  <Link href={`/entrate/nuovo?rinnovo=${r.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                    <PlusIcon /> Richiedi al cliente
                  </Link>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Fornitore</CardTitle>
                <CardAction>
                  <PaymentSideBadge side={provider} kind="provider" />
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {r.payables.length === 0 ? (
                  <p className="text-muted-foreground">Nessun costo registrato per questo rinnovo.</p>
                ) : (
                  <ul className="divide-y">
                    {r.payables.map((x) => (
                      <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <Link href={`/uscite/${x.id}`} className="hover:underline">
                          {x.description}
                        </Link>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums">{formatMoney(x.amountDue)}</span>
                          <SettlementBadge status={x.status} dueDate={x.dueDate} today={today} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {open && (
                  <Link href={`/uscite/nuovo?rinnovo=${r.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                    <PlusIcon /> Registra costo fornitore
                  </Link>
                )}
              </CardContent>
            </Card>
          </div>

          {open && (
            <Card>
              <CardHeader>
                <CardTitle>Stato e dettagli</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <RenewalStatusForm id={r.id} status={r.status} />
                <RenewalDetailsForm
                  id={r.id}
                  plannedRenewalDate={r.plannedRenewalDate ? civilFromDb(r.plannedRenewalDate) : ""}
                  expectedProviderCost={formatNumber(r.expectedProviderCost)}
                  clientPrice={formatNumber(r.clientPrice)}
                  notes={r.notes ?? ""}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Riepilogo</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  ["Cliente", <Link key="c" href={`/clienti/${r.service.client.id}`} className="hover:underline">{r.service.client.displayName}</Link>],
                  ["Fornitore", r.service.provider ? <Link key="p" href={`/fornitori/${r.service.provider.id}`} className="hover:underline">{r.service.provider.name}</Link> : null],
                  ["Scadenza", formatCivilDate(r.expiryDate)],
                  ["Previsto il", r.plannedRenewalDate ? formatCivilDate(r.plannedRenewalDate) : null],
                  ["Prezzo al cliente", formatMoney(r.clientPrice)],
                  ["Costo previsto", formatMoney(r.expectedProviderCost)],
                  ["Costo effettivo", r.actualProviderCost ? formatMoney(r.actualProviderCost) : null],
                  ["Rinnovato il", r.renewedAt ? formatCivilDate(r.renewedAt) : null],
                  ["Nuova scadenza", r.newExpiryDate ? formatCivilDate(r.newExpiryDate) : null],
                ]}
              />
              {r.notes && !open && <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">{r.notes}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Promemoria</CardTitle>
              <CardDescription>Avvisi pianificati e inviati per questa scadenza</CardDescription>
            </CardHeader>
            <CardContent>
              {events.length === 0 && notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {open ? "Gli avvisi vengono pianificati automaticamente in base alle regole dei promemoria." : "Nessun promemoria."}
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {events.map((e) => (
                    <li key={e.id} className="flex flex-wrap justify-between gap-2">
                      <span>{e.rule.label}</span>
                      <span className="text-muted-foreground">
                        {formatDateTime(e.scheduledFor)} · {REMINDER_EVENT_STATUS_LABELS[e.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/impostazioni/promemoria" className="mt-3 inline-block text-sm hover:underline">
                Regole dei promemoria
              </Link>
            </CardContent>
          </Card>

          {others.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Altri cicli</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {others.map((o) => (
                    <li key={o.id} className="flex flex-wrap justify-between gap-2">
                      <Link href={`/rinnovi/${o.id}`} className="hover:underline">
                        Ciclo #{o.cycleNumber} · {formatCivilDate(o.expiryDate)}
                      </Link>
                      <StatusBadge tone={RENEWAL_STATUS_TONES[o.status]}>{RENEWAL_STATUS_LABELS[o.status]}</StatusBadge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
