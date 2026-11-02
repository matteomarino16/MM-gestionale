import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";
import { formatCivilDate, formatDateTime, formatMoney } from "@/lib/format";

const norm = (s: string) => s.replace(/\s/g, " ");

describe("formattazione italiana", () => {
  it("importi in EUR con virgola decimale e punto delle migliaia", () => {
    expect(norm(formatMoney("1234.5"))).toBe("1.234,50 €");
    expect(norm(formatMoney(new Decimal("1000000.01")))).toBe("1.000.000,01 €");
    expect(formatMoney(null)).toBe("—");
  });

  it("non perde precisione su importi grandi", () => {
    expect(norm(formatMoney("9999999999.99"))).toBe("9.999.999.999,99 €");
  });

  it("date in formato DD/MM/YYYY", () => {
    expect(formatCivilDate(new Date("2026-03-09T00:00:00Z"))).toBe("09/03/2026");
    expect(formatDateTime(new Date("2026-10-25T08:00:00Z"))).toBe("25/10/2026, 09:00");
  });
});
