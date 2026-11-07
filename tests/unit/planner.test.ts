import { describe, expect, it } from "vitest";
import { DEFAULT_REMINDER_RULES } from "@/modules/reminders/defaults";
import { describeDaysLeft, notificationType, planReminders, type RuleSpec } from "@/modules/reminders/planner";
import { parseCivilDate as d } from "@/lib/timezone/civil-date";

const rules = (target: "RENEWAL" | "RECEIVABLE", channels: ("DASHBOARD" | "PUSH")[] = ["DASHBOARD"]): RuleSpec[] =>
  DEFAULT_REMINDER_RULES.filter((r) => r.target === target).map((r) => ({
    id: `rule-${r.key}`,
    key: r.key,
    offsetDays: r.offsetDays,
    repeatEveryDays: r.repeatEveryDays ?? null,
    maxRepeats: r.maxRepeats ?? null,
    channels,
  }));

const base = { target: "RENEWAL" as const, resourceId: "res-1", revision: 1, timeZone: "Europe/Rome", reminderTime: "09:00" };
const iso = (x: Date) => x.toISOString();
const YEAR = 365 * 86_400_000;

describe("pianificazione dei promemoria di rinnovo", () => {
  it("genera 30, 14, 7 giorni prima e il giorno della scadenza alle 09:00 locali", () => {
    const events = planReminders({ ...base, deadline: d("2026-12-15"), rules: rules("RENEWAL"), now: new Date("2026-11-01T00:00:00Z"), horizonMs: YEAR });
    const byKey = Object.fromEntries(events.map((e) => [e.ruleKey + (e.occurrence ? `:${e.occurrence}` : ""), [e.fireDate, iso(e.scheduledFor)]]));
    expect(byKey["30d"]).toEqual(["2026-11-15", "2026-11-15T08:00:00.000Z"]);
    expect(byKey["14d"]).toEqual(["2026-12-01", "2026-12-01T08:00:00.000Z"]);
    expect(byKey["7d"]).toEqual(["2026-12-08", "2026-12-08T08:00:00.000Z"]);
    expect(byKey["due"]).toEqual(["2026-12-15", "2026-12-15T08:00:00.000Z"]);
    expect(byKey["overdue"]).toEqual(["2026-12-16", "2026-12-16T08:00:00.000Z"]);
    expect(byKey["overdue:8"]).toEqual(["2027-02-10", "2027-02-10T08:00:00.000Z"]);
    expect(byKey["overdue:9"]).toBeUndefined(); // maxRepeats = 8
  });

  it("chiavi deterministiche con risorsa, revisione, regola e canale", () => {
    const events = planReminders({ ...base, deadline: d("2026-12-15"), rules: rules("RENEWAL", ["DASHBOARD", "PUSH"]), now: new Date("2026-11-01T00:00:00Z"), horizonMs: YEAR });
    const keys = events.map((e) => e.dedupeKey);
    expect(keys).toContain("renewal:res-1:r1:30d:dashboard");
    expect(keys).toContain("renewal:res-1:r1:30d:push");
    expect(keys).toContain("renewal:res-1:r1:overdue:3:push");
    expect(new Set(keys).size).toBe(keys.length);
    const again = planReminders({ ...base, deadline: d("2026-12-15"), rules: rules("RENEWAL", ["DASHBOARD", "PUSH"]), now: new Date("2026-11-01T00:00:00Z"), horizonMs: YEAR });
    expect(again.map((e) => e.dedupeKey)).toEqual(keys);
  });

  it("una nuova revisione della scadenza produce chiavi diverse", () => {
    const a = planReminders({ ...base, deadline: d("2026-12-15"), rules: rules("RENEWAL"), now: new Date("2026-11-01T00:00:00Z") });
    const b = planReminders({ ...base, revision: 2, deadline: d("2026-12-15"), rules: rules("RENEWAL"), now: new Date("2026-11-01T00:00:00Z") });
    expect(a.every((e) => e.dedupeKey.includes(":r1:"))).toBe(true);
    expect(b.every((e) => e.dedupeKey.includes(":r2:"))).toBe(true);
  });

  it("pianifica solo fino all'orizzonte", () => {
    const events = planReminders({ ...base, deadline: d("2026-12-15"), rules: rules("RENEWAL"), now: new Date("2026-11-15T07:00:00Z"), horizonMs: 86_400_000 });
    expect(events.map((e) => e.ruleKey)).toEqual(["30d"]);
  });

  it("dopo un'interruzione recupera solo l'avviso arretrato più recente", () => {
    // Il worker riparte il 10/12: 30d, 14d e 7d sono passati; si recupera solo il 7d.
    const events = planReminders({ ...base, deadline: d("2026-12-15"), rules: rules("RENEWAL"), now: new Date("2026-12-10T12:00:00Z"), horizonMs: 86_400_000 });
    expect(events.map((e) => e.ruleKey)).toEqual(["7d"]);
  });

  it("gestisce i cambi di ora legale: le 09:00 restano le 09:00 locali", () => {
    const events = planReminders({ ...base, deadline: d("2027-04-05"), rules: rules("RENEWAL"), now: new Date("2027-02-01T00:00:00Z"), horizonMs: YEAR });
    const at = Object.fromEntries(events.map((e) => [e.ruleKey + (e.occurrence ? `:${e.occurrence}` : ""), iso(e.scheduledFor)]));
    expect(at["30d"]).toBe("2027-03-06T08:00:00.000Z"); // CET, UTC+1
    expect(at["7d"]).toBe("2027-03-29T07:00:00.000Z"); // dopo il 28/03: CEST, UTC+2
    expect(at["due"]).toBe("2027-04-05T07:00:00.000Z");
  });
});

describe("promemoria dei crediti", () => {
  it("7 giorni prima, giorno della scadenza, il giorno dopo e poi ogni 7 giorni", () => {
    const events = planReminders({
      ...base,
      target: "RECEIVABLE",
      deadline: d("2026-11-20"),
      rules: rules("RECEIVABLE"),
      now: new Date("2026-11-01T00:00:00Z"),
      horizonMs: 42 * 86_400_000,
    });
    const dates = events.map((e) => `${e.ruleKey}${e.occurrence ? `:${e.occurrence}` : ""}@${e.fireDate}`);
    expect(dates).toEqual([
      "7d@2026-11-13",
      "due@2026-11-20",
      "overdue-1d@2026-11-21",
      "overdue-weekly@2026-11-28",
      "overdue-weekly:1@2026-12-05",
      "overdue-weekly:2@2026-12-12",
    ]);
  });
});

describe("testi", () => {
  it("tipo e descrizione dei giorni", () => {
    expect(notificationType("RENEWAL", 5)).toBe("RENEWAL_UPCOMING");
    expect(notificationType("RECEIVABLE", 0)).toBe("RECEIVABLE_DUE");
    expect(notificationType("RECEIVABLE", -3)).toBe("RECEIVABLE_OVERDUE");
    expect(describeDaysLeft(1)).toBe("domani");
    expect(describeDaysLeft(-1)).toBe("da 1 giorno");
    expect(describeDaysLeft(-9)).toBe("da 9 giorni");
  });
});
