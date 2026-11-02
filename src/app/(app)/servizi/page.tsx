import type { Metadata } from "next";
import Link from "next/link";
import { LayersIcon, PlusIcon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { ExpiryBadge } from "@/components/common/expiry-badge";
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
import { FREQUENCY_LABELS, options, SERVICE_STATUS_LABELS, SERVICE_STATUS_TONES, SERVICE_TYPE_LABELS } from "@/lib/labels";
import { param, parseListParams, pickEnum } from "@/lib/list-params";
import { appToday } from "@/lib/today";
import { uuid } from "@/lib/validation/common";
import { listServices, SERVICE_SORTS } from "@/modules/services/service";

export const metadata: Metadata = { title: "Servizi" };

const STATUSES = ["ACTIVE", "SUSPENDED", "EXPIRED", "CANCELLED", "ALL"] as const;
const TYPES = Object.keys(SERVICE_TYPE_LABELS) as (keyof typeof SERVICE_TYPE_LABELS)[];
const WINDOWS = ["7", "30", "60", "90"] as const;

export default async function ServicesPage({ searchParams }: PageProps<"/servizi">) {
  await requireUser();
  const sp = await searchParams;
  const params = parseListParams(sp, SERVICE_SORTS, "expiry");
  const status = pickEnum(param(sp, "stato"), STATUSES) ?? "ACTIVE";
  const type = pickEnum(param(sp, "tipo"), TYPES);
  const window = pickEnum(param(sp, "scadenza"), WINDOWS);
  const clientParam = uuid.safeParse(param(sp, "cliente"));
  const clientId = clientParam.success ? clientParam.data : undefined;
  const today = appToday();

  const [result, client] = await Promise.all([
    listServices(prisma, params, {
      status,
      type,
      clientId,
      expiringWithinDays: window ? Number(window) : undefined,
      today,
    }),
    clientId ? prisma.client.findUnique({ where: { id: clientId }, select: { displayName: true } }) : null,
  ]);
  const filtered = !!(params.q || type || window || clientId || status !== "ACTIVE");
  const newHref = clientId ? `/servizi/nuovo?cliente=${clientId}` : "/servizi/nuovo";

  return (
    <>
      <PageHeader
        title="Servizi"
        description={client ? `Servizi di ${client.displayName}` : "Domini, hosting, licenze, manutenzioni e altri servizi"}
        actions={
          <Link href={newHref} className={buttonVariants()}>
            <PlusIcon /> Nuovo servizio
          </Link>
        }
      />
      <ListToolbar q={params.q} placeholder="Cerca per nome, dominio, cliente, fornitore…" resetHref="/servizi" hidden={{ cliente: clientId }}>
        <NativeSelect name="stato" defaultValue={status} aria-label="Stato">
          {options(SERVICE_STATUS_LABELS).map((o) => (
            <NativeSelectOption key={o.value} value={o.value}>
              {o.label}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value="ALL">Tutti gli stati</NativeSelectOption>
        </NativeSelect>
        <NativeSelect name="tipo" defaultValue={type ?? ""} aria-label="Tipologia">
          <NativeSelectOption value="">Tutte le tipologie</NativeSelectOption>
          {options(SERVICE_TYPE_LABELS).map((o) => (
            <NativeSelectOption key={o.value} value={o.value}>
              {o.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect name="scadenza" defaultValue={window ?? ""} aria-label="Scadenza">
          <NativeSelectOption value="">Qualsiasi scadenza</NativeSelectOption>
          {WINDOWS.map((w) => (
            <NativeSelectOption key={w} value={w}>
              Entro {w} giorni
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </ListToolbar>

      {result.total === 0 ? (
        filtered ? (
          <EmptyState icon={LayersIcon} title="Nessun servizio corrisponde ai filtri" />
        ) : (
          <EmptyState
            icon={LayersIcon}
            title="Nessun servizio"
            description="Aggiungi domini, hosting e altri servizi con le relative scadenze."
            action={
              <Link href={newHref} className={buttonVariants()}>
                <PlusIcon /> Nuovo servizio
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
                    <SortHeader label="Servizio" field="name" sort={params.sort} dir={params.dir} searchParams={sp} />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    <SortHeader label="Cliente" field="client" sort={params.sort} dir={params.dir} searchParams={sp} />
                  </TableHead>
                  <TableHead>
                    <SortHeader label="Scadenza" field="expiry" sort={params.sort} dir={params.dir} searchParams={sp} />
                  </TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    <SortHeader label="Prezzo" field="price" sort={params.sort} dir={params.dir} searchParams={sp} className="justify-end" />
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link href={`/servizi/${s.id}`} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {SERVICE_TYPE_LABELS[s.type]}
                        {s.provider && ` · ${s.provider.name}`}
                      </div>
                      <div className="text-xs text-muted-foreground md:hidden">{s.client.displayName}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Link href={`/clienti/${s.client.id}`} className="hover:underline">
                        {s.client.displayName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <ExpiryBadge date={s.expiryDate} today={today} muted={s.status !== "ACTIVE"} />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {formatMoney(s.clientPrice)}
                      <div className="text-xs text-muted-foreground">{FREQUENCY_LABELS[s.frequency]}</div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <StatusBadge tone={SERVICE_STATUS_TONES[s.status]}>{SERVICE_STATUS_LABELS[s.status]}</StatusBadge>
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
