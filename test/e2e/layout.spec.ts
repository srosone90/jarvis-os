import { expect, test, type Page } from "@playwright/test";
import { accedi, apriChat, apriImpostazioni, chiedi, comando, fotocameraAccesa } from "./aiuti";

/**
 * Regola: MAI sovrapposizioni, a nessuna misura da 320 px di larghezza in su.
 * Il tablet a muro (orizzontale) ha la schermata unica senza scorrere; sui
 * telefoni la pagina scorre. Per ogni misura, con la TV del salotto accesa (il
 * caso più alto) e poi anche offline:
 *  - nessun riquadro principale che si interseca con un altro;
 *  - ogni card dentro la sua stanza, e nessuna card sopra un'altra;
 *  - nessun testo tagliato né parola spezzata a metà («Scaldabagn|o»);
 *  - niente scorrimento orizzontale;
 *  - sul tablet: niente scorrimento verticale e tutto dentro lo schermo.
 * Gli screenshot finiscono in schermate/layout/ (ignorata da Git).
 */
const MISURE = [
  { nome: "tablet-1024x600", width: 1024, height: 600, unica: true },
  { nome: "telefono-orizzontale-915x412", width: 915, height: 412, unica: false },
  { nome: "telefono-in-chrome-915x330", width: 915, height: 330, unica: false },
  { nome: "telefono-verticale-412x915", width: 412, height: 915, unica: false },
  { nome: "telefono-verticale-360x740", width: 360, height: 740, unica: false },
  { nome: "minimo-320x640", width: 320, height: 640, unica: false },
];

interface Rettangolo {
  nome: string;
  x: number;
  y: number;
  r: number;
  b: number;
}

interface Misura {
  principali: Rettangolo[];
  stanze: { stanza: Rettangolo; card: Rettangolo[] }[];
  tagliati: string[];
  spezzate: string[];
  larghezzaPagina: number;
  altezzaPagina: number;
}

/** Misura dentro gli shadow DOM di Lit, con le coordinate della pagina intera. */
function misura(page: Page): Promise<Misura> {
  return page.evaluate(() => {
    const app = document.querySelector("jarvis-app")?.shadowRoot;
    if (!app) throw new Error("jarvis-app mancante");
    const ret = (nome: string, e: Element) => {
      const b = e.getBoundingClientRect();
      return { nome, x: b.left + scrollX, y: b.top + scrollY, r: b.right + scrollX, b: b.bottom + scrollY };
    };
    const visibile = (e: Element) => {
      const b = e.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== "hidden";
    };
    const nomeStanza = (s: Element) => s.shadowRoot?.querySelector("h2")?.textContent ?? "?";
    const principali = [
      ...app.querySelectorAll(
        ".stato jarvis-connessione, .info > *, [data-test=zona-scene], .barra .chiedi, .barra .mic, .barra .posto-banner, .barra jarvis-mini-lettore, jarvis-stanza",
      ),
    ]
      .filter(visibile)
      .map((e) =>
        ret(e.localName === "jarvis-stanza" ? `stanza ${nomeStanza(e)}` : e.className || e.localName, e),
      );
    const stanze = [...app.querySelectorAll("jarvis-stanza")].map((s) => ({
      stanza: ret(nomeStanza(s), s),
      card: [...(s.shadowRoot?.querySelectorAll(".carte > *") ?? [])]
        .filter(visibile)
        .map((c) => ret(c.localName, c)),
    }));
    const tagliati: string[] = [];
    const guarda = (radice: Document | ShadowRoot) => {
      for (const e of radice.querySelectorAll("*")) {
        if (!(e instanceof HTMLElement) || !visibile(e)) continue;
        const cs = getComputedStyle(e);
        const ritaglia =
          cs.overflowX !== "visible" || cs.textOverflow === "ellipsis" || e.localName === "button";
        if (ritaglia && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1)
          tagliati.push(`${e.localName}.${e.className}: «${e.textContent?.trim().slice(0, 40)}»`);
        if (e.shadowRoot) guarda(e.shadowRoot);
      }
    };
    guarda(document);
    // una parola che occupa più di una riga è stata spezzata a metà
    const spezzate: string[] = [];
    const parole = (radice: Document | ShadowRoot) => {
      const giro = document.createTreeWalker(radice, NodeFilter.SHOW_TEXT);
      for (let n = giro.nextNode(); n; n = giro.nextNode()) {
        const testo = n.textContent ?? "";
        const genitore = n.parentElement;
        if (!genitore || !visibile(genitore)) continue;
        for (const m of testo.matchAll(/\S+/g)) {
          const r = document.createRange();
          r.setStart(n, m.index);
          r.setEnd(n, m.index + m[0].length);
          const righe = new Set(
            [...r.getClientRects()].filter((c) => c.width > 0).map((c) => Math.round(c.top)),
          );
          if (righe.size > 1) spezzate.push(`«${m[0]}» in ${genitore.localName}.${genitore.className}`);
        }
      }
      for (const e of radice.querySelectorAll("*")) if (e.shadowRoot) parole(e.shadowRoot);
    };
    parole(document);
    return {
      principali,
      stanze,
      tagliati,
      spezzate,
      larghezzaPagina: document.documentElement.scrollWidth,
      altezzaPagina: document.documentElement.scrollHeight,
    };
  });
}

const siIntersecano = (a: Rettangolo, b: Rettangolo) =>
  a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5;
const dentro = (a: Rettangolo, c: Rettangolo) =>
  a.x >= c.x - 0.5 && a.r <= c.r + 0.5 && a.y >= c.y - 0.5 && a.b <= c.b + 0.5;

/** Tutte le coppie (a, b) di elementi diversi, senza ripetizioni. */
function coppie<T>(elenco: readonly T[]): [T, T][] {
  return elenco.flatMap((a, i) => elenco.slice(i + 1).map((b): [T, T] => [a, b]));
}

