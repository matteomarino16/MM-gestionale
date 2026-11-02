import { describe, expect, it } from "vitest";
import { displayStatus, payableAmounts, receivableAmounts, residual, settlementStatus } from "@/lib/calculations/amounts";
import { periodRange } from "@/lib/calculations/period";
import { parseCivilDate as d } from "@/lib/timezone/civil-date";

describe("importi di crediti e debiti", () => {
  it("dovuto = imponibile + IVA − ritenuta, con arrotondamento al centesimo", () => {
    expect(receivableAmounts("1000", "22", "20")).toEqual({
      netAmount: "1000.00",
      vatAmount: "220.00",
      withholdingAmount: "200.00",
      amountDue: "1020.00",
    });
    // 22% di 10,05 = 2,211 → 2,21; 22% di 10,25 = 2,255 → 2,26 (half-up)
    expect(receivableAmounts("10.05", "22", "0").vatAmount).toBe("2.21");
    expect(receivableAmounts("10.25", "22", "0").vatAmount).toBe("2.26");
    expect(receivableAmounts("0.10", "0", "0").amountDue).toBe("0.10");
  });

  it("per i debiti usa l'importo effettivo se noto", () => {
    expect(payableAmounts("100", null, "22")).toEqual({ vatAmount: "22.00", amountDue: "122.00" });
    expect(payableAmounts("100", "90.50", "22")).toEqual({ vatAmount: "19.91", amountDue: "110.41" });
    expect(payableAmounts("100", "0", "22")).toEqual({ vatAmount: "0.00", amountDue: "0.00" });
  });

  it("calcola lo stato e il residuo senza floating point", () => {
    expect(settlementStatus("0.30", "0")).toBe("OPEN");
    expect(settlementStatus("0.30", "0.10")).toBe("PARTIAL");
    // In floating point 0.1 + 0.2 ≠ 0.3: qui il saldo deve risultare esatto.
    expect(settlementStatus("0.30", "0.30")).toBe("PAID");
    expect(residual("0.30", "0.10")).toBe("0.20");
    expect(displayStatus("PARTIAL", "2026-01-01", "2026-01-02")).toBe("OVERDUE");
    expect(displayStatus("PARTIAL", "2026-01-02", "2026-01-02")).toBe("PARTIAL");
    expect(displayStatus("PAID", "2020-01-01", "2026-01-02")).toBe("PAID");
  });
});

describe("periodi", () => {
  it("settimana da lunedì a domenica, anche a cavallo d'anno", () => {
    expect(periodRange("week", d("2026-10-25"))).toMatchObject({ from: "2026-10-19", to: "2026-10-25" });
    expect(periodRange("week", d("2027-01-01"))).toMatchObject({ from: "2026-12-28", to: "2027-01-03" });
  });

  it("mese, trimestre e anno", () => {
    expect(periodRange("month", d("2028-02-10"))).toMatchObject({ from: "2028-02-01", to: "2028-02-29" });
    expect(periodRange("quarter", d("2026-11-15"))).toMatchObject({ from: "2026-10-01", to: "2026-12-31" });
    expect(periodRange("quarter", d("2026-02-15"))).toMatchObject({ from: "2026-01-01", to: "2026-03-31" });
    expect(periodRange("year", d("2026-06-01"))).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
    expect(periodRange("day", d("2026-06-01"))).toMatchObject({ from: "2026-06-01", to: "2026-06-01" });
  });

  it("intervallo personalizzato normalizzato", () => {
    expect(periodRange("custom", d("2026-06-01"), { from: d("2026-05-31"), to: d("2026-01-01") })).toMatchObject({
      from: "2026-01-01",
      to: "2026-05-31",
    });
    expect(periodRange("all", d("2026-06-01"))).toMatchObject({ from: null, to: null });
  });
});
