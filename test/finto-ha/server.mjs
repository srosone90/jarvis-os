/**
 * Finto Home Assistant per le prove end-to-end.
 *
 * Serve l'app compilata (dist/) in /local/jarvis/ come fa HA (niente indice di
 * cartella: si apre /local/jarvis/index.html; cache HTTP di un mese), il flusso OAuth
 * (/auth/authorize, /auth/token, /auth/providers) e il WebSocket /api/websocket
 * con lo stesso protocollo (auth, subscribe_entities compresso, ping,
 * weather/subscribe_forecast).
 *
 * Comandi per le prove (POST):
 *   /__prova/spegni              chiude tutti i WebSocket e rifiuta i nuovi (HA giù)
 *   /__prova/accendi             HA di nuovo su
 *   /__prova/latenza?ms=1500     ritardo su OGNI risposta HTTP e messaggio WebSocket
 *   /__prova/stato               {entity_id, state, attributes?, contesto?}: cambia/crea un'entità
 *                                (contesto {user_id?, parent_id?}: chi l'ha causato; senza = sistema)
 *   /__prova/rimuovi?entity_id=  toglie un'entità (anche mentre HA è "giù")
 *   /__prova/revoca              invalida i token: serve rifare il login
 *   /__prova/nuova-versione      il server pubblica un sw.js diverso (app aggiornata)
 *   /__prova/rifiuta?servizio=   HA rifiuta quel servizio (es. media_player.turn_on)
 *   /__prova/muto?entity_id=     il dispositivo accetta i comandi ma non cambia stato
 *   /__prova/aggiungi            {area?, dispositivo?, entita, s, a}: dispositivo nuovo nei registri
 *   /__prova/assistente?modo=    come risponde Gemini (assist_pipeline/run):
 *                                normale | lenta (&ms=10000) | errore | cade | azione | lunga
 *   /__prova/reset               tutto come all'avvio
 *   GET /__prova/info            contatori (connessioni, login, richieste per file)
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, normalize, extname } from "node:path";
import { WebSocketServer } from "ws";

const PORTA = Number(process.env.PORTA ?? 18123);
const DIST = new URL("../../dist/", import.meta.url).pathname;
const VERSIONE_HA = "2026.9.3";

const TIPI = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".json": "application/json",
};

function entitaIniziali() {
  const ora = Date.now() / 1000;
  const e = (s, a = {}) => ({ s: String(s), a, c: "ctx", lc: ora });
  return {
    "weather.forecast_casa": e("partlycloudy", {
      temperature: 22.4,
      humidity: 60,
      cloud_coverage: 40,
      temperature_unit: "°C",
      friendly_name: "Forecast Casa",
    }),
    "sensor.meter_salone_temperatura": e(25.7, { unit_of_measurement: "°C" }),
    "sensor.meter_salone_umidita": e(44, { unit_of_measurement: "%" }),
    "sensor.meter_letto_temperatura": e(25.1, { unit_of_measurement: "°C" }),
    "sensor.meter_letto_umidita": e(43, { unit_of_measurement: "%" }),
    "sensor.jarvis_temperatura_percepita_soggiorno": e(26.5, { unit_of_measurement: "°C" }),
    "sensor.jarvis_temperatura_percepita_camera": e(25.6, { unit_of_measurement: "°C" }),
    "switch.scaldabagno": e("off", { friendly_name: "scaldabagno" }),
    "media_player.soggiorno_tv_salotto": e("off", {
      friendly_name: "TV Salotto",
      is_volume_muted: false,
      volume_level: 0.2,
    }),
    "remote.soggiorno_tv_salotto": e("off"),
    // Condizionatore a infrarossi: lo "stato" è l'ultimo comando inviato
    "climate.condizionatore": e("fan_only", {
      hvac_modes: ["heat_cool", "cool", "dry", "fan_only", "heat", "off"],
      temperature: 24,
      min_temp: 16,
      max_temp: 30,
      target_temp_step: 1,
      friendly_name: "Condizionatore",
    }),
    "switch.condizionatore": e("unknown"),
    "switch.tv_camera_da_letto": e("unknown", { friendly_name: "TV camera da letto" }),
    "sensor.scaldabagno_batteria": e(100),
    // dal pacchetto HA
    "binary_sensor.jarvis_scaldabagno_modalita_inverno": e("on"),
    "counter.jarvis_giorni_nuvolosi": e(2),
    "sensor.jarvis_scaldabagno_prossimo_cambio": e("Si spegne alle 00:00"),
  };
}

// Registri come li restituisce HA (config/*_registry/list*), casa vera del 26/09
function registriIniziali() {
  return {
    aree: [
      { area_id: "soggiorno", name: "Soggiorno" },
      { area_id: "cucina", name: "Cucina" },
      { area_id: "camera_da_letto", name: "Camera da letto" },
      { area_id: "veranda", name: "Veranda" },
    ],
    dispositivi: [
      { id: "d-tv", area_id: "soggiorno", name: "TV Salotto", name_by_user: null, disabled_by: null },
      { id: "d-meter-s", area_id: "soggiorno", name: "Meter salone", name_by_user: null, disabled_by: null },
      {
        id: "d-meter-l",
        area_id: "camera_da_letto",
        name: "Meter letto",
        name_by_user: null,
        disabled_by: null,
      },
      {
        id: "d-clima",
        area_id: "camera_da_letto",
        name: "Condizionatore",
        name_by_user: null,
        disabled_by: null,
      },
      {
        id: "d-tvc",
        area_id: "camera_da_letto",
        name: "TV camera da letto",
        name_by_user: null,
        disabled_by: null,
      },
      {
        id: "d-bot",
        area_id: "veranda",
        name: "scaldabagno",
        name_by_user: "Scaldabagno",
        disabled_by: null,
      },
    ],
    entita: [
      { ei: "media_player.soggiorno_tv_salotto", di: "d-tv", pl: "samsungtv" },
      { ei: "remote.soggiorno_tv_salotto", di: "d-tv", pl: "samsungtv" },
      { ei: "sensor.meter_salone_temperatura", di: "d-meter-s", pl: "switchbot_cloud" },
      { ei: "sensor.meter_salone_umidita", di: "d-meter-s", pl: "switchbot_cloud" },
      { ei: "sensor.meter_letto_temperatura", di: "d-meter-l", pl: "switchbot_cloud" },
      { ei: "sensor.meter_letto_umidita", di: "d-meter-l", pl: "switchbot_cloud" },
      { ei: "climate.condizionatore", di: "d-clima", pl: "switchbot_cloud" },
      { ei: "switch.condizionatore", di: "d-clima", pl: "switchbot_cloud" },
      { ei: "switch.tv_camera_da_letto", di: "d-tvc", pl: "switchbot_cloud" },
      { ei: "switch.scaldabagno", di: "d-bot", pl: "switchbot_cloud" },
      { ei: "sensor.scaldabagno_batteria", di: "d-bot", pl: "switchbot_cloud", ec: 1 },
      { ei: "weather.forecast_casa", pl: "met" },
    ],
  };
}

function previsione() {
  const oggi = new Date();
  oggi.setHours(12, 0, 0, 0);
  const cond = ["partlycloudy", "sunny", "rainy", "cloudy", "sunny", "pouring"];
  return cond.map((c, i) => ({
    datetime: new Date(oggi.getTime() + i * 86_400_000).toISOString(),
    condition: c,
    temperature: 26 - i,
    templow: 18 - i,
  }));
}

let stato;
function reset() {
  stato = {
    entita: entitaIniziali(),
    acceso: true,
    latenza: 0,
    tokenValidi: true,
    nuovaVersione: false,
    registri: registriIniziali(),
    rifiuta: new Set(), // "dominio.servizio" che HA rifiuta
    muti: new Set(), // entity_id che non cambiano stato dopo un comando
    chiamate: [],
    // assistente (assist_pipeline/run): modo di risposta, conversazioni aperte, richieste ricevute
    assistente: { modo: "normale", attesaMs: 10_000, conversazioni: new Set(), prossima: 1 },
    richiesteAssistente: [],
    disiscrizioniPipeline: 0,
    generazioneToken: 1,
    info: { connessioni: 0, login: 0, rinnovi: 0, richieste: {} },
  };
}
reset();

const clienti = new Set(); // { ws, abbonamentiEntita:Set<id>, abbonamentiMeteo:Map<id,entita> }
const ritardo = () => new Promise((r) => setTimeout(r, stato.latenza));

/**
 * Come HA vero: se il client ha chiesto `coalesce_messages` (la libreria lo fa
 * sempre), i messaggi pronti nello stesso giro del loop partono insieme in UN
 * solo frame, come array JSON. È così che risultato di una sottoscrizione e
 * primo evento arrivano attaccati: la v0.1.0 cadeva proprio lì.
 */
