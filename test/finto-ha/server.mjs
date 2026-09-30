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
 *                                normale | lenta (&ms=10000) | errore | quota | occupato
 *                                | cade | azione | lunga | timer | timer-camera (timer di 2 s
 *                                al device_id della domanda, o a jarvis_camera_da_letto)
 *                                voce: &trascrizione=… (cosa "sente" l'STT), &stt=silenzio|manuale|guasto
 *                                (nessuna parola / fine solo col tocco / stt-stream-failed), &tts=streaming (risposta locale: run-end
 *                                solo dopo che l'audio è stato scaricato), &continua=N (le
 *                                prossime N risposte chiedono un seguito)
 *   /__prova/veloce?stato=       su | giu | lenta: l'"origine veloce" delle prove, cioè le
 *                                richieste arrivate come 127.0.0.1 (l'origine di riserva è
 *                                localhost). giu = connessione chiusa (app Tailscale spenta),
 *                                lenta = 3 s di attesa su ogni richiesta HTTP
 *   /__prova/file                {nome, contenuto, tipo?}: un file in /local/jarvis/ che
 *                                nello zip non c'è (es. parola.json di una casa)
 *   /__prova/musica              {stato, stanza, volume, titolo} | null: jarvis_musica (lo stato
 *                                vero di Spotify); null = componente non installato
 *   /__prova/timer               {tipo, id, nome, secondi_totali, secondi_rimasti, pannello}:
 *                                evento jarvis_timer, e l'elenco di jarvis_voce.timer_attivi si
 *                                aggiorna (come jarvis_voce 0.1.8 lato server)
 *   /__prova/jarvis-voce?installato=0  servizi jarvis_voce assenti (server vecchio)
 *   /__prova/reset               tutto come all'avvio
 *   GET /__prova/info            contatori (connessioni, login, richieste per file)
 */
import { Buffer } from "node:buffer";
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
    veloce: "su",
    fileVirtuali: new Map(), // nome → {contenuto, tipo}
    versioneServer: null, // nuova-versione?versione=x.y.z: VERSIONE diversa in sw.js
    musica: null, // jarvis_musica: {stato, stanza, volume, titolo}; null = non installato
    // jarvis_voce (lato server): timer in corso {id, nome, secondi_totali, scadenza, pannello}
    timerServer: new Map(),
    jarvisVoce: true, // false = servizi jarvis_voce non installati (server vecchio)
    registri: registriIniziali(),
    rifiuta: new Set(), // "dominio.servizio" che HA rifiuta
    muti: new Set(), // entity_id che non cambiano stato dopo un comando
    chiamate: [],
    // assistente (assist_pipeline/run): modo di risposta, conversazioni aperte, richieste ricevute
    assistente: {
      modo: "normale",
      attesaMs: 10_000,
      conversazioni: new Set(),
      prossima: 1,
      trascrizione: "Che temperatura c'è in camera?",
      stt: "normale",
      tts: "normale",
      continua: 0,
    },
    // voce: byte di audio ricevuti per ogni pipeline, fine dell'audio, audio TTS scaricati
    audioVoce: [],
    richiesteTts: [],
    richiesteAssistente: [],
    disiscrizioniPipeline: 0,
    generazioneToken: 1,
    // Come HA vero: ogni login crea il suo refresh token, e restano validi tutti
    // (un login per origine: riserva e veloce convivono)
    generazioniValide: new Set(),
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

/** jarvis_voce finto: tiene l'elenco dei timer come il server e manda l'evento. */
function eventoTimerServer(ev) {
  const { tipo, id } = ev;
  if (tipo === "started" || tipo === "updated")
    stato.timerServer.set(id, {
      id,
      nome: ev.nome ?? null,
      secondi_totali: ev.secondi_totali ?? null,
      scadenza: Date.now() + (ev.secondi_rimasti ?? ev.secondi_totali ?? 0) * 1000,
      fermo: ev.secondi_rimasti ?? ev.secondi_totali ?? 0,
      pannello: ev.pannello ?? null,
      in_pausa: ev.in_pausa ?? false,
    });
  else stato.timerServer.delete(id);
  trasmettiEvento("jarvis_timer", ev);
}

function elencoTimerServer() {
  return [...stato.timerServer.values()].map(({ scadenza, fermo, ...t }) => ({
    ...t,
    secondi_rimasti: t.in_pausa ? fermo : Math.max(0, Math.round((scadenza - Date.now()) / 1000)),
  }));
}

/**
 * Timer chiesto a Gemini, come jarvis_voce 0.1.8: senza stanza va al device_id
 * della richiesta (o "jarvis_pannello" se manca), con la stanza a quella.
 */
function timerDaAssistente(deviceId, stanza) {
  const id = `t-${++contatoreTimer}`;
  const pannello = stanza ?? deviceId ?? "jarvis_pannello";
  const t = { id, nome: "pasta", secondi_totali: 2, secondi_rimasti: 2, pannello };
  eventoTimerServer({ tipo: "started", ...t });
  setTimeout(() => {
    if (stato.timerServer.has(id)) eventoTimerServer({ tipo: "finished", ...t, secondi_rimasti: 0 });
  }, 2000);
}
let contatoreTimer = 0;

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
async function rispondiAssistente(cliente, id, conversationId, testoDomanda, voce = null) {
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
      continue_conversation: continua,
    },
  });
  // seguito (continue_conversation) per le prossime N risposte, come quando Gemini fa una domanda
  const continua = voce !== null && stato.assistente.continua > 0;
  if (continua) stato.assistente.continua--;
  if (voce === null)
    await evento("run-start", {
      pipeline: "pipeline-italiano",
      language: "it",
      conversation_id: conversationId,
      runner_data: { stt_binary_handler_id: null, timeout: 60 },
    });
  if (voce === null)
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
  // Errori di Gemini con i testi veri di HA 2026.9.3 (google_generative_ai_conversation/entity.py):
  // all'invio senza causa; durante la risposta con il messaggio di Google in coda.
  const ERRORE_GEMINI = "Sorry, I had a problem getting a response from Google Generative AI.";
  const errori = {
    errore: ERRORE_GEMINI,
    quota: `${ERRORE_GEMINI}: Resource has been exhausted (e.g. check quota).`,
    occupato: `${ERRORE_GEMINI}: The model is overloaded. Please try again later.`,
  };
  if (modo in errori) {
    await evento("intent-end", uscita(errori[modo], "error"));
    return evento("run-end", null);
  }
  await evento("intent-progress", { chat_log_delta: { role: "assistant" } });
  if (modo === "musica") {
    // "metti in pausa la musica": Gemini usa lo script di jarvis_musica
    await evento("intent-progress", {
      chat_log_delta: {
        tool_calls: [
          {
            tool_name: "script__jarvis_musica_controllo",
            tool_args: { azione: "pausa" },
            id: "m1",
            external: false,
          },
        ],
      },
    });
    if (stato.musica) stato.musica.stato = "in_pausa";
    stato.chiamate.push({ servizio: "jarvis_musica.controllo", dati: { azione: "pausa" }, da: "assistente" });
    await pausa(200);
    await evento("intent-progress", {
      chat_log_delta: {
        role: "tool_result",
        agent_id: "conversation.google_ai_conversation",
        tool_call_id: "m1",
        tool_name: "script__jarvis_musica_controllo",
        tool_result: { esito: "ok", stato: "in_pausa" },
        created: new Date().toISOString(),
      },
    });
    await evento("intent-progress", { chat_log_delta: { role: "assistant" } });
  }
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
  // "metti un timer" (qui di 2 s): a chi chiede, o alla camera da letto se lo dice
  if (modo === "timer" || modo === "timer-camera")
    timerDaAssistente(
      cliente.dispositivi.get(id) ?? null,
      modo === "timer-camera" ? "jarvis_camera_da_letto" : null,
    );
  const testi = {
    timer: ["Timer ", "avviato."],
    "timer-camera": ["Timer avviato ", "in camera da letto."],
    normale: ["In camera ci sono ", "25,1°, ", "con umidità al 43%."],
    lenta: ["Scusa l'attesa: ", "in soggiorno ci sono 25,7°."],
    azione: ["Fatto, ", "ho spento la TV del salotto."],
    musica: ["Fatto, ", "musica in pausa."],
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
  if (voce === null) return evento("run-end", null);
  // TTS: tts-start, tts-end con l'URL (lo stesso già dato in run-start)
  await evento("tts-start", {
    engine: "tts.google_translate_en_com",
    language: "it",
    voice: null,
    tts_input: testi.join(""),
    acknowledge_override: false,
  });
  await pausa(150);
  await evento("tts-end", {
    tts_output: {
      media_id: `media-source://tts/${voce.token}`,
      token: voce.token,
      url: voce.url,
      mime_type: "audio/wav",
    },
  });
  // Come HA con le risposte locali in streaming (sessione server, 29/09): run-end
  // arriva solo dopo che qualcuno ha scaricato l'audio.
  if (stato.assistente.tts === "streaming") await attendiTts(voce.token, 30_000);
  await evento("run-end", null);
}

