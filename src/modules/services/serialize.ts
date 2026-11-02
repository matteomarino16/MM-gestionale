import type { Service } from "@/generated/prisma/client";
import type { ServiceFormValues } from "@/components/services/service-form";

/** I Decimal di Prisma non sono serializzabili verso i Client Component: si passano come stringhe. */
export function serviceToFormValues(s: Service): ServiceFormValues {
  const { providerCost, clientPrice, vatRate, createdAt: _c, updatedAt: _u, ...rest } = s;
  void _c;
  void _u;
  return { ...rest, providerCost: providerCost.toFixed(2), clientPrice: clientPrice.toFixed(2), vatRate: vatRate.toString() };
}
