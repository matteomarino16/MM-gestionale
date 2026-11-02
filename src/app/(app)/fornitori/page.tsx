import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, TruckIcon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { ListToolbar } from "@/components/tables/list-toolbar";
import { Pagination } from "@/components/tables/pagination";
import { SortHeader } from "@/components/tables/sort-header";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { formatMoney } from "@/lib/format";
import { param, parseListParams } from "@/lib/list-params";
import { listProviders, PROVIDER_SORTS } from "@/modules/providers/service";

export const metadata: Metadata = { title: "Fornitori" };

export default async function ProvidersPage({ searchParams }: PageProps<"/fornitori">) {
  await requireUser();
  const sp = await searchParams;
  const params = parseListParams(sp, PROVIDER_SORTS, "name");
  const stato = param(sp, "stato");
  const active = stato === "inattivi" ? false : stato === "tutti" ? ("ALL" as const) : true;
  const result = await listProviders(prisma, params, { active });
  const newButton = (
    <Link href="/fornitori/nuovo" className={buttonVariants()}>
      <PlusIcon /> Nuovo fornitore
    </Link>
  );

  return (
    <>
      <PageHeader title="Fornitori" description="Registrar, hosting, licenze e altri fornitori" actions={newButton} />
      <ListToolbar q={params.q} placeholder="Cerca per nome, email, sito, codice account…" resetHref="/fornitori">
        <NativeSelect name="stato" defaultValue={stato ?? "attivi"} aria-label="Stato">
          <NativeSelectOption value="attivi">Attivi</NativeSelectOption>
          <NativeSelectOption value="inattivi">Disattivati</NativeSelectOption>
          <NativeSelectOption value="tutti">Tutti</NativeSelectOption>
        </NativeSelect>
      </ListToolbar>
      {result.total === 0 ? (
        params.q || stato ? (
          <EmptyState icon={TruckIcon} title="Nessun fornitore corrisponde ai filtri" />
        ) : (
          <EmptyState icon={TruckIcon} title="Nessun fornitore" description="Registra i fornitori per tracciare costi e scadenze dei servizi." action={newButton} />
        )
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortHeader label="Fornitore" field="name" sort={params.sort} dir={params.dir} searchParams={sp} />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Contatti</TableHead>
                  <TableHead className="text-right">
                    <SortHeader label="Servizi attivi" field="services" sort={params.sort} dir={params.dir} searchParams={sp} />
                  </TableHead>
                  <TableHead className="text-right">Debito residuo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/fornitori/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      {!p.active && <StatusBadge tone="muted" className="ml-2">Disattivato</StatusBadge>}
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      <div>{p.email ?? "—"}</div>
                      <div className="text-muted-foreground">{p.website}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.activeServices}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.outstanding === "0.00" ? <span className="text-muted-foreground">—</span> : formatMoney(p.outstanding)}
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
