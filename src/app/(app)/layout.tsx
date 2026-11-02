import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/dal";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>;
}
