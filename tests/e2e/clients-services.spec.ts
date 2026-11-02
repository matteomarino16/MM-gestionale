import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// I flussi condividono il database: eseguiti in sequenza in un'unica sessione.
test.describe.configure({ mode: "serial" });

const suffix = Date.now().toString(36);
const company = `Studio Test ${suffix}`;
const domain = `studio-${suffix}.it`;

test("ciclo completo: cliente, fornitore, servizio, ricerca, archiviazione", async ({ page, isMobile }) => {
  test.skip(isMobile, "Flusso completo verificato su desktop; la navigazione mobile è coperta da auth.spec");
  await login(page);

  // Validazione lato server con messaggi chiari e valori conservati.
  await page.goto("/clienti/nuovo");
  await page.getByLabel("Tipologia").selectOption("COMPANY");
  await page.getByLabel("Partita IVA").fill("123");
  await page.getByRole("button", { name: "Crea cliente" }).click();
  await expect(page.getByText("Inserisci la ragione sociale")).toBeVisible();
  await expect(page.getByText("Partita IVA italiana: 11 cifre")).toBeVisible();
  await expect(page.getByLabel("Partita IVA")).toHaveValue("123");

  // Creazione cliente.
  await page.locator("#companyName").fill(company);
  await page.getByLabel("Partita IVA").fill("01234567890");
  await page.getByLabel("Email", { exact: true }).fill("info@studio.test");
  await page.getByLabel("Città").fill("Bologna");
  await page.getByLabel("Provincia").fill("bo");
  await page.getByRole("button", { name: "Crea cliente" }).click();
  await expect(page.getByRole("heading", { name: company })).toBeVisible();
  const clientUrl = page.url();

  // Modifica.
  await page.getByRole("link", { name: "Modifica" }).click();
  await page.getByLabel("Telefono").fill("051 123456");
  await page.getByRole("button", { name: "Salva modifiche" }).click();
  await expect(page.getByText("051 123456")).toBeVisible();

  // Fornitore.
  await page.goto("/fornitori/nuovo");
  await page.locator("#name").fill(`Registrar ${suffix}`);
  await page.getByRole("button", { name: "Crea fornitore" }).click();
  await expect(page.getByRole("heading", { name: `Registrar ${suffix}` })).toBeVisible();

  // Servizio dal cliente, con importi in formato italiano.
  await page.goto(clientUrl);
  await page.getByRole("link", { name: "Nuovo servizio" }).click();
  await expect(page.locator("#clientId")).toHaveValue(/.+/);
  await page.locator("#name").fill(domain);
  await page.locator("#domain").fill(`https://${domain}/`);
  await page.locator("#providerId").selectOption({ label: `Registrar ${suffix}` });
  await page.locator("#expiryDate").fill("2027-03-01");
  await page.locator("#providerCost").fill("1.008,50");
  await page.locator("#clientPrice").fill("1.250");
  await expect(page.getByText("Margine per ciclo:")).toContainText("241,50");
  await page.getByRole("button", { name: "Crea servizio" }).click();

  await expect(page.getByRole("heading", { name: domain })).toBeVisible();
  await expect(page.getByText("01/03/2027").first()).toBeVisible();
  await expect(page.getByText("Previsto")).toBeVisible(); // primo ciclo di rinnovo
  await expect(page.getByText("1.250,00 €").first()).toBeVisible();

  // Ricerca globale dall'header.
  await page.getByLabel("Ricerca globale").fill(`studio-${suffix}`);
  await page.getByLabel("Ricerca globale").press("Enter");
  await expect(page).toHaveURL(/\/cerca\?q=/);
  await expect(page.getByRole("link", { name: domain })).toBeVisible();
  await expect(page.getByRole("link", { name: company })).toBeVisible();

  // Elenco servizi filtrato e ordinabile.
  await page.goto(`/servizi?q=${suffix}`);
  await expect(page.getByRole("link", { name: domain })).toBeVisible();

  // Archiviazione con conferma.
  await page.goto(clientUrl);
  await page.getByRole("button", { name: "Archivia" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Archiviare il cliente?");
  await page.getByRole("alertdialog").getByRole("button", { name: "Archivia" }).click();
  await expect(page.getByText(/Archiviato il/)).toBeVisible();

  await page.goto(`/clienti?q=${suffix}`);
  await expect(page.getByText("Nessun cliente corrisponde ai filtri")).toBeVisible();
  await page.goto(`/clienti?q=${suffix}&stato=ARCHIVED`);
  await expect(page.getByRole("link", { name: company })).toBeVisible();
});

test("id non validi o inesistenti mostrano la pagina 404", async ({ page }) => {
  await login(page);
  await page.goto("/clienti/non-un-uuid");
  await expect(page.getByText("Pagina non trovata")).toBeVisible();
  await page.goto("/servizi/0190a3c4-0000-7000-8000-000000000001");
  await expect(page.getByText("Pagina non trovata")).toBeVisible();
});
