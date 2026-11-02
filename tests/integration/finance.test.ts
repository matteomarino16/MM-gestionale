import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/lib/action-result";
import { periodRange } from "@/lib/calculations/period";
import { parseListParams } from "@/lib/list-params";
import { parseCivilDate } from "@/lib/timezone/civil-date";
import { clientFinanceSummary, serviceFinanceSummary } from "@/modules/finance/summary";
import { financeOverview, listPayments, listReceivables, PAYMENT_SORTS, RECEIVABLE_SORTS } from "@/modules/finance/ledger";
import { cancelPayable, createPayable, updatePayable } from "@/modules/finance/payables";
import { registerPayment, voidPayment } from "@/modules/finance/payments";
import { cancelReceivable, createReceivable, restoreReceivable, updateReceivable } from "@/modules/finance/receivables";
import { payableInputSchema, paymentInputSchema, receivableInputSchema } from "@/modules/finance/schema";
import { createTestDb, createTestUser, resetDb } from "./helpers/db";
import { makeClient, makeService } from "./helpers/factories";

const db = createTestDb();
const TODAY = parseCivilDate("2026-10-25");
let userId: string;
let clientId: string;

beforeEach(async () => {
  await resetDb(db);
  userId = (await createTestUser(db)).id;
  clientId = (await makeClient(db, userId)).id;
});
afterAll(() => db.$disconnect());

const recInput = (over: Record<string, unknown> = {}) =>
  receivableInputSchema.parse({ clientId, description: "Rinnovo dominio", netAmount: "100", vatRate: "22", withholdingRate: "0", dueDate: "2026-11-30", ...over });
const payInput = (over: Record<string, unknown> = {}) =>
  payableInputSchema.parse({ description: "Rinnovo registrar", expectedAmount: "10", vatRate: "22", ...over });
const payment = (targetId: string, amount: string, paidOn = "2026-10-20") =>
  paymentInputSchema.parse({ targetId, amount, paidOn, method: "BANK_TRANSFER" });

describe("crediti e pagamenti parziali", () => {
  it("registra un pagamento parziale e mostra il residuo aggiornato", async () => {
    const r = await createReceivable(db, userId, recInput());
    expect(r.amountDue.toFixed(2)).toBe("122.00");
    expect(r.status).toBe("OPEN");

    const { target } = await registerPayment(db, userId, "IN", payment(r.id, "50,00"), TODAY);
    expect(target.paidAmount.toFixed(2)).toBe("50.00");
    expect(target.status).toBe("PARTIAL");

    const second = await registerPayment(db, userId, "IN", payment(r.id, "22"), TODAY);
    expect(second.target.paidAmount.toFixed(2)).toBe("72.00");
    expect(second.target.status).toBe("PARTIAL");
    // Ogni pagamento è un movimento indipendente.
    expect(await db.payment.count({ where: { receivableId: r.id } })).toBe(2);
  });

  it("salda completamente un credito e impedisce pagamenti eccedenti", async () => {
    const r = await createReceivable(db, userId, recInput());
    await expect(registerPayment(db, userId, "IN", payment(r.id, "122.01"), TODAY)).rejects.toThrow(/supera il residuo/);
    await registerPayment(db, userId, "IN", payment(r.id, "100"), TODAY);
    const { target } = await registerPayment(db, userId, "IN", payment(r.id, "22"), TODAY);
    expect(target.status).toBe("PAID");
    expect(target.paidAmount.toFixed(2)).toBe("122.00");
    await expect(registerPayment(db, userId, "IN", payment(r.id, "1"), TODAY)).rejects.toThrow(/già saldata/);
  });

  it("rifiuta pagamenti con data futura", async () => {
    const r = await createReceivable(db, userId, recInput());
    await expect(registerPayment(db, userId, "IN", payment(r.id, "1", "2026-10-26"), TODAY)).rejects.toThrow(/futura/);
  });

  it("lo storno conserva il movimento ed è escluso dai saldi", async () => {
    const r = await createReceivable(db, userId, recInput());
    const { payment: p } = await registerPayment(db, userId, "IN", payment(r.id, "122"), TODAY);
    await voidPayment(db, userId, p.id, "Bonifico respinto");
    const after = await db.receivable.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.status).toBe("OPEN");
    expect(after.paidAmount.toFixed(2)).toBe("0.00");
    const stored = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(stored.voidedAt).not.toBeNull();
    expect(stored.voidReason).toBe("Bonifico respinto");
    await expect(voidPayment(db, userId, p.id, "di nuovo")).rejects.toThrow(/già stato stornato/);
  });

  it("pagamenti concorrenti non superano mai il dovuto", async () => {
    const r = await createReceivable(db, userId, recInput({ netAmount: "100", vatRate: "0" }));
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => registerPayment(db, userId, "IN", payment(r.id, "40"), TODAY)));
    const ok = results.filter((x) => x.status === "fulfilled").length;
    expect(ok).toBe(2); // 40 + 40 = 80; il terzo da 40 supererebbe 100
    const after = await db.receivable.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.paidAmount.toFixed(2)).toBe("80.00");
    expect(results.filter((x) => x.status === "rejected").every((x) => (x as PromiseRejectedResult).reason instanceof DomainError)).toBe(true);
  });

  it("precisione decimale: 0,10 + 0,20 salda esattamente 0,30", async () => {
    const r = await createReceivable(db, userId, recInput({ netAmount: "0.30", vatRate: "0" }));
    await registerPayment(db, userId, "IN", payment(r.id, "0.10"), TODAY);
    const { target } = await registerPayment(db, userId, "IN", payment(r.id, "0.20"), TODAY);
    expect(target.status).toBe("PAID");
    expect(target.paidAmount.toString()).toBe("0.3");
  });
});

