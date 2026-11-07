/** Elenco etichetta/valore. Le voci con `false` vengono omesse; `null` mostra "—". */
export function DetailList({ items }: { items: ([string, React.ReactNode] | false)[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]">
      {items.filter((item): item is [string, React.ReactNode] => item !== false).map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
