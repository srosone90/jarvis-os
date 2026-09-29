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
    "switch.scaldabagno": e("off"),
    "media_player.soggiorno_tv_salotto": e("off"),
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
    generazioneToken: 1,
    info: { connessioni: 0, login: 0, rinnovi: 0, richieste: {} },
  };
}
reset();

const clienti = new Set(); // { ws, abbonamentiEntita:Set<id>, abbonamentiMeteo:Map<id,entita> }
const ritardo = () => new Promise((r) => setTimeout(r, stato.latenza));

async function invia(cliente, msg) {
  await ritardo();
  if (cliente.ws.readyState === 1) cliente.ws.send(JSON.stringify(msg));
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
      return json(res, 200, { ...stato.info, clienti: clienti.size, acceso: stato.acceso });
    if (comando === "spegni") {
      stato.acceso = false;
      for (const c of clienti) c.ws.terminate();
    } else if (comando === "accendi") stato.acceso = true;
    else if (comando === "latenza") stato.latenza = Number(url.searchParams.get("ms") ?? 0);
    else if (comando === "stato") {
      const { entity_id, state, attributes } = JSON.parse(await leggiCorpo(req));
      const vecchia = stato.entita[entity_id];
      stato.entita[entity_id] = {
        s: String(state),
        a: attributes ?? vecchia?.a ?? {},
        c: "ctx",
        lc: Date.now() / 1000,
      };
      trasmettiEntita({ a: { [entity_id]: stato.entita[entity_id] } });
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
  const cliente = { ws, autenticato: false, abbonamentiEntita: new Set(), abbonamentiMeteo: new Map() };
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
        return invia(cliente, { id, type: "result", success: true, result: null });
      case "ping":
        return invia(cliente, { id, type: "pong" });
      case "subscribe_entities":
        cliente.abbonamentiEntita.add(id);
        await invia(cliente, { id, type: "result", success: true, result: null });
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
        await invia(cliente, { id, type: "result", success: true, result: null });
        return invia(cliente, { id, type: "event", event: { type: "daily", forecast: previsione() } });
      }
      case "unsubscribe_events":
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
