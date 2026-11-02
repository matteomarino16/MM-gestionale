import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Accesso" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeRedirectPath(Array.isArray(next) ? next[0] : next);
  if (await getCurrentSession()) redirect(nextPath);

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground">
            MM
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Gestionale MM</h1>
          <p className="text-sm text-muted-foreground">Accedi per continuare</p>
        </div>
        <LoginForm next={nextPath} />
      </div>
    </main>
  );
}