/** Aspetta che il pannello scarichi l'audio della TTS (o il tempo massimo). */
const attesaTts = new Map();
function attendiTts(token, ms) {
  if (stato.richiesteTts.includes(token)) return Promise.resolve();
  return new Promise((ris) => {
    const t = setTimeout(ris, ms);
    attesaTts.set(token, () => {
      clearTimeout(t);
      ris();
    });
  });
}

/** WAV vero (PCM 16 bit, 16 kHz, mono): 0,4 s di un la leggero, perché il browser lo riproduca. */
function wavProva() {
  const campioni = 6400;
  const b = Buffer.alloc(44 + campioni * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + campioni * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(campioni * 2, 40);
  for (let i = 0; i < campioni; i++)
    b.writeInt16LE(Math.round(Math.sin((i / 16000) * 2 * Math.PI * 440) * 3000), 44 + i * 2);
  return b;
}

/**
 * Pipeline a voce (start_stage stt, end_stage tts), come HA 2026.9.3:
 * run-start con runner_data.stt_binary_handler_id e tts_output; l'audio arriva
 * in frame binari [id][PCM]; un frame col solo id chiude l'audio. Qui il "VAD"
 * chiude dopo ~0,6 s di audio (il microfono finto di Chromium suona di continuo).
 */
async function voceAssistente(cliente, id, conversationId, sampleRate) {
  const a = stato.assistente;
  const vivo = () => cliente.pipeline.has(id) && cliente.ws.readyState === 1;
  const evento = (type, data) =>
    vivo()
      ? invia(cliente, { id, type: "event", event: { type, data, timestamp: new Date().toISOString() } })
      : null;
  const gestore = cliente.prossimoGestore++;
  const token = `tts-${id}-${Date.now()}`;
  const url = `/api/tts_proxy/${token}.wav`;
  const registro = { pipeline: id, byte: 0, fine: false, sampleRate };
  stato.audioVoce.push(registro);
  // stt=manuale: nessun VAD, l'ascolto finisce solo col frame di fine (tocco su "ferma")
  const sogliaVad = a.stt === "manuale" ? Infinity : sampleRate * 2 * 0.6;
  const fineAscolto = new Promise((ris) => {
    cliente.gestori.set(gestore, {
      dati(n) {
        if (registro.byte === 0 && n > 0) void evento("stt-vad-start", { timestamp: 0 });
        registro.byte += n;
        if (registro.byte >= sogliaVad) ris("vad");
      },
      fine() {
        registro.fine = true;
        ris("fine");
      },
    });
    setTimeout(() => ris("tempo"), 15_000);
  });
  await evento("run-start", {
    pipeline: "pipeline-italiano",
    language: "it",
    conversation_id: conversationId,
    runner_data: { stt_binary_handler_id: gestore, timeout: 60 },
    tts_output: { token, url, mime_type: "audio/wav", stream_response: a.tts === "streaming" },
  });
  await evento("stt-start", {
    engine: "stt.google_ai_stt",
    metadata: { language: "it", sample_rate: 16000 },
  });
  const perche = await fineAscolto;
  cliente.gestori.delete(gestore);
  if (!vivo()) return;
  if (perche === "vad") await evento("stt-vad-end", { timestamp: 600 });
  if (a.stt === "guasto") {
    // lo stream audio verso l'STT si interrompe (visto sul server il 30/09)
    await evento("error", { code: "stt-stream-failed", message: "Speech-to-text failed" });
    return evento("run-end", null);
  }
  if (a.stt === "silenzio" || registro.byte === 0) {
    await evento("error", { code: "stt-no-text-recognized", message: "No text recognized" });
    return evento("run-end", null);
  }
  await pausa(200);
  await evento("stt-end", { stt_output: { text: a.trascrizione } });
  await evento("intent-start", {
    engine: "conversation.google_ai_conversation",
    language: "it",
    intent_input: a.trascrizione,
    conversation_id: conversationId,
    device_id: null,
    satellite_id: null,
    prefer_local_intents: true,
  });
  return rispondiAssistente(cliente, id, conversationId, a.trascrizione, { token, url });
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

/** Le due origini delle prove: localhost = riserva, 127.0.0.1 = veloce. */
const RISERVA = `http://localhost:${PORTA}`;
const daVeloce = (req) => (req.headers.host ?? "").startsWith("127.0.0.1");

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
        audioVoce: stato.audioVoce,
        richiesteTts: stato.richiesteTts,
        disiscrizioniPipeline: stato.disiscrizioniPipeline,
        pipelineAperte: [...clienti].reduce((n, c) => n + c.pipeline.size, 0),
        clienti: clienti.size,
        acceso: stato.acceso,
        musica: stato.musica,
        iscrittiTimer: [...clienti].reduce(
          (n, c) => n + [...c.abbonamentiEventi.values()].filter((t) => t === "jarvis_timer").length,
          0,
        ),
      });
    if (comando === "spegni") {
      stato.acceso = false;
      for (const c of clienti) c.ws.terminate();
    } else if (comando === "accendi") stato.acceso = true;
    else if (comando === "latenza") stato.latenza = Number(url.searchParams.get("ms") ?? 0);
    else if (comando === "file") {
      const { nome, contenuto, tipo } = JSON.parse(await leggiCorpo(req));
      stato.fileVirtuali.set(nome, { contenuto, tipo: tipo ?? "application/json" });
    } else if (comando === "veloce") {
      stato.veloce = url.searchParams.get("stato") ?? "su";
      if (stato.veloce === "giu") for (const c of clienti) if (c.veloce) c.ws.terminate();
    } else if (comando === "rifiuta") stato.rifiuta.add(url.searchParams.get("servizio"));
    else if (comando === "muto") stato.muti.add(url.searchParams.get("entity_id"));
    else if (comando === "assistente") {
      const q = url.searchParams;
      const a = stato.assistente;
      if (q.has("modo")) a.modo = q.get("modo");
      if (q.has("ms")) a.attesaMs = Number(q.get("ms"));
      if (q.has("trascrizione")) a.trascrizione = q.get("trascrizione");
      if (q.has("stt")) a.stt = q.get("stt");
      if (q.has("tts")) a.tts = q.get("tts");
      if (q.has("continua")) a.continua = Number(q.get("continua"));
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
      stato.generazioniValide.clear();
      for (const c of clienti) c.ws.terminate();
    } else if (comando === "nuova-versione") {
      stato.nuovaVersione = true;
      stato.versioneServer = url.searchParams.get("versione");
    } else if (comando === "musica") stato.musica = JSON.parse((await leggiCorpo(req)) || "null");
    // evento jarvis_timer di jarvis_voce: {tipo, id, nome, secondi_totali, secondi_rimasti}
    else if (comando === "timer") eventoTimerServer(JSON.parse(await leggiCorpo(req)));
    else if (comando === "jarvis-voce") stato.jarvisVoce = url.searchParams.get("installato") !== "0";
    else if (comando === "reset") {
      for (const c of clienti) c.ws.terminate();
      reset();
    } else return json(res, 404, { errore: "comando sconosciuto" });
    return json(res, 200, { ok: true });
  }

  // Origine veloce delle prove (127.0.0.1): può sparire o rallentare
  if (daVeloce(req)) {
    if (stato.veloce === "giu") return req.socket.destroy();
    if (stato.veloce === "lenta") await new Promise((r) => setTimeout(r, 3000));
  }
  await ritardo();

  // Audio della TTS: come HA, senza login (il token nell'URL basta)
  if (p.startsWith("/api/tts_proxy/")) {
    const token = p.slice("/api/tts_proxy/".length).replace(/\.wav$/, "");
    stato.richiesteTts.push(token);
    attesaTts.get(token)?.();
    attesaTts.delete(token);
    res.writeHead(200, { "content-type": "audio/wav", "cache-control": "no-cache" });
    return res.end(wavProva());
  }

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
      stato.generazioniValide.add(stato.generazioneToken);
      return json(res, 200, {
        access_token: `accesso-${stato.generazioneToken}`,
        token_type: "Bearer",
        refresh_token: `rinnovo-${stato.generazioneToken}`,
        expires_in: 1800,
      });
    }
    if (tipo === "refresh_token") {
      stato.info.rinnovi++;
      const n = Number(/name="refresh_token"\r\n\r\nrinnovo-(\d+)/.exec(corpo)?.[1]);
      if (!stato.tokenValidi || !stato.generazioniValide.has(n))
        return json(res, 400, { error: "invalid_grant" });
      return json(res, 200, {
        access_token: `accesso-${n}`,
        token_type: "Bearer",
        expires_in: 1800,
      });
    }
    return json(res, 400, { error: "unsupported_grant_type" });
  }

  // File dell'app, come /config/www/jarvis/ → /local/jarvis/
  if (p.startsWith("/local/jarvis/")) {
    const rel = normalize(p.slice("/local/jarvis/".length)).replace(/^(\.\.[/\\])+/, "");
    const virtuale = stato.fileVirtuali.get(rel);
    if (virtuale) {
      stato.info.richieste[rel] = (stato.info.richieste[rel] ?? 0) + 1;
      res.writeHead(200, { "content-type": virtuale.tipo, "cache-control": "public, max-age=2678400" });
      return res.end(virtuale.contenuto);
    }
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
    // Come HA: i file di /local/ hanno una cache HTTP di un mese. Come l'nginx
    // dell'origine veloce: CORS permesso solo all'origine di riserva.
    res.writeHead(200, {
      "content-type": TIPI[extname(file)] ?? "application/octet-stream",
      "cache-control": "public, max-age=2678400",
      ...(req.headers.origin === RISERVA ? { "access-control-allow-origin": RISERVA } : {}),
      vary: "Origin",
    });
    const contenuto = readFileSync(file);
    if (rel === "sw.js" && stato.nuovaVersione) {
      const testo = stato.versioneServer
        ? String(contenuto).replace(/const VERSIONE = "[^"]+"/, `const VERSIONE = "${stato.versioneServer}"`)
        : String(contenuto);
      return res.end(`${testo}\n// versione nuova\n`);
    }
    return res.end(contenuto);
  }

  res.writeHead(404);
  res.end("non trovato");
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, testa) => {
  if (!req.url.startsWith("/api/websocket") || !stato.acceso || (daVeloce(req) && stato.veloce === "giu")) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, testa, (ws) => gestisci(ws, daVeloce(req)));
});

