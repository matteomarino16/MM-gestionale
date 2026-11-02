import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Decimal } from "decimal.js";
import { PencilIcon, PlusIcon } from "lucide-react";
import { DetailList } from "@/components/common/detail-list";
import { ExpiryBadge } from "@/components/common/expiry-badge";
import { CountStat, MoneyStat } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { SettlementBadge } from "@/components/finance/settlement-badge";
import { PageHeader } from "@/components/layout/page-header";
import { ProviderActions } from "@/components/providers/provider-actions";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { formatCivilDate, formatDateTime, formatMoney } from "@/lib/format";
import { FREQUENCY_LABELS, SERVICE_STATUS_LABELS, SERVICE_STATUS_TONES } from "@/lib/labels";
import { appToday } from "@/lib/today";
import { uuid } from "@/lib/validation/common";
import { annualizedAmount } from "@/lib/calculations/renewal-period";
import { getProviderDetail } from "@/modules/providers/service";

export const metadata: Metadata = { title: "Scheda fornitore" };

export default async function ProviderDetailPage({ params }: PageProps<"/fornitori/[id]">) {
  await requireUser();
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const detail = await getProviderDetail(prisma, id.data);
  if (!detail) notFound();
  const { provider, services, payables, history } = detail;
  const today = appToday();

  const active = services.filter((s) => s.status === "ACTIVE");
  const yearlyCost = active.reduce((sum, s) => sum.plus(annualizedAmount(s.providerCost.toString(), s) ?? "0"), new Decimal(0));
  const outstanding = payables
    .filter((p) => p.status === "OPEN" || p.status === "PARTIAL")
    .reduce((sum, p) => sum.plus(p.amountDue.toString()).minus(p.paidAmount.toString()), new Decimal(0));
  const paid = payables.reduce((sum, p) => sum.plus(p.paidAmount.toString()), new Decimal(0));

  return (
    <>
      <PageHeader
        title={provider.name}
        description={provider.active ? "Fornitore attivo" : "Fornitore disattivato"}
        actions={
          <>
            <Link href={`/fornitori/${provider.id}/modifica`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <PencilIcon /> Modifica
            </Link>
            <ProviderActions id={provider.id} name={provider.name} active={provider.active} deletable={services.length === 0 && payables.length === 0} />
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyStat label="Costo annuo stimato" value={yearlyCost.toFixed(2)} hint={`${active.length} servizi attivi, imponibile`} />
        <MoneyStat label="Pagato" value={paid.toFixed(2)} />
        <MoneyStat label="Debito residuo" value={outstanding.toFixed(2)} tone="warning" />
        <CountStat label="Servizi totali" value={services.length} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Dati</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                ["Sito web", provider.website && <a href={provider.website} target="_blank" rel="noopener noreferrer" className="hover:underline">{provider.website}</a>],
                ["Email", provider.email],
                ["Telefono", provider.phone],
                ["Codice account", provider.accountRef],
                ["Note", provider.notes && <span className="whitespace-pre-wrap">{provider.notes}</span>],
              ]}
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Servizi</CardTitle>
          </CardHeader>
          <CardContent>
            {services.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nessun servizio con questo fornitore.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Servizio</TableHead>
                    <TableHead className="hidden sm:table-cell">Cliente</TableHead>
                    <TableHead>Scadenza</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="hidden md:table-cell">Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link href={`/servizi/${s.id}`} className="font-medium hover:underline">
                          {s.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{FREQUENCY_LABELS[s.frequency]}</div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Link href={`/clienti/${s.client.id}`} className="hover:underline">
                          {s.client.displayName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <ExpiryBadge date={s.expiryDate} today={today} muted={s.status !== "ACTIVE"} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(s.providerCost)}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <StatusBadge tone={SERVICE_STATUS_TONES[s.status]}>{SERVICE_STATUS_LABELS[s.status]}</StatusBadge>
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
            <CardTitle>Costi registrati</CardTitle>
            <CardAction>
              <Link href={`/uscite/nuovo?fornitore=${provider.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                <PlusIcon /> Nuovo costo
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {payables.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nessun costo registrato.</p>
            ) : (
              <ul className="divide-y text-sm">
                {payables.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      <Link href={`/uscite/${p.id}`} className="hover:underline">
                        {p.description}
                      </Link>
                      <span className="block text-xs text-muted-foreground">Scadenza {formatCivilDate(p.dueDate)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{formatMoney(p.amountDue)}</span>
                      <SettlementBadge status={p.status} dueDate={p.dueDate} today={today} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {history.length > 0 && (
          <Card className="lg:row-start-2">
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
        )}
      </div>
    </>
  );
}
