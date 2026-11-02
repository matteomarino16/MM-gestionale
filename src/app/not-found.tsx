import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Pagina non trovata</h1>
      <p className="text-muted-foreground">La risorsa richiesta non esiste o è stata spostata.</p>
      <Link href="/dashboard" className={buttonVariants()}>
        Torna alla dashboard
      </Link>
    </main>
  );
}
