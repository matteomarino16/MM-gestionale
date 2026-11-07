import type { Metadata } from "next";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { NewRuleForm, ReminderTimeForm, RuleToggles } from "@/components/settings/reminder-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Promemoria" };

function describeRule(offsetDays: number, repeat: number | null, max: number | null) {
  const base = offsetDays < 0 ? `${-offsetDays} giorni prima` : offsetDays === 0 ? "Il giorno della scadenza" : `${offsetDays} giorni dopo`;
  if (!repeat) return base;
  return `${base}, poi ogni ${repeat} giorni${max ? ` (max ${max} volte)` : " finché resta aperto"}`;
}

export default async function ReminderSettingsPage() {
  const user = await requireUser();
  const [pref, rules, heartbeats, pending, failed] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId: user.id } }),
    prisma.reminderRule.findMany({ orderBy: [{ target: "asc" }, { offsetDays: "asc" }] }),
    prisma.workerHeartbeat.findMany({ orderBy: { lastSeen: "desc" }, take: 3 }),
    prisma.reminderEvent.count({ where: { status: "PENDING", channel: "DASHBOARD" } }),
    prisma.reminderEvent.count({ where: { status: "FAILED" } }),
  ]);

  const groups = [
    ["RENEWAL", "Rinnovi dei servizi"],
    ["RECEIVABLE", "Crediti da incassare"],
  ] as const;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Promemoria" description="Quando e come ricevere gli avvisi su rinnovi e pagamenti" />

      <Card>
        <CardHeader>
          <CardTitle>Orario</CardTitle>
          <CardDescription>Gli avvisi di ogni giorno vengono emessi a quest&apos;ora, tenendo conto di ora legale e solare.</CardDescription>
        </CardHeader>
        <CardContent>
          <ReminderTimeForm value={pref?.reminderTime ?? "09:00"} />
        </CardContent>
      </Card>

      {groups.map(([target, title]) => (
        <Card key={target}>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {rules
                .filter((r) => r.target === target)
                .map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <div className={r.enabled ? "font-medium" : "font-medium text-muted-foreground line-through"}>{r.label}</div>
                      <div className="text-xs text-muted-foreground">{describeRule(r.offsetDays, r.repeatEveryDays, r.maxRepeats)}</div>
                    </div>
                    <RuleToggles id={r.id} enabled={r.enabled} push={r.channels.includes("PUSH")} />
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Nuova regola</CardTitle>
          <CardDescription>Le regole esistenti non si modificano (servono a evitare avvisi duplicati): puoi disattivarle e crearne di nuove.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewRuleForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stato del servizio promemoria</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {heartbeats.length === 0 ? (
            <p className="text-muted-foreground">Nessun ciclo eseguito finora.</p>
          ) : (
            <ul className="space-y-1">
              {heartbeats.map((h) => (
                <li key={h.workerId} className="flex flex-wrap justify-between gap-2">
                  <span className="font-mono text-xs">{h.workerId}</span>
                  <span className="text-muted-foreground">ultimo ciclo {formatDateTime(h.lastSeen)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <StatusBadge tone="info">{pending} avvisi in programma</StatusBadge>
            {failed > 0 && <StatusBadge tone="danger">{failed} non riusciti</StatusBadge>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
