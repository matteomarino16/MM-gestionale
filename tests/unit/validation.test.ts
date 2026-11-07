import { describe, expect, it } from "vitest";
import { money, parseItalianDecimal, percent } from "@/lib/validation/common";
import { clientInputSchema, computeDisplayName } from "@/modules/clients/schema";
import { normalizeDomain, serviceInputSchema } from "@/modules/services/schema";

describe("importi in formato italiano", () => {
  it.each([
    ["1.234,56", "1234.56"],
    ["1234,5", "1234.5"],
    ["1234.56", "1234.56"],
    ["1.234.567", "1234567"],
    ["1.250", "1250"],
    ["12.50", "12.5"],
    ["1.25", "1.25"],
    ["€ 12,00", "12"],
    ["0,1", "0.1"],
  ])("%s → %s", (input, expected) => {
    expect(parseItalianDecimal(input)).toBe(expected);
  });

  it.each(["abc", "1,2,3", "12a", "1.234,56,7"])("rifiuta %s", (input) => {
    expect(parseItalianDecimal(input)).toBeNull();
  });

  it("valida decimali, segno e massimo", () => {
    const m = money({ label: "Prezzo" });
    expect(m.parse("99,9")).toBe("99.90");
    expect(m.safeParse("1,234").success).toBe(false);
    expect(m.safeParse("-5").success).toBe(false);
    expect(m.safeParse("").success).toBe(false);
    expect(m.safeParse("99999999999").success).toBe(false);
    expect(percent().parse("22")).toBe("22.00");
    expect(percent().safeParse("101").success).toBe(false);
  });
});

describe("domini", () => {
  it.each([
    ["Esempio.IT", "esempio.it"],
    ["https://www.esempio.it/pagina?x=1", "www.esempio.it"],
    ["caffè.it", "xn--caff-8oa.it"],
    ["sub.dominio.co.uk.", "sub.dominio.co.uk"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each(["localhost", "esempio", "-a.it", "spazi nel.it"])("rifiuta %s", (input) => {
    expect(normalizeDomain(input)).toBeNull();
  });
});

describe("cliente", () => {
  it("accetta una persona fisica senza azienda né dati fiscali", () => {
    const r = clientInputSchema.parse({ type: "PERSON", firstName: "Mario", lastName: "Rossi", email: "Mario@Esempio.IT" });
    expect(r.companyName).toBeNull();
    expect(r.vatNumber).toBeNull();
    expect(r.email).toBe("mario@esempio.it");
    expect(computeDisplayName(r)).toBe("Mario Rossi");
  });

  it("richiede la ragione sociale per le aziende", () => {
    const r = clientInputSchema.safeParse({ type: "COMPANY", firstName: "Mario" });
    expect(r.success).toBe(false);
  });

  it("valida P.IVA, CAP e provincia italiani", () => {
    const r = clientInputSchema.safeParse({ type: "COMPANY", companyName: "ACME", vatNumber: "123", postalCode: "1", province: "Milano" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path[0]);
      expect(paths).toEqual(expect.arrayContaining(["vatNumber", "postalCode", "province"]));
    }
    const ok = clientInputSchema.parse({ type: "COMPANY", companyName: "ACME", vatNumber: "IT 01234567890", province: "mi", postalCode: "20100" });
    expect(ok.vatNumber).toBe("IT01234567890");
    expect(ok.province).toBe("MI");
  });
});

describe("servizio", () => {
  const base = {
    clientId: "0190a3c4-0000-7000-8000-000000000001",
    name: "esempio.it",
    type: "DOMAIN_RENEWAL",
    frequency: "ANNUAL",
    expiryDate: "2027-03-01",
    providerCost: "8,50",
    clientPrice: "25",
    vatRate: "22",
  };

  it("converte importi e date", () => {
    const s = serviceInputSchema.parse(base);
    expect(s.providerCost).toBe("8.50");
    expect(s.clientPrice).toBe("25.00");
    expect(s.expiryDate).toBe("2027-03-01");
    expect(s.customIntervalValue).toBeNull();
  });

  it("richiede la scadenza per i servizi ricorrenti attivi", () => {
    expect(serviceInputSchema.safeParse({ ...base, expiryDate: "" }).success).toBe(false);
    expect(serviceInputSchema.safeParse({ ...base, expiryDate: "", frequency: "NONE" }).success).toBe(true);
  });

  it("richiede l'intervallo per la frequenza personalizzata e lo azzera altrimenti", () => {
    expect(serviceInputSchema.safeParse({ ...base, frequency: "CUSTOM" }).success).toBe(false);
    const c = serviceInputSchema.parse({ ...base, frequency: "CUSTOM", customIntervalValue: "45", customIntervalUnit: "DAY" });
    expect(c.customIntervalValue).toBe(45);
    const a = serviceInputSchema.parse({ ...base, customIntervalValue: "45", customIntervalUnit: "DAY" });
    expect(a.customIntervalValue).toBeNull();
  });

  it("rifiuta scadenza precedente all'inizio", () => {
    expect(serviceInputSchema.safeParse({ ...base, startDate: "2027-04-01" }).success).toBe(false);
  });
});

describe("connessione al database", () => {
  it("rende esplicita la verifica SSL senza toccare il resto dell'URL", async () => {
    const { normalizeSslMode } = await import("@/lib/db/client");
    expect(normalizeSslMode("postgresql://u:p@h/db?sslmode=require&channel_binding=require")).toBe(
      "postgresql://u:p@h/db?sslmode=verify-full&channel_binding=require",
    );
    expect(normalizeSslMode("postgresql://u:p@h/db?channel_binding=require&sslmode=prefer")).toBe(
      "postgresql://u:p@h/db?channel_binding=require&sslmode=verify-full",
    );
    expect(normalizeSslMode("postgresql://u:p@localhost:5432/db?schema=public")).toBe("postgresql://u:p@localhost:5432/db?schema=public");
  });
});

describe("servizio senza importi", () => {
  it("costo e prezzo vuoti valgono zero", async () => {
    const { serviceInputSchema } = await import("@/modules/services/schema");
    const s = serviceInputSchema.parse({
      clientId: "0190a3c4-0000-7000-8000-000000000001",
      name: "E-commerce",
      type: "ECOMMERCE",
      frequency: "NONE",
      providerCost: "",
      clientPrice: "",
      vatRate: "22",
    });
    expect([s.providerCost, s.clientPrice]).toEqual(["0.00", "0.00"]);
  });
});
