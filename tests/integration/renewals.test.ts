import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { parseCivilDate } from "@/lib/timezone/civil-date";
import { parseListParams } from "@/lib/list-params";
import { registerPayment } from "@/modules/finance/payments";
import { createReceivable } from "@/modules/finance/receivables";
import { paymentInputSchema, receivableInputSchema } from "@/modules/finance/schema";
import { completeRenewalSchema } from "@/modules/renewals/schema";
import { completeRenewal, listRenewals, RENEWAL_SORTS, setRenewalStatus, skipRenewal } from "@/modules/renewals/service";
import { createTestDb, createTestUser, resetDb } from "./helpers/db";
import { makeClient, makeService } from "./helpers/factories";

const db = createTestDb();
const TODAY = parseCivilDate("2026-11-10");
let userId: string;
let clientId: string;

beforeEach(async () => {
  await resetDb(db);
  userId = (await createTestUser(db)).id;
  clientId = (await makeClient(db, userId)).id;
});
afterAll(() => db.$disconnect());

const openCycle = (serviceId: string) => db.serviceRenewal.findFirstOrThrow({ where: { serviceId, status: { notIn: ["COMPLETED", "CANCELLED"] } } });
const complete = (id: string, over: Record<string, unknown> = {}) =>
  completeRenewalSchema.parse({ id, renewedAt: "2026-11-08", newExpiryDate: "2027-12-15", actualProviderCost: "9,00", ...over });

describe("workflow dei rinnovi", () => {
  it("il pagamento del cliente non completa il rinnovo", async () => {
    const s = await makeService(db, userId, clientId, { expiryDate: "2026-12-15" });
    const r = await openCycle(s.id);
    const rec = await createReceivable(db, userId, receivableInputSchema.parse({ clientId, renewalId: r.id, description: "Rinnovo", netAmount: "25", vatRate: "0", withholdingRate: "0" }));
    await registerPayment(db, userId, "IN", paymentInputSchema.parse({ targetId: rec.id, amount: "25", paidOn: "2026-11-05", method: "CARD" }), TODAY);
    await setRenewalStatus(db, userId, r.id, "CLIENT_PAID");

    const after = await db.serviceRenewal.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.status).toBe("CLIENT_PAID");
    expect(after.renewedAt).toBeNull();
    const list = await listRenewals(db, parseListParams({}, RENEWAL_SORTS, "expiry"), { view: "open", today: TODAY });
    expect(list.items[0].client).toEqual({ state: "PAID", due: "25.00", paid: "25.00" });
    expect(list.items[0].provider.state).toBe("NONE");
  });

  it("il completamento conserva il ciclo e crea il successivo", async () => {
    const s = await makeService(db, userId, clientId, { expiryDate: "2026-12-15" });
    const r = await openCycle(s.id);
    const res = await completeRenewal(db, userId, complete(r.id), TODAY);

    const closed = await db.serviceRenewal.findUniqueOrThrow({ where: { id: r.id } });
    expect(closed.status).toBe("COMPLETED");
    expect(closed.expiryDate.toISOString()).toBe("2026-12-15T00:00:00.000Z"); // storico invariato
    expect(closed.newExpiryDate?.toISOString()).toBe("2027-12-15T00:00:00.000Z");
    expect(closed.actualProviderCost?.toFixed(2)).toBe("9.00");

    const next = await openCycle(s.id);
    expect(next.id).toBe(res.nextRenewalId);
    expect(next.cycleNumber).toBe(2);
    expect(next.expiryDate.toISOString()).toBe("2027-12-15T00:00:00.000Z");
    expect(next.status).toBe("PLANNED");
    const service = await db.service.findUniqueOrThrow({ where: { id: s.id } });
    expect(service.expiryDate?.toISOString()).toBe("2027-12-15T00:00:00.000Z");

    // Lo storico non si modifica più.
    await expect(setRenewalStatus(db, userId, r.id, "PLANNED")).rejects.toThrow(/già chiuso/);
    await expect(completeRenewal(db, userId, complete(r.id), TODAY)).rejects.toThrow(/già chiuso/);
  });

  it("valida date del rinnovo e nuova scadenza", async () => {
    const s = await makeService(db, userId, clientId, { expiryDate: "2026-12-15" });
    const r = await openCycle(s.id);
    await expect(completeRenewal(db, userId, complete(r.id, { renewedAt: "2026-11-11" }), TODAY)).rejects.toThrow(/futura/);
    await expect(completeRenewal(db, userId, complete(r.id, { newExpiryDate: "2026-12-15" }), TODAY)).rejects.toThrow(/successiva/);
  });

  it("completamenti concorrenti dello stesso ciclo: uno solo va a buon fine", async () => {
    const s = await makeService(db, userId, clientId, { expiryDate: "2026-12-15" });
    const r = await openCycle(s.id);
    const results = await Promise.allSettled([1, 2, 3].map(() => completeRenewal(db, userId, complete(r.id), TODAY)));
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.serviceRenewal.count({ where: { serviceId: s.id } })).toBe(2);
  });

  it("'non rinnovare' annulla il ciclo e segna il servizio come scaduto", async () => {
    const s = await makeService(db, userId, clientId, { expiryDate: "2026-12-15" });
    const r = await openCycle(s.id);
    await skipRenewal(db, userId, r.id, "Il cliente ha cambiato fornitore");
    const closed = await db.serviceRenewal.findUniqueOrThrow({ where: { id: r.id } });
    expect(closed.status).toBe("CANCELLED");
    expect(closed.notes).toContain("cambiato fornitore");
    expect((await db.service.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("EXPIRED");

    // Il ciclo annullato resta chiuso; per rinnovare in ritardo si riattiva il servizio, che apre un nuovo ciclo.
    await expect(completeRenewal(db, userId, complete(r.id), TODAY)).rejects.toThrow(/già chiuso/);
  });

  it("i servizi una tantum non aprono un nuovo ciclo dopo il completamento", async () => {
    const s = await makeService(db, userId, clientId, { expiryDate: "2026-12-15" });
    const r = await openCycle(s.id);
    await db.service.update({ where: { id: s.id }, data: { frequency: "NONE" } });
    const res = await completeRenewal(db, userId, complete(r.id), TODAY);
    expect(res.nextRenewalId).toBeNull();
  });
});
