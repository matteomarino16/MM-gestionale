import { expect, test, type Page } from "@playwright/test";
import { createTestDb } from "../integration/helpers/db";
import { makeClient, makeService } from "../integration/helpers/factories";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

const suffix = Date.now().toString(36);
let serviceId: string;
let receivableUrl: string;

test.beforeAll(async () => {
  // Dati di partenza creati direttamente: qui si verifica il registro economico, non il CRUD.
  const db = createTestDb();
  try {
    const user = await db.user.findFirstOrThrow();
    const provider = await db.provider.create({ data: { name: `Fornitore ${suffix}` } });
    const client = await makeClient(db, user.id, { type: "COMPANY", companyName: `Cliente Finanza ${suffix}` });
    const service = await makeService(db, user.id, client.id, {
      name: `finanza-${suffix}.it`,
      providerId: provider.id,
      providerCost: "8,50",
      clientPrice: "25,00",
    });
    serviceId = service.id;
  } finally {
    await db.$disconnect();
  }
});

async function registerPayment(page: Page, amount: string, submit: string) {
  await page.locator("#pay-amount").fill(amount);
  await page.getByRole("button", { name: submit }).click();
}

test("credito dal rinnovo: incasso parziale, saldo, storno", async ({ page, isMobile }) => {
  test.skip(isMobile, "Flusso economico verificato su desktop");
  await login(page);

  await page.goto(`/servizi/${serviceId}`);
  await page.getByRole("link", { name: "Credito" }).click();
  await expect(page.locator("#description")).toHaveValue(/Rinnovo finanza-/);
  await expect(page.locator("#netAmount")).toHaveValue("25,00");
  await expect(page.locator("#renewalId")).not.toHaveValue("");
  await expect(page.getByText("Dovuto dal cliente")).toBeVisible();
  await expect(page.getByText("30,50 €")).toBeVisible(); // 25 + 22% IVA
  await page.getByRole("button", { name: "Registra credito" }).click();

  await expect(page.getByText("Credito verso Cliente Finanza")).toBeVisible();
  receivableUrl = page.url();

  // Importo superiore al residuo: errore chiaro, nessun movimento.
  await registerPayment(page, "31", "Registra incasso");
  await expect(page.getByText(/supera il residuo da pagare/)).toBeVisible();

  // Pagamento parziale.
  await registerPayment(page, "10", "Registra incasso");
  await expect(page.getByText("Incasso registrato")).toBeVisible();
  await expect(page.getByText("Parziale").first()).toBeVisible();
  await expect(page.locator("#pay-amount")).toHaveValue("20,50"); // residuo proposto

  // Saldo.
  await registerPayment(page, "20,50", "Registra incasso");
  await expect(page.getByText("Pagato", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Registra incasso" })).toHaveCount(0);

  // Storno del secondo movimento con motivazione.
  await page.getByRole("button", { name: "Storna" }).first().click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Storna" }).click();
  await expect(dialog.getByText("Motivo dello storno obbligatorio")).toBeVisible();
  await dialog.getByLabel("Motivo").fill("Bonifico respinto");
  await dialog.getByRole("button", { name: "Storna" }).click();
  await expect(page.getByText("Movimento stornato")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Stornato .* Bonifico respinto/ })).toBeVisible();
  await expect(page.getByText("Parziale").first()).toBeVisible();
});

test("costo dal rinnovo e pagamento al fornitore", async ({ page, isMobile }) => {
  test.skip(isMobile, "Flusso economico verificato su desktop");
  await login(page);
  await page.goto(`/servizi/${serviceId}`);
  await page.getByRole("link", { name: "Costo" }).click();
  await expect(page.locator("#expectedAmount")).toHaveValue("8,50");
  await expect(page.locator("#providerId")).not.toHaveValue("");
  await page.getByRole("button", { name: "Registra costo" }).click();
  await expect(page.getByText(/Costo verso Fornitore/)).toBeVisible();
  await registerPayment(page, "10,37", "Registra pagamento");
  await expect(page.getByText("Pagamento registrato")).toBeVisible();
  await expect(page.getByText("Pagato", { exact: true }).first()).toBeVisible();

  // La scheda servizio mostra il margine gestionale: 25,00 − 8,50.
  await page.goto(`/servizi/${serviceId}`);
  await expect(page.getByText("Margine gestionale").locator("..")).toContainText("16,50 €");
});

test("registro pagamenti, filtri ed elenco entrate", async ({ page, isMobile }) => {
  test.skip(isMobile, "Flusso economico verificato su desktop");
  await login(page);
  await page.goto(`/pagamenti?periodo=all&q=${suffix}`);
  // Incasso valido 10,00 (20,50 stornato) e pagamento 10,37 → flusso −0,37.
  await expect(page.getByText("Flusso di cassa").locator("..")).toContainText("-0,37 €");
  await expect(page.getByText("Stornato")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Mostra stornati" }).click();
  await page.getByRole("button", { name: "Filtra" }).click();
  await expect(page.getByText("Stornato").first()).toBeVisible();

  await page.goto(`/entrate?q=${suffix}`);
  await expect(page.getByRole("link", { name: /Rinnovo finanza-/ })).toBeVisible();
  await page.goto(`/entrate?q=${suffix}&stato=PAID`);
  await expect(page.getByText("Nessun credito corrisponde ai filtri")).toBeVisible();
});

test("annullamento di un credito senza incassi", async ({ page, isMobile }) => {
  test.skip(isMobile, "Flusso economico verificato su desktop");
  await login(page);
  await page.goto(`/servizi/${serviceId}`);
  await page.getByRole("link", { name: "Credito" }).click();
  await page.locator("#description").fill(`Da annullare ${suffix}`);
  await page.getByRole("button", { name: "Registra credito" }).click();
  await expect(page.getByRole("heading", { name: `Da annullare ${suffix}` })).toBeVisible();
  await page.getByRole("button", { name: "Annulla" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Annulla credito" }).click();
  await expect(page.getByText("Annullato", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Registra incasso" })).toHaveCount(0);
  expect(receivableUrl).toContain("/entrate/");
});
