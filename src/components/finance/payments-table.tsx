import type { Payment } from "@/generated/prisma/client";
import { StatusBadge } from "@/components/common/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCivilDate, formatDateTime, formatMoney } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { VoidPaymentButton } from "./void-payment-button";

/** Movimenti di un credito o debito, stornati inclusi (barrati). */
export function PaymentsTable({ payments, emptyLabel }: { payments: Payment[]; emptyLabel: string }) {
  if (payments.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead className="hidden sm:table-cell">Metodo</TableHead>
          <TableHead className="hidden md:table-cell">Riferimento</TableHead>
          <TableHead className="text-right">Importo</TableHead>
          <TableHead className="w-0" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => {
          const voided = !!p.voidedAt;
          return (
            <TableRow key={p.id} className={voided ? "text-muted-foreground" : undefined}>
              <TableCell>
                <span className={voided ? "line-through" : undefined}>{formatCivilDate(p.paidOn)}</span>
                {voided && (
                  <div className="mt-1 text-xs">
                    <StatusBadge tone="muted">Stornato</StatusBadge> {formatDateTime(p.voidedAt)} · {p.voidReason}
                  </div>
                )}
                {p.notes && <div className="text-xs text-muted-foreground">{p.notes}</div>}
              </TableCell>
              <TableCell className="hidden sm:table-cell">{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
              <TableCell className="hidden md:table-cell">{p.reference ?? "—"}</TableCell>
              <TableCell className={`text-right tabular-nums ${voided ? "line-through" : ""}`}>{formatMoney(p.amount)}</TableCell>
              <TableCell className="text-right">
                {!voided && <VoidPaymentButton paymentId={p.id} description={`${formatMoney(p.amount)} del ${formatCivilDate(p.paidOn)}`} />}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
