import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDb } from "./helpers/db";

const db = createTestDb();

beforeEach(() => resetDb(db));
afterAll(() => db.$disconnect());

async function makeClient() {
  return db.client.create({ data: { type: "PERSON", firstName: "Mario", lastName: "Rossi", displayName: "Mario Rossi" } });
}

describe("vincoli del database", () => {
  it("un cliente deve avere almeno nome, cognome o ragione sociale", async () => {
    await expect(db.client.create({ data: { displayName: "x", type: "OTHER" } })).rejects.toThrow();
  });

  it("le email utente sono salvate in minuscolo", async () => {
    await expect(db.user.create({ data: { email: "Admin@X.it", name: "a", passwordHash: "h" } })).rejects.toThrow();
  });

  it("un credito non può essere pagato oltre il dovuto né con totale incoerente", async () => {
    const client = await makeClient();
    await expect(
      db.receivable.create({
        data: { clientId: client.id, description: "x", netAmount: "100", vatAmount: "22", amountDue: "100" },
      }),
    ).rejects.toThrow();
    const r = await db.receivable.create({
      data: { clientId: client.id, description: "x", netAmount: "100", vatRate: "22", vatAmount: "22", amountDue: "122" },
    });
    await expect(
      db.receivable.update({ where: { id: r.id }, data: { paidAmount: "122.01", status: "PARTIAL" } }),
    ).rejects.toThrow();
  });

  it("un pagamento in entrata deve riferirsi a un credito", async () => {
    const client = await makeClient();
    const r = await db.receivable.create({
      data: { clientId: client.id, description: "x", netAmount: "10", amountDue: "10" },
    });
    await expect(db.payment.create({ data: { direction: "OUT", receivableId: r.id, amount: "5", paidOn: new Date("2026-01-01") } })).rejects.toThrow();
    await expect(db.payment.create({ data: { direction: "IN", receivableId: r.id, amount: "0", paidOn: new Date("2026-01-01") } })).rejects.toThrow();
  });

  it("un servizio ha al massimo un ciclo di rinnovo aperto", async () => {
    const client = await makeClient();
    const s = await db.service.create({ data: { clientId: client.id, name: "esempio.it", type: "DOMAIN_RENEWAL" } });
    await db.serviceRenewal.create({ data: { serviceId: s.id, cycleNumber: 1, expiryDate: new Date("2026-12-01") } });
    await expect(
      db.serviceRenewal.create({ data: { serviceId: s.id, cycleNumber: 2, expiryDate: new Date("2027-12-01") } }),
    ).rejects.toThrow();
  });

  it("un rinnovo non può risultare completato senza conferma esplicita di data e nuova scadenza", async () => {
    const client = await makeClient();
    const s = await db.service.create({ data: { clientId: client.id, name: "esempio.it", type: "DOMAIN_RENEWAL" } });
    const r = await db.serviceRenewal.create({ data: { serviceId: s.id, cycleNumber: 1, expiryDate: new Date("2026-12-01") } });
    await expect(db.serviceRenewal.update({ where: { id: r.id }, data: { status: "COMPLETED" } })).rejects.toThrow();
  });

  it("i dati finanziari non si cancellano a cascata eliminando il cliente", async () => {
    const client = await makeClient();
    await db.receivable.create({ data: { clientId: client.id, description: "x", netAmount: "10", amountDue: "10" } });
    await expect(db.client.delete({ where: { id: client.id } })).rejects.toThrow();
  });
});
