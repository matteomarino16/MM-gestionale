"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Ricerca globale nell'header. Scorciatoia: tasto "/". */
export function GlobalSearch() {
  const ref = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname === "/cerca" ? (params.get("q") ?? "") : "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) && !target.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <form action="/cerca" method="get" role="search" className="relative hidden w-full max-w-md md:block">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={ref}
          key={current}
          name="q"
          defaultValue={current}
          placeholder="Cerca cliente, dominio, servizio…  ( / )"
          className="pl-8"
          aria-label="Ricerca globale"
        />
      </form>
      <Link href="/cerca" className={`${buttonVariants({ variant: "ghost", size: "icon" })} md:hidden`} aria-label="Cerca">
        <SearchIcon />
      </Link>
    </>
  );
}
