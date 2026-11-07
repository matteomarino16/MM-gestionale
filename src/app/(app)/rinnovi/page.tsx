import type { Metadata } from "next";
import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { ExpiryBadge } from "@/components/common/expiry-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { PaymentSideBadge } from "@/components/renewals/payment-side-badge";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { SortHeader } from "@/components/tables/sort-header";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { formatMoney } from "@/lib/format";
import { RENEWAL_STATUS_LABELS, RENEWAL_STATUS_TONES } from "@/lib/labels";
import { param, parseListParams, pickEnum } from "@/lib/list-params";
import { appToday } from "@/lib/today";
import { listRenewals, RENEWAL_SORTS } from "@/modules/renewals/service";

export const metadata: Metadata = { title: "Rinnovi" };

const VIEWS = ["open", "completed", "cancelled", "all"] as const;
const WINDOWS = ["7", "30", "60", "90"] as const;

export default async function RenewalsPage({ searchParams }: PageProps<"/rinnovi">) {
  await requireUser();
  const sp = await searchParams;
  const today = appToday();
  const view = pickEnum(param(sp, "vista"), VIEWS) ?? "open";
  const window = pickEnum(param(sp, "entro"), WINDOWS);
  const params = parseListParams(sp, RENEWAL_SORTS, "expiry", view === "open" ? "asc" : "desc");
  const result = await listRenewals(prisma, params, { view, withinDays: window ? Number(window) : undefined, today });

  return (
    <>
      <PageHeader title="Rinnovi" description="Cicli di rinnovo dei servizi: pagamenti del cliente, del fornitore e conferma del rinnovo" />
      <ListToolbar q={params.q} placeholder="Cerca per servizio, dominio, cliente…" resetHref="/rinnovi">
        <NativeSelect name="vista" defaultValue={view} aria-label="Vista">
          <NativeSelectOption value="open">Da gestire</NativeSelectOption>
          <NativeSelectOption value="completed">Completati</NativeSelectOption>
          <NativeSelectOption value="cancelled">Non rinnovati</NativeSelectOption>
          <NativeSelectOption value="all">Tutti</NativeSelectOption>
        </NativeSelect>
        <NativeSelect name="entro" defaultValue={window ?? ""} aria-label="Scadenza">
          <NativeSelectOption value="">Qualsiasi scadenza</NativeSelectOption>
          {WINDOWS.map((w) => (
            <NativeSelectOption key={w} value={w}>
              Entro {w} giorni
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </ListToolbar>

      {result.total === 0 ? (
        <EmptyState
          icon={RefreshCwIcon}
          title={view === "open" ? "Nessun rinnovo da gestire" : "Nessun rinnovo"}
          description="I cicli di rinnovo nascono dai servizi ricorrenti con una data di scadenza."
        />
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortHeader label="Servizio" field="service" sort={params.sort} dir={params.dir} searchParams={sp} />
                  </TableHead>
                  <TableHead>
                    <SortHeader label="Scadenza" field="expiry" sort={params.sort} dir={params.dir} searchParams={sp} />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Fornitore</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Prezzo / costo</TableHead>
                  <TableHead className="hidden sm:table-cell">Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/rinnovi/${r.id}`} className="font-medium hover:underline">
                        {r.service.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {r.service.client.displayName} · ciclo #{r.cycleNumber}
                        {r.service.provider && ` · ${r.service.provider.name}`}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                        <StatusBadge tone={RENEWAL_STATUS_TONES[r.status]}>{RENEWAL_STATUS_LABELS[r.status]}</StatusBadge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ExpiryBadge date={r.expiryDate} today={today} muted={r.status === "COMPLETED" || r.status === "CANCELLED"} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <PaymentSideBadge side={r.client} kind="client" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <PaymentSideBadge side={r.provider} kind="provider" />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      {formatMoney(r.clientPrice)}
                      <div className="text-xs text-muted-foreground">{formatMoney(r.actualProviderCost ?? r.expectedProviderCost)}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <StatusBadge tone={RENEWAL_STATUS_TONES[r.status]}>{RENEWAL_STATUS_LABELS[r.status]}</StatusBadge>
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
