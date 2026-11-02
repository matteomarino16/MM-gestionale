import type { Payable, Receivable } from "@/generated/prisma/client";
import type { PayableFormValues } from "@/components/finance/payable-form";
import type { ReceivableFormValues } from "@/components/finance/receivable-form";
import type { DbTx } from "@/lib/db/client";
import { formatCivilDate, formatNumber } from "@/lib/format";
import { civilFromDb } from "@/lib/timezone/civil-date";

const num = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? "" : formatNumber(v.toString()));
const date = (d: Date | null) => (d ? civilFromDb(d) : "");

export function receivableToFormValues(r: Receivable): ReceivableFormValues {
  return {
    id: r.id,
    clientId: r.clientId,
    serviceId: r.serviceId ?? "",
    renewalId: r.renewalId ?? "",
    description: r.description,
    netAmount: num(r.netAmount),
    vatRate: num(r.vatRate),
    withholdingRate: num(r.withholdingRate),
    dueDate: date(r.dueDate),
    notes: r.notes ?? "",
  };
}

export function payableToFormValues(p: Payable): PayableFormValues {
  return {
    id: p.id,
    providerId: p.providerId ?? "",
    categoryId: p.categoryId ?? "",
    serviceId: p.serviceId ?? "",
    renewalId: p.renewalId ?? "",
    description: p.description,
    expectedAmount: num(p.expectedAmount),
    actualAmount: num(p.actualAmount),
    vatRate: num(p.vatRate),
    dueDate: date(p.dueDate),
    notes: p.notes ?? "",
  };
}

type Prefill = { clientId?: string; providerId?: string; serviceId?: string; renewalId?: string };

/** Valori iniziali di un nuovo credito, precompilati da servizio/rinnovo quando indicati. */
export async function receivableDefaults(db: DbTx, pre: Prefill): Promise<ReceivableFormValues> {
  const values: ReceivableFormValues = {
    clientId: pre.clientId ?? "",
    serviceId: "",
    renewalId: "",
    description: "",
    netAmount: "",
    vatRate: "22",
    withholdingRate: "0",
    dueDate: "",
    notes: "",
  };
  const renewal = pre.renewalId ? await db.serviceRenewal.findUnique({ where: { id: pre.renewalId } }) : null;
  const serviceId = renewal?.serviceId ?? pre.serviceId;
  const service = serviceId ? await db.service.findUnique({ where: { id: serviceId } }) : null;
  if (service) {
    values.clientId = service.clientId;
    values.serviceId = service.id;
    values.vatRate = num(service.vatRate);
    values.netAmount = num(renewal?.clientPrice ?? service.clientPrice);
    values.description = renewal ? `Rinnovo ${service.name} (scadenza ${formatCivilDate(renewal.expiryDate)})` : service.name;
    if (renewal) {
      values.renewalId = renewal.id;
      values.dueDate = civilFromDb(renewal.expiryDate);
    }
  }
  return values;
}

/** Valori iniziali di un nuovo costo, precompilati da servizio/rinnovo/fornitore. */
export async function payableDefaults(db: DbTx, pre: Prefill): Promise<PayableFormValues> {
  const values: PayableFormValues = {
    providerId: pre.providerId ?? "",
    categoryId: "",
    serviceId: "",
    renewalId: "",
    description: "",
    expectedAmount: "",
    actualAmount: "",
    vatRate: "22",
    dueDate: "",
    notes: "",
  };
  const renewal = pre.renewalId ? await db.serviceRenewal.findUnique({ where: { id: pre.renewalId } }) : null;
  const serviceId = renewal?.serviceId ?? pre.serviceId;
  const service = serviceId ? await db.service.findUnique({ where: { id: serviceId } }) : null;
  if (service) {
    values.serviceId = service.id;
    values.providerId = service.providerId ?? values.providerId;
    values.expectedAmount = num(renewal?.expectedProviderCost ?? service.providerCost);
    values.description = renewal ? `Rinnovo ${service.name} presso fornitore (scadenza ${formatCivilDate(renewal.expiryDate)})` : `Costo ${service.name}`;
    if (renewal) {
      values.renewalId = renewal.id;
      values.dueDate = civilFromDb(renewal.expiryDate);
    }
  }
  return values;
}
