import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

export function SubmitBar({ pending, label, cancelHref }: { pending: boolean; label: string; cancelHref: string }) {
  return (
    <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
      <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
        Annulla
      </Link>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        {label}
      </Button>
    </div>
  );
}
