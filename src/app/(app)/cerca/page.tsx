import type { Metadata } from "next";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { ExpiryBadge } from "@/components/common/expiry-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { formatMoney } from "@/lib/format";
import { CLIENT_TYPE_LABELS, SERVICE_STATUS_LABELS, SERVICE_STATUS_TONES, SERVICE_TYPE_LABELS, SETTLEMENT_STATUS_LABELS } from "@/lib/labels";
import { param } from "@/lib/list-params";
import { appToday } from "@/lib/today";
import { globalSearch, SEARCH_MIN_LENGTH } from "@/modules/search/service";

export const metadata: Metadata = { title: "Ricerca" };

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title} <span className="text-muted-foreground">({count})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">{children}</ul>
      </CardContent>
    </Card>
  );
}

export default async function SearchPage({ searchParams }: PageProps<"/cerca">) {
  await requireUser();
  const q = param(await searchParams, "q") ?? "";
  const results = await globalSearch(prisma, q);
  const today = appToday();
  const total = results
    ? results.clients.length + results.services.length + results.providers.length + results.receivables.length + results.payables.length
    : 0;

  return (
    <>
      <PageHeader title="Ricerca" description="Clienti, domini, servizi, fornitori e movimenti" />
      <form method="get" role="search" className="mb-6 flex max-w-2xl gap-2">
        <Input name="q" defaultValue={q} placeholder="Cerca…" autoFocus aria-label="Testo da cercare" />
        <Button type="submit">
          <SearchIcon /> Cerca
        </Button>
      </form>
      {!results ? (
        q && <p className="text-sm text-muted-foreground">Inserisci almeno {SEARCH_MIN_LENGTH} caratteri.</p>
      ) : total === 0 ? (
        <EmptyState icon={SearchIcon} title={`Nessun risultato per “${results.q}”`} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Clienti" count={results.clients.length}>
            {results.clients.map((c) => (
              <li key={c.id} className="flex justify-between gap-2 py-2">
                <Link href={`/clienti/${c.id}`} className="font-medium hover:underline">
                  {c.displayName}
                </Link>
                <span className="text-muted-foreground">
                  {c.status === "ARCHIVED" ? "Archiviato" : CLIENT_TYPE_LABELS[c.type]}
                  {c.city && ` · ${c.city}`}
                </span>
              </li>
            ))}
          </Section>
          <Section title="Servizi e domini" count={results.services.length}>
            {results.services.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <Link href={`/servizi/${s.id}`} className="font-medium hover:underline">
                    {s.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {SERVICE_TYPE_LABELS[s.type]} · {s.client.displayName}
                    {s.domain && s.domain !== s.name && ` · ${s.domain}`}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <ExpiryBadge date={s.expiryDate} today={today} muted={s.status !== "ACTIVE"} />
                  {s.status !== "ACTIVE" && <StatusBadge tone={SERVICE_STATUS_TONES[s.status]}>{SERVICE_STATUS_LABELS[s.status]}</StatusBadge>}
                </span>
              </li>
            ))}
          </Section>
          <Section title="Fornitori" count={results.providers.length}>
            {results.providers.map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <Link href={`/fornitori/${p.id}`} className="font-medium hover:underline">
                  {p.name}
                </Link>
                {!p.active && <span className="text-muted-foreground">Disattivato</span>}
              </li>
            ))}
          </Section>
          <Section title="Crediti" count={results.receivables.length}>
            {results.receivables.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <Link href={`/entrate/${r.id}`} className="font-medium hover:underline">
                    {r.description}
                  </Link>
                  <Link href={`/clienti/${r.client.id}`} className="block text-xs text-muted-foreground hover:underline">
                    {r.client.displayName}
                  </Link>
                </span>
                <span className="tabular-nums">
                  {formatMoney(r.amountDue)} · {SETTLEMENT_STATUS_LABELS[r.status]}
                </span>
              </li>
            ))}
          </Section>
          <Section title="Costi" count={results.payables.length}>
            {results.payables.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <Link href={`/uscite/${p.id}`} className="font-medium hover:underline">
                    {p.description}
                  </Link>
                  {p.provider && (
                    <Link href={`/fornitori/${p.provider.id}`} className="block text-xs text-muted-foreground hover:underline">
                      {p.provider.name}
                    </Link>
                  )}
                </span>
                <span className="tabular-nums">
                  {formatMoney(p.amountDue)} · {SETTLEMENT_STATUS_LABELS[p.status]}
                </span>
              </li>
            ))}
          </Section>
        </div>
      )}
    </>
  );
}
