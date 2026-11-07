import { expect, test } from "@playwright/test";
import { createTestDb } from "../integration/helpers/db";
import { makeClient, makeService } from "../integration/helpers/factories";
import { addDays, todayIn } from "../../src/lib/timezone/civil-date";
import { runReminderTick } from "../../src/modules/reminders/engine";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

const suffix = Date.now().toString(36);
const serviceName = `rinnovo-${suffix}.it`;

test.beforeAll(async () => {
  const db = createTestDb();
  try {
    const user = await db.user.findFirstOrThrow();
    const client = await makeClient(db, user.id, { type: "COMPANY", companyName: `Cliente Rinnovi ${suffix}` });
    const expiry = addDays(todayIn("Europe/Rome"), 5);
    await makeService(db, user.id, client.id, { name: serviceName, expiryDate: expiry });
    // Esegue un ciclo del worker: deve produrre l'avviso (recupero del promemoria a 7 giorni).
    await runReminderTick(db, { workerId: "e2e" });
  } finally {
    await db.$disconnect();
  }
});

test("la notifica del rinnovo compare e porta alla scheda", async ({ page }) => {
  await login(page);
  await page.goto("/notifiche?vista=UNREAD");
  const title = page.getByRole("button", { name: `Rinnovo ${serviceName} tra 5 giorni` });
  await expect(title).toBeVisible();
  await title.click();
  await expect(page).toHaveURL(/\/rinnovi\//);
  await expect(page.getByRole("heading", { name: `Rinnovo ${serviceName}` })).toBeVisible();
  // Aperta, la notifica risulta letta.
  await page.goto("/notifiche?vista=UNREAD");
  await expect(page.getByRole("button", { name: `Rinnovo ${serviceName} tra 5 giorni` })).toHaveCount(0);
});

test("conferma del rinnovo: il ciclo resta nello storico e si apre il successivo", async ({ page, isMobile }) => {
  test.skip(isMobile, "Verificato su desktop");
  await login(page);
  await page.goto(`/rinnovi?q=${suffix}`);
  await page.getByRole("link", { name: serviceName }).click();

  // Lo stato operativo non completa il rinnovo.
  await page.getByLabel("Stato del rinnovo").selectOption("CLIENT_PAID");
  await page.getByRole("button", { name: "Aggiorna stato" }).click();
  await expect(page.getByText("Stato aggiornato")).toBeVisible();
  await expect(page.getByText("Pagato dal cliente").first()).toBeVisible();

  // La nuova scadenza è proposta (un anno dopo); il costo effettivo è facoltativo.
  await expect(page.locator("#newExpiryDate")).not.toHaveValue("");
  await page.locator("#actualProviderCost").fill("9,50");
  await page.getByRole("button", { name: "Conferma rinnovo effettuato" }).click();
  await expect(page.getByText("Rinnovo completato: aperto il ciclo successivo")).toBeVisible();
  await expect(page.getByText("Completato", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Ciclo #2/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Conferma rinnovo effettuato" })).toHaveCount(0);
});

test("manifest e icone sono pubblici, il resto no", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const json = await manifest.json();
  expect(json).toMatchObject({ name: "Gestionale MM", display: "standalone", start_url: "/dashboard", lang: "it" });
  for (const icon of json.icons) expect((await request.get(icon.src)).status()).toBe(200);
  expect((await request.get("/apple-icon.png")).headers()["content-type"]).toContain("image/png");
});

test("l'endpoint del cron richiede il segreto", async ({ request }) => {
  expect((await request.get("/api/cron/reminders")).status()).toBe(401);
  expect((await request.get("/api/cron/reminders", { headers: { Authorization: "Bearer sbagliato" } })).status()).toBe(401);
  const ok = await request.get("/api/cron/reminders", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ ok: true });
});

test("su smartphone c'è la barra di navigazione in basso", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Solo mobile");
  await login(page);
  const bar = page.getByRole("navigation", { name: "Navigazione rapida" });
  await expect(bar).toBeVisible();
  await bar.getByRole("link", { name: "Rinnovi" }).click();
  await expect(page).toHaveURL(/\/rinnovi$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