async function invia(cliente, msg) {
  await ritardo();
  if (!cliente.coalesce) {
    if (cliente.ws.readyState === 1) cliente.ws.send(JSON.stringify(msg));
    return;
  }
  cliente.coda.push(msg);
  if (cliente.invioProgrammato) return;
  cliente.invioProgrammato = true;
  setImmediate(() => {
    cliente.invioProgrammato = false;
    const gruppo = cliente.coda.splice(0);
    if (cliente.ws.readyState === 1)
      cliente.ws.send(JSON.stringify(gruppo.length === 1 ? gruppo[0] : gruppo));
  });
}

function trasmettiEvento(tipo, dati) {
  for (const c of clienti)
    for (const [id, t] of c.abbonamentiEventi)
      if (t === tipo)
        void invia(c, {
          id,
          type: "event",
          event: { event_type: tipo, data: dati, origin: "LOCAL", time_fired: new Date().toISOString() },
        });
}

/**
 * Context dello stato, come HA (core.py e websocket_api/messages.py):
 *  - stato completo: stringa se user_id e parent_id sono vuoti, altrimenti oggetto;
 *  - differenza: stringa se è cambiato solo l'id, altrimenti oggetto con i SOLI
 *    campi cambiati (parent_id, user_id, id).
 * Un comando riuscito scrive lo stato col context della chiamata (user_id di chi
 * l'ha mandato); un'automazione con parent_id; l'avvio senza nessuno dei due.
 */
