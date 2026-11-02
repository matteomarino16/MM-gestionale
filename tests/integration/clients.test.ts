import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { parseListParams } from "@/lib/list-params";
import { setClientArchived, updateClient, listClients, getClientDetail, CLIENT_SORTS } from "@/modules/clients/service";
import { clientFinanceSummary } from "@/modules/finance/summary";
import { globalSearch } from "@/modules/search/service";
import { parseCivilDate } from "@/lib/timezone/civil-date";
import { createTestDb, createTestUser, resetDb } from "./helpers/db";
import { clientInput, makeClient, makeService } from "./helpers/factories";

const db = createTestDb();
let userId: string;
const list = (q?: string, extra: Record<string, string> = {}) => parseListParams({ q, ...extra }, CLIENT_SORTS, "name");

beforeEach(async () => {
  await resetDb(db);
  userId = (await createTestUser(db)).id;
});
afterAll(() => db.$disconnect());

describe("clienti", () => {
  it("crea, modifica, archivia e ripristina un cliente con storico", async () => {
    const c = await makeClient(db, userId, { email: "mario@esempio.it" });
    expect(c.displayName).toBe("Mario Rossi");
    expect(c.status).toBe("ACTIVE");

    const updated = await updateClient(db, userId, c.id, clientInput({ type: "COMPANY", companyName: "Rossi Srl", vatNumber: "01234567890" }));
    expect(updated.displayName).toBe("Rossi Srl");
    expect(updated.firstName).toBe("Mario");

    await setClientArchived(db, userId, c.id, true);
    let row = await db.client.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.status).toBe("ARCHIVED");
    expect(row.archivedAt).not.toBeNull();
    expect((await listClients(db, list())).total).toBe(0);
    expect((await listClients(db, list(), { status: "ARCHIVED" })).total).toBe(1);

    await setClientArchived(db, userId, c.id, false);
    row = await db.client.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.status).toBe("ACTIVE");
    expect(row.archivedAt).toBeNull();

    const actions = (await db.auditLog.findMany({ where: { entityId: c.id }, orderBy: { id: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["client.created", "client.updated", "client.archived", "client.restored"]);
  });

  it("cerca per nome, email, P.IVA, città e dominio dei servizi", async () => {
    const a = await makeClient(db, userId, { firstName: "Anna", lastName: "Bianchi", city: "Torino", email: "anna@studio.it" });
    await makeClient(db, userId, { type: "COMPANY", companyName: "Verdi Spa", vatNumber: "09876543210" });
    await makeService(db, userId, a.id, { name: "Sito vetrina", domain: "bianchi-arredi.it" });

    const names = async (q: string) => (await listClients(db, list(q))).items.map((c) => c.displayName);
    expect(await names("bianch")).toEqual(["Anna Bianchi"]);
    expect(await names("STUDIO.IT")).toEqual(["Anna Bianchi"]);
    expect(await names("0987654")).toEqual(["Verdi Spa"]);
    expect(await names("torino")).toEqual(["Anna Bianchi"]);
    expect(await names("arredi")).toEqual(["Anna Bianchi"]);
  });

  it("ordina e pagina i risultati", async () => {
    for (const n of ["Zeta", "Alfa", "Mike", "Beta"]) await makeClient(db, userId, { firstName: n, lastName: "X" });
    const page1 = await listClients(db, parseListParams({ size: "20" }, CLIENT_SORTS, "name"));
    expect(page1.items.map((c) => c.displayName)).toEqual(["Alfa X", "Beta X", "Mike X", "Zeta X"]);
    const desc = await listClients(db, parseListParams({ dir: "desc" }, CLIENT_SORTS, "name"));
    expect(desc.items[0].displayName).toBe("Zeta X");
    const p2 = await listClients(db, { ...list(), pageSize: 2, page: 2 });
    expect(p2.items.map((c) => c.displayName)).toEqual(["Mike X", "Zeta X"]);
    expect(p2.pageCount).toBe(2);
  });

  it("calcola crediti residui e margine con precisione decimale", async () => {
    const c = await makeClient(db, userId);
    // 0,10 + 0,20 deve dare esattamente 0,30.
    for (const amount of ["0.10", "0.20"]) {
      await db.receivable.create({ data: { clientId: c.id, description: "x", netAmount: amount, amountDue: amount, dueDate: new Date("2020-01-01") } });
    }
    const s = await makeService(db, userId, c.id);
    await db.payable.create({ data: { serviceId: s.id, description: "costo", expectedAmount: "0.05", amountDue: "0.05" } });

    const summary = await clientFinanceSummary(db, c.id, parseCivilDate("2026-01-01"));
    expect(summary.agreedRevenue).toBe("0.30");
    expect(summary.outstanding).toBe("0.30");
    expect(summary.overdue).toBe("0.30");
    expect(summary.costs).toBe("0.05");
    expect(summary.margin).toBe("0.25");

    const listed = await listClients(db, list());
    expect(listed.items[0].outstanding).toBe("0.30");
    expect(listed.items[0].activeServices).toBe(1);

    const detail = await getClientDetail(db, c.id);
    expect(detail?.services).toHaveLength(1);
    expect(detail?.history.some((h) => h.action === "service.created")).toBe(true);
  });

  it("ricerca globale su clienti, domini e fornitori", async () => {
    const c = await makeClient(db, userId, { firstName: "Luca", lastName: "Neri" });
    await makeService(db, userId, c.id, { name: "Hosting Neri", domain: "neri.dev", type: "HOSTING" });
    await db.provider.create({ data: { name: "Aruba" } });
    const r = await globalSearch(db, "neri");
    expect(r?.clients.map((x) => x.displayName)).toEqual(["Luca Neri"]);
    expect(r?.services.map((x) => x.name)).toEqual(["Hosting Neri"]);
    expect((await globalSearch(db, "aru"))?.providers.map((p) => p.name)).toEqual(["Aruba"]);
    expect(await globalSearch(db, "a")).toBeNull();
  });
});
