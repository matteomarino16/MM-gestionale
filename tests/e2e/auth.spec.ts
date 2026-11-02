import { expect, test } from "@playwright/test";
import { credentials, login } from "./helpers";

test.describe("accesso non autorizzato", () => {
  for (const path of ["/dashboard", "/impostazioni", "/"]) {
    test(`la pagina ${path} rimanda al login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole("button", { name: "Accedi" })).toBeVisible();
    });
  }

  test("le API protette rispondono 401 senza sessione", async ({ request }) => {
    const res = await request.get("/api/qualsiasi");
    expect(res.status()).toBe(401);
  });

  test("un cookie di sessione falso non dà accesso", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "gst_session", value: "token-inventato", url: baseURL! }]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("login", () => {
  test("credenziali errate mostrano un errore generico", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(credentials().email);
    await page.getByLabel("Password").fill("password-sbagliata");
    await page.getByRole("button", { name: "Accedi" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Email o password" })).toContainText("Email o password non corretti");
  });

  test("accesso, cookie sicuro, redirect al percorso richiesto e logout", async ({ page, context }) => {
    await login(page, "/impostazioni");
    await expect(page).toHaveURL(/\/impostazioni$/);
    await expect(page.getByText("Sessioni attive", { exact: true })).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === "gst_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");

    await page.getByRole("button", { name: "Menu utente" }).click();
    await page.getByRole("menuitem", { name: "Esci" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("la dashboard vuota mostra le istruzioni iniziali", async ({ page }, testInfo) => {
    // Il database è vuoto solo prima che gli altri file di test creino dati (progetto desktop, primo file).
    test.skip(testInfo.project.name !== "desktop", "Richiede il database vuoto");
    await login(page);
    await expect(page.getByText("Il gestionale è pronto")).toBeVisible();
  });
});
