import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { parseCivilDate } from "@/lib/timezone/civil-date";
import { registerPayment } from "@/modules/finance/payments";
import { createReceivable, updateReceivable } from "@/modules/finance/receivables";
import { paymentInputSchema, receivableInputSchema } from "@/modules/finance/schema";
import { claimDueEvents, planAll, processEvent, runReminderTick } from "@/modules/reminders/engine";
import { updateService } from "@/modules/services/service";
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

const at = (iso: string) => new Date(iso);
const tick = (iso: string, workerId = "test") => runReminderTick(db, { now: at(iso), workerId });
const notificationKeys = async () => (await db.notification.findMany({ orderBy: { scheduledFor: "asc" } })).map((n) => n.dedupeKey.replace(/^[a-z]+:[^:]+:/, ""));

describe("promemoria dei rinnovi", () => {
  it("genera gli avvisi a 30, 14 e 7 giorni senza duplicati", async () => {
    const s = await makeService(db, userId, clientId, { expiryDate: "2026-12-15" });
    // 15/11 ore 08:30 UTC = 09:30 a Roma: è dovuto l'avviso a 30 giorni.
    await tick("2026-11-15T08:30:00Z");
    await tick("2026-11-15T08:31:00Z");
    expect(await notificationKeys()).toEqual(["r1:30d"]);

    await tick("2026-12-01T08:05:00Z");
    await tick("2026-12-08T08:05:00Z");
    expect(await notificationKeys()).toEqual(["r1:30d", "r1:14d", "r1:7d"]);

    const n = await db.notification.findFirstOrThrow({ where: { dedupeKey: { endsWith: ":7d" } } });
    expect(n.title).toBe("Rinnovo esempio.it tra 7 giorni");
    expect(n.type).toBe("RENEWAL_UPCOMING");
    expect(n.link).toMatch(/^\/rinnovi\//);
    expect(n.serviceId).toBe(s.id);
    expect(n.amount?.toFixed(2)).toBe("25.00");
    // Prima delle 09:00 locali l'avviso del giorno non è ancora dovuto.
    await tick("2026-12-15T07:59:00Z");
    expect(await db.notification.count()).toBe(3);
  });

  it("dopo la modifica della scadenza non restano avvisi obsoleti", async () => {
    const s = await makeService(db, userId, clientId, { expiryDate: "2026-12-15" });
    await planAll(db, at("2026-11-14T10:00:00Z"));
    expect(await db.reminderEvent.count({ where: { status: "PENDING" } })).toBeGreaterThan(0);

    await updateService(db, userId, s.id, serviceInput(clientId, { expiryDate: "2027-01-31" }));
    await tick("2026-11-15T08:30:00Z");
    // Gli avvisi della vecchia scadenza (r1) sono rimossi dalla coda; nessuna notifica obsoleta.
    expect(await db.notification.count()).toBe(0);
    expect(await db.reminderEvent.count({ where: { dedupeKey: { contains: ":r1:" } } })).toBe(0);

    await tick("2027-01-01T08:30:00Z");
    expect(await notificationKeys()).toEqual(["r2:30d"]);
  });

  it("un servizio sospeso e poi riattivato riceve di nuovo gli avvisi", async () => {
    const s = await makeService(db, userId, clientId, { expiryDate: "2026-12-15" });
    await planAll(db, at("2026-11-14T10:00:00Z"));
    await updateService(db, userId, s.id, serviceInput(clientId, { expiryDate: "2026-12-15", status: "SUSPENDED" }));
    await tick("2026-11-15T08:30:00Z");
    expect(await db.notification.count()).toBe(0);
    await updateService(db, userId, s.id, serviceInput(clientId, { expiryDate: "2026-12-15", status: "ACTIVE" }));
    await tick("2026-11-16T08:30:00Z");
    expect(await notificationKeys()).toEqual(["r1:30d"]);
  });

  it("nessun avviso per servizi annullati", async () => {
    const s = await makeService(db, userId, clientId, { expiryDate: "2026-12-15" });
    await updateService(db, userId, s.id, serviceInput(clientId, { expiryDate: "2026-12-15", status: "CANCELLED" }));
    await tick("2026-11-15T08:30:00Z");
    expect(await db.notification.count()).toBe(0);
  });
});

describe("promemoria dei crediti", () => {
  const rec = (over: Record<string, unknown> = {}) =>
    receivableInputSchema.parse({ clientId, description: "Sito web", netAmount: "100", vatRate: "0", withholdingRate: "0", dueDate: "2026-11-20", ...over });
  const pay = (targetId: string, amount: string) => paymentInputSchema.parse({ targetId, amount, paidOn: "2026-11-15", method: "BANK_TRANSFER" });

  it("avvisa prima, alla scadenza, dopo e poi ogni 7 giorni con il residuo aggiornato", async () => {
    const r = await createReceivable(db, userId, rec());
    await tick("2026-11-13T08:30:00Z");
    await registerPayment(db, userId, "IN", pay(r.id, "40"), parseCivilDate("2026-11-15"));
    await tick("2026-11-20T08:30:00Z");
    await tick("2026-11-21T08:30:00Z");
    await tick("2026-11-28T08:30:00Z");
    await tick("2026-12-05T08:30:00Z");
    expect(await notificationKeys()).toEqual(["r1:7d", "r1:due", "r1:overdue-1d", "r1:overdue-weekly", "r1:overdue-weekly:1"]);
    const due = await db.notification.findFirstOrThrow({ where: { dedupeKey: { endsWith: ":due" } } });
    expect(due.title).toBe("Pagamento in scadenza oggi: Sito web");
    expect(due.body.replace(/\s/g, " ")).toContain("residuo 60,00 € su 100,00 €");
    expect(due.amount?.toFixed(2)).toBe("60.00");
    const overdue = await db.notification.findFirstOrThrow({ where: { dedupeKey: { endsWith: ":overdue-weekly:1" } } });
    expect(overdue.type).toBe("RECEIVABLE_OVERDUE");
    expect(overdue.title).toBe("Pagamento scaduto da 15 giorni: Sito web");
  });

  it("dopo il saldo annulla gli avvisi futuri e archivia quelli non letti", async () => {
    const r = await createReceivable(db, userId, rec());
    await tick("2026-11-13T08:30:00Z");
    await planAll(db, at("2026-11-19T10:00:00Z")); // pianifica l'avviso del giorno di scadenza
    await registerPayment(db, userId, "IN", pay(r.id, "100"), parseCivilDate("2026-11-15"));
    await tick("2026-11-20T08:30:00Z");
    await tick("2026-11-28T08:30:00Z");
    expect(await notificationKeys()).toEqual(["r1:7d"]);
    expect((await db.notification.findFirstOrThrow()).status).toBe("ARCHIVED");
    expect(await db.reminderEvent.count({ where: { status: "PENDING" } })).toBe(0);
  });

  it("uno storno che riapre il credito riattiva i promemoria", async () => {
    const r = await createReceivable(db, userId, rec());
    const { payment } = await registerPayment(db, userId, "IN", pay(r.id, "100"), parseCivilDate("2026-11-15"));
    await planAll(db, at("2026-11-19T10:00:00Z"));
    const { voidPayment } = await import("@/modules/finance/payments");
    await voidPayment(db, userId, payment.id, "Bonifico respinto");
    await tick("2026-11-20T08:30:00Z");
    expect(await notificationKeys()).toEqual(["r1:due"]);
  });

  it("spostando la scadenza gli avvisi seguono la nuova data", async () => {
    const r = await createReceivable(db, userId, rec());
    await planAll(db, at("2026-11-12T10:00:00Z"));
    await updateReceivable(db, userId, r.id, rec({ dueDate: "2026-12-20" }));
    await tick("2026-11-13T08:30:00Z");
    expect(await db.notification.count()).toBe(0);
    await tick("2026-12-13T08:30:00Z");
    expect(await notificationKeys()).toEqual(["r2:7d"]);
  });
});

describe("affidabilità della coda", () => {
  it("più worker concorrenti non producono duplicati", async () => {
    for (let i = 0; i < 5; i++) await makeService(db, userId, clientId, { name: `s${i}.it`, expiryDate: "2026-12-15" });
    await db.pushSubscription.create({ data: { userId, endpoint: "https://push.example/1", p256dh: "k", auth: "a" } });
    await db.pushSubscription.create({ data: { userId, endpoint: "https://push.example/2", p256dh: "k", auth: "a" } });

    const now = "2026-11-15T08:30:00Z";
    await Promise.all(["w1", "w2", "w3", "w4"].map((w) => tick(now, w)));

    expect(await db.notification.count()).toBe(5);
    // 5 notifiche × 2 dispositivi, una sola consegna per coppia.
    expect(await db.notificationDelivery.count()).toBe(10);
    const events = await db.reminderEvent.findMany({ where: { scheduledFor: { lte: at(now) } } });
    expect(events).toHaveLength(10); // canali dashboard + push
    expect(events.every((e) => e.status === "DONE" && e.attempts === 1)).toBe(true);
  });

  it("recupera gli eventi rimasti bloccati da un worker interrotto", async () => {
    await makeService(db, userId, clientId, { expiryDate: "2026-12-15" });
    await planAll(db, at("2026-11-15T08:30:00Z"));
    // Un worker acquisisce gli eventi e si arresta prima di elaborarli.
    const claimed = await claimDueEvents(db, "crashed", at("2026-11-15T08:30:00Z"));
    expect(claimed.length).toBe(2);
    // Subito dopo un altro worker non li tocca (sono ancora in lavorazione)…
    expect(await claimDueEvents(db, "w2", at("2026-11-15T08:31:00Z"))).toHaveLength(0);
    // …ma dopo il timeout li riprende e li completa.
    await tick("2026-11-15T08:40:00Z", "w2");
    expect(await db.notification.count()).toBe(1);
    const events = await db.reminderEvent.findMany({ where: { status: { not: "PENDING" } } });
    expect(events.every((e) => e.status === "DONE" && e.lockedBy === null)).toBe(true);
  });

  it("dopo un lungo arresto recupera solo l'avviso più recente", async () => {
    await makeService(db, userId, clientId, { expiryDate: "2026-12-15" });
    await tick("2026-12-10T08:30:00Z");
    expect(await notificationKeys()).toEqual(["r1:7d"]);
    expect((await db.notification.findFirstOrThrow()).title).toBe("Rinnovo esempio.it tra 5 giorni");
  });

  it("riprova con backoff gli eventi in errore e poi li marca falliti", async () => {
    await makeService(db, userId, clientId, { expiryDate: "2026-12-15" });
    await planAll(db, at("2026-11-15T08:30:00Z"));
    const [ev] = await claimDueEvents(db, "w", at("2026-11-15T08:30:00Z"), 1);
    // Simula un errore: la notifica fa riferimento a un utente inesistente.
    await db.user.deleteMany();
    await expect(processEvent(db, ev, at("2026-11-15T08:30:00Z"))).rejects.toThrow();
    // Il ciclo completo applica la politica di retry (qui un utente non c'è: planAll non pianifica).
    await db.reminderEvent.update({ where: { id: ev.id }, data: { status: "PENDING", attempts: 4 } });
    await runReminderTick(db, { now: at("2026-11-15T08:31:00Z"), workerId: "w" });
    const failed = await db.reminderEvent.findUniqueOrThrow({ where: { id: ev.id } });
    expect(failed.status).toBe("FAILED");
    expect(failed.attempts).toBe(5);
    expect(failed.lastError).toMatch(/Nessun utente/);
  });
});
