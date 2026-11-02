import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Barra di ricerca e filtri come form GET: i filtri finiscono nell'URL,
 * quindi sono condivisibili e funzionano anche senza JavaScript.
 */
export function ListToolbar({
  q,
  placeholder,
  resetHref,
  hidden,
  children,
}: {
  q?: string;
  placeholder: string;
  resetHref: string;
  hidden?: Record<string, string | undefined>;
  children?: React.ReactNode;
}) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-2" role="search">
      {Object.entries(hidden ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <div className="relative min-w-56 flex-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder={placeholder} className="pl-8" aria-label="Cerca" />
      </div>
      {children}
      <Button type="submit" variant="secondary">
        Filtra
      </Button>
      <Link href={resetHref} className={buttonVariants({ variant: "ghost" })}>
        Azzera
      </Link>
    </form>
  );
}
