import type { Metadata } from "next";
import Link from "next/link";
import { BellIcon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge, type Tone } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { MarkAllReadButton, NotificationButtons } from "@/components/notifications/notification-actions";
import { Pagination } from "@/components/tables/pagination";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { formatDateTime, formatMoney } from "@/lib/format";
import { buildQuery, param, parseListParams, pickEnum } from "@/lib/list-params";
import { cn } from "@/lib/utils";
import { openNotificationAction } from "@/modules/notifications/actions";
import { listNotifications, unreadCount } from "@/modules/notifications/service";
import type { NotificationType } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Notifiche" };

const TABS = [
  ["ACTIVE", "In evidenza"],
  ["UNREAD", "Non lette"],
  ["ARCHIVED", "Archiviate"],
  ["ALL", "Tutte"],
] as const;

const TYPE_TONE: Record<NotificationType, Tone> = {
  RENEWAL_UPCOMING: "info",
  RENEWAL_DUE: "warning",
  RENEWAL_OVERDUE: "danger",
  RECEIVABLE_UPCOMING: "info",
  RECEIVABLE_DUE: "warning",
  RECEIVABLE_OVERDUE: "danger",
  SYSTEM: "neutral",
};
const TYPE_LABEL: Record<NotificationType, string> = {
  RENEWAL_UPCOMING: "Rinnovo",
  RENEWAL_DUE: "Rinnovo oggi",
  RENEWAL_OVERDUE: "Rinnovo scaduto",
  RECEIVABLE_UPCOMING: "Pagamento",
  RECEIVABLE_DUE: "Pagamento oggi",
  RECEIVABLE_OVERDUE: "Pagamento scaduto",
  SYSTEM: "Sistema",
};

export default async function NotificationsPage({ searchParams }: PageProps<"/notifiche">) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = pickEnum(param(sp, "vista"), TABS.map(([v]) => v)) ?? "ACTIVE";
  const params = parseListParams(sp, ["date"] as const, "date", "desc");
  const [result, unread] = await Promise.all([listNotifications(prisma, user.id, params, tab), unreadCount(prisma, user.id)]);

  return (
    <>
      <PageHeader
        title="Notifiche"
        description={unread ? `${unread} non lett${unread === 1 ? "a" : "e"}` : "Promemoria di rinnovi e pagamenti"}
        actions={unread > 0 ? <MarkAllReadButton /> : undefined}
      />
      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Filtro notifiche">
        {TABS.map(([v, label]) => (
          <Link
            key={v}
            href={buildQuery({}, { vista: v === "ACTIVE" ? undefined : v }) || "/notifiche"}
            className={cn("rounded-lg px-3 py-1.5 text-sm", tab === v ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}
            aria-current={tab === v ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>

      {result.total === 0 ? (
        <EmptyState
          icon={BellIcon}
          title="Nessuna notifica"
          description="Qui arrivano i promemoria di rinnovi e pagamenti, generati automaticamente secondo le regole configurate."
          action={
            <Link href="/impostazioni/promemoria" className="text-sm hover:underline">
              Configura i promemoria
            </Link>
          }
        />
      ) : (
        <>
          <ul className="divide-y rounded-xl border">
            {result.items.map((n) => (
              <li key={n.id} className={cn("flex gap-3 p-3 sm:p-4", n.status === "UNREAD" && "bg-sky-500/5")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.status === "UNREAD" ? "bg-sky-500" : "bg-transparent")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <form action={openNotificationAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className={cn("text-left hover:underline", n.status === "UNREAD" && "font-semibold")}>
                      {n.title}
                    </button>
                  </form>
                  <p className="text-sm text-muted-foreground">{n.body}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <StatusBadge tone={TYPE_TONE[n.type]}>{TYPE_LABEL[n.type]}</StatusBadge>
                    <span>{formatDateTime(n.scheduledFor)}</span>
                    {n.amount && <span className="tabular-nums">{formatMoney(n.amount)}</span>}
                    {n.status === "ARCHIVED" && <StatusBadge tone="muted">Archiviata</StatusBadge>}
                  </div>
                </div>
                <NotificationButtons id={n.id} status={n.status} />
              </li>
            ))}
          </ul>
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} searchParams={sp} />
        </>
      )}
    </>
  );
}