describe("modifica e annullamento dei crediti", () => {
  it("la modifica ricalcola importi e stato; la nuova scadenza incrementa la revisione", async () => {
    const r = await createReceivable(db, userId, recInput({ vatRate: "0" }));
    await registerPayment(db, userId, "IN", payment(r.id, "100"), TODAY);
    // Credito saldato: aumentarlo lo riporta a parziale (stato aggiornato nello stesso UPDATE).
    const u = await updateReceivable(db, userId, r.id, recInput({ netAmount: "150", vatRate: "0", dueDate: "2026-12-15" }));
    expect(u.status).toBe("PARTIAL");
    expect(u.amountDue.toFixed(2)).toBe("150.00");
    expect(u.deadlineRevision).toBe(2);
    await expect(updateReceivable(db, userId, r.id, recInput({ netAmount: "90", vatRate: "0" }))).rejects.toThrow(/inferiore a quanto già incassato/);
  });

  it("gestisce IVA e ritenuta d'acconto", async () => {
    const r = await createReceivable(db, userId, recInput({ netAmount: "1000", vatRate: "22", withholdingRate: "20" }));
    expect([r.vatAmount.toFixed(2), r.withholdingAmount.toFixed(2), r.amountDue.toFixed(2)]).toEqual(["220.00", "200.00", "1020.00"]);
  });

  it("annulla solo crediti senza incassi e consente il ripristino", async () => {
    const r = await createReceivable(db, userId, recInput());
    const { payment: p } = await registerPayment(db, userId, "IN", payment(r.id, "10"), TODAY);
    await expect(cancelReceivable(db, userId, r.id)).rejects.toThrow(/stornali/);
    await voidPayment(db, userId, p.id, "errore");
    await cancelReceivable(db, userId, r.id);
    await expect(registerPayment(db, userId, "IN", payment(r.id, "1"), TODAY)).rejects.toThrow(/annullata/);
    await restoreReceivable(db, userId, r.id);
    const after = await db.receivable.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.status).toBe("OPEN");
    expect(after.deadlineRevision).toBe(2);
  });

  it("verifica che servizio e rinnovo appartengano al cliente", async () => {
    const other = await makeClient(db, userId, { firstName: "Altro" });
    const s = await makeService(db, userId, other.id);
    await expect(createReceivable(db, userId, recInput({ serviceId: s.id }))).rejects.toThrow(/non appartiene al cliente/);
    const own = await makeService(db, userId, clientId, { name: "mio.it" });
    const renewal = await db.serviceRenewal.findFirstOrThrow({ where: { serviceId: own.id } });
    const r = await createReceivable(db, userId, recInput({ renewalId: renewal.id }));
    expect(r.serviceId).toBe(own.id); // dedotto dal rinnovo
  });
});

