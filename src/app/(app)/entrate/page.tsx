import type { Metadata } from "next";
import Link from "next/link";
import { Decimal } from "decimal.js";
import { ArrowDownLeftIcon, PlusIcon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { MoneyStat } from "@/components/common/stat-card";
import { describePeriod, PeriodFilter } from "@/components/finance/period-filter";
import { SettlementBadge } from "@/components/finance/settlement-badge";
import { PageHeader } from "@/components/layout/page-header";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { SortHeader } from "@/components/tables/sort-header";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { formatCivilDate, formatMoney } from "@/lib/format";
import { param, parseListParams, pickEnum } from "@/lib/list-params";
import { parsePeriod } from "@/lib/period-params";
import { appToday } from "@/lib/today";
import { uuid } from "@/lib/validation/common";
import { financeOverview, listReceivables, RECEIVABLE_SORTS, type StatusFilter } from "@/modules/finance/ledger";

export const metadata: Metadata = { title: "Entrate" };

const STATUS_OPTIONS: [StatusFilter, string][] = [
  ["OPEN_ANY", "Da incassare"],
  ["OVERDUE", "Scaduti"],
  ["OPEN", "Da pagare (non scaduti)"],
  ["PARTIAL", "Parziali (non scaduti)"],
  ["PAID", "Incassati"],
  ["CANCELLED", "Annullati"],
  ["ALL", "Tutti"],
];

export default async function ReceivablesPage({ searchParams }: PageProps<"/entrate">) {
  await requireUser();
  const sp = await searchParams;
  const today = appToday();
  const params = parseListParams(sp, RECEIVABLE_SORTS, "dueDate");
  const status = pickEnum(param(sp, "stato"), STATUS_OPTIONS.map(([v]) => v)) ?? "OPEN_ANY";
  const period = parsePeriod(sp, today, "all");
  const clientParam = uuid.safeParse(param(sp, "cliente"));
  const clientId = clientParam.success ? clientParam.data : undefined;

  const [result, overview, clients] = await Promise.all([
    listReceivables(prisma, params, { status, clientId, period, today }),
    financeOverview(prisma, period, today),
    prisma.client.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
  ]);
  const newHref = clientId ? `/entrate/nuovo?cliente=${clientId}` : "/entrate/nuovo";
  const filtered = !!(params.q || clientId || status !== "OPEN_ANY" || period.preset !== "all");

  return (
    <>
      <PageHeader
        title="Entrate"
        description="Crediti verso i clienti e incassi"
        actions={
          <Link href={newHref} className={buttonVariants()}>
            <PlusIcon /> Nuovo credito
          </Link>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyStat label="Crediti residui" value={overview.receivables.residual} tone="warning" hint={`${overview.receivables.count} crediti aperti`} />
        <MoneyStat label="Crediti scaduti" value={overview.receivablesOverdue.residual} tone="warning" hint={`${overview.receivablesOverdue.count} da sollecitare`} />
        <MoneyStat label="Incassato nel periodo" value={overview.inflow} hint={describePeriod(period)} />
        <MoneyStat label="Residuo della selezione" value={result.totals.residual} hint={`Dovuto ${formatMoney(result.totals.amountDue)}`} />
      </div>
      <ListToolbar q={params.q} placeholder="Cerca per descrizione, cliente, servizio…" resetHref="/entrate">
        <NativeSelect name="stato" defaultValue={status} aria-label="Stato">
          {STATUS_OPTIONS.map(([v, l]) => (
            <NativeSelectOption key={v} value={v}>
              {l}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect name="cliente" defaultValue={clientId ?? ""} aria-label="Cliente">
          <NativeSelectOption value="">Tutti i clienti</NativeSelectOption>
          {clients.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.displayName}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <PeriodFilter period={period} label="Scadenza nel periodo" />
      </ListToolbar>

      {result.total === 0 ? (
        <EmptyState
          icon={ArrowDownLeftIcon}
          title={filtered ? "Nessun credito corrisponde ai filtri" : "Nessun credito da incassare"}
          description={filtered ? "Il periodo filtra per data di scadenza del pagamento." : "Registra un credito per ogni importo concordato con un cliente."}
          action={
            filtered ? undefined : (
              <Link href={newHref} className={buttonVariants()}>
                <PlusIcon /> Nuovo credito
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrizione</TableHead>
                  <TableHead>
                    <SortHeader label="Scadenza" field="dueDate" sort={params.sort} dir={params.dir} searchParams={sp} />
                  </TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    <SortHeader label="Dovuto" field="amount" sort={params.sort} dir={params.dir} searchParams={sp} className="justify-end" />
                  </TableHead>
                  <TableHead className="text-right">Residuo</TableHead>
                  <TableHead className="hidden sm:table-cell">Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/entrate/${r.id}`} className="font-medium hover:underline">
                        {r.description}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {r.client.displayName}
                        {r.service && ` · ${r.service.name}`}
                      </div>
                    </TableCell>
                    <TableCell>{formatCivilDate(r.dueDate)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{formatMoney(r.amountDue)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(new Decimal(r.amountDue.toString()).minus(r.paidAmount.toString()).toFixed(2))}
                      <div className="sm:hidden">
                        <SettlementBadge status={r.status} dueDate={r.dueDate} today={today} />
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <SettlementBadge status={r.status} dueDate={r.dueDate} today={today} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} searchParams={sp} />
        </>
      )}
    </>
  );
}
