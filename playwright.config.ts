import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

const PORTA = 18123;

/**
 * Prove end-to-end contro il finto Home Assistant (test/finto-ha/server.mjs),
 * che serve l'app COMPILATA (dist/): si prova esattamente quello che va sul
 * server, service worker compreso. Prima: `npm run build`.
 *
 * Una prova alla volta: il finto HA ha uno stato condiviso che ogni prova azzera.
 */
export default defineConfig({
  testDir: "test/e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    // guida del primo avvio (fase G) e «Jarvis» sempre in ascolto (v0.5.0) hanno le loro prove:
    // le altre partono con la guida già fatta e «Jarvis» spento (solo "tocca per parlare")
    storageState: "test/e2e/stato-iniziale.json",
    baseURL: `http://localhost:${PORTA}/local/jarvis/`,
    viewport: { width: 1024, height: 600 },
    testIdAttribute: "data-test",
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    trace: "retain-on-failure",
    // voce (F5): microfono finto di Chromium, permesso già concesso, audio della
    // risposta senza bisogno di un tocco. Il microfono di serie è un fruscio
    // bassissimo (v0.5.3): col tono continuo di Chromium il riascolto di 8 s
    // dopo ogni risposta lo prenderebbe per parlato e la conversazione non
    // finirebbe mai. HA finto conta i byte, non l'energia: le domande col tocco
    // vanno come prima. Chi vuole voce vera usa `microfonoDaFile`.
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
        `--use-file-for-fake-audio-capture=${resolve("test/dati/audio/silenzio.wav")}`,
      ],
      ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    },
  },
  webServer: {
    command: `node test/finto-ha/server.mjs`,
    env: { PORTA: String(PORTA) },
    url: `http://localhost:${PORTA}/__prova/info`,
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