function controlla(m: Misura, larghezza: number, altezza: number, unica: boolean): string[] {
  const problemi: string[] = [];
  const p = m.principali;
  for (const [a, b] of coppie(p))
    if (siIntersecano(a, b)) problemi.push(`sovrapposti: ${a.nome} ↔ ${b.nome}`);
  for (const { stanza, card } of m.stanze) {
    for (const c of card) if (!dentro(c, stanza)) problemi.push(`${c.nome} esce dalla stanza ${stanza.nome}`);
    for (const [a, b] of coppie(card))
      if (siIntersecano(a, b)) problemi.push(`card sovrapposte in ${stanza.nome}: ${a.nome} ↔ ${b.nome}`);
  }
  const tutti = [...p, ...m.stanze.flatMap((s) => s.card)];
  for (const r of tutti) {
    if (r.x < -0.5 || r.r > larghezza + 0.5) problemi.push(`${r.nome} esce dallo schermo in larghezza`);
    if (unica && r.b > altezza + 0.5)
      problemi.push(`${r.nome} esce dallo schermo in basso (${Math.round(r.b)} > ${altezza})`);
  }
  problemi.push(...m.tagliati.map((t) => `testo tagliato: ${t}`));
  problemi.push(...m.spezzate.map((t) => `parola spezzata: ${t}`));
  if (m.larghezzaPagina > larghezza)
    problemi.push(`scorrimento orizzontale: ${m.larghezzaPagina} > ${larghezza}`);
  if (unica && m.altezzaPagina > altezza) problemi.push(`la pagina scorre: ${m.altezzaPagina} > ${altezza}`);
  return problemi;
}

test.beforeEach(async ({ request }) => {
  await comando(request, "reset");
});

for (const v of MISURE) {
  test(`layout ${v.nome}: niente sovrapposizioni né testi tagliati, anche offline`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    await accedi(page);
    // caso più alto: TV del salotto accesa, con la riga del volume
    await page.getByTestId("card-media").locator("button.principale").click();
    await expect(page.getByRole("button", { name: "Volume su" })).toBeVisible();
    await page.screenshot({ path: `schermate/layout/${v.nome}.png`, fullPage: true });
    expect(controlla(await misura(page), v.width, v.height, v.unica), "in linea").toEqual([]);

    await comando(request, "spegni");
    await expect(page.getByTestId("banner")).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `schermate/layout/${v.nome}-offline.png`, fullPage: true });
    expect(controlla(await misura(page), v.width, v.height, v.unica), "offline").toEqual([]);
  });
}

/** Rettangoli della chat e delle sue parti, con le coordinate della pagina. */
function misuraChat(page: Page) {
  return page.evaluate(() => {
    const app = document.querySelector("jarvis-app")?.shadowRoot;
    const chat = app?.querySelector("jarvis-chat");
    const dentro = chat?.shadowRoot;
    if (!app || !chat || !dentro) throw new Error("chat mancante");
    const ret = (nome: string, e: Element) => {
      const b = e.getBoundingClientRect();
      return { nome, x: b.left + scrollX, y: b.top + scrollY, r: b.right + scrollX, b: b.bottom + scrollY };
    };
    const uno = (sel: string) => {
      const e = dentro.querySelector(sel);
      if (!e) throw new Error(`${sel} mancante`);
      return ret(sel, e);
    };
    const esterni = [
      ...app.querySelectorAll(".info, [data-test=zona-scene], .stato jarvis-connessione, .barra"),
    ]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => ret(e.className || e.localName, e));
    return {
      chat: ret("chat", chat),
      parti: [uno(".testa"), uno(".messaggi"), uno("form")],
      campo: uno("input"),
      invia: uno(".invia"),
      contenuti: [...dentro.querySelectorAll(".messaggi > *")].map((e) => ret(e.className, e)),
      esterni,
      stanze: app.querySelectorAll("jarvis-stanza").length,
    };
  });
}

/** Tastiera virtuale simulata: visualViewport più basso, come quando Android la apre. */
async function apriTastiera(page: Page, altezza: number): Promise<void> {
  await page.evaluate((h) => {
    const vv = window.visualViewport;
    if (!vv) throw new Error("visualViewport mancante");
    Object.defineProperty(vv, "height", { get: () => h, configurable: true });
    vv.dispatchEvent(new Event("resize"));
  }, altezza);
}

for (const v of MISURE) {
  test(`layout ${v.nome} con la chat aperta: conversazione lunga, tastiera, niente sovrapposizioni`, async ({
    page,
    request,
  }) => {
    await comando(request, "stato", { entity_id: "media_player.soggiorno_tv_salotto", state: "on" });
    await page.setViewportSize({ width: v.width, height: v.height });
    await accedi(page);
    await apriChat(page);
    await comando(request, "assistente?modo=azione");
    await chiedi(page, "Spegni la TV del salotto");
    await expect(page.getByTestId("stato-assistente")).toHaveText("Gemini");
    await comando(request, "assistente?modo=lunga");
    await chiedi(page, "Fammi un riepilogo completo di tutta la casa, stanza per stanza, per favore");
    await expect(page.getByTestId("stato-assistente")).toHaveText("Gemini");
    await expect(page.getByTestId("azione")).toHaveText("TV Salotto · spenta");
    await page.screenshot({ path: `schermate/layout/chat-${v.nome}.png` });

    const problemi: string[] = [];
    const m = await misuraChat(page);
    const schermo = { nome: "schermo", x: 0, y: 0, r: v.width, b: v.height };
    if (!dentro(m.chat, schermo)) problemi.push("la chat esce dallo schermo");
    for (const [a, b] of coppie(m.parti))
      if (siIntersecano(a, b)) problemi.push(`chat: ${a.nome} ↔ ${b.nome}`);
    const elenco = m.parti[1];
    for (const c of m.contenuti)
      if (elenco && (c.x < elenco.x - 0.5 || c.r > elenco.r + 0.5))
        problemi.push(`${c.nome} esce dall'elenco`);
    for (const e of m.esterni) if (siIntersecano(e, m.chat)) problemi.push(`chat sopra ${e.nome}`);
    if (v.unica && m.stanze !== 0) problemi.push("sul tablet la chat deve prendere il posto delle stanze");
    const g = await misura(page);
    problemi.push(...g.tagliati.map((t) => `testo tagliato: ${t}`));
    problemi.push(...g.spezzate.map((t) => `parola spezzata: ${t}`));
    if (g.larghezzaPagina > v.width) problemi.push(`scorrimento orizzontale: ${g.larghezzaPagina}`);
    expect(problemi, "chat aperta").toEqual([]);

    // tastiera aperta: il campo e il pulsante restano sopra, il resto della pagina non salta
    const altezzaVisibile = Math.round(v.height * 0.55);
    await apriTastiera(page, altezzaVisibile);
    await expect
      .poll(async () => (await misuraChat(page)).campo.b, { message: "campo sopra la tastiera" })
      .toBeLessThanOrEqual(altezzaVisibile);
    const t = await misuraChat(page);
    expect(t.invia.b).toBeLessThanOrEqual(altezzaVisibile);
    expect(t.chat.x).toBe(m.chat.x);
    expect(t.chat.y).toBe(m.chat.y);
    for (const [a, b] of coppie(t.parti)) expect(siIntersecano(a, b), `${a.nome} ↔ ${b.nome}`).toBe(false);
    await page.screenshot({ path: `schermate/layout/chat-${v.nome}-tastiera.png` });
  });
}

