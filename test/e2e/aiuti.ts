import { resolve } from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Funzioni comuni delle prove end-to-end contro il finto Home Assistant. */

export const HA = "http://localhost:18123";

export async function comando(request: APIRequestContext, percorso: string, corpo?: unknown): Promise<void> {
  const r = await request.post(`${HA}/__prova/${percorso}`, corpo === undefined ? {} : { data: corpo });
  expect(r.ok()).toBeTruthy();
}

export interface RichiestaAssistente {
  /** device_id mandato dal pannello (v0.4.6), null se senza stanza. */
  device_id: string | null;
  testo: string;
  conversation_id: string | null;
  start_stage: string;
  end_stage: string;
  timeout: number;
  /** v0.5.0, solo domande a voce: la parola detta (se nata da «Jarvis») e no_vad. */
  wake_word_phrase?: string | null;
  no_vad?: boolean | null;
}

export async function info(request: APIRequestContext): Promise<{
  login: number;
  rinnovi: number;
  connessioni: number;
  richieste: Record<string, number>;
  chiamate: { servizio: string; dati: Record<string, unknown> }[];
  richiesteAssistente: RichiestaAssistente[];
  audioVoce: {
    pipeline: number;
    byte: number;
    byteSubito: number;
    fine: boolean;
    sampleRate: number;
    /** v0.5.3: device_id della pipeline, e se è quella del contesto (…__contesto, no_vad). */
    device_id: string | null;
    contesto: boolean;
    noVad: boolean;
    /** ms dalla richiesta al frame di fine audio. */
    msFine: number | null;
  }[];
  richiesteTts: string[];
  disiscrizioniPipeline: number;
  pipelineAperte: number;
  /** Iscrizioni a jarvis_annuncio (una per pannello collegato). */
  iscrittiAnnunci: number;
  /** Iscrizioni a jarvis_timer (una per pannello collegato). */
  iscrittiTimer: number;
  /** v0.5.7: la lista della spesa del finto HA e chi la segue (todo/item/subscribe). */
  spesa: { uid: string; summary: string; status: string }[];
  iscrittiTodo: number;
}> {
  return (await request.get(`${HA}/__prova/info`)).json();
}

/**
 * Le letture che il pannello fa da solo, a intervalli: l'elenco dei timer e,
 * dalla v0.5.6, cosa suona (il mini-lettore rilegge ogni 20 s). Non sono
 * comandi dati da qualcuno, e il loro numero dipende dal tempo.
 */
const LETTURE = new Set(["jarvis_voce.timer_attivi", "jarvis_musica.stato", "jarvis_musica.playlist"]);

/** Solo i comandi (le chiamate che cambiano qualcosa), nell'ordine in cui sono arrivati. */
export function soloComandi<T extends { servizio: string }>(chiamate: readonly T[]): T[] {
  return chiamate.filter((c) => !LETTURE.has(c.servizio));
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

/** Impostazioni (fase G): orologio tenuto premuto 3 s, poi la sezione chiesta. */
export async function apriImpostazioni(
  page: Page,
  sezione:
    "stanza" | "schermate" | "musica" | "voce" | "annunci" | "riposo" | "audio" | "diagnostica" = "stanza",
): Promise<void> {
  const ora = page.getByTestId("ora");
  const box = await ora.boundingBox();
  if (!box) throw new Error("orologio non visibile");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  await expect(page.getByTestId("impostazioni")).toBeVisible();
  await page.getByTestId(`sezione-${sezione}`).click();
}

/** La diagnostica di prima: ora è l'ultima sezione delle impostazioni. */
export async function apriDiagnostica(page: Page): Promise<void> {
  await apriImpostazioni(page, "diagnostica");
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

const ARGOMENTI = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
];
/**
 * Microfono finto di Chromium che suona un file WAV (in loop), per le prove con
 * audio vero di «Jarvis» (v0.5.1). Va in `test.use()` a livello di file.
 */
export const microfonoDaFile = (file: string) => ({
  launchOptions: {
    args: [...ARGOMENTI, `--use-file-for-fake-audio-capture=${resolve(`test/dati/audio/${file}`)}`],
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
  },
});

/** v0.5.3: la pipeline del contesto prima di «Jarvis» (device_id «…__contesto»). */
export const eContesto = (r: { device_id: string | null }): boolean =>
  r.device_id?.endsWith("__contesto") === true;
