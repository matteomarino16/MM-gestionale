import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Decimal } from "decimal.js";
import { PencilIcon, PlusIcon } from "lucide-react";
import { ClientArchiveButton } from "@/components/clients/client-archive-button";
import { DetailList } from "@/components/common/detail-list";
import { ExpiryBadge } from "@/components/common/expiry-badge";
import { MoneyStat } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { formatCivilDate, formatDateTime, formatMoney } from "@/lib/format";
import {
  CLIENT_TYPE_LABELS,
  DOCUMENT_KIND_LABELS,
  FREQUENCY_LABELS,
  PROJECT_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  SERVICE_STATUS_LABELS,
  SERVICE_STATUS_TONES,
  SERVICE_TYPE_LABELS,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_TONES,
} from "@/lib/labels";
import { addDays, civilFromDb, civilToDb, compareCivil } from "@/lib/timezone/civil-date";
import { appToday } from "@/lib/today";
import { uuid } from "@/lib/validation/common";
import { getClientDetail } from "@/modules/clients/service";
import { clientFinanceSummary } from "@/modules/finance/summary";

export const metadata: Metadata = { title: "Scheda cliente" };

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export default async function ClientDetailPage({ params }: PageProps<"/clienti/[id]">) {
  await requireUser();
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const detail = await getClientDetail(prisma, id.data);
  if (!detail) notFound();
  const { client, services, projects, quotes, receivables, payments, payables, documents, tasks, history } = detail;
  const finance = await clientFinanceSummary(prisma, client.id);
  const today = appToday();
  const horizon = civilToDb(addDays(today, 60));

  const upcoming = [
    ...services
      .filter((s) => s.status === "ACTIVE" && s.expiryDate && s.expiryDate <= horizon)
      .map((s) => ({ date: s.expiryDate!, label: `Scadenza ${s.name}`, href: `/servizi/${s.id}`, amount: null as string | null })),
    ...receivables
      .filter((r) => (r.status === "OPEN" || r.status === "PARTIAL") && r.dueDate && r.dueDate <= horizon)
      .map((r) => ({
        date: r.dueDate!,
        label: `Pagamento: ${r.description}`,
        href: `/clienti/${client.id}`,
        amount: new Decimal(r.amountDue.toString()).minus(r.paidAmount.toString()).toFixed(2),
      })),
  ].sort((a, b) => compareCivil(civilFromDb(a.date), civilFromDb(b.date)));

  const address = [client.address, [client.postalCode, client.city, client.province && `(${client.province})`].filter(Boolean).join(" "), client.country !== "IT" ? client.country : null]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <PageHeader
        title={client.displayName}
        description={`${CLIENT_TYPE_LABELS[client.type]} · cliente dal ${formatDateTime(client.createdAt).slice(0, 10)}`}
        actions={
          <>
            {client.status === "ACTIVE" && (
              <Link href={`/servizi/nuovo?cliente=${client.id}`} className={buttonVariants({ size: "sm" })}>
                <PlusIcon /> Nuovo servizio
              </Link>
            )}
            <Link href={`/clienti/${client.id}/modifica`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <PencilIcon /> Modifica
            </Link>
            <ClientArchiveButton id={client.id} archived={client.status === "ARCHIVED"} name={client.displayName} />
          </>
        }
      />
      {client.status === "ARCHIVED" && (
        <div className="mb-4">
          <StatusBadge tone="muted">Archiviato il {formatDateTime(client.archivedAt)}</StatusBadge>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MoneyStat label="Ricavi concordati" value={finance.agreedRevenue} hint="Imponibile" />
        <MoneyStat label="Incassato" value={finance.collected} />
        <MoneyStat label="Crediti residui" value={finance.outstanding} tone="warning" hint={finance.overdue !== "0.00" ? `di cui scaduti ${formatMoney(finance.overdue)}` : undefined} />
        <MoneyStat label="Costi attribuiti" value={finance.costs} hint="Imponibile" />
        <MoneyStat label="Pagato ai fornitori" value={finance.paidCosts} />
        <MoneyStat label="Margine gestionale" value={finance.margin} tone="positive" hint="Stima non contabile" />
      </div>

      <Tabs defaultValue="panoramica">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList>
            <TabsTrigger value="panoramica">Panoramica</TabsTrigger>
            <TabsTrigger value="servizi">Servizi ({services.length})</TabsTrigger>
            <TabsTrigger value="economico">Economico</TabsTrigger>
            <TabsTrigger value="commesse">Commesse e preventivi</TabsTrigger>
            <TabsTrigger value="attivita">Attività ({tasks.filter((t) => !t.completedAt).length})</TabsTrigger>
            <TabsTrigger value="documenti">Documenti ({documents.length})</TabsTrigger>
            <TabsTrigger value="storico">Storico</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="panoramica" className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Dati anagrafici</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  ["Ragione sociale", client.companyName],
                  ["Nome e cognome", [client.firstName, client.lastName].filter(Boolean).join(" ") || null],
                  ["Partita IVA", client.vatNumber],
                  ["Codice fiscale", client.taxCode],
                  ["Email", client.email && <a href={`mailto:${client.email}`} className="hover:underline">{client.email}</a>],
                  ["PEC", client.pec],
                  ["Telefono", client.phone && <a href={`tel:${client.phone}`} className="hover:underline">{client.phone}</a>],
                  ["Indirizzo", address || null],
                  ["Fatturazione", client.billingAddress],
                ]}
              />
              {client.notes && (
                <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Note interne</div>
                  {client.notes}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Scadenze nei prossimi 60 giorni</CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <Empty>Nessuna scadenza imminente.</Empty>
              ) : (
                <ul className="divide-y">
                  {upcoming.map((u, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <Link href={u.href} className="hover:underline">
                        {u.label}
                      </Link>
                      <span className="flex items-center gap-3">
                        {u.amount && <span className="tabular-nums">{formatMoney(u.amount)}</span>}
                        <ExpiryBadge date={u.date} today={today} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="servizi" className="mt-4">
          <Card>
            <CardContent>
              {services.length === 0 ? (
                <Empty>Nessun servizio associato a questo cliente.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Servizio</TableHead>
                      <TableHead className="hidden md:table-cell">Fornitore</TableHead>
                      <TableHead>Scadenza</TableHead>
                      <TableHead className="hidden sm:table-cell text-right">Prezzo / costo</TableHead>
                      <TableHead>Stato</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <Link href={`/servizi/${s.id}`} className="font-medium hover:underline">
                            {s.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {SERVICE_TYPE_LABELS[s.type]} · {FREQUENCY_LABELS[s.frequency]}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {s.provider ? (
                            <Link href={`/fornitori/${s.provider.id}`} className="hover:underline">
                              {s.provider.name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <ExpiryBadge date={s.expiryDate} today={today} muted={s.status !== "ACTIVE"} />
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">
                          {formatMoney(s.clientPrice)}
                          <div className="text-xs text-muted-foreground">{formatMoney(s.providerCost)}</div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={SERVICE_STATUS_TONES[s.status]}>{SERVICE_STATUS_LABELS[s.status]}</StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="economico" className="mt-4 grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Crediti</CardTitle>
              {client.status === "ACTIVE" && (
                <CardAction>
                  <Link href={`/entrate/nuovo?cliente=${client.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                    <PlusIcon /> Nuovo credito
                  </Link>
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              {receivables.length === 0 ? (
                <Empty>Nessun credito registrato.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrizione</TableHead>
                      <TableHead>Scadenza</TableHead>
                      <TableHead className="text-right">Dovuto</TableHead>
                      <TableHead className="text-right">Residuo</TableHead>
                      <TableHead>Stato</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receivables.map((r) => {
                      const residual = new Decimal(r.amountDue.toString()).minus(r.paidAmount.toString());
                      const overdue = (r.status === "OPEN" || r.status === "PARTIAL") && r.dueDate && compareCivil(civilFromDb(r.dueDate), today) < 0;
                      const st = overdue ? "OVERDUE" : r.status;
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <Link href={`/entrate/${r.id}`} className="hover:underline">
                              {r.description}
                            </Link>
                            {r.service && <div className="text-xs text-muted-foreground">{r.service.name}</div>}
                          </TableCell>
                          <TableCell>{formatCivilDate(r.dueDate)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(r.amountDue)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(residual.toFixed(2))}</TableCell>
                          <TableCell>
                            <StatusBadge tone={SETTLEMENT_STATUS_TONES[st]}>{SETTLEMENT_STATUS_LABELS[st]}</StatusBadge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Pagamenti ricevuti</CardTitle>
              </CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <Empty>Nessun pagamento registrato.</Empty>
                ) : (
                  <ul className="divide-y text-sm">
                    {payments.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2 py-2">
                        <Link href={`/entrate/${p.receivable?.id}`} className={`hover:underline ${p.voidedAt ? "text-muted-foreground line-through" : ""}`}>
                          {formatCivilDate(p.paidOn)} · {p.receivable?.description}
                        </Link>
                        <span className="tabular-nums">{formatMoney(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Costi sostenuti</CardTitle>
              </CardHeader>
              <CardContent>
                {payables.length === 0 ? (
                  <Empty>Nessun costo attribuito a questo cliente.</Empty>
                ) : (
                  <ul className="divide-y text-sm">
                    {payables.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2 py-2">
                        <span>
                          <Link href={`/uscite/${p.id}`} className="hover:underline">
                            {p.description}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {[p.provider?.name, p.service?.name].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="tabular-nums">{formatMoney(p.actualAmount ?? p.expectedAmount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="commesse" className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Commesse</CardTitle>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <Empty>Nessuna commessa.</Empty>
              ) : (
                <ul className="divide-y text-sm">
                  {projects.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2 py-2">
                      <span>
                        {p.title}
                        <span className="block text-xs text-muted-foreground">{PROJECT_STATUS_LABELS[p.status]}</span>
                      </span>
                      <span className="tabular-nums">{p.agreedAmount ? formatMoney(p.agreedAmount) : "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Preventivi</CardTitle>
            </CardHeader>
            <CardContent>
              {quotes.length === 0 ? (
                <Empty>Nessun preventivo.</Empty>
              ) : (
                <ul className="divide-y text-sm">
                  {quotes.map((q) => (
                    <li key={q.id} className="flex justify-between gap-2 py-2">
                      <span>
                        {q.number} · {q.title}
                        <span className="block text-xs text-muted-foreground">{QUOTE_STATUS_LABELS[q.status]}</span>
                      </span>
                      <span className="tabular-nums">{formatMoney(q.netAmount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attivita" className="mt-4">
          <Card>
            <CardContent>
              {tasks.length === 0 ? (
                <Empty>Nessuna attività.</Empty>
              ) : (
                <ul className="divide-y text-sm">
                  {tasks.map((t) => (
                    <li key={t.id} className="flex justify-between gap-2 py-2">
                      <span className={t.completedAt ? "text-muted-foreground line-through" : ""}>{t.title}</span>
                      <span>{formatCivilDate(t.dueDate)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documenti" className="mt-4">
          <Card>
            <CardContent>
              {documents.length === 0 ? (
                <Empty>Nessun documento. L&apos;archivio documentale sarà disponibile nella fase dedicata.</Empty>
              ) : (
                <ul className="divide-y text-sm">
                  {documents.map((d) => (
                    <li key={d.id} className="flex justify-between gap-2 py-2">
                      <span>{d.originalName}</span>
                      <span className="text-muted-foreground">{DOCUMENT_KIND_LABELS[d.kind]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storico" className="mt-4">
          <Card>
            <CardContent>
              {history.length === 0 ? (
                <Empty>Nessuna operazione registrata.</Empty>
              ) : (
                <ol className="space-y-3 text-sm">
                  {history.map((h) => (
                    <li key={h.id.toString()} className="flex gap-3">
                      <span className="w-36 shrink-0 text-muted-foreground tabular-nums">{formatDateTime(h.createdAt)}</span>
                      <span>{h.summary ?? h.action}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
