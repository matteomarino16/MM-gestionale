import type { Metadata } from "next";
import Link from "next/link";
import { Decimal } from "decimal.js";
import { ArrowUpRightIcon, PlusIcon, TagsIcon } from "lucide-react";
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
import { financeOverview, listPayables, PAYABLE_SORTS, type StatusFilter } from "@/modules/finance/ledger";

export const metadata: Metadata = { title: "Uscite" };

const STATUS_OPTIONS: [StatusFilter, string][] = [
  ["OPEN_ANY", "Da pagare"],
  ["OVERDUE", "Scaduti"],
  ["OPEN", "Da pagare (non scaduti)"],
  ["PARTIAL", "Parziali (non scaduti)"],
  ["PAID", "Pagati"],
  ["CANCELLED", "Annullati"],
  ["ALL", "Tutti"],
];

const optId = (v: string | undefined) => {
  const r = uuid.safeParse(v);
  return r.success ? r.data : undefined;
};

export default async function PayablesPage({ searchParams }: PageProps<"/uscite">) {
  await requireUser();
  const sp = await searchParams;
  const today = appToday();
  const params = parseListParams(sp, PAYABLE_SORTS, "dueDate");
  const status = pickEnum(param(sp, "stato"), STATUS_OPTIONS.map(([v]) => v)) ?? "OPEN_ANY";
  const period = parsePeriod(sp, today, "all");
  const providerId = optId(param(sp, "fornitore"));
  const categoryId = optId(param(sp, "categoria"));

  const [result, overview, providers, categories] = await Promise.all([
    listPayables(prisma, params, { status, providerId, categoryId, period, today }),
    financeOverview(prisma, period, today),
    prisma.provider.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.expenseCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const newHref = providerId ? `/uscite/nuovo?fornitore=${providerId}` : "/uscite/nuovo";
  const filtered = !!(params.q || providerId || categoryId || status !== "OPEN_ANY" || period.preset !== "all");

  return (
    <>
      <PageHeader
        title="Uscite"
        description="Costi e debiti verso fornitori"
        actions={
          <>
            <Link href="/uscite/categorie" className={buttonVariants({ variant: "outline" })}>
              <TagsIcon /> Categorie
            </Link>
            <Link href={newHref} className={buttonVariants()}>
              <PlusIcon /> Nuovo costo
            </Link>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyStat label="Debiti residui" value={overview.payables.residual} tone="warning" hint={`${overview.payables.count} voci aperte`} />
        <MoneyStat label="Debiti scaduti" value={overview.payablesOverdue.residual} tone="warning" />
        <MoneyStat label="Pagato nel periodo" value={overview.outflow} hint={describePeriod(period)} />
        <MoneyStat label="Residuo della selezione" value={result.totals.residual} hint={`Dovuto ${formatMoney(result.totals.amountDue)}`} />
      </div>
      <ListToolbar q={params.q} placeholder="Cerca per descrizione, fornitore, servizio…" resetHref="/uscite">
        <NativeSelect name="stato" defaultValue={status} aria-label="Stato">
          {STATUS_OPTIONS.map(([v, l]) => (
            <NativeSelectOption key={v} value={v}>
              {l}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect name="fornitore" defaultValue={providerId ?? ""} aria-label="Fornitore">
          <NativeSelectOption value="">Tutti i fornitori</NativeSelectOption>
          {providers.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect name="categoria" defaultValue={categoryId ?? ""} aria-label="Categoria">
          <NativeSelectOption value="">Tutte le categorie</NativeSelectOption>
          {categories.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <PeriodFilter period={period} label="Data prevista nel periodo" />
      </ListToolbar>

      {result.total === 0 ? (
        <EmptyState
          icon={ArrowUpRightIcon}
          title={filtered ? "Nessun costo corrisponde ai filtri" : "Nessun costo da pagare"}
          description={filtered ? "Il periodo filtra per data prevista di pagamento." : "Registra i costi dei fornitori per calcolare debiti e margini."}
          action={
            filtered ? undefined : (
              <Link href={newHref} className={buttonVariants()}>
                <PlusIcon /> Nuovo costo
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
                    <SortHeader label="Data prevista" field="dueDate" sort={params.sort} dir={params.dir} searchParams={sp} />
                  </TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    <SortHeader label="Dovuto" field="amount" sort={params.sort} dir={params.dir} searchParams={sp} className="justify-end" />
                  </TableHead>
                  <TableHead className="text-right">Residuo</TableHead>
                  <TableHead className="hidden sm:table-cell">Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/uscite/${p.id}`} className="font-medium hover:underline">
                        {p.description}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {[p.provider?.name, p.service?.name, p.category?.name].filter(Boolean).join(" · ")}
                      </div>
                    </TableCell>
                    <TableCell>{formatCivilDate(p.dueDate)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{formatMoney(p.amountDue)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(new Decimal(p.amountDue.toString()).minus(p.paidAmount.toString()).toFixed(2))}
                      <div className="sm:hidden">
                        <SettlementBadge status={p.status} dueDate={p.dueDate} today={today} />
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <SettlementBadge status={p.status} dueDate={p.dueDate} today={today} />
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
