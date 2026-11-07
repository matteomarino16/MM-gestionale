/**
 * Genera le icone dell'app (PWA, iPhone) dal logo "MM" usando il Chromium di Playwright.
 *   node scripts/generate-icons.mjs
 */
import { chromium } from "@playwright/test";

const html = (size, { radius, scale }) => `<!doctype html><html><body style="margin:0">
<div style="width:${size}px;height:${size}px;background:#171717;border-radius:${radius}px;display:flex;align-items:center;justify-content:center;
font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-weight:700;color:#fff;
font-size:${Math.round(size * 0.42 * scale)}px;letter-spacing:${Math.round(-size * 0.02 * scale)}px">MM</div></body></html>`;

const targets = [
  // Icone "any": angoli arrotondati come il logo nell'app.
  { file: "public/icons/icon-192.png", size: 192, radius: 42, scale: 1 },
  { file: "public/icons/icon-512.png", size: 512, radius: 112, scale: 1 },
  // Maskable: sfondo pieno, contenuto nella zona sicura (80%).
  { file: "public/icons/icon-maskable-512.png", size: 512, radius: 0, scale: 0.8 },
  // iPhone: quadrata e opaca, gli angoli li arrotonda iOS.
  { file: "src/app/apple-icon.png", size: 180, radius: 0, scale: 0.9 },
  { file: "src/app/icon.png", size: 64, radius: 14, scale: 1 },
];

const browser = await chromium.launch();
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
  await page.setContent(html(t.size, t));
  await page.screenshot({ path: t.file, omitBackground: t.radius > 0 });
  await page.close();
  console.log(t.file);
}
await browser.close();
