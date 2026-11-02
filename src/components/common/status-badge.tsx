import { cn } from "@/lib/utils";

export type Tone = "success" | "warning" | "danger" | "info" | "muted" | "neutral";

const TONES: Record<Tone, string> = {
  success: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/25",
  danger: "bg-red-500/12 text-red-700 dark:text-red-400 border-red-500/20",
  info: "bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/20",
  muted: "bg-muted text-muted-foreground border-transparent",
  neutral: "bg-secondary text-secondary-foreground border-transparent",
};

export function StatusBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