let contatoreContesti = 0;
const UTENTE_PROVA = "utente-prova";
const nuovoContesto = (user_id = null, parent_id = null) => ({
  id: `ctx-${++contatoreContesti}`,
  parent_id,
  user_id,
});
const oggettoContesto = (c) => (typeof c === "string" ? { id: c, parent_id: null, user_id: null } : c);
const comprimiContesto = (c) => (c.user_id === null && c.parent_id === null ? c.id : c);
function diffContesto(vecchio, nuovo) {
  const v = oggettoContesto(vecchio);
  let d;
  if (v.parent_id !== nuovo.parent_id) d = { parent_id: nuovo.parent_id };
  if (v.user_id !== nuovo.user_id) d = { ...(d ?? {}), user_id: nuovo.user_id };
  if (v.id !== nuovo.id) d = d ? { ...d, id: nuovo.id } : nuovo.id;
  return d;
}

/** Cambia (o crea) un'entità e lo manda ai client, come fa HA. */
function impostaEntita(entity_id, s, a, contesto = nuovoContesto()) {
  const vecchia = stato.entita[entity_id];
  const n = {
    s: String(s),
    a: a ?? vecchia?.a ?? {},
    c: comprimiContesto(contesto),
    lc: Date.now() / 1000,
  };
  stato.entita[entity_id] = n;
  if (!vecchia) return trasmettiEntita({ a: { [entity_id]: n } });
  const dc = diffContesto(vecchia.c, contesto);
  trasmettiEntita({
    c: { [entity_id]: { "+": { s: n.s, a: n.a, lc: n.lc, ...(dc === undefined ? {} : { c: dc }) } } },
  });
}

/**
 * Effetto dei servizi sui dispositivi finti (come si comporterebbero quelli veri).
 * Lo stato nuovo porta il context della chiamata, con lo user_id di chi l'ha fatta.
 */
