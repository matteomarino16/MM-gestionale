import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, UsersIcon } from "lucide-react";
import { ExpiryBadge } from "@/components/common/expiry-badge";
import { Decimal } from "decimal.js";
import { CountStat, MoneyStat } from "@/components/common/stat-card";
import { SettlementBadge } from "@/components/finance/settlement-badge";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { periodRange } from "@/lib/calculations/period";
import { formatCivilDate, formatMoney } from "@/lib/format";
import { SERVICE_TYPE_LABELS } from "@/lib/labels";
import { addDays, civilToDb } from "@/lib/timezone/civil-date";
import { appToday } from "@/lib/today";
import { financeOverview } from "@/modules/finance/ledger";

export const metadata: Metadata = { title: "Dashboard" };

const WINDOW_DAYS = 30;

export default async function DashboardPage() {
  const user = await requireUser();
  const today = appToday();
  const horizon = civilToDb(addDays(today, WINDOW_DAYS));
  const expiringWhere = { status: "ACTIVE" as const, expiryDate: { not: null, lte: horizon } };

  const month = periodRange("month", today);
  const receivableWhere = { status: { in: ["OPEN" as const, "PARTIAL" as const] }, dueDate: { not: null, lte: horizon } };
  const [clients, activeServices, unread, expiringCount, expiring, overview, dueReceivables] = await Promise.all([
    prisma.client.count({ where: { status: "ACTIVE" } }),
    prisma.service.count({ where: { status: "ACTIVE" } }),
    prisma.notification.count({ where: { userId: user.id, status: "UNREAD" } }),
    prisma.service.count({ where: expiringWhere }),
    prisma.service.findMany({
      where: expiringWhere,
      orderBy: { expiryDate: "asc" },
      take: 10,
      include: { client: { select: { id: true, displayName: true } } },
    }),
    financeOverview(prisma, month, today),
    prisma.receivable.findMany({
      where: receivableWhere,
      orderBy: { dueDate: "asc" },
      take: 8,
      include: { client: { select: { displayName: true } } },
    }),
  ]);

  if (clients === 0) {
    return (
      <>
        <PageHeader title="Dashboard" description={`Bentornato, ${user.name}`} />
        <Card className="mx-auto max-w-xl text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
              <UsersIcon className="size-6 text-muted-foreground" />
            </div>
            <CardTitle>Il gestionale è pronto</CardTitle>
            <CardDescription>
              Non ci sono ancora clienti. Inserisci il primo cliente, poi associagli domini e servizi con le relative scadenze: da quel
              momento la dashboard mostrerà rinnovi, crediti e flussi di cassa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/clienti/nuovo" className={buttonVariants()}>
              <PlusIcon /> Inserisci il primo cliente
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Dashboard" description={`Bentornato, ${user.name}`} />
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyStat label="Incassato questo mese" value={overview.inflow} />
        <MoneyStat
          label="Flusso di cassa del mese"
          value={overview.cashFlow}
          tone="positive"
          hint={`Pagato ai fornitori ${formatMoney(overview.outflow)}`}
        />
        <MoneyStat
          label="Crediti residui"
          value={overview.receivables.residual}
          tone="warning"
          hint={
            overview.receivablesOverdue.residual !== "0.00"
              ? `di cui scaduti ${formatMoney(overview.receivablesOverdue.residual)}`
              : "Nessun credito scaduto"
          }
        />
        <MoneyStat label="Debiti verso fornitori" value={overview.payables.residual} hint={`${overview.payables.count} voci da pagare`} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CountStat label="Clienti attivi" value={clients} />
        <CountStat label="Servizi attivi" value={activeServices} />
        <CountStat label={`Scadenze entro ${WINDOW_DAYS} giorni`} value={expiringCount} hint="Incluse quelle già passate" />
        <CountStat label="Notifiche non lette" value={unread} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Scadenze imminenti</CardTitle>
            <CardDescription>Servizi attivi in scadenza nei prossimi {WINDOW_DAYS} giorni o già scaduti</CardDescription>
          </CardHeader>
          <CardContent>
            {expiring.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nessuna scadenza nei prossimi {WINDOW_DAYS} giorni.</p>
            ) : (
              <>
                <ul className="divide-y text-sm">
                  {expiring.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <Link href={`/servizi/${s.id}`} className="font-medium hover:underline">
                          {s.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {SERVICE_TYPE_LABELS[s.type]} ·{" "}
                          <Link href={`/clienti/${s.client.id}`} className="hover:underline">
                            {s.client.displayName}
                          </Link>
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums text-muted-foreground">{formatMoney(s.clientPrice)}</span>
                        <ExpiryBadge date={s.expiryDate} today={today} />
                      </span>
                    </li>
                  ))}
                </ul>
                {expiringCount > expiring.length && (
                  <Link href={`/servizi?scadenza=${WINDOW_DAYS}`} className="mt-3 inline-block text-sm hover:underline">
                    Vedi tutte le {expiringCount} scadenze
                  </Link>
                )}
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pagamenti da incassare</CardTitle>
            <CardDescription>Crediti in scadenza nei prossimi {WINDOW_DAYS} giorni o già scaduti</CardDescription>
          </CardHeader>
          <CardContent>
            {dueReceivables.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nessun pagamento in scadenza.</p>
            ) : (
              <>
                <ul className="divide-y text-sm">
                  {dueReceivables.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <Link href={`/entrate/${r.id}`} className="font-medium hover:underline">
                          {r.description}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {r.client.displayName} · scadenza {formatCivilDate(r.dueDate)}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums">
                          {formatMoney(new Decimal(r.amountDue.toString()).minus(r.paidAmount.toString()).toFixed(2))}
                        </span>
                        <SettlementBadge status={r.status} dueDate={r.dueDate} today={today} />
                      </span>
                    </li>
                  ))}
                </ul>
                <Link href="/entrate" className="mt-3 inline-block text-sm hover:underline">
                  Vai alle entrate
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
