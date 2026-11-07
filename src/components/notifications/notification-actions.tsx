"use client";

import { useTransition } from "react";
import { ArchiveIcon, CheckCheckIcon, MailIcon, MailOpenIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markAllReadAction, setNotificationStatusAction } from "@/modules/notifications/actions";

export function NotificationButtons({ id, status }: { id: string; status: "UNREAD" | "READ" | "ARCHIVED" }) {
  const [pending, start] = useTransition();
  const set = (s: string) =>
    start(async () => {
      const res = await setNotificationStatusAction(id, s);
      if (!res.ok) toast.error(res.error);
    });
  return (
    <div className="flex gap-1">
      {status === "UNREAD" ? (
        <Button variant="ghost" size="icon-sm" onClick={() => set("READ")} disabled={pending} aria-label="Segna come letta">
          <MailOpenIcon />
        </Button>
      ) : (
        <Button variant="ghost" size="icon-sm" onClick={() => set("UNREAD")} disabled={pending} aria-label="Segna come non letta">
          <MailIcon />
        </Button>
      )}
      {status !== "ARCHIVED" && (
        <Button variant="ghost" size="icon-sm" onClick={() => set("ARCHIVED")} disabled={pending} aria-label="Archivia">
          <ArchiveIcon />
        </Button>
      )}
    </div>
  );
}

export function MarkAllReadButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await markAllReadAction();
          if (res.ok && res.message) toast.success(res.message);
        })
      }
    >
      <CheckCheckIcon /> Segna tutte come lette
    </Button>
  );
}
