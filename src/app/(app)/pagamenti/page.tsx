import type { Metadata } from "next";
import Link from "next/link";
import { WalletIcon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { MoneyStat } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { describePeriod, PeriodFilter } from "@/components/finance/period-filter";
import { PageHeader } from "@/components/layout/page-header";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { SortHeader } from "@/components/tables/sort-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { formatCivilDate, formatMoney } from "@/lib/format";
import { options, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { param, parseListParams, pickEnum } from "@/lib/list-params";
import { parsePeriod } from "@/lib/period-params";
import { appToday } from "@/lib/today";
import { listPayments, PAYMENT_SORTS } from "@/modules/finance/ledger";
import { PAYMENT_METHODS } from "@/modules/finance/schema";

export const metadata: Metadata = { title: "Pagamenti" };

export default async function PaymentsPage({ searchParams }: PageProps<"/pagamenti">) {
  await requireUser();
  const sp = await searchParams;
  const today = appToday();
  const params = parseListParams(sp, PAYMENT_SORTS, "paidOn", "desc");
  const period = parsePeriod(sp, today, "month");
  const direction = pickEnum(param(sp, "tipo"), ["IN", "OUT"] as const);
  const method = pickEnum(param(sp, "metodo"), PAYMENT_METHODS);
  const includeVoided = param(sp, "stornati") === "on";
  const result = await listPayments(prisma, params, { direction, method, period, includeVoided });

  return (
    <>
      <PageHeader title="Pagamenti" description="Registro dei movimenti di cassa: incassi dai clienti e pagamenti ai fornitori" />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MoneyStat label="Incassi" value={result.totals.inflow} hint={describePeriod(period)} />
        <MoneyStat label="Pagamenti" value={result.totals.outflow} hint={describePeriod(period)} />
        <MoneyStat label="Flusso di cassa" value={result.totals.net} tone="positive" hint="Incassi − pagamenti effettivi" />
      </div>
      <ListToolbar q={params.q} placeholder="Cerca per riferimento, descrizione, cliente, fornitore…" resetHref="/pagamenti">
        <NativeSelect name="tipo" defaultValue={direction ?? ""} aria-label="Tipo">
          <NativeSelectOption value="">Entrate e uscite</NativeSelectOption>
          <NativeSelectOption value="IN">Solo incassi</NativeSelectOption>
          <NativeSelectOption value="OUT">Solo pagamenti</NativeSelectOption>
        </NativeSelect>
        <NativeSelect name="metodo" defaultValue={method ?? ""} aria-label="Metodo">
          <NativeSelectOption value="">Tutti i metodi</NativeSelectOption>
          {options(PAYMENT_METHOD_LABELS).map((o) => (
            <NativeSelectOption key={o.value} value={o.value}>
              {o.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <PeriodFilter period={period} />
        <div className="flex h-8 items-center gap-2">
          <Checkbox id="stornati" name="stornati" defaultChecked={includeVoided} />
          <Label htmlFor="stornati" className="font-normal">
            Mostra stornati
          </Label>
        </div>
      </ListToolbar>

      {result.total === 0 ? (
        <EmptyState
          icon={WalletIcon}
          title="Nessun movimento nel periodo"
          description="Gli incassi e i pagamenti si registrano dalla scheda del credito o del costo."
        />
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortHeader label="Data" field="paidOn" sort={params.sort} dir={params.dir} searchParams={sp} />
                  </TableHead>
                  <TableHead>Voce</TableHead>
                  <TableHead className="hidden md:table-cell">Metodo</TableHead>
                  <TableHead className="text-right">
                    <SortHeader label="Importo" field="amount" sort={params.sort} dir={params.dir} searchParams={sp} className="justify-end" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((p) => {
                  const incoming = p.direction === "IN";
                  const href = incoming ? `/entrate/${p.receivable?.id}` : `/uscite/${p.payable?.id}`;
                  const counterpart = incoming ? p.receivable?.client.displayName : p.payable?.provider?.name;
                  return (
                    <TableRow key={p.id} className={p.voidedAt ? "text-muted-foreground" : undefined}>
                      <TableCell className={p.voidedAt ? "line-through" : undefined}>{formatCivilDate(p.paidOn)}</TableCell>
                      <TableCell>
                        <Link href={href} className="font-medium hover:underline">
                          {incoming ? p.receivable?.description : p.payable?.description}
                        </Link>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <StatusBadge tone={incoming ? "success" : "warning"}>{incoming ? "Incasso" : "Pagamento"}</StatusBadge>
                          {counterpart}
                          {p.reference && <span>· {p.reference}</span>}
                          {p.voidedAt && <StatusBadge tone="muted">Stornato</StatusBadge>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${p.voidedAt ? "line-through" : incoming ? "text-emerald-700 dark:text-emerald-400" : ""}`}
                      >
                        {incoming ? "+" : "−"} {formatMoney(p.amount)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} searchParams={sp} />
        </>
      )}
    </>
  );
}
