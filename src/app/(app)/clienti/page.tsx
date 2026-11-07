import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, UsersIcon } from "lucide-react";
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
import { CLIENT_TYPE_LABELS, options } from "@/lib/labels";
import { param, parseListParams, pickEnum } from "@/lib/list-params";
import { CLIENT_SORTS, listClients } from "@/modules/clients/service";

export const metadata: Metadata = { title: "Clienti" };

export default async function ClientsPage({ searchParams }: PageProps<"/clienti">) {
  await requireUser();
  const sp = await searchParams;
  const params = parseListParams(sp, CLIENT_SORTS, "name");
  const status = pickEnum(param(sp, "stato"), ["ACTIVE", "ARCHIVED", "ALL"] as const) ?? "ACTIVE";
  const type = pickEnum(param(sp, "tipo"), ["PERSON", "COMPANY", "OTHER"] as const);
  const result = await listClients(prisma, params, { status, type });
  const filtered = !!(params.q || type || status !== "ACTIVE");
  const deleted = param(sp, "eliminato") === "1";

  return (
    <>
      <PageHeader
        title="Clienti"
        description="Anagrafiche, servizi e situazione economica"
        actions={
          <Link href="/clienti/nuovo" className={buttonVariants()}>
            <PlusIcon /> Nuovo cliente
          </Link>
        }
      />
      {deleted && (
        <p role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
          Cliente eliminato.
        </p>
      )}
      <ListToolbar q={params.q} placeholder="Cerca per nome, email, P.IVA, città, dominio…" resetHref="/clienti">
        <NativeSelect name="stato" defaultValue={status} aria-label="Stato">
          <NativeSelectOption value="ACTIVE">Attivi</NativeSelectOption>
          <NativeSelectOption value="ARCHIVED">Archiviati</NativeSelectOption>
          <NativeSelectOption value="ALL">Tutti</NativeSelectOption>
        </NativeSelect>
        <NativeSelect name="tipo" defaultValue={type ?? ""} aria-label="Tipologia">
          <NativeSelectOption value="">Tutte le tipologie</NativeSelectOption>
          {options(CLIENT_TYPE_LABELS).map((o) => (
            <NativeSelectOption key={o.value} value={o.value}>
              {o.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </ListToolbar>

      {result.total === 0 ? (
        filtered ? (
          <EmptyState icon={UsersIcon} title="Nessun cliente corrisponde ai filtri" description="Modifica la ricerca o azzera i filtri." />
        ) : (
          <EmptyState
            icon={UsersIcon}
            title="Nessun cliente"
            description="Inserisci il primo cliente: potrai poi associargli domini, servizi e pagamenti."
            action={
              <Link href="/clienti/nuovo" className={buttonVariants()}>
                <PlusIcon /> Nuovo cliente
              </Link>
            }
          />
        )
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortHeader label="Cliente" field="name" sort={params.sort} dir={params.dir} searchParams={sp} />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Contatti</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    <SortHeader label="Città" field="city" sort={params.sort} dir={params.dir} searchParams={sp} />
                  </TableHead>
                  <TableHead className="text-right">Servizi attivi</TableHead>
                  <TableHead className="text-right">Credito residuo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/clienti/${c.id}`} className="font-medium hover:underline">
                        {c.displayName}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {CLIENT_TYPE_LABELS[c.type]}
                        {c.status === "ARCHIVED" && <StatusBadge tone="muted">Archiviato</StatusBadge>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      <div>{c.email ?? "—"}</div>
                      <div className="text-muted-foreground">{c.phone}</div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {c.city ? `${c.city}${c.province ? ` (${c.province})` : ""}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.activeServices}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.outstanding === "0.00" ? <span className="text-muted-foreground">—</span> : formatMoney(c.outstanding)}
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