/** Rettangolo di un elemento dentro gli shadow DOM (percorso di selettori, uno per livello). */
function rettangolo(page: Page, percorso: string[]) {
  return page.evaluate((p) => {
    let radice: Document | ShadowRoot | null | undefined = document;
    let e: Element | null | undefined = null;
    for (const [i, sel] of p.entries()) {
      e = radice?.querySelector(sel);
      if (!e) return null;
      if (i < p.length - 1) radice = e.shadowRoot;
    }
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { nome: p.join(" › "), x: b.left, y: b.top, r: b.right, b: b.bottom };
  }, percorso);
}

for (const v of MISURE) {
  test(`layout ${v.nome} con la voce: riquadro con risposta lunga e barra della voce nella chat`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    await comando(request, "assistente?modo=lunga");
    await accedi(page);
    const schermo = { nome: "schermo", x: 0, y: 0, r: v.width, b: v.height };

    // 1. riquadro piccolo (chat chiusa)
    await page.getByRole("button", { name: "Parla con Jarvis" }).click();
    const riquadro = page.getByTestId("riquadro-voce");
    await expect(riquadro.getByTestId("risposta")).toContainText("si riaccenderà alle 04:30.");
    await page.screenshot({ path: `schermate/layout/voce-riquadro-${v.nome}.png` });
    const r = await rettangolo(page, ["jarvis-app", "jarvis-voce-riquadro"]);
    const barra = await rettangolo(page, ["jarvis-app", ".barra"]);
    const problemi: string[] = [];
    if (!r) problemi.push("riquadro non trovato");
    else {
      if (!dentro(r, schermo)) problemi.push("il riquadro esce dallo schermo");
      // sul tablet la barra è sempre in vista: il riquadro non la copre mai
      if (v.unica && barra && siIntersecano(r, barra)) problemi.push("il riquadro copre la barra");
    }
    const g = await misura(page);
    problemi.push(...g.tagliati.map((t) => `testo tagliato: ${t}`));
    problemi.push(...g.spezzate.map((t) => `parola spezzata: ${t}`));
    if (g.larghezzaPagina > v.width) problemi.push(`scorrimento orizzontale: ${g.larghezzaPagina}`);
    expect(problemi, "riquadro").toEqual([]);
    await riquadro.getByRole("button", { name: "Chiudi il riquadro" }).click();
    await expect(riquadro).toHaveCount(0);

    // 2. barra della voce nella chat, durante l'ascolto
    await comando(request, "assistente?stt=manuale");
    await apriChat(page);
    await page.getByRole("button", { name: "Parla", exact: true }).click();
    await expect(page.getByTestId("voce-stato")).toContainText("Ti ascolto…");
    await page.screenshot({ path: `schermate/layout/voce-chat-${v.nome}.png` });
    const parti = await Promise.all([
      rettangolo(page, ["jarvis-app", "jarvis-chat", ".testa"]),
      rettangolo(page, ["jarvis-app", "jarvis-chat", ".messaggi"]),
      rettangolo(page, ["jarvis-app", "jarvis-chat", "jarvis-voce"]),
    ]);
    const presenti = parti.filter((p): p is NonNullable<typeof p> => p !== null);
    expect(presenti).toHaveLength(3);
    const q: string[] = [];
    for (const [a, b] of coppie(presenti)) if (siIntersecano(a, b)) q.push(`${a.nome} ↔ ${b.nome}`);
    for (const p of presenti) if (!dentro(p, schermo)) q.push(`${p.nome} esce dallo schermo`);
    const g2 = await misura(page);
    q.push(...g2.tagliati.map((t) => `testo tagliato: ${t}`));
    q.push(...g2.spezzate.map((t) => `parola spezzata: ${t}`));
    expect(q, "barra della voce").toEqual([]);
    await page.getByRole("button", { name: "Ferma l'ascolto" }).click();
  });
}

