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
 *   /__prova/stato               {entity_id, state, attributes?}: cambia/crea un'entità
 *   /__prova/rimuovi?entity_id=  toglie un'entità (anche mentre HA è "giù")
 *   /__prova/revoca              invalida i token: serve rifare il login
 *   /__prova/nuova-versione      il server pubblica un sw.js diverso (app aggiornata)
 *   /__prova/rifiuta?servizio=   HA rifiuta quel servizio (es. media_player.turn_on)
 *   /__prova/muto?entity_id=     il dispositivo accetta i comandi ma non cambia stato
 *   /__prova/aggiungi            {area?, dispositivo?, entita, s, a}: dispositivo nuovo nei registri
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

/** Cambia (o crea) un'entità e lo manda ai client, come fa HA. */
function impostaEntita(entity_id, s, a) {
  const vecchia = stato.entita[entity_id];
  stato.entita[entity_id] = { s: String(s), a: a ?? vecchia?.a ?? {}, c: "ctx", lc: Date.now() / 1000 };
  const n = stato.entita[entity_id];
  trasmettiEntita(
    vecchia ? { c: { [entity_id]: { "+": { s: n.s, a: n.a, lc: n.lc } } } } : { a: { [entity_id]: n } },
  );
}

/** Effetto dei servizi sui dispositivi finti (come si comporterebbero quelli veri). */
function eseguiServizio(dominio, servizio, dati) {
  const ids = [].concat(dati.entity_id ?? []);
  for (const id of ids) {
    if (stato.muti.has(id)) continue;
    const e = stato.entita[id];
    if (!e) continue;
    const a = { ...e.a };
    if (dominio === "media_player" || (dominio === "switch" && e.s !== "unknown")) {
      if (servizio === "turn_on") setTimeout(() => impostaEntita(id, "on", a), 300);
      if (servizio === "turn_off") setTimeout(() => impostaEntita(id, "off", a), 300);
      if (servizio === "volume_mute") impostaEntita(id, e.s, { ...a, is_volume_muted: dati.is_volume_muted });
    }
    if (dominio === "climate") {
      if (servizio === "set_hvac_mode") impostaEntita(id, dati.hvac_mode, a);
      if (servizio === "set_temperature") impostaEntita(id, e.s, { ...a, temperature: dati.temperature });
    }
  }
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
    else if (comando === "aggiungi") {
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
      const { entity_id, state, attributes } = JSON.parse(await leggiCorpo(req));
      const vecchia = stato.entita[entity_id];
      stato.entita[entity_id] = {
        s: String(state),
        a: attributes ?? vecchia?.a ?? {},
        c: "ctx",
        lc: Date.now() / 1000,
      };
      // Come HA: entità nuova → "a"; entità esistente → differenza "c"
      const n = stato.entita[entity_id];
      trasmettiEntita(
        vecchia ? { c: { [entity_id]: { "+": { s: n.s, a: n.a, lc: n.lc } } } } : { a: { [entity_id]: n } },
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
      case "unsubscribe_events":
        cliente.abbonamentiEventi.delete(msg.subscription);
        cliente.abbonamentiEntita.delete(msg.subscription);
        cliente.abbonamentiMeteo.delete(msg.subscription);
        return invia(cliente, { id, type: "result", success: true, result: null });
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
