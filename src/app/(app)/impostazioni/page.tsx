import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { formatDateTime } from "@/lib/format";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/modules/auth/actions";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Impostazioni" };

function describeAgent(ua: string | null): string {
  if (!ua) return "Dispositivo sconosciuto";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} su ${os}` : browser;
}

export default async function SettingsPage() {
  const session = await requireSession();
  const [user, sessions] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { name: true, email: true, createdAt: true, lastLoginAt: true },
    }),
    prisma.session.findMany({
      where: { userId: session.user.id, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Impostazioni"
        description="Account, sicurezza e sessioni attive"
        actions={
          <Link href="/impostazioni/promemoria" className={buttonVariants({ variant: "outline" })}>
            Promemoria
          </Link>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Nome</dt>
              <dd>{user.name}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-all">{user.email}</dd>
              <dt className="text-muted-foreground">Creato il</dt>
              <dd>{formatDateTime(user.createdAt)}</dd>
              <dt className="text-muted-foreground">Ultimo accesso</dt>
              <dd>{formatDateTime(user.lastLoginAt)}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cambia password</CardTitle>
            <CardDescription>Le altre sessioni verranno chiuse automaticamente.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Sessioni attive</CardTitle>
            <CardDescription>Dispositivi su cui hai effettuato l&apos;accesso.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y rounded-lg border">
              {sessions.map((s) => {
                const current = s.id === session.sessionId;
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                    <div>
                      <div className="flex items-center gap-2 font-medium">
                        {describeAgent(s.userAgent)}
                        {current && <Badge variant="secondary">Questa sessione</Badge>}
                      </div>
                      <div className="text-muted-foreground">
                        Ultima attività {formatDateTime(s.lastSeenAt)} · scade {formatDateTime(s.expiresAt)}
                      </div>
                    </div>
                    <form action={revokeSessionAction}>
                      <input type="hidden" name="sessionId" value={s.id} />
                      <Button type="submit" variant="outline" size="sm">
                        {current ? "Esci" : "Revoca"}
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
            {sessions.length > 1 && (
              <form action={revokeOtherSessionsAction}>
                <Button type="submit" variant="destructive" size="sm">
                  Chiudi tutte le altre sessioni
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