/** Tre timer (uno col nome lungo, uno senza nome) e poi "Timer … finito", a ogni misura. */
for (const v of MISURE) {
  test(`layout ${v.nome} con i timer: conto alla rovescia sotto l'orologio e "Timer finito"`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    await accedi(page);
    await page.getByTestId("card-media").locator("button.principale").click();
    await expect(page.getByRole("button", { name: "Volume su" })).toBeVisible();
    const timer = [
      { id: "t1", nome: "pasta", secondi_totali: 600, secondi_rimasti: 540 },
      { id: "t2", nome: "uova sode per l'insalata di stasera", secondi_totali: 5400, secondi_rimasti: 3725 },
      { id: "t3", nome: null, secondi_totali: 90, secondi_rimasti: 45 },
      { id: "t4", nome: "pane", secondi_totali: 3600, secondi_rimasti: 3000 },
      { id: "t5", nome: "bucato", secondi_totali: 7200, secondi_rimasti: 7000 },
    ];
    for (const t of timer) await comando(request, "timer", { tipo: "started", ...t });
    // sul tablet la colonna non scorre: due timer più "+3"; altrove tutti e cinque
    await expect(page.getByTestId("timer")).toHaveCount(v.unica ? 2 : 5);
    if (v.unica) await expect(page.getByTestId("timer-altri")).toHaveText("+3");
    await page.screenshot({ path: `schermate/layout/timer-${v.nome}.png`, fullPage: true });
    expect(controlla(await misura(page), v.width, v.height, v.unica), "timer attivi").toEqual([]);

    await comando(request, "timer", { tipo: "finished", ...timer[0], secondi_rimasti: 0 });
    await comando(request, "timer", { tipo: "finished", ...timer[1], secondi_rimasti: 0 });
    const overlay = page.getByTestId("timer-finito");
    await expect(overlay).toContainText("Timer pasta finito");
    await page.screenshot({ path: `schermate/layout/timer-finito-${v.nome}.png` });
    const schermo = { nome: "schermo", x: 0, y: 0, r: v.width, b: v.height };
    const stop = await rettangolo(page, ["jarvis-app", "jarvis-timer-finito", "button"]);
    const titolo = await rettangolo(page, ["jarvis-app", "jarvis-timer-finito", "h2"]);
    const q: string[] = [];
    if (!stop || !dentro(stop, schermo)) q.push("Stop fuori dallo schermo");
    if (!titolo || !dentro(titolo, schermo)) q.push("titolo fuori dallo schermo");
    if (stop && titolo && siIntersecano(stop, titolo)) q.push("Stop sopra il titolo");
    const g = await misura(page);
    q.push(...g.tagliati.map((t) => `testo tagliato: ${t}`));
    q.push(...g.spezzate.map((t) => `parola spezzata: ${t}`));
    expect(q, "timer finito").toEqual([]);
    await page.getByTestId("timer-stop").click();
    await expect(overlay).toHaveCount(0);
  });
}

// --- fase G (v0.4.8): riposo, Hub, impostazioni, guida a tutte le misure ---

/** Problemi comuni: testi tagliati, parole spezzate, scorrimento orizzontale. */
async function problemiTesto(page: Page, larghezza: number): Promise<string[]> {
  const g = await misura(page);
  const q = [
    ...g.tagliati.map((t) => `testo tagliato: ${t}`),
    ...g.spezzate.map((t) => `parola spezzata: ${t}`),
  ];
  if (g.larghezzaPagina > larghezza) q.push(`scorrimento orizzontale: ${g.larghezzaPagina}`);
  return q;
}

/** Rettangoli dentro lo schermo e senza sovrapposizioni tra loro. */
async function controllaParti(page: Page, v: { width: number; height: number }, percorsi: string[][]) {
  const schermo = { nome: "schermo", x: 0, y: 0, r: v.width, b: v.height };
  const parti = (await Promise.all(percorsi.map((p) => rettangolo(page, p)))).filter(
    (p): p is NonNullable<typeof p> => p !== null && p.r - p.x > 0,
  );
  const q: string[] = [];
  if (parti.length !== percorsi.length) q.push(`parti mancanti: ${parti.length} di ${percorsi.length}`);
  for (const p of parti) if (!dentro(p, schermo)) q.push(`${p.nome} esce dallo schermo`);
  for (const [a, b] of coppie(parti)) if (siIntersecano(a, b)) q.push(`${a.nome} ↔ ${b.nome}`);
  return q;
}

for (const v of MISURE) {
  test(`layout ${v.nome} fase G: riposo (giorno e notte), Hub, impostazioni, guida`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    await page.addInitScript(() =>
      localStorage.setItem("jarvis-riposo", JSON.stringify({ attesaMin: 2, notteDa: 0, notteA: 0 })),
    );
    await comando(request, "musica", {
      stato: "in_riproduzione",
      stanza: "Cucina",
      volume: 40,
      titolo: "Bohemian Rhapsody",
    });
    await accedi(page);
    for (const t of [
      { id: "t1", nome: "pasta", secondi_totali: 600, secondi_rimasti: 540 },
      { id: "t2", nome: "uova sode per l'insalata di stasera", secondi_totali: 5400, secondi_rimasti: 3725 },
      { id: "t3", nome: null, secondi_totali: 90, secondi_rimasti: 45, in_pausa: true },
    ])
      await comando(request, "timer", { tipo: "started", ...t });

    // 1. riposo di giorno, con timer, musica e un annuncio non detto (ora del silenzio, v0.5.4)
    await comando(request, "stato", { entity_id: "binary_sensor.jarvis_annunci_in_silenzio", state: "on" });
    await page.getByTestId("ora").click({ delay: 3300 });
    await page.getByTestId("sezione-riposo").click();
    await page.getByTestId("prova-riposo").click();
    await comando(request, "annuncio", {
      pannello: "jarvis_pannello",
      testo: "In camera da letto ci sono 28 gradi: se vuoi accendo il condizionatore prima di dormire.",
    });
    await expect(page.getByTestId("riposo-annuncio")).toBeVisible();
    await expect(page.getByTestId("riposo-musica")).toContainText("Bohemian Rhapsody");
    await expect(page.getByTestId("riposo-timer")).toHaveCount(3);
    await page.screenshot({ path: `schermate/layout/riposo-${v.nome}.png` });
    const r = ["jarvis-app", "jarvis-riposo"];
    expect(
      [
        ...(await controllaParti(page, v, [
          [...r, "jarvis-sfera"],
          [...r, ".testo"],
        ])),
        ...(await problemiTesto(page, v.width)),
      ],
      "riposo",
    ).toEqual([]);

    // 2. timer finito sopra il riposo
    await comando(request, "timer", { tipo: "finished", id: "t1", nome: "pasta", secondi_totali: 600 });
    await expect(page.getByTestId("timer-finito")).toBeVisible();
    await page.screenshot({ path: `schermate/layout/riposo-timer-finito-${v.nome}.png` });
    expect(
      await controllaParti(page, v, [
        ["jarvis-app", "jarvis-timer-finito", "h2"],
        ["jarvis-app", "jarvis-timer-finito", "button"],
      ]),
      "timer finito",
    ).toEqual([]);
    await page.getByTestId("timer-stop").click();

    // 3. Hub con la risposta
    await page.getByTestId("riposo-sfera").click();
    await expect(page.getByTestId("hub-risposta")).toBeVisible();
    await page.screenshot({ path: `schermate/layout/hub-${v.nome}.png` });
    const h = ["jarvis-app", "jarvis-hub"];
    expect(
      [
        ...(await controllaParti(page, v, [
          [...h, ".angolo"],
          [...h, "jarvis-timer"],
          [...h, "button.griglia"],
          [...h, "jarvis-sfera"],
          [...h, ".sott"],
        ])),
        ...(await problemiTesto(page, v.width)),
      ],
      "hub",
    ).toEqual([]);
    await page.getByTestId("hub-completo").click();

    // 4. impostazioni, sezione per sezione
    for (const s of [
      "stanza",
      "schermate",
      "musica",
      "voce",
      "annunci",
      "riposo",
      "audio",
      "copia",
      "fotocamera",
      "diagnostica",
    ]) {
      if (s === "stanza") await page.getByTestId("ora").click({ delay: 3300 });
      await page.getByTestId(`sezione-${s}`).click();
      await page.screenshot({ path: `schermate/layout/impostazioni-${s}-${v.nome}.png` });
      expect(
        [
          ...(await controllaParti(page, v, [
            ["jarvis-app", "jarvis-impostazioni", "header"],
            ["jarvis-app", "jarvis-impostazioni", "nav"],
            ["jarvis-app", "jarvis-impostazioni", "main"],
          ])),
          ...(await problemiTesto(page, v.width)),
        ],
        `impostazioni ${s}`,
      ).toEqual([]);
    }
    // 5. guida (rifatta dalle impostazioni)
    await page.getByTestId("sezione-stanza").click();
    await page.getByTestId("rifai-guida").click();
    await expect(page.getByTestId("guida")).toBeVisible();
    await page.screenshot({ path: `schermate/layout/guida-${v.nome}.png`, fullPage: true });
    expect(await problemiTesto(page, v.width), "guida").toEqual([]);
  });
}

