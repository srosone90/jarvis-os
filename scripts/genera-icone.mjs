/**
 * Genera le icone PNG del manifest da un SVG (si lancia a mano, una volta:
 * le PNG sono versionate in public/icone/). Usa il Chromium di Playwright.
 *   node scripts/genera-icone.mjs
 */
import { chromium } from "@playwright/test";

const svg = (maskable) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="#0d0f13"/>
  <circle cx="256" cy="256" r="${maskable ? 150 : 176}" fill="none" stroke="#5b8def" stroke-width="${maskable ? 26 : 30}"/>
  <path d="M${maskable ? "286 176v112a46 46 0 0 1-92 0" : "292 160v124a52 52 0 0 1-104 0"}" fill="none" stroke="#eef1f6"
        stroke-width="${maskable ? 30 : 34}" stroke-linecap="round"/>
</svg>`;

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
for (const [nome, lato, maskable] of [
  ["icona-192.png", 192, false],
  ["icona-512.png", 512, false],
  ["icona-maskable-512.png", 512, true],
]) {
  const pagina = await browser.newPage({ viewport: { width: lato, height: lato } });
  await pagina.setContent(
    `<html><body style="margin:0;background:transparent">${svg(maskable).replace("<svg ", `<svg width="${lato}" height="${lato}" `)}</body></html>`,
  );
  await pagina.screenshot({ path: `public/icone/${nome}`, omitBackground: true });
  await pagina.close();
}
await browser.close();
console.log("Icone generate in public/icone/");