function eseguiServizio(dominio, servizio, dati) {
  const ids = [].concat(dati.entity_id ?? []);
  for (const id of ids) {
    if (stato.muti.has(id)) continue;
    const e = stato.entita[id];
    if (!e) continue;
    const a = { ...e.a };
    const ctx = nuovoContesto(UTENTE_PROVA);
    if (dominio === "media_player" || (dominio === "switch" && e.s !== "unknown")) {
      if (servizio === "turn_on") setTimeout(() => impostaEntita(id, "on", a, ctx), 300);
      if (servizio === "turn_off") setTimeout(() => impostaEntita(id, "off", a, ctx), 300);
      if (servizio === "volume_mute")
        impostaEntita(id, e.s, { ...a, is_volume_muted: dati.is_volume_muted }, ctx);
    }
    if (dominio === "climate") {
      if (servizio === "set_hvac_mode") impostaEntita(id, dati.hvac_mode, a, ctx);
      if (servizio === "set_temperature")
        impostaEntita(id, e.s, { ...a, temperature: dati.temperature }, ctx);
    }
  }
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Risposta dell'assistente come la manda HA 2026.9.3 (assist_pipeline/pipeline.py):
 * run-start, intent-start, intent-progress con chat_log_delta, intent-end,
 * run-end. Si ferma se il client si disiscrive (HA cancella il task).
 */
async function rispondiAssistente(cliente, id, conversationId, testoDomanda) {
  const { modo, attesaMs } = stato.assistente;
  const vivo = () => cliente.pipeline.has(id) && cliente.ws.readyState === 1;
  const evento = (type, data) =>
    vivo()
      ? invia(cliente, { id, type: "event", event: { type, data, timestamp: new Date().toISOString() } })
      : null;
  const uscita = (speech, tipo = "action_done") => ({
    processed_locally: false,
    intent_output: {
      response: {
        speech: { plain: { speech, extra_data: null } },
        card: {},
        language: "it",
        response_type: tipo,
        data: tipo === "error" ? { code: "unknown" } : { targets: [], success: [], failed: [] },
      },
      conversation_id: conversationId,
      continue_conversation: false,
    },
  });
  await evento("run-start", {
    pipeline: "pipeline-italiano",
    language: "it",
    conversation_id: conversationId,
    runner_data: { stt_binary_handler_id: null, timeout: 60 },
  });
  await evento("intent-start", {
    engine: "conversation.google_ai_conversation",
    language: "it",
    intent_input: testoDomanda,
    conversation_id: conversationId,
    device_id: null,
    satellite_id: null,
    prefer_local_intents: false,
  });
  await pausa(modo === "lenta" ? attesaMs : 300);
  if (!vivo()) return;
  if (modo === "errore") {
    await evento("intent-end", uscita("Error talking to API", "error"));
    return evento("run-end", null);
  }
  await evento("intent-progress", { chat_log_delta: { role: "assistant" } });
  if (modo === "azione") {
    await evento("intent-progress", {
      chat_log_delta: {
        tool_calls: [
          { tool_name: "HassTurnOff", tool_args: { name: "TV Salotto" }, id: "t1", external: false },
        ],
      },
    });
    const tv = "media_player.soggiorno_tv_salotto";
    stato.chiamate.push({ servizio: "media_player.turn_off", dati: { entity_id: tv }, da: "assistente" });
    eseguiServizio("media_player", "turn_off", { entity_id: tv });
    await pausa(400);
    await evento("intent-progress", {
      chat_log_delta: {
        role: "tool_result",
        agent_id: "conversation.google_ai_conversation",
        tool_call_id: "t1",
        tool_name: "HassTurnOff",
        tool_result: {
          speech: {},
          response_type: "action_done",
          data: { targets: [], success: [{ name: "TV Salotto", type: "entity", id: tv }], failed: [] },
        },
        created: new Date().toISOString(),
      },
    });
    await evento("intent-progress", { chat_log_delta: { role: "assistant" } });
  }
  const testi = {
    normale: ["In camera ci sono ", "25,1°, ", "con umidità al 43%."],
    lenta: ["Scusa l'attesa: ", "in soggiorno ci sono 25,7°."],
    azione: ["Fatto, ", "ho spento la TV del salotto."],
    cade: ["Sto controllando ", "la TV…"],
    lunga: [
      "Ecco il riepilogo della casa. ",
      "In soggiorno ci sono 25,7° con umidità al 44% e la TV è spenta. ",
      "In camera da letto ci sono 25,1° e il condizionatore è in modalità ventola a 24°. ",
      "In veranda lo scaldabagno è spento e la modalità inverno è attiva da due giorni nuvolosi; ",
      "si spegnerà alle 00:00 e si riaccenderà alle 04:30.",
    ],
  }[modo] ?? ["Ok."];
  for (const [i, pezzo] of testi.entries()) {
    await evento("intent-progress", { chat_log_delta: { content: pezzo } });
    // "cade": HA si perde a metà risposta (Wi-Fi giù, server riavviato...)
    if (modo === "cade" && i === 0) {
      await pausa(200);
      cliente.ws.terminate();
      return;
    }
    await pausa(150);
  }
  await evento("intent-end", uscita(testi.join("")));
  await evento("run-end", null);
}

function trasmettiEntita(agg) {
  for (const c of clienti)
    for (const id of c.abbonamentiEntita) void invia(c, { id, type: "event", event: agg });
}

function leggiCorpo(req) {
  return new Promise((ris) => {
    let dati = "";
    req.on("data", (d) => (dati += d));
    req.on("end", () => ris(dati));
  });
}

function json(res, codice, corpo) {
  res.writeHead(codice, { "content-type": "application/json" });
  res.end(JSON.stringify(corpo));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  // --- comandi delle prove (mai ritardati) ---
  if (p.startsWith("/__prova/")) {
    const comando = p.slice("/__prova/".length);
    if (comando === "info")
      return json(res, 200, {
        ...stato.info,
        chiamate: stato.chiamate,
        richiesteAssistente: stato.richiesteAssistente,
        disiscrizioniPipeline: stato.disiscrizioniPipeline,
        pipelineAperte: [...clienti].reduce((n, c) => n + c.pipeline.size, 0),
        clienti: clienti.size,
        acceso: stato.acceso,
      });
    if (comando === "spegni") {
      stato.acceso = false;
      for (const c of clienti) c.ws.terminate();
    } else if (comando === "accendi") stato.acceso = true;
    else if (comando === "latenza") stato.latenza = Number(url.searchParams.get("ms") ?? 0);
    else if (comando === "rifiuta") stato.rifiuta.add(url.searchParams.get("servizio"));
    else if (comando === "muto") stato.muti.add(url.searchParams.get("entity_id"));
    else if (comando === "assistente") {
      stato.assistente.modo = url.searchParams.get("modo") ?? "normale";
      stato.assistente.attesaMs = Number(url.searchParams.get("ms") ?? 10_000);
    } else if (comando === "aggiungi") {
      // {area?, dispositivo?, entita, s, a}: un dispositivo nuovo in HA
      const { area, dispositivo, entita, s: st, a } = JSON.parse(await leggiCorpo(req));
      if (area && !stato.registri.aree.some((x) => x.area_id === area.area_id)) {
        stato.registri.aree.push(area);
        trasmettiEvento("area_registry_updated", { action: "create", area_id: area.area_id });
      }
      if (dispositivo) {
        stato.registri.dispositivi.push(dispositivo);
        trasmettiEvento("device_registry_updated", { action: "create", device_id: dispositivo.id });
      }
      stato.registri.entita.push(entita);
      impostaEntita(entita.ei, st, a);
      trasmettiEvento("entity_registry_updated", { action: "create", entity_id: entita.ei });
    } else if (comando === "stato") {
      // contesto facoltativo {user_id?, parent_id?}: senza, è un cambio "di sistema"
      const { entity_id, state, attributes, contesto } = JSON.parse(await leggiCorpo(req));
      // Come HA: entità nuova → "a"; entità esistente → differenza "c"
      impostaEntita(
        entity_id,
        state,
        attributes,
        nuovoContesto(contesto?.user_id ?? null, contesto?.parent_id ?? null),
      );
    } else if (comando === "rimuovi") {
      const id = url.searchParams.get("entity_id");
      delete stato.entita[id];
      trasmettiEntita({ r: [id] });
    } else if (comando === "revoca") {
      stato.tokenValidi = false;
      for (const c of clienti) c.ws.terminate();
    } else if (comando === "nuova-versione") stato.nuovaVersione = true;
    else if (comando === "reset") {
      for (const c of clienti) c.ws.terminate();
      reset();
    } else return json(res, 404, { errore: "comando sconosciuto" });
    return json(res, 200, { ok: true });
  }

  await ritardo();

  if (p === "/auth/providers") {
    if (!stato.acceso) return json(res, 502, { errore: "giù" });
    return json(res, 200, [{ name: "Home Assistant Local", id: null, type: "homeassistant" }]);
  }

  // Login: il finto HA "accetta" subito e rimanda indietro con il codice
  if (p === "/auth/authorize") {
    const redirect = url.searchParams.get("redirect_uri");
    const clientId = url.searchParams.get("client_id");
    const statoOAuth = url.searchParams.get("state");
    if (!redirect || !clientId || !redirect.startsWith(clientId))
      return json(res, 400, { errore: "redirect_uri" });
    stato.info.login++;
    const destinazione = `${redirect}&code=codice-prova&state=${encodeURIComponent(statoOAuth ?? "")}`;
    res.writeHead(302, { location: destinazione });
    return res.end();
  }

  if (p === "/auth/token" && req.method === "POST") {
    // FormData arriva come multipart: basta cercare i campi
    const corpo = await leggiCorpo(req);
    const tipo = /name="grant_type"\r\n\r\n([^\r]+)/.exec(corpo)?.[1];
    if (tipo === "authorization_code") {
      stato.tokenValidi = true;
      stato.generazioneToken++;
      return json(res, 200, {
        access_token: `accesso-${stato.generazioneToken}`,
        token_type: "Bearer",
        refresh_token: `rinnovo-${stato.generazioneToken}`,
        expires_in: 1800,
      });
    }
    if (tipo === "refresh_token") {
      stato.info.rinnovi++;
      if (!stato.tokenValidi) return json(res, 400, { error: "invalid_grant" });
      return json(res, 200, {
        access_token: `accesso-${stato.generazioneToken}`,
        token_type: "Bearer",
        expires_in: 1800,
      });
    }
    return json(res, 400, { error: "unsupported_grant_type" });
  }

  // File dell'app, come /config/www/jarvis/ → /local/jarvis/
  if (p.startsWith("/local/jarvis/")) {
    const rel = normalize(p.slice("/local/jarvis/".length)).replace(/^(\.\.[/\\])+/, "");
    const file = join(DIST, rel);
    stato.info.richieste[rel] = (stato.info.richieste[rel] ?? 0) + 1;
    // Come HA (aiohttp senza indice): una cartella NON serve index.html
    if (existsSync(file) && statSync(file).isDirectory()) {
      res.writeHead(403);
      return res.end("403: Forbidden");
    }
    if (!file.startsWith(DIST) || !existsSync(file)) {
      res.writeHead(404);
      return res.end("non trovato");
    }
    // Come HA: i file di /local/ hanno una cache HTTP di un mese
    res.writeHead(200, {
      "content-type": TIPI[extname(file)] ?? "application/octet-stream",
      "cache-control": "public, max-age=2678400",
    });
    const contenuto = readFileSync(file);
    if (rel === "sw.js" && stato.nuovaVersione) return res.end(`${contenuto}\n// versione nuova\n`);
    return res.end(contenuto);
  }

  res.writeHead(404);
  res.end("non trovato");
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, testa) => {
  if (!req.url.startsWith("/api/websocket") || !stato.acceso) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, testa, (ws) => gestisci(ws));
});