test("layout riposo di notte (tablet e telefono verticale)", async ({ page, request }) => {
  await page.addInitScript(() => {
    const h = new Date().getHours();
    localStorage.setItem("jarvis-riposo", JSON.stringify({ attesaMin: 2, notteDa: h, notteA: (h + 1) % 24 }));
  });
  await accedi(page);
  await comando(request, "timer", {
    tipo: "started",
    id: "t1",
    nome: "pasta",
    secondi_totali: 600,
    secondi_rimasti: 540,
  });
  for (const v of [MISURE[0], MISURE[4]]) {
    if (!v) continue;
    await page.setViewportSize({ width: v.width, height: v.height });
    await page.getByTestId("ora").click({ delay: 3300 });
    await page.getByTestId("sezione-riposo").click();
    await page.getByTestId("prova-riposo").click();
    await expect(page.getByTestId("riposo")).toHaveAttribute("data-momento", "notte");
    await page.screenshot({ path: `schermate/layout/riposo-notte-${v.nome}.png` });
    expect(await problemiTesto(page, v.width), `notte ${v.nome}`).toEqual([]);
    await page.getByTestId("riposo-ora").click();
  }
});

// --- v0.5.0: «Jarvis» sempre in ascolto, indicatore del microfono a tutte le misure ---

for (const v of MISURE) {
  test(`layout ${v.nome} «Jarvis»: indicatore nel pannello, a riposo, nell'Hub; sezione Voce`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    // v0.5.2: la domanda è una frase intera (il contesto prima di «Jarvis»): l'Hub non la taglia
    await comando(
      request,
      `assistente?trascrizione=${encodeURIComponent("C'è un po' di freddo in questa stanza, cosa ne pensi, Jarvis? Secondo te accendo il condizionatore o metto un maglione?")}`,
    );
    await page.addInitScript(() => {
      localStorage.setItem("jarvis-parola", JSON.stringify({ acceso: true }));
      localStorage.setItem("jarvis-riposo", JSON.stringify({ attesaMin: 2, notteDa: 0, notteA: 0 }));
    });
    await accedi(page);
    const indicatore = page.getByTestId("indicatore-parola");
    await expect(indicatore.first()).toHaveAttribute("data-stato", "ascolta", { timeout: 30_000 });

    // 1. pannello completo: il pallino con l'indicatore resta nello schermo e non copre niente
    await page.screenshot({ path: `schermate/layout/parola-pannello-${v.nome}.png` });
    const pallino = ["jarvis-app", "jarvis-connessione", ".pallino"];
    expect(
      [
        ...(await controllaParti(page, v, [pallino, ["jarvis-app", "jarvis-orologio"]])),
        ...(await problemiTesto(page, v.width)),
      ],
      "pannello",
    ).toEqual([]);

    // 2. riposo: l'indicatore nell'angolo, fuori dalla sfera e dal testo
    await page.getByTestId("ora").click({ delay: 3300 });
    await page.getByTestId("sezione-riposo").click();
    await page.getByTestId("prova-riposo").click();
    await expect(page.getByTestId("riposo")).toBeVisible();
    await page.screenshot({ path: `schermate/layout/parola-riposo-${v.nome}.png` });
    const r = ["jarvis-app", "jarvis-riposo"];
    expect(
      await controllaParti(page, v, [
        [...r, "jarvis-indicatore-parola"],
        [...r, "jarvis-sfera"],
        [...r, ".testo"],
      ]),
      "riposo",
    ).toEqual([]);

    // 3. Hub: l'indicatore sta nell'angolo con ora, stanza e pallino
    await page.getByTestId("riposo-sfera").click();
    await expect(page.getByTestId("hub-risposta")).toBeVisible();
    await page.screenshot({ path: `schermate/layout/parola-hub-${v.nome}.png` });
    const h = ["jarvis-app", "jarvis-hub"];
    expect(
      [
        ...(await controllaParti(page, v, [
          [...h, ".angolo"],
          [...h, "button.griglia"],
          [...h, "jarvis-sfera"],
          [...h, ".sott"],
        ])),
        ...(await problemiTesto(page, v.width)),
      ],
      "hub",
    ).toEqual([]);
    await page.getByTestId("hub-completo").click();

    // 4. Impostazioni → Voce, con le misure e la pronuncia
    await page.getByTestId("ora").click({ delay: 3300 });
    await page.getByTestId("sezione-voce").click();
    await expect(page.getByTestId("misure-parola")).toBeVisible();
    await page.screenshot({ path: `schermate/layout/impostazioni-voce-${v.nome}.png`, fullPage: true });
    expect(
      [
        ...(await controllaParti(page, v, [
          ["jarvis-app", "jarvis-impostazioni", "header"],
          ["jarvis-app", "jarvis-impostazioni", "nav"],
          ["jarvis-app", "jarvis-impostazioni", "main"],
        ])),
        ...(await problemiTesto(page, v.width)),
      ],
      "impostazioni voce",
    ).toEqual([]);
  });
}

