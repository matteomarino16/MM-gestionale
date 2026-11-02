import Link from "next/link";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import { buildQuery, type SearchParams } from "@/lib/list-params";

export function SortHeader({
  label,
  field,
  sort,
  dir,
  searchParams,
  className,
}: {
  label: string;
  field: string;
  sort: string;
  dir: "asc" | "desc";
  searchParams: SearchParams;
  className?: string;
}) {
  const active = sort === field;
  const nextDir = active && dir === "asc" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDownIcon : dir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <Link
      href={buildQuery(searchParams, { sort: field, dir: nextDir, page: undefined }) || "?"}
      className={`inline-flex items-center gap-1 hover:text-foreground ${className ?? ""}`}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
    >
      {label}
      <Icon className={`size-3.5 ${active ? "" : "opacity-40"}`} />
    </Link>
  );
}
