import { expect, test, type Page } from "@playwright/test";
import { accedi, apriChat, chiedi, comando } from "./aiuti";

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
        ".stato jarvis-connessione, .info > *, [data-test=zona-scene], .barra .chiedi, .barra .mic, .barra .posto-banner, jarvis-stanza",
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

    // 1. riposo di giorno, con timer e musica
    await page.getByTestId("ora").click({ delay: 3300 });
    await page.getByTestId("sezione-riposo").click();
    await page.getByTestId("prova-riposo").click();
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
    for (const s of ["stanza", "riposo", "audio", "diagnostica"]) {
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