// --- v0.5.5: navigazione N2, Meteo, Stanza a tutte le misure ---
for (const v of MISURE) {
  test(`layout ${v.nome} v0.5.5: colonna, Meteo, Stanza, impostazioni Schermate`, async ({ page }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    await accedi(page);
    const colonna = ["jarvis-app", "jarvis-colonna"];
    // casa con la colonna: la colonna non copre niente
    await page.screenshot({ path: `schermate/layout/casa-colonna-${v.nome}.png` });
    expect(
      [
        // negli altri modi la pagina scorre: la barra sta in fondo, anche sotto lo schermo
        ...(await controllaParti(page, v, v.unica ? [colonna, ["jarvis-app", ".barra"]] : [colonna])),
        ...(await problemiTesto(page, v.width)),
      ],
      "casa",
    ).toEqual([]);
    // Meteo
    await page.getByTestId("colonna-meteo").click();
    await expect(page.getByTestId("meteo-ora").first()).toBeVisible();
    await page.screenshot({ path: `schermate/layout/meteo-${v.nome}.png`, fullPage: true });
    expect(
      [
        ...(await controllaParti(page, v, v.unica ? [colonna, ["jarvis-app", ".pagina"]] : [colonna])),
        ...(await problemiTesto(page, v.width)),
      ],
      "meteo",
    ).toEqual([]);
    // Stanza
    await page.getByTestId("colonna-casa").click();
    await page.getByTestId("apri-stanza").filter({ hasText: "Camera da letto" }).click();
    await expect(page.getByTestId("grafico-stanza")).toBeVisible();
    await page.screenshot({ path: `schermate/layout/stanza-${v.nome}.png`, fullPage: true });
    expect(
      [
        ...(await controllaParti(page, v, v.unica ? [colonna, ["jarvis-app", ".pagina"]] : [colonna])),
        ...(await problemiTesto(page, v.width)),
      ],
      "stanza",
    ).toEqual([]);
  });
}

// --- v0.5.6: Musica e mini-lettore a tutte le misure ---
const copertinaProva =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#7a3"/></svg>',
  );
for (const v of MISURE) {
  test(`layout ${v.nome} v0.5.6: Musica, mini-lettore sotto l'orologio e nella barra`, async ({
    page,
    request,
  }) => {
    await comando(request, "musica", {
      stato: "in_riproduzione",
      // titolo lungo vero di Spotify, più artisti: nel mini va a capo, mai tagliato
      titolo: "Under Pressure - Remastered 2011, from the album Hot Space",
      artisti: "Queen, David Bowie",
      dispositivo: "Echo Dot della camera da letto",
      stanza: "Camera da letto",
      volume: 35,
      copertina: copertinaProva,
      posizione_ms: 61_000,
      durata_ms: 354_000,
      playlist: [
        {
          nome: "Rock classico",
          uri: "spotify:playlist:1",
          copertina: copertinaProva,
          proprietario: "Salvatore",
        },
        {
          nome: "Una playlist dal nome molto lungo per vedere se va a capo",
          uri: "spotify:playlist:2",
          copertina: null,
          proprietario: "Spotify",
        },
        { nome: "Lo-fi", uri: "spotify:playlist:3", copertina: null, proprietario: null },
        { nome: "Jazz della sera", uri: "spotify:playlist:4", copertina: null, proprietario: "Salvatore" },
      ],
    });
    await page.setViewportSize({ width: v.width, height: v.height });
    await accedi(page);
    const colonna = ["jarvis-app", "jarvis-colonna"];
    // Casa con il mini-lettore sotto l'orologio: sul tablet tutto resta nello schermo
    await expect(page.getByTestId("mini-lettore")).toBeVisible();
    await page.screenshot({ path: `schermate/layout/musica-mini-orologio-${v.nome}.png`, fullPage: true });
    expect(controlla(await misura(page), v.width, v.height, v.unica), "mini sotto l'orologio").toEqual([]);
    // Schermata Musica
    await page.getByTestId("colonna-musica").click();
    await expect(page.getByTestId("playlist-nome").first()).toBeVisible();
    await page.screenshot({ path: `schermate/layout/musica-${v.nome}.png`, fullPage: true });
    expect(
      [
        ...(await controllaParti(page, v, v.unica ? [colonna, ["jarvis-app", ".pagina"]] : [colonna])),
        ...(await problemiTesto(page, v.width)),
      ],
      "musica",
    ).toEqual([]);
    // mini-lettore nella barra
    await page.getByTestId("colonna-casa").click();
    await apriImpostazioni(page, "schermate");
    await page.getByTestId("campo-musica-posizione").selectOption("barra");
    await page.screenshot({ path: `schermate/layout/impostazioni-musica-${v.nome}.png`, fullPage: true });
    await page.getByTestId("chiudi-impostazioni").click();
    await expect(page.getByTestId("zona-assistente").getByTestId("mini-lettore")).toBeVisible();
    await page.screenshot({ path: `schermate/layout/musica-mini-barra-${v.nome}.png`, fullPage: true });
    // il mini nella barra è tra le parti principali di `misura`: non si sovrappone a "Chiedi" né al microfono
    expect(controlla(await misura(page), v.width, v.height, v.unica), "mini nella barra").toEqual([]);
  });
}

