import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Funzioni comuni delle prove end-to-end contro il finto Home Assistant. */

export const HA = "http://localhost:18123";

export async function comando(request: APIRequestContext, percorso: string, corpo?: unknown): Promise<void> {
  const r = await request.post(`${HA}/__prova/${percorso}`, corpo === undefined ? {} : { data: corpo });
  expect(r.ok()).toBeTruthy();
}

export interface RichiestaAssistente {
  testo: string;
  conversation_id: string | null;
  start_stage: string;
  end_stage: string;
  timeout: number;
}

export async function info(request: APIRequestContext): Promise<{
  login: number;
  rinnovi: number;
  connessioni: number;
  richieste: Record<string, number>;
  chiamate: { servizio: string; dati: Record<string, unknown> }[];
  richiesteAssistente: RichiestaAssistente[];
  audioVoce: { pipeline: number; byte: number; fine: boolean; sampleRate: number }[];
  richiesteTts: string[];
  disiscrizioniPipeline: number;
  pipelineAperte: number;
}> {
  return (await request.get(`${HA}/__prova/info`)).json();
}

export const pallino = (page: Page) => page.getByTestId("pallino");
export const stanza = (page: Page, nome: string) => page.getByTestId("stanza").filter({ hasText: nome });

/** Primo accesso: schermata "Collega", login OAuth, pannello connesso. */
export async function accedi(page: Page): Promise<void> {
  await page.goto("./index.html");
  await expect(page.getByTestId("accesso")).toBeVisible();
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(pallino(page)).toHaveAttribute("data-stato", "connesso");
}

/** Aspetta che il service worker controlli la pagina (app in cache). */
export async function aspettaServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active !== null && navigator.serviceWorker.controller !== null;
  });
}

export async function apriDiagnostica(page: Page): Promise<void> {
  const ora = page.getByTestId("ora");
  const box = await ora.boundingBox();
  if (!box) throw new Error("orologio non visibile");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  await expect(page.getByTestId("diagnostica")).toBeVisible();
}

/** Apre la chat dalla barra "Chiedi a Jarvis…". */
export async function apriChat(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Chiedi a Jarvis…" }).click();
  await expect(page.getByRole("textbox", { name: "Domanda per Jarvis" })).toBeVisible();
}

/** Scrive una domanda nella chat e la manda con Invio. */
export async function chiedi(page: Page, testo: string): Promise<void> {
  const campo = page.getByRole("textbox", { name: "Domanda per Jarvis" });
  await campo.fill(testo);
  await campo.press("Enter");
}
