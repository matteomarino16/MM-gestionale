"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDownLeftIcon, BellIcon, LayoutDashboardIcon, RefreshCwIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboardIcon },
  { href: "/rinnovi", label: "Rinnovi", icon: RefreshCwIcon },
  { href: "/entrate", label: "Entrate", icon: ArrowDownLeftIcon },
  { href: "/clienti", label: "Clienti", icon: UsersIcon },
  { href: "/notifiche", label: "Avvisi", icon: BellIcon },
];

/** Barra in basso per lo smartphone (come un'app nativa), con area sicura dell'iPhone. */
export function MobileTabBar({ unread }: { unread: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigazione rapida"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                {label}
                {href === "/notifiche" && unread > 0 && (
                  <span className="absolute top-1.5 left-1/2 ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