// --- v0.5.7: Timer, Clima, Scene, Spesa, Avvisi, Altro a tutte le misure ---
const SCHERMATE_V057 = [
  { id: "timer", attesa: "timer-attivo" },
  { id: "clima", attesa: "clima-legenda" },
  { id: "scene", attesa: "scena" },
  { id: "spesa", attesa: "spesa-voce" },
  { id: "avvisi", attesa: "avviso-dispositivo" },
  { id: "altro", attesa: "altro-griglia" },
] as const;
for (const v of MISURE) {
  test(`layout ${v.nome} v0.5.7: Timer, Clima, Scene, Spesa, Avvisi, Altro`, async ({ page, request }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    // casi lunghi: nome del timer, voci della spesa, molte voci
    await comando(request, "timer", {
      tipo: "started",
      id: "t-lungo",
      nome: "lasagne al forno per la cena di domenica",
      secondi_totali: 5400,
      secondi_rimasti: 5300,
    });
    await comando(request, "spesa", {
      items: [
        "latte",
        "pane",
        "detersivo per i piatti al limone, quello grande",
        "pasta",
        "uova",
        "caffè",
        "mozzarella",
        "pomodori",
        "olio extravergine",
        "carta da forno",
      ].map((summary, i) => ({ uid: `l${i}`, summary, status: i > 7 ? "completed" : "needs_action" })),
    });
    await accedi(page);
    const colonna = ["jarvis-app", "jarvis-colonna"];
    const parti = v.unica ? [colonna, ["jarvis-app", ".pagina"]] : [colonna];
    for (const s of SCHERMATE_V057) {
      if (s.id === "timer" || s.id === "altro") await page.getByTestId(`colonna-${s.id}`).click();
      else {
        await page.getByTestId("colonna-altro").click();
        await page.getByTestId(`altro-${s.id}`).click();
      }
      await expect(page.getByTestId(`pagina-${s.id}`)).toBeVisible();
      await expect(page.getByTestId(s.attesa).first()).toBeVisible();
      await page.screenshot({ path: `schermate/layout/${s.id}-${v.nome}.png`, fullPage: true });
      expect(
        [...(await controllaParti(page, v, parti)), ...(await problemiTesto(page, v.width))],
        s.id,
      ).toEqual([]);
    }
  });
}

// --- v0.5.7: la colonna con tutte le schermate dentro (il caso più lungo) ---
for (const v of MISURE) {
  test(`layout ${v.nome} v0.5.7: colonna con tutte le schermate`, async ({ page }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    const colonna = ["jarvis-app", "jarvis-colonna"];
    await accedi(page);
    await apriImpostazioni(page, "schermate");
    for (const s of ["clima", "scene", "spesa", "avvisi"])
      await page.getByTestId(`dove-${s}`).selectOption("colonna");
    await page.screenshot({ path: `schermate/layout/impostazioni-schermate-${v.nome}.png`, fullPage: true });
    expect(await problemiTesto(page, v.width), "impostazioni").toEqual([]);
    await page.getByTestId("chiudi-impostazioni").click();
    await expect(page.locator("jarvis-colonna button")).toHaveCount(10);
    await page.screenshot({ path: `schermate/layout/colonna-piena-${v.nome}.png` });
    expect(
      [...controlla(await misura(page), v.width, v.height, v.unica), ...(await problemiTesto(page, v.width))],
      "casa",
    ).toEqual([]);
    // la colonna resta nello schermo; l'Hub in fondo si raggiunge sempre
    expect(await controllaParti(page, v, [colonna]), "colonna").toEqual([]);
    await page.getByTestId("colonna-hub").click();
    await expect(page.getByTestId("vista-hub")).toBeVisible();
  });
}

// --- v0.5.8: Timer con la stanza (Pausa/Riprendi e Annulla) e scene con la conferma ---
for (const v of MISURE) {
  test(`layout ${v.nome} v0.5.8: timer in pausa con i comandi, «Tocca ancora» nella Casa`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    await page.addInitScript(() => {
      localStorage.setItem("jarvis-stanza-pannello", "Camera da letto");
      localStorage.setItem("jarvis-schermate", JSON.stringify({ sceneConferma: true }));
    });
    for (const [id, nome, pausa] of [
      ["t-1", "lasagne al forno per la cena di domenica", true],
      ["t-2", "pasta", false],
    ] as const)
      await comando(request, "timer", {
        tipo: pausa ? "updated" : "started",
        id,
        nome,
        secondi_totali: 5400,
        secondi_rimasti: 5300,
        in_pausa: pausa,
      });
    await accedi(page);
    // Casa: il primo tocco su Buonanotte (il nome più lungo) diventa «Tocca ancora»
    const buonanotte = page.getByTestId("zona-scene").getByRole("button").first();
    await buonanotte.click();
    await expect(buonanotte).toHaveText("Tocca ancora");
    await page.screenshot({ path: `schermate/layout/casa-tocca-ancora-${v.nome}.png` });
    expect(
      [...controlla(await misura(page), v.width, v.height, v.unica), ...(await problemiTesto(page, v.width))],
      "casa",
    ).toEqual([]);
    await page.getByTestId("colonna-timer").click();
    await expect(page.getByTestId("timer-riprendi")).toBeVisible();
    await expect(page.getByTestId("timer-pausa")).toBeVisible();
    await page.screenshot({ path: `schermate/layout/timer-comandi-${v.nome}.png`, fullPage: true });
    const colonna = ["jarvis-app", "jarvis-colonna"];
    const parti = v.unica ? [colonna, ["jarvis-app", ".pagina"]] : [colonna];
    expect(
      [...(await controllaParti(page, v, parti)), ...(await problemiTesto(page, v.width))],
      "timer",
    ).toEqual([]);
  });
}

