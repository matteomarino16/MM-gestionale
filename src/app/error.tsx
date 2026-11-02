"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[60svh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Si è verificato un errore</h1>
      <p className="max-w-md text-muted-foreground">
        L&apos;operazione non è andata a buon fine. Riprova; se il problema persiste controlla i log del server
        {error.digest ? ` (codice ${error.digest})` : ""}.
      </p>
      <Button onClick={reset}>Riprova</Button>
    </main>
  );
}
