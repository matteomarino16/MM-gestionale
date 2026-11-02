/** Parametri di lista (ricerca, ordinamento, paginazione) letti dai searchParams. */
export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s === undefined || s === "" ? undefined : s;
}

export const PAGE_SIZES = [20, 50, 100] as const;

export type ListParams<S extends string> = {
  q?: string;
  page: number;
  pageSize: number;
  sort: S;
  dir: "asc" | "desc";
};

export function parseListParams<S extends string>(
  sp: SearchParams,
  sorts: readonly S[],
  defaultSort: S,
  defaultDir: "asc" | "desc" = "asc",
): ListParams<S> {
  const q = param(sp, "q")?.trim().slice(0, 100) || undefined;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(param(sp, "page") ?? "1", 10) || 1));
  const sizeRaw = Number.parseInt(param(sp, "size") ?? "", 10);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(sizeRaw) ? sizeRaw : PAGE_SIZES[0];
  const sortRaw = param(sp, "sort") as S | undefined;
  const sort = sortRaw && sorts.includes(sortRaw) ? sortRaw : defaultSort;
  const dirRaw = param(sp, "dir");
  const dir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : defaultDir;
  return { q, page, pageSize, sort, dir };
}

export function pickEnum<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Costruisce una query string mantenendo i parametri esistenti. */
export function buildQuery(sp: SearchParams, changes: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s) params.set(k, s);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined || v === "") params.delete(k);
    else params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number; pageCount: number };

export function paged<T>(items: T[], total: number, page: number, pageSize: number): Paged<T> {
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}