// --- v0.5.9: musica dal dispositivo del pannello ---
for (const v of MISURE) {
  test(`layout ${v.nome} v0.5.9: «Dove la suono?», «suona su», Impostazioni → Musica`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    await page.addInitScript(() => localStorage.setItem("jarvis-stanza-pannello", "Camera da letto"));
    await comando(request, "musica", {
      stato: "niente",
      titolo: "",
      stanza: "",
      volume: null,
      playlist: [
        { nome: "Musica per cucinare la domenica mattina", uri: "spotify:playlist:x", copertina: null },
      ],
    });
    await comando(request, "spotify-compare", {
      dispositivi: [{ nome: "Redmi Note 13 Pro+ di Salvatore Rosone", tipo: "Smartphone" }],
      dopoMs: 0,
    });
    await accedi(page);
    await page.getByTestId("colonna-musica").click();
    await expect(page.getByTestId("musica-dispositivo")).toBeVisible();
    await page.getByTestId("playlist-riproduci").first().click();
    await expect(page.getByTestId("dove-la-suono")).toBeVisible();
    await page.screenshot({ path: `schermate/layout/dove-la-suono-${v.nome}.png` });
    const colonna = ["jarvis-app", "jarvis-colonna"];
    const parti = v.unica ? [colonna, ["jarvis-app", ".pagina"]] : [colonna];
    expect([...(await problemiTesto(page, v.width))], "dove la suono").toEqual([]);
    const riquadro = await page.getByTestId("dove-la-suono").boundingBox();
    expect(
      riquadro && riquadro.x >= 0 && riquadro.x + riquadro.width <= v.width,
      "riquadro nello schermo",
    ).toBe(true);
    await page.getByTestId("dove-annulla").click();
    // dispositivo salvato che Spotify non vede: le scritte più lunghe
    await comando(request, "musica-pannello", {
      pannello: "jarvis_camera_da_letto",
      dispositivo: "Tablet della cucina vicino al frigorifero",
    });
    await page.reload();
    await expect(page.getByTestId("musica-dispositivo")).toContainText("Su Spotify non vedo");
    // il ricaricamento ripristina lo scorrimento di prima: si misura dalla cima
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `schermate/layout/musica-suona-su-${v.nome}.png`, fullPage: true });
    expect(
      [...(await controllaParti(page, v, parti)), ...(await problemiTesto(page, v.width))],
      "musica",
    ).toEqual([]);
    await page.getByTestId("colonna-casa").click();
    await apriImpostazioni(page);
    await page.getByTestId("sezione-musica").click();
    await expect(page.getByTestId("musica-dispositivo-sparito")).toBeVisible();
    await page.screenshot({ path: `schermate/layout/impostazioni-musica-${v.nome}.png`, fullPage: true });
    expect(
      [
        ...(await controllaParti(page, v, [
          ["jarvis-app", "jarvis-impostazioni", "header"],
          ["jarvis-app", "jarvis-impostazioni", "nav"],
          ["jarvis-app", "jarvis-impostazioni", "main"],
        ])),
        ...(await problemiTesto(page, v.width)),
      ],
      "impostazioni musica",
    ).toEqual([]);
  });
}

// --- v0.5.10: esporta e importa, con la conferma di un file pieno ---
for (const v of MISURE) {
  test(`layout ${v.nome} v0.5.10: importa, cosa cambia e chiavi scartate`, async ({ page }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    await accedi(page);
    await apriImpostazioni(page, "copia");
    const impostazioni: Record<string, string> = {
      "jarvis-chiave-di-un-altro-programma-molto-lunga": "x",
      "jarvis-token": "x",
    };
    for (const k of [
      "jarvis-navigazione",
      "jarvis-schermate",
      "jarvis-meteo",
      "jarvis-storico",
      "jarvis-musica",
      "jarvis-voce",
      "jarvis-parola",
      "jarvis-microfono",
      "jarvis-annunci",
      "jarvis-riposo",
      "jarvis-audio-sveglio",
    ])
      impostazioni[k] = "{}";
    await page.getByTestId("copia-file").setInputFiles({
      name: "tutto.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ formato: "jarvis-impostazioni", versione: "0.5.10", impostazioni }),
      ),
    });
    await expect(page.getByTestId("copia-cambia").locator("li")).toHaveCount(11);
    // le impostazioni sono un livello fisso che scorre dentro: si va alla conferma e si fotografa lo schermo
    await page.getByTestId("copia-conferma").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `schermate/layout/impostazioni-copia-${v.nome}.png` });
    expect(
      [
        ...(await controllaParti(page, v, [
          ["jarvis-app", "jarvis-impostazioni", "header"],
          ["jarvis-app", "jarvis-impostazioni", "nav"],
        ])),
        ...(await problemiTesto(page, v.width)),
      ],
      "copia",
    ).toEqual([]);
  });
}

// --- v0.6.0: fotocamera accesa (spia sopra ogni schermata) e Impostazioni → Fotocamera ---
for (const v of MISURE) {
  test(`layout ${v.nome} v0.6.0: spia della fotocamera, Impostazioni → Fotocamera`, async ({ page }) => {
    await page.setViewportSize({ width: v.width, height: v.height });
    await fotocameraAccesa(page);
    await accedi(page);
    const spia = page.getByTestId("spia-fotocamera");
    await expect(spia).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `schermate/layout/casa-spia-fotocamera-${v.nome}.png` });
    const box = await spia.boundingBox();
    expect(box && box.y >= 0 && box.y + box.height <= 24 && box.width < 120, "spia piccola, in alto").toBe(
      true,
    );
    expect(
      [...controlla(await misura(page), v.width, v.height, v.unica), ...(await problemiTesto(page, v.width))],
      "casa",
    ).toEqual([]);
    await apriImpostazioni(page, "fotocamera");
    await expect(page.getByTestId("fotocamera-stato-testo")).toHaveText(/Accesa/);
    await page.screenshot({ path: `schermate/layout/impostazioni-fotocamera-${v.nome}.png` });
    expect(
      [
        ...(await controllaParti(page, v, [
          ["jarvis-app", "jarvis-impostazioni", "header"],
          ["jarvis-app", "jarvis-impostazioni", "nav"],
          ["jarvis-app", "jarvis-impostazioni", "main"],
        ])),
        ...(await problemiTesto(page, v.width)),
      ],
      "impostazioni fotocamera",
    ).toEqual([]);
    // più giù: «Jarvis» più facile da vicino e di quanto (punto 7.3 come deciso il 02/10)
    await page.getByTestId("campo-fotocamera-passo").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `schermate/layout/impostazioni-fotocamera-aiuto-${v.nome}.png` });
    expect(await problemiTesto(page, v.width), "impostazioni fotocamera, più giù").toEqual([]);
    // il valore di serie si legge giusto (1,5 m, non arrotondato a 2)
    await expect(page.getByTestId("serie-fotocamera-distanza")).toHaveText("Di serie: 1,5 metri");
    await expect(page.getByTestId("serie-fotocamera-passo")).toHaveText("Di serie: 0,05 di soglia");
  });
}
