import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MoneyStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  tone?: "positive" | "negative" | "warning";
}) {
  const negative = value.startsWith("-");
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            "text-xl tabular-nums",
            tone === "negative" || (tone === "positive" && negative) ? "text-red-600 dark:text-red-400" : "",
            tone === "warning" && value !== "0.00" ? "text-amber-700 dark:text-amber-400" : "",
          )}
        >
          {formatMoney(value)}
        </CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  );
}

export function CountStat({ label, value, hint }: { label: string; value: number; hint?: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl tabular-nums">{value.toLocaleString("it-IT")}</CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  );
}
