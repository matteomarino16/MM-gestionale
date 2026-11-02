import type { DbTx } from "@/lib/db/client";
import { categoryOptions } from "./categories";
import { serviceLinkOptions } from "./ledger";
import { providerOptions } from "@/modules/providers/service";

/** Opzioni per il form costi: fornitori, categorie attive e servizi con il nome del cliente. */
export async function payableFormData(db: DbTx, current?: { providerId?: string | null; categoryId?: string | null }) {
  const [providers, categories, services, clients] = await Promise.all([
    providerOptions(db, current?.providerId),
    categoryOptions(db, current?.categoryId),
    serviceLinkOptions(db),
    db.client.findMany({ select: { id: true, displayName: true } }),
  ]);
  return { providers, categories, services, clientNames: Object.fromEntries(clients.map((c) => [c.id, c.displayName])) };
}