describe("debiti verso fornitori", () => {
  it("usa l'importo effettivo, registra pagamenti e impedisce riduzioni sotto il pagato", async () => {
    const provider = await db.provider.create({ data: { name: "Aruba" } });
    const p = await createPayable(db, userId, payInput({ providerId: provider.id, expectedAmount: "10", vatRate: "22" }));
    expect(p.amountDue.toFixed(2)).toBe("12.20");
    await registerPayment(db, userId, "OUT", payment(p.id, "12.20"), TODAY);
    let row = await db.payable.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.status).toBe("PAID");

    // A consuntivo il costo effettivo è più alto: il debito torna parziale.
    const u = await updatePayable(db, userId, p.id, payInput({ providerId: provider.id, expectedAmount: "10", actualAmount: "12", vatRate: "22" }));
    expect(u.amountDue.toFixed(2)).toBe("14.64");
    expect(u.status).toBe("PARTIAL");
    await expect(updatePayable(db, userId, p.id, payInput({ providerId: provider.id, expectedAmount: "5", vatRate: "0" }))).rejects.toThrow(/inferiore a quanto già pagato/);
    await expect(cancelPayable(db, userId, p.id)).rejects.toThrow(/stornali/);
    row = await db.payable.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.paidAmount.toFixed(2)).toBe("12.20");
  });

  it("richiede almeno fornitore, servizio o categoria", async () => {
    await expect(createPayable(db, userId, payInput())).rejects.toThrow(/almeno fornitore/);
  });
});

describe("calcoli economici", () => {
  it("costi, ricavi, margine e flusso di cassa", async () => {
    const s = await makeService(db, userId, clientId);
    const renewal = await db.serviceRenewal.findFirstOrThrow({ where: { serviceId: s.id } });
    const r = await createReceivable(db, userId, recInput({ renewalId: renewal.id, netAmount: "25", vatRate: "22", dueDate: "2026-10-01" }));
    const c = await createPayable(db, userId, payInput({ renewalId: renewal.id, expectedAmount: "8.50", vatRate: "22" }));
    await registerPayment(db, userId, "IN", payment(r.id, "10.50", "2026-10-05"), TODAY);
    await registerPayment(db, userId, "OUT", payment(c.id, "10.37", "2026-09-30"), TODAY);

    const svc = await serviceFinanceSummary(db, s.id, TODAY);
    expect(svc).toMatchObject({ agreedRevenue: "25.00", costs: "8.50", margin: "16.50", collected: "10.50", outstanding: "20.00", overdue: "20.00", paidCosts: "10.37" });

    const cli = await clientFinanceSummary(db, clientId, TODAY);
    expect(cli).toMatchObject({ agreedRevenue: "25.00", collected: "10.50", costs: "8.50", margin: "16.50", payableOutstanding: "0.00" });

    // Flusso di cassa di ottobre: solo l'incasso (il pagamento è di settembre).
    const oct = await financeOverview(db, periodRange("month", TODAY), TODAY);
    expect(oct).toMatchObject({ inflow: "10.50", outflow: "0.00", cashFlow: "10.50" });
    const year = await financeOverview(db, periodRange("year", TODAY), TODAY);
    expect(year.cashFlow).toBe("0.13");
    expect(year.receivablesOverdue.residual).toBe("20.00");

    const moves = await listPayments(db, parseListParams({}, PAYMENT_SORTS, "paidOn", "desc"), { period: periodRange("year", TODAY) });
    expect(moves.totals).toEqual({ inflow: "10.50", outflow: "10.37", net: "0.13" });
    expect(moves.items.map((m) => m.direction)).toEqual(["IN", "OUT"]);
  });

  it("filtra i crediti per stato, incluso lo scaduto derivato", async () => {
    await createReceivable(db, userId, recInput({ description: "scaduto", dueDate: "2026-10-01" }));
    await createReceivable(db, userId, recInput({ description: "futuro", dueDate: "2026-12-01" }));
    const paid = await createReceivable(db, userId, recInput({ description: "pagato", vatRate: "0" }));
    await registerPayment(db, userId, "IN", payment(paid.id, "100"), TODAY);
    const p = parseListParams({}, RECEIVABLE_SORTS, "dueDate");
    const names = async (status: Parameters<typeof listReceivables>[2]["status"]) =>
      (await listReceivables(db, p, { status, today: TODAY })).items.map((r) => r.description).sort();
    expect(await names("OVERDUE")).toEqual(["scaduto"]);
    expect(await names("OPEN")).toEqual(["futuro"]);
    expect(await names("OPEN_ANY")).toEqual(["futuro", "scaduto"]);
    expect(await names("PAID")).toEqual(["pagato"]);
    const all = await listReceivables(db, p, { status: "ALL", today: TODAY });
    expect(all.totals).toMatchObject({ amountDue: "344.00", paid: "100.00", residual: "244.00", count: 3 });
  });
});
