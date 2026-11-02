import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  civilFromDb,
  civilToDb,
  diffDays,
  isCivilDate,
  parseCivilDate,
  todayIn,
  zonedInstant,
} from "@/lib/timezone/civil-date";

const d = parseCivilDate;
const TZ = "Europe/Rome";

describe("date civili", () => {
  it("valida le date di calendario", () => {
    expect(isCivilDate("2028-02-29")).toBe(true);
    expect(isCivilDate("2026-02-29")).toBe(false);
    expect(isCivilDate("2026-13-01")).toBe(false);
    expect(isCivilDate("26-1-1")).toBe(false);
  });

  it("andata e ritorno con le colonne DATE senza slittamenti di fuso", () => {
    const db = civilToDb(d("2026-03-29"));
    expect(db.toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(civilFromDb(db)).toBe("2026-03-29");
  });

  it("somma giorni di calendario attraverso i cambi d'ora", () => {
    // 30 giorni prima di una scadenza successiva al passaggio all'ora legale (29/03/2026).
    expect(addDays(d("2026-04-15"), -30)).toBe("2026-03-16");
    // Passaggio all'ora solare (25/10/2026).
    expect(addDays(d("2026-10-25"), 1)).toBe("2026-10-26");
    expect(addDays(d("2026-11-01"), -7)).toBe("2026-10-25");
    expect(diffDays(d("2026-03-28"), d("2026-03-30"))).toBe(2);
  });

  it("somma mesi rispettando la fine del mese", () => {
    expect(addMonths(d("2026-01-31"), 1)).toBe("2026-02-28");
    expect(addMonths(d("2028-01-31"), 1)).toBe("2028-02-29");
    expect(addMonths(d("2026-11-30"), 3)).toBe("2027-02-28");
    expect(addMonths(d("2026-05-15"), 12)).toBe("2027-05-15");
    expect(addMonths(d("2026-03-31"), -1)).toBe("2026-02-28");
  });
});

describe("istanti locali Europe/Rome e ora legale", () => {
  it("le 09:00 locali seguono il calendario, non multipli di 24 ore", () => {
    // Prima del passaggio all'ora legale: CET (UTC+1).
    expect(zonedInstant(d("2026-03-28"), "09:00", TZ).toISOString()).toBe("2026-03-28T08:00:00.000Z");
    // Giorno del passaggio: CEST (UTC+2).
    expect(zonedInstant(d("2026-03-29"), "09:00", TZ).toISOString()).toBe("2026-03-29T07:00:00.000Z");
    // Giorno del ritorno all'ora solare.
    expect(zonedInstant(d("2026-10-24"), "09:00", TZ).toISOString()).toBe("2026-10-24T07:00:00.000Z");
    expect(zonedInstant(d("2026-10-25"), "09:00", TZ).toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });

  it("tra due promemoria alle 09:00 a cavallo del cambio d'ora passano 23 o 25 ore", () => {
    const h = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;
    expect(h(zonedInstant(d("2026-03-28"), "09:00", TZ), zonedInstant(d("2026-03-29"), "09:00", TZ))).toBe(23);
    expect(h(zonedInstant(d("2026-10-24"), "09:00", TZ), zonedInstant(d("2026-10-25"), "09:00", TZ))).toBe(25);
  });

  it("calcola la data odierna nel fuso locale vicino alla mezzanotte", () => {
    expect(todayIn(TZ, new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
    expect(todayIn(TZ, new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(todayIn("UTC", new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
  });

  it("rifiuta orari non validi", () => {
    expect(() => zonedInstant(d("2026-01-01"), "24:00", TZ)).toThrow();
  });
});
