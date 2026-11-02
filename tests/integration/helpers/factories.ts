import type { Db } from "@/lib/db/client";
import { clientInputSchema, type ClientInput } from "@/modules/clients/schema";
import { createClient } from "@/modules/clients/service";
import { serviceInputSchema } from "@/modules/services/schema";
import { createService } from "@/modules/services/service";

export function clientInput(over: Record<string, unknown> = {}): ClientInput {
  return clientInputSchema.parse({ type: "PERSON", firstName: "Mario", lastName: "Rossi", ...over });
}

export async function makeClient(db: Db, userId: string, over: Record<string, unknown> = {}) {
  return createClient(db, userId, clientInput(over));
}

export function serviceInput(clientId: string, over: Record<string, unknown> = {}) {
  return serviceInputSchema.parse({
    clientId,
    name: "esempio.it",
    domain: "esempio.it",
    type: "DOMAIN_RENEWAL",
    frequency: "ANNUAL",
    expiryDate: "2027-03-01",
    providerCost: "8,50",
    clientPrice: "25,00",
    vatRate: "22",
    ...over,
  });
}

export async function makeService(db: Db, userId: string, clientId: string, over: Record<string, unknown> = {}) {
  return createService(db, userId, serviceInput(clientId, over));
}
