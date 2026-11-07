import Link from "next/link";
import { BellIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NotificationBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/notifiche"
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
      aria-label={unread ? `Notifiche: ${unread} non lette` : "Notifiche"}
    >
      <BellIcon />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white tabular-nums">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
