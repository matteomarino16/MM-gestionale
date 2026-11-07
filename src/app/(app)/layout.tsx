import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/client";
import { unreadCount } from "@/modules/notifications/service";
import { scheduleOpportunisticTick } from "@/modules/reminders/opportunistic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  scheduleOpportunisticTick();
  const unread = await unreadCount(prisma, user.id);
  return (
    <AppShell user={{ name: user.name, email: user.email }} unread={unread}>
      {children}
    </AppShell>
  );
}