function gestisci(ws, veloce) {
  const cliente = {
    veloce,
    ws,
    autenticato: false,
    abbonamentiEventi: new Map(),
    coalesce: false,
    coda: [],
    invioProgrammato: false,
    abbonamentiEntita: new Set(),
    abbonamentiMeteo: new Map(),
    dispositivi: new Map(), // id della pipeline → device_id mandato dal pannello
    pipeline: new Set(), // assist_pipeline/run in corso (o finite e non ancora disiscritte, come in HA)
    gestori: new Map(), // id (1 byte) → gestore dell'audio in arrivo, come async_register_binary_handler
    prossimoGestore: 1,
  };
  clienti.add(cliente);
  stato.info.connessioni++;
  ws.on("close", () => clienti.delete(cliente));
  void invia(cliente, { type: "auth_required", ha_version: VERSIONE_HA });

  ws.on("message", async (grezzo, binario) => {
    if (binario) {
      // come websocket_api/http.py: primo byte = id del gestore, il resto è audio; solo l'id = fine
      const g = cliente.gestori.get(grezzo[0]);
      if (!g) return;
      if (grezzo.length === 1) g.fine();
      else g.dati(grezzo.length - 1);
      return;
    }
    const msg = JSON.parse(String(grezzo));
    await ritardo();
    if (!cliente.autenticato) {
      if (msg.type !== "auth") return;
      const n = Number(/^accesso-(\d+)$/.exec(String(msg.access_token))?.[1]);
      const valido = stato.tokenValidi && stato.generazioniValide.has(n);
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
        if (msg.domain === "jarvis_voce") {
          if (!stato.jarvisVoce)
            return invia(cliente, {
              id,
              type: "result",
              success: false,
              error: { code: "service_not_found", message: `Service ${chiave} not found.` },
            });
          let response = {};
          if (msg.service === "timer_attivi") response = { timer: elencoTimerServer() };
          if (msg.service === "timer_ferma")
            trasmettiEvento("jarvis_timer", { tipo: "fermato", id: dati.id });
          return invia(cliente, {
            id,
            type: "result",
            success: true,
            result: { context: { id: "ctx" }, response },
          });
        }
        if (msg.domain === "jarvis_musica") {
          // come il componente vero: stato letto da Spotify, comandi confermati
          const m = stato.musica;
          if (!m)
            return invia(cliente, {
              id,
              type: "result",
              success: false,
              error: { code: "service_not_found", message: `Service ${chiave} not found.` },
            });
          if (msg.service === "controllo") {
            if (dati.azione === "pausa") m.stato = "in_pausa";
            if (dati.azione === "riprendi") {
              m.stato = "in_riproduzione";
              // l'Echo cambia il volume da solo (30 → 40, visto il 30/09)
              if (m.volumeDopoRipresa !== undefined) m.volume = m.volumeDopoRipresa;
            }
            if (dati.azione === "volume") m.volume = dati.livello;
          }
          const response = {
            esito: "ok",
            stato: m.stato,
            stanza: m.stanza,
            volume: m.volume,
            titolo: m.titolo,
          };
          return invia(cliente, {
            id,
            type: "result",
            success: true,
            result: { context: { id: "ctx" }, response },
          });
        }
        eseguiServizio(msg.domain, msg.service, dati);
        return invia(cliente, { id, type: "result", success: true, result: { context: { id: "ctx" } } });
      }
      case "assist_pipeline/run": {
        const testoDomanda = msg.input?.text;
        cliente.dispositivi.set(id, msg.device_id ?? null);
        stato.richiesteAssistente.push({
          device_id: msg.device_id ?? null,
          testo: testoDomanda,
          conversation_id: msg.conversation_id ?? null,
          start_stage: msg.start_stage,
          end_stage: msg.end_stage,
          timeout: msg.timeout,
        });
        const aVoce =
          msg.start_stage === "stt" && msg.end_stage === "tts" && typeof msg.input?.sample_rate === "number";
        if (!aVoce && (msg.start_stage !== "intent" || typeof testoDomanda !== "string"))
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
        if (aVoce) void voceAssistente(cliente, id, conversationId, msg.input.sample_rate);
        else void rispondiAssistente(cliente, id, conversationId, testoDomanda);
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