function gestisci(ws) {
  const cliente = {
    ws,
    autenticato: false,
    abbonamentiEventi: new Map(),
    coalesce: false,
    coda: [],
    invioProgrammato: false,
    abbonamentiEntita: new Set(),
    abbonamentiMeteo: new Map(),
    pipeline: new Set(), // assist_pipeline/run in corso (o finite e non ancora disiscritte, come in HA)
  };
  clienti.add(cliente);
  stato.info.connessioni++;
  ws.on("close", () => clienti.delete(cliente));
  void invia(cliente, { type: "auth_required", ha_version: VERSIONE_HA });

  ws.on("message", async (grezzo) => {
    const msg = JSON.parse(String(grezzo));
    await ritardo();
    if (!cliente.autenticato) {
      if (msg.type !== "auth") return;
      const valido = stato.tokenValidi && msg.access_token === `accesso-${stato.generazioneToken}`;
      if (!valido) {
        await invia(cliente, { type: "auth_invalid", message: "Invalid access token" });
        ws.close();
        return;
      }
      cliente.autenticato = true;
      return invia(cliente, { type: "auth_ok", ha_version: VERSIONE_HA });
    }
    const { id, type } = msg;
    switch (type) {
      case "supported_features":
        cliente.coalesce = msg.features?.coalesce_messages === 1;
        return invia(cliente, { id, type: "result", success: true, result: null });
      case "ping":
        return invia(cliente, { id, type: "pong" });
      case "subscribe_entities":
        cliente.abbonamentiEntita.add(id);
        void invia(cliente, { id, type: "result", success: true, result: null });
        return invia(cliente, { id, type: "event", event: { a: stato.entita } });
      case "weather/subscribe_forecast": {
        if (!stato.entita[msg.entity_id])
          return invia(cliente, {
            id,
            type: "result",
            success: false,
            error: { code: "not_found", message: "Entity not found" },
          });
        cliente.abbonamentiMeteo.set(id, msg.entity_id);
        void invia(cliente, { id, type: "result", success: true, result: null });
        return invia(cliente, { id, type: "event", event: { type: "daily", forecast: previsione() } });
      }
      case "subscribe_events":
        cliente.abbonamentiEventi.set(id, msg.event_type);
        return invia(cliente, { id, type: "result", success: true, result: null });
      case "config/area_registry/list":
        return invia(cliente, { id, type: "result", success: true, result: stato.registri.aree });
      case "config/device_registry/list":
        return invia(cliente, { id, type: "result", success: true, result: stato.registri.dispositivi });
      case "config/entity_registry/list_for_display":
        return invia(cliente, {
          id,
          type: "result",
          success: true,
          result: { entity_categories: { 0: "config", 1: "diagnostic" }, entities: stato.registri.entita },
        });
      case "call_service": {
        const chiave = `${msg.domain}.${msg.service}`;
        const dati = { ...(msg.service_data ?? {}), ...(msg.target ?? {}) };
        stato.chiamate.push({ servizio: chiave, dati });
        if (stato.rifiuta.has(chiave))
          return invia(cliente, {
            id,
            type: "result",
            success: false,
            error: { code: "home_assistant_error", message: "Il dispositivo non risponde" },
          });
        eseguiServizio(msg.domain, msg.service, dati);
        return invia(cliente, { id, type: "result", success: true, result: { context: { id: "ctx" } } });
      }
      case "assist_pipeline/run": {
        const testoDomanda = msg.input?.text;
        stato.richiesteAssistente.push({
          testo: testoDomanda,
          conversation_id: msg.conversation_id ?? null,
          start_stage: msg.start_stage,
          end_stage: msg.end_stage,
          timeout: msg.timeout,
        });
        if (msg.start_stage !== "intent" || typeof testoDomanda !== "string")
          return invia(cliente, {
            id,
            type: "result",
            success: false,
            error: { code: "invalid_format", message: "start_stage/input non validi" },
          });
        // come chat_session: un id sconosciuto (o scaduto) diventa una conversazione nuova
        const a = stato.assistente;
        const conversationId =
          msg.conversation_id && a.conversazioni.has(msg.conversation_id)
            ? msg.conversation_id
            : `conv-${a.prossima++}`;
        a.conversazioni.add(conversationId);
        cliente.pipeline.add(id);
        await invia(cliente, { id, type: "result", success: true, result: null });
        void rispondiAssistente(cliente, id, conversationId, testoDomanda);
        return;
      }
      case "unsubscribe_events": {
        // come HA: una sottoscrizione sconosciuta è un errore (commands.py)
        const s = msg.subscription;
        const nota =
          cliente.abbonamentiEventi.delete(s) |
          cliente.abbonamentiEntita.delete(s) |
          cliente.abbonamentiMeteo.delete(s);
        if (cliente.pipeline.delete(s)) stato.disiscrizioniPipeline++;
        else if (!nota)
          return invia(cliente, {
            id,
            type: "result",
            success: false,
            error: { code: "not_found", message: "Subscription not found." },
          });
        return invia(cliente, { id, type: "result", success: true, result: null });
      }
      default:
        return invia(cliente, {
          id,
          type: "result",
          success: false,
          error: { code: "unknown_command", message: type },
        });
    }
  });
}

server.listen(PORTA, () =>
  console.log(`Finto Home Assistant su http://localhost:${PORTA}/local/jarvis/index.html`),
);
