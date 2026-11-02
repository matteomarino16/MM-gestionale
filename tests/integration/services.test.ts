import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { parseListParams } from "@/lib/list-params";
import { setClientArchived } from "@/modules/clients/service";
import { serviceFinanceSummary } from "@/modules/finance/summary";
import { cancelService, listServices, SERVICE_SORTS, updateService } from "@/modules/services/service";
import { parseCivilDate } from "@/lib/timezone/civil-date";
import { createTestDb, createTestUser, resetDb } from "./helpers/db";
import { makeClient, makeService, serviceInput } from "./helpers/factories";

const db = createTestDb();
let userId: string;
let clientId: string;

beforeEach(async () => {
  await resetDb(db);
  userId = (await createTestUser(db)).id;
  clientId = (await makeClient(db, userId)).id;
});
afterAll(() => db.$disconnect());

const renewals = (serviceId: string) => db.serviceRenewal.findMany({ where: { serviceId }, orderBy: { cycleNumber: "asc" } });

describe("servizi e primo ciclo di rinnovo", () => {
  it("crea un servizio ricorrente con il ciclo di rinnovo aperto", async () => {
    const s = await makeService(db, userId, clientId);
    expect(s.providerCost.toFixed(2)).toBe("8.50");
    expect(s.clientPrice.toFixed(2)).toBe("25.00");
    const [r] = await renewals(s.id);
    expect(r.cycleNumber).toBe(1);
    expect(r.status).toBe("PLANNED");
    expect(r.expiryDate.toISOString()).toBe("2027-03-01T00:00:00.000Z");
    expect(r.expectedProviderCost.toFixed(2)).toBe("8.50");
    expect(r.clientPrice.toFixed(2)).toBe("25.00");
    expect(r.deadlineRevision).toBe(1);
  });

  it("non crea rinnovi per servizi una tantum", async () => {
    const s = await makeService(db, userId, clientId, { frequency: "NONE", expiryDate: "", type: "WEBSITE", name: "Sito" });
    expect(await renewals(s.id)).toHaveLength(0);
  });

  it("supporta frequenze non annuali", async () => {
    const s = await makeService(db, userId, clientId, { frequency: "CUSTOM", customIntervalValue: "45", customIntervalUnit: "DAY", type: "SUPPORT" });
    expect(s.customIntervalValue).toBe(45);
    expect(await renewals(s.id)).toHaveLength(1);
  });

  it("spostare la scadenza aggiorna il ciclo aperto e ne incrementa la revisione", async () => {
    const s = await makeService(db, userId, clientId);
    await updateService(db, userId, s.id, serviceInput(clientId, { expiryDate: "2027-04-15", clientPrice: "30" }));
    const [r] = await renewals(s.id);
    expect(r.expiryDate.toISOString()).toBe("2027-04-15T00:00:00.000Z");
    expect(r.deadlineRevision).toBe(2);
    expect(r.clientPrice.toFixed(2)).toBe("30.00");

    // Modifica senza cambio di scadenza: revisione invariata.
    await updateService(db, userId, s.id, serviceInput(clientId, { expiryDate: "2027-04-15", notes: "nota" }));
    expect((await renewals(s.id))[0].deadlineRevision).toBe(2);
  });

  it("non sovrascrive gli importi di un rinnovo già avviato", async () => {
    const s = await makeService(db, userId, clientId);
    const [r] = await renewals(s.id);
    await db.serviceRenewal.update({ where: { id: r.id }, data: { status: "CLIENT_REQUESTED" } });
    await updateService(db, userId, s.id, serviceInput(clientId, { clientPrice: "99" }));
    expect((await renewals(s.id))[0].clientPrice.toFixed(2)).toBe("25.00");
  });

  it("passando a una tantum annulla il ciclo aperto; tornando ricorrente ne apre uno nuovo", async () => {
    const s = await makeService(db, userId, clientId);
    await updateService(db, userId, s.id, serviceInput(clientId, { frequency: "NONE" }));
    let rs = await renewals(s.id);
    expect(rs.map((r) => r.status)).toEqual(["CANCELLED"]);
    expect(rs[0].cancelledAt).not.toBeNull();

    await updateService(db, userId, s.id, serviceInput(clientId, { frequency: "QUARTERLY", expiryDate: "2027-06-30" }));
    rs = await renewals(s.id);
    expect(rs.map((r) => [r.cycleNumber, r.status])).toEqual([
      [1, "CANCELLED"],
      [2, "PLANNED"],
    ]);
  });

  it("l'annullamento del servizio chiude il ciclo aperto e conserva lo storico", async () => {
    const s = await makeService(db, userId, clientId);
    await cancelService(db, userId, s.id);
    const row = await db.service.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe("CANCELLED");
    expect((await renewals(s.id)).map((r) => r.status)).toEqual(["CANCELLED"]);
    const actions = (await db.auditLog.findMany({ where: { entityId: s.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["service.created", "service.cancelled"]));
  });

  it("modifiche concorrenti non creano due cicli aperti", async () => {
    const s = await makeService(db, userId, clientId, { frequency: "NONE", expiryDate: "" });
    const input = serviceInput(clientId, { frequency: "ANNUAL", expiryDate: "2027-01-10" });
    await Promise.all([updateService(db, userId, s.id, input), updateService(db, userId, s.id, input), updateService(db, userId, s.id, input)]);
    const open = (await renewals(s.id)).filter((r) => r.status === "PLANNED");
    expect(open).toHaveLength(1);
  });

  it("non associa servizi a clienti archiviati e non sposta servizi con crediti", async () => {
    const other = await makeClient(db, userId, { firstName: "Altro" });
    await setClientArchived(db, userId, other.id, true);
    await expect(makeService(db, userId, other.id)).rejects.toThrow(/archiviato/);

    const s = await makeService(db, userId, clientId);
    const third = await makeClient(db, userId, { firstName: "Terzo" });
    await db.receivable.create({ data: { clientId, serviceId: s.id, description: "rinnovo", netAmount: "25", amountDue: "25" } });
    await expect(updateService(db, userId, s.id, serviceInput(third.id))).rejects.toThrow(/cambiarne il cliente/);
  });

  it("elenca per scadenza con filtro sui prossimi giorni e calcola il margine del servizio", async () => {
    const a = await makeService(db, userId, clientId, { name: "a.it", expiryDate: "2026-11-10" });
    await makeService(db, userId, clientId, { name: "b.it", expiryDate: "2027-05-01" });
    await makeService(db, userId, clientId, { name: "c.it", expiryDate: "2026-10-01" });
    const params = parseListParams({}, SERVICE_SORTS, "expiry");
    const soon = await listServices(db, params, { expiringWithinDays: 30, today: parseCivilDate("2026-10-25") });
    expect(soon.items.map((s) => s.name)).toEqual(["c.it", "a.it"]);

    await db.receivable.create({ data: { clientId, serviceId: a.id, description: "r", netAmount: "25.00", amountDue: "30.50", vatRate: "22", vatAmount: "5.50" } });
    await db.payable.create({ data: { serviceId: a.id, description: "p", expectedAmount: "9.00", actualAmount: "8.50", amountDue: "8.50" } });
    const f = await serviceFinanceSummary(db, a.id);
    expect(f.agreedRevenue).toBe("25.00");
    expect(f.costs).toBe("8.50");
    expect(f.margin).toBe("16.50");
    expect(f.outstanding).toBe("30.50");
  });
});
