import { expect, test } from "@playwright/test";
import { createTestDb } from "../integration/helpers/db";
import { makeClient } from "../integration/helpers/factories";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

test("cliente nuovo, servizio dal catalogo e poi eliminazione", async ({ page, isMobile }) => {
  test.skip(isMobile, "Verificato su desktop");
  const name = `Bar Centrale ${Date.now().toString(36)}`;
  await login(page);

  // Cliente con i soli dati essenziali.
  await page.goto("/clienti/nuovo");
  await page.locator("#type").selectOption("COMPANY");
  await page.locator("#companyName").fill(name);
  await page.getByRole("button", { name: "Crea cliente" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Servizio dal catalogo: il modello compila tipologia, nome, descrizione e frequenza.
  await page.getByRole("link", { name: "Nuovo servizio" }).click();
  await page.locator("#preset").selectOption("ecommerce");
  await expect(page.locator("#type")).toHaveValue("ECOMMERCE");
  await expect(page.locator("#name")).toHaveValue("E-commerce");
  await expect(page.locator("#frequency")).toHaveValue("NONE");
  await expect(page.locator("#description")).toHaveValue(/catalogo prodotti/);
  await page.locator("#name").fill(`E-commerce ${name}`);
  await page.locator("#clientPrice").fill("2.500");
  await page.getByRole("button", { name: "Crea servizio" }).click();
  await expect(page.getByRole("heading", { name: `E-commerce ${name}` })).toBeVisible();
  await expect(page.getByText("E-commerce ·").first()).toBeVisible();
  await expect(page.getByText("2.500,00 €").first()).toBeVisible();

  // Anche un servizio ricorrente dal catalogo.
  await page.goto("/servizi/nuovo");
  await page.locator("#preset").selectOption("hosting");
  await expect(page.locator("#frequency")).toHaveValue("ANNUAL");

  // Eliminazione del cliente (senza storico economico) insieme ai suoi servizi.
  await page.goto(`/clienti?q=${encodeURIComponent(name)}`);
  await page.getByRole("link", { name }).click();
  await page.getByRole("button", { name: "Elimina" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("eliminato definitivamente insieme ai suoi 1 servizi");
  await dialog.getByRole("button", { name: "Elimina definitivamente" }).click();
  await expect(page).toHaveURL(/\/clienti\?eliminato=1/);
  await expect(page.getByText("Cliente eliminato.")).toBeVisible();
  await page.goto(`/servizi?stato=ALL&q=${encodeURIComponent(name)}`);
  await expect(page.getByText("Nessun servizio corrisponde ai filtri")).toBeVisible();
});

test("un cliente con storico economico non si elimina", async ({ page, isMobile }) => {
  test.skip(isMobile, "Verificato su desktop");
  const name = `Cliente Storico ${Date.now().toString(36)}`;
  const db = createTestDb();
  try {
    const user = await db.user.findFirstOrThrow();
    const client = await makeClient(db, user.id, { type: "COMPANY", companyName: name });
    await db.receivable.create({ data: { clientId: client.id, description: "Sito", netAmount: "100", amountDue: "100" } });
  } finally {
    await db.$disconnect();
  }
  await login(page);
  await page.goto(`/clienti?q=${encodeURIComponent(name)}`);
  await page.getByRole("link", { name }).click();
  await page.getByRole("button", { name: "Elimina" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("non può essere eliminato");
  await page.getByRole("alertdialog").getByRole("button", { name: "Ho capito" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
});
