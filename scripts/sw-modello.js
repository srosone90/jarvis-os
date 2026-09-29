/*
 * Service worker di Jarvis OS — GENERATO da scripts/dopo-build.mjs: non
 * modificare dist/sw.js a mano, si modifica questo modello.
 *
 * Mette in cache TUTTI i file dell'app al primo caricamento: dopo, il pannello
 * si apre all'istante anche sull'indirizzo HTTPS lento (~1,5 s a richiesta) o
 * con Home Assistant spento. Sul filo passa solo il WebSocket.
 *
 * Aggiornamento controllato: una versione nuova si installa ma resta in attesa
 * finché la pagina non chiede "attiva-subito" (ricarica notturna delle 04:00 o
 * pulsante in diagnostica). Mai skipWaiting automatico.
 */
const VERSIONE = "__VERSIONE__";
const IMPRONTA = "__IMPRONTA__";
const FILE = __ELENCO__;
const CACHE = `jarvis-${VERSIONE}-${IMPRONTA}`;

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILE.map((f) => new Request(f, { cache: "reload" })))),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomi) =>
        Promise.all(nomi.filter((n) => n.startsWith("jarvis-") && n !== CACHE).map((n) => caches.delete(n))),
      )
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

  // Pagina: sempre la index.html in cache (anche con ?auth_callback=… del login).
  if (richiesta.mode === "navigate") {
    evento.respondWith(
      caches.match(new URL("./index.html", self.registration.scope).href).then((r) => r || fetch(richiesta)),
    );
    return;
  }
  evento.respondWith(caches.match(richiesta, { ignoreSearch: true }).then((r) => r || fetch(richiesta)));
});
