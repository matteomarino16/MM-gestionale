import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { buildQuery, type SearchParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  searchParams,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  searchParams: SearchParams;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = (p: number, disabled: boolean, children: React.ReactNode, label: string) =>
    disabled ? (
      <span aria-disabled className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
        {children}
      </span>
    ) : (
      <Link href={buildQuery(searchParams, { page: p === 1 ? undefined : p }) || "?"} aria-label={label} className={buttonVariants({ variant: "outline", size: "sm" })}>
        {children}
      </Link>
    );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-sm text-muted-foreground">
      <span>
        {total === 0 ? "Nessun risultato" : `${from.toLocaleString("it-IT")}–${to.toLocaleString("it-IT")} di ${total.toLocaleString("it-IT")}`}
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          {link(page - 1, page <= 1, <ChevronLeftIcon />, "Pagina precedente")}
          <span>
            Pagina {page} di {pageCount}
          </span>
          {link(page + 1, page >= pageCount, <ChevronRightIcon />, "Pagina successiva")}
        </div>
      )}
    </div>
  );
}
