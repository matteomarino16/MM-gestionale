import { describe, expect, it } from "vitest";
import { annualizedAmount, cycleMargin, nextExpiry, renewalPeriod } from "@/lib/calculations/renewal-period";
import { parseCivilDate as d } from "@/lib/timezone/civil-date";

describe("periodi di rinnovo", () => {
  it("non presume che i servizi siano annuali", () => {
    expect(nextExpiry(d("2026-01-31"), { frequency: "MONTHLY" })).toBe("2026-02-28");
    expect(nextExpiry(d("2026-11-30"), { frequency: "QUARTERLY" })).toBe("2027-02-28");
    expect(nextExpiry(d("2026-08-31"), { frequency: "SEMIANNUAL" })).toBe("2027-02-28");
    expect(nextExpiry(d("2028-02-29"), { frequency: "ANNUAL" })).toBe("2029-02-28");
    expect(nextExpiry(d("2026-05-10"), { frequency: "BIENNIAL" })).toBe("2028-05-10");
    expect(nextExpiry(d("2026-03-20"), { frequency: "CUSTOM", customIntervalValue: 45, customIntervalUnit: "DAY" })).toBe("2026-05-04");
    expect(nextExpiry(d("2026-03-20"), { frequency: "CUSTOM", customIntervalValue: 18, customIntervalUnit: "MONTH" })).toBe("2027-09-20");
    expect(nextExpiry(d("2026-03-20"), { frequency: "NONE" })).toBeNull();
  });

  it("segnala frequenze personalizzate incomplete", () => {
    expect(() => renewalPeriod({ frequency: "CUSTOM" })).toThrow();
  });

  it("riporta gli importi su base annua con precisione decimale", () => {
    expect(annualizedAmount("10.00", { frequency: "MONTHLY" })).toBe("120.00");
    expect(annualizedAmount("100.00", { frequency: "BIENNIAL" })).toBe("50.00");
    expect(annualizedAmount("10.00", { frequency: "CUSTOM", customIntervalValue: 7, customIntervalUnit: "MONTH" })).toBe("17.14");
    expect(annualizedAmount("1.00", { frequency: "CUSTOM", customIntervalValue: 30, customIntervalUnit: "DAY" })).toBe("12.17");
    expect(annualizedAmount("10.00", { frequency: "NONE" })).toBeNull();
  });

  it("calcola il margine per ciclo senza errori di floating point", () => {
    expect(cycleMargin("0.30", "0.10")).toBe("0.20");
    expect(cycleMargin("25.00", "8.50")).toBe("16.50");
    expect(cycleMargin("5.00", "8.50")).toBe("-3.50");
  });
});
