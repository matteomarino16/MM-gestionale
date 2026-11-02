import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

export function credentials(): { email: string; password: string } {
  return JSON.parse(readFileSync("tests/e2e/.auth/credentials.json", "utf8"));
}

export async function login(page: Page, next?: string) {
  const { email, password } = credentials();
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
