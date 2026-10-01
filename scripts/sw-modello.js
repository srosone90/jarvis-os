/*
 * Service worker di Jarvis OS — GENERATO da scripts/dopo-build.mjs: non
 * modificare dist/sw.js a mano, si modifica questo modello.
 *
 * Mette in cache TUTTI i file dell'app al primo caricamento: dopo, il pannello
 * si apre all'istante anche sull'indirizzo HTTPS lento (~1,5 s a richiesta) o
 * con Home Assistant spento. Sul filo passa solo il WebSocket.
 *
 * Il motore della parola «Jarvis» (parola/, ~17 MB, v0.5.0) ha una cache sua,
 * che sopravvive alle versioni: i nomi dei file hanno l'impronta del
 * contenuto, quindi a ogni versione si scarica solo ciò che è cambiato (di
 * solito il solo motore-*.js, ~90 KB), non 17 MB. Si riempie al primo uso,
 * MAI durante l'installazione (vedi "install").
 *
 * Aggiornamento controllato: una versione nuova si installa ma resta in attesa
 * finché la pagina non chiede "attiva-subito" (ricarica notturna delle 04:00 o
 * pulsante in diagnostica). Mai skipWaiting automatico.
 */
const VERSIONE = "__VERSIONE__";
const IMPRONTA = "__IMPRONTA__";
const FILE = __ELENCO__;
const PAROLA = __PAROLA__;
const CACHE = `jarvis-${VERSIONE}-${IMPRONTA}`;
const CACHE_PAROLA = "jarvis-parola";

self.addEventListener("install", (evento) => {
  // Il motore della parola (17 MB) NON si scarica qui: renderebbe lenta e fragile
  // l'installazione di tutto il pannello. Lo mette in cache il fetch qui sotto al
  // primo uso (con «Jarvis» acceso, subito dopo l'avvio).
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILE.map((f) => new Request(f, { cache: "reload" })))),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomi) =>
        Promise.all(
          nomi
            .filter((n) => n.startsWith("jarvis-") && n !== CACHE && n !== CACHE_PAROLA)
            .map((n) => caches.delete(n)),
        ),
      )
      // della parola si tengono solo i file di questa versione
      .then(() => caches.open(CACHE_PAROLA))
      .then(async (cache) => {
        const validi = new Set(PAROLA.map((f) => new URL(f, self.registration.scope).href));
        for (const r of await cache.keys()) if (!validi.has(r.url)) await cache.delete(r);
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (evento) => {
  if (evento.data && evento.data.tipo === "attiva-subito") self.skipWaiting();
});

self.addEventListener("fetch", (evento) => {
  const richiesta = evento.request;
  if (richiesta.method !== "GET") return;
  const url = new URL(richiesta.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;

  // Pagina del pannello: sempre la index.html in cache (anche con ?auth_callback=…
  // del login). Solo la radice e index.html: altre pagine (es. la prova "Ehi
  // Jarvis") vanno alla rete, senza cache.
  if (richiesta.mode === "navigate") {
    const scope = new URL(self.registration.scope).pathname;
    if (url.pathname !== scope && url.pathname !== `${scope}index.html`) return;
    evento.respondWith(
      caches.match(new URL("./index.html", self.registration.scope).href).then((r) => r || fetch(richiesta)),
    );
    return;
  }
  // parola/: dalla cache sua; la prima volta (e quando un file cambia) dalla rete, e lo si tiene
  if (url.pathname.startsWith(new URL("./parola/", self.registration.scope).pathname)) {
    evento.respondWith(
      caches.open(CACHE_PAROLA).then(async (cache) => {
        const trovata = await cache.match(richiesta, { ignoreSearch: true });
        if (trovata) return trovata;
        const risposta = await fetch(richiesta);
        if (risposta.ok) await cache.put(richiesta, risposta.clone());
        return risposta;
      }),
    );
    return;
  }
  evento.respondWith(caches.match(richiesta, { ignoreSearch: true }).then((r) => r || fetch(richiesta)));
});
