# CLAUDE.md — Jarvis OS

Memoria di lungo periodo del progetto. Va letto a ogni sessione e aggiornato a
ogni fase, insieme alle modifiche che lo riguardano.

## 1. Cos'è

**Jarvis OS** è una PWA a schermo intero per un **tablet Android 8" fissato a muro in
orizzontale**, che comanda la casa di Salvatore tramite **Home Assistant**. Deve
reggere 24/7 per mesi: **la stabilità viene prima di tutto**.

Salvatore è il product owner e non programma. Le scelte tecniche le fa Claude;
tutto ciò che riguarda **come si usa il pannello in casa** o **come si comporta la
casa** (layout, orari, soglie, automazioni) si chiede prima, con domande a scelta
multipla. Orari, soglie e abitudini non si inventano mai.

Il lato server (certificato HTTPS, configurazione di HA, installazione del
pacchetto) lo gestisce **un'altra sessione di Claude** che amministra HA. Qui si
prepara il materiale e le istruzioni per lei.

## 2. La casa (elenco reale del 26/09/2026, server aggiornato al 29/09)

HA **2026.9.3** gira su un Redmi Note 9 (Termux + Debian proot), ~4 GB di RAM quasi
tutta usata e CPU modesta: **il pannello non deve caricare il server**. Dal cloud
**non è raggiungibile**: i dati arrivano da Salvatore o dall'altra sessione.

Tre indirizzi, stessa istanza:

| Indirizzo | Note |
|---|---|
| `http://192.168.1.250:8123` | LAN, ~20 ms |
| `http://casa-veloce.tail8392c1.ts.net:8123` (`100.113.206.56`) | Tailscale, veloce, HTTP |
| `https://casa.tail8392c1.ts.net` | Tailscale **HTTPS**, certificato valido; lenta solo l'**apertura** di una connessione (proxy dentro proot) |

Misure dal vivo sull'HTTPS (29/09, 6 connessioni WebSocket dal browser):
**apertura di una connessione nuova 665–905 ms** (handshake TLS nel proxy),
**poi 12–18 ms per messaggio**; fetch HTTP su connessione già aperta 18–31 ms.
Quindi conta il numero di **connessioni nuove**, non di messaggi: una sola
connessione WebSocket persistente (è già così), pochi file da scaricare la prima
volta, e ogni tentativo di riconnessione costa ~1 s di handshake (il timeout di
apertura della libreria è 10 s, ampio).

Il microfono funziona solo in HTTPS, quindi il tablet usa
`https://casa.tail8392c1.ts.net/local/jarvis/index.html`. Da qui discendono il
bundle di pochi file e la cache completa nel service worker.

**Come HA serve `/local/`** (verificato nel codice di HA,
`components/http/static.py`): niente indice di cartella, quindi `/local/jarvis/`
dà 403 e si apre sempre `/local/jarvis/index.html`; ogni file ha
`Cache-Control: public, max-age=2678400`, cioè un mese.

Assistente: agente `conversation.google_ai_conversation` (Gemini), STT
`stt.google_ai_stt`, TTS `tts.google_translate_en_com`, pipeline Assist
predefinita in italiano. Il condizionatore ha i modi `heat_cool, cool, dry,
fan_only, heat, off`.

| Stanza | Entità | Note |
|---|---|---|
| Soggiorno | `media_player.soggiorno_tv_salotto`, `remote.soggiorno_tv_salotto`, `sensor.meter_salone_{temperatura,umidita,batteria}` | TV Samsung: stato affidabile |
| Camera da letto | `climate.condizionatore`, `switch.condizionatore`, `switch.tv_camera_da_letto`, `sensor.meter_letto_*` | Clima e TV **a infrarossi**: stato non verificabile |
| Veranda | `switch.scaldabagno`, `sensor.scaldabagno_batteria` | SwitchBot Bot sul pulsante dello scaldabagno |
| Cucina | (vuota) | Sul pannello resta nascosta finché è vuota |
| Senza stanza | `weather.forecast_casa`, `device_tracker.xiaomi_salvo`, `notify.xiaomi_salvo` | |

In casa **non ci sono luci smart**.

## 3. Com'è organizzato

| Percorso | Cosa |
|---|---|
| `home-assistant/packages/jarvis.yaml` | Tutto ciò che il pannello chiede a HA: aiutanti, sensori, scene, automazioni |
| `home-assistant/README.md` | Istruzioni di installazione e verifiche per chi amministra HA |
| `home-assistant/prove/prova_pacchetto.py` | Prova funzionale del pacchetto su un HA vero, riavvio compreso (96 verifiche) |
| `docs/mockup.html` | Mockup statico della schermata principale (1024×600), approvato |
| `src/main.ts` | Avvio: gestori d'errore globali, service worker, ricarica notturna, connessione |
| `src/configurazione.ts` | Preferenze: entità meteo e sensori del clima interno (F1) |
| `src/connessione/` | Login OAuth (`autenticazione.ts`), WebSocket e riconnessione (`connessione.ts`), backoff |
| `src/stato/` | `entita.ts` (aggiornamenti compressi, risincronizzazione), `negozio.ts` (notifiche per entità) |
| `src/meteo/` | Previsione in push, testi e icone delle condizioni |
| `src/pwa/` | Service worker, aggiornamenti controllati, ricarica delle 04:00 |
| `src/diagnostica/log.ts` | Log circolare (200 voci, salvato nel localStorage) |
| `src/ui/` | Componenti Lit; `base.ts` ha il riquadro protetto e i controller |
| `scripts/dopo-build.mjs` | Genera `dist/sw.js` dal modello e controlla i limiti (file, KB) |
| `scripts/crea-zip.sh` | `jarvis-dist.zip` da `dist/` |
| `test/unit/` | Vitest |
| `test/e2e/` + `test/finto-ha/server.mjs` | Playwright contro un finto HA fedele (OAuth, WebSocket, `/local/`) |
| `.github/workflows/` | `ci.yml` (app + pacchetto HA), `release.yml` (su tag `v*`) |

## 4. Architettura prevista dell'app (dal prompt, decisa)

- **TypeScript strict + Vite + Lit**, bundle iniziale < 200 KB gzip, niente CDN
  (font inclusi), percorsi relativi, `base: './'`.
- Servita da HA in `/config/www/jarvis/` → `<HA>/local/jarvis/`. Service worker con
  scope `/local/jarvis/`. Nessun backend proprio.
- Solo WebSocket con `home-assistant-js-websocket`: OAuth di HA (`getAuth`), mai
  long-lived token nel codice; `subscribeEntities`, `callService`,
  `conversation/process`, `assist_pipeline/run`. Il protocollo di Assist va
  **verificato sulla documentazione attuale** prima di implementarlo.
- Stanze e dispositivi si ricavano dai registri di HA (area/device/entity) e si
  aggiornano da soli quando i registri cambiano. Le preferenze (ordine, nascoste,
  colori delle scene) stanno in un file di configurazione. **Mai entity_id scritti
  nel codice dell'app.**
- Moduli: `connessione/` (auth, backoff con jitter, risincronizzazione),
  `stato/` (store per entità, aggiornamenti granulari), `registri/`, `comandi/`
  (feedback ottimistico + rollback), `assistente/`, `diagnostica/` (log circolare,
  versione; si apre **tenendo premuto l'orologio 3 s**).

### Com'è fatta davvero (F1, v0.1.0)

- **Build**: un solo file JS (stile compreso), `index.html`, `sw.js`, manifest, 3
  icone. Niente font: su Android il carattere di sistema è già Roboto.
  `scripts/dopo-build.mjs` blocca il build se i file superano 10, se il JS non è
  uno solo o se il codice supera 200 KB gzip. Oggi: 7 file, ~23 KB gzip.
- **Service worker**: in `install` mette in cache tutti i file (con
  `cache: 'reload'`, per scavalcare la cache di un mese di HA). Serve tutto dalla
  cache; la navigazione riceve sempre la `index.html` in cache (anche col
  `?auth_callback` del login). **Mai `skipWaiting` automatico**: la versione nuova
  aspetta la ricarica delle 04:00 o "Aggiorna ora" in diagnostica.
  `register(..., { updateViaCache: 'none' })`.
- **Connessione**: la libreria si riconnette da sola; in più ci sono attese
  esponenziali con jitter dentro `createSocket` (fino a 30 s, sommate allo 0-5 s
  fisso della libreria), un ping ogni 30 s con timeout 10 s che forza la
  riconnessione, e l'evento `online` che interrompe l'attesa.
- **Entità**: iscrizione diretta a `subscribe_entities` con il nostro
  `applicaAggiornamento`. Il primo messaggio dopo ogni (ri)sottoscrizione
  **sostituisce** tutto; la libreria invece lo fonderebbe, lasciando "fantasmi" le
  entità cancellate mentre il pannello era offline. Il segnale `prossimoCompleto`
  si arma solo prima di mandare l'iscrizione (primo collegamento) e nell'evento
  `ready` (riconnessione, sincrono col reinvio): vedi lezioni, v0.1.0.
- **Offline**: il pallino è sempre visibile. Dopo 10 s senza HA compaiono il
  banner e i valori "non aggiornati" (in arancione e scritto a parole).
- **Login**: senza token, schermata "Collega" con un pulsante; prima del redirect
  si verifica che HA risponda (`/auth/providers`). Token nel localStorage per
  origine (`jarvis-token`). Se HA rifiuta il login salvato: schermata "accedi di
  nuovo", mai redirect a sorpresa.
- **Preferenze F1** in `src/configurazione.ts` (entità meteo e sensori del clima):
  cambiarle richiede un nuovo build. Dalla F2 stanze e dispositivi arrivano dai
  registri di HA.

## 5. Decisioni di prodotto (log)

Si aggiungono in fondo, con la data. Non si cancellano: se una decisione cambia,
se ne scrive una nuova che annulla la precedente.

- **2026-09-26** — Tablet **8" orizzontale** (viewport di riferimento 1024×600).
- **2026-09-26** — **Tutte le stanze in una sola schermata**, niente linguette:
  sono 6 comandi in tutto. Ogni stanza ha in testa temperatura, umidità e
  percepita.
- **2026-09-26** — Assistente: **barra in basso** ("Chiedi a Jarvis…" + microfono)
  che apre un pannello di chat solo quando la usi.
- **2026-09-26** — **Modalità notte dopo 5 minuti** senza tocchi, e anche con
  la scena Buonanotte (evento `jarvis_buonanotte`).
- **2026-09-26** — Scene: **Buonanotte, Esco, Rientro**, ognuna con il suo colore
  di accento.
- **2026-09-26** — **Uscita di casa: solo notifica** con cosa resta acceso, più un
  pulsante per lanciare Esco. Non spegne niente da sola.
- **2026-09-26** — **Rientro**: parte col pulsante e all'arrivo del telefono a casa.
  Decide sulla **temperatura percepita** (Steadman): raffresca sopra 26° a 24°,
  riscalda sotto 18° a 21°. Soglie modificabili.
- **2026-09-26** — **Scaldabagno** (solare con resistenza di riserva): modalità
  inverno **da ottobre a giugno, dopo 2 giornate di fila con copertura media diurna
  ≥ 90%**. Una giornata sotto soglia la disattiva. Orari: 00:00 off e 04:30 on tutti
  i giorni; 11:00 off e 17:00 on da martedì a sabato. I cambi dentro una fascia
  hanno effetto **subito**.
- **2026-09-26** — La **TV della camera** (infrarossi) non entra in nessuna
  automazione: il comando "spegni" potrebbe accenderla.
- **2026-09-29** — Mockup approvato per la F1. La **diagnostica si apre tenendo
  premuto l'orologio 3 secondi**.
- **2026-09-29** — Le **release** le pubblica Claude a fine fase, con i test verdi:
  tag `vX.Y.Z` → il workflow allega `jarvis-dist.zip`.
- **2026-09-27** — Le 5 regolazioni (soglia nuvole, soglie e temperature del
  clima) **non hanno `initial:`**, così sopravvivono ai riavvii del server. I
  valori di partenza (90%, 26°, 24°, 18°, 21°) li imposta Salvatore una volta sola
  lato server, subito dopo l'installazione.

## 6. Convenzioni

- Tutto in italiano: codice, commenti, commit, documentazione.
- In HA tutto ciò che crea Jarvis ha nome/ID che inizia con `jarvis`.
- In HA le notifiche passano **solo** da `script.jarvis_notifica`.
- Niente emoji nei controlli: icone SVG (`@mdi/js` nell'app).
- Touch target ≥ 48 px. Lo stato si scrive sempre a parole, mai solo col colore.
- Mai `catch` vuoti: ogni errore va nel log diagnostico.
- Mai finti successi: un dispositivo a infrarossi si mostra come "ultimo comando"
  o "stato non verificabile", mai come "Acceso".

## 7. Comandi (tutti eseguiti)

```bash
npm ci
npm run verifica        # lint + typecheck + test + build + e2e: è il comando che conta
npm run build           # dist/ (7 file) + controllo dei limiti
npm test                # Vitest
npm run e2e             # Playwright contro il finto HA (serve dist/ già compilata)
bash scripts/crea-zip.sh
node test/finto-ha/server.mjs   # finto HA a mano: http://localhost:18123/local/jarvis/index.html

# Release: versione in package.json + sezione "## vX.Y.Z" in CHANGELOG.md, poi
# push sul branch principale. Il workflow "Release" vede che vX.Y.Z non esiste,
# rifà tutte le verifiche, crea il tag e allega jarvis-dist.zip. Se la release
# esiste già non fa niente.

# Prova del pacchetto HA (serve Python 3.13)
uv venv -p 3.13 .venv-ha && VIRTUAL_ENV=.venv-ha uv pip install homeassistant
.venv-ha/bin/python home-assistant/prove/prova_pacchetto.py   # atteso: 96/96
.venv-ha/bin/hass --script check_config -c <cartella con configuration.yaml + packages/>
```

## 8. Lezioni imparate

- **Gli infrarossi non hanno ritorno.** `switch.*` in stato `unknown` e un clima
  che mostra l'ultimo comando ne sono il segnale. Quei dispositivi vanno trattati
  come telecomandi, non come interruttori con uno stato.
- **Nelle prove di HA, `async_block_till_done` non basta per i template.** Il
  ridisegno dopo un cambio di stato parte con un timer a ritardo zero: serve
  anche un giro di loop (`asyncio.sleep(0.05)`), altrimenti la prova legge lo
  stato vecchio e sembra un difetto che non c'è.
- **Una prova si verifica anche al contrario.** Con un errore messo apposta nel
  pacchetto (04:30 → 05:00) deve fallire: ha segnalato esattamente le 2 verifiche
  attese.
- **`check_config` va fatto partire senza interfaccia web.** Nel banco di prova
  `hass_frontend` non c'è: l'avvio completo va in modalità ripristino e non carica
  il pacchetto. La prova usa `bootstrap.async_from_config_dict`.
- **Le note nel registro (`logbook.log`) vanno sempre per ultime** in
  un'automazione: se il servizio manca, non devono bloccare i passi importanti.
- **Mai `initial:` su un aiutante regolabile.** `input_number` (e simili) con
  `initial` tornano a quel valore a ogni riavvio di HA, e il server si riavvia
  spesso (blackout, guardiano). Senza `initial` HA ripristina l'ultimo valore; alla
  prima installazione però parte dal `min`, quindi i valori di partenza si
  documentano nel README e l'amministratore li imposta una volta sola. `counter`
  con `restore: true` è diverso: lì `initial` vale solo la prima volta. Il
  ripristino si salva ogni 15 minuti e allo spegnimento ordinato: con un blackout
  si può perdere l'ultima regolazione. Verificato con un riavvio vero nella prova
  (sezione 15), che fallisce se si rimette `initial:`.
- **Il finto server deve essere fedele al vero, o le prove mentono.** La prima
  versione serviva `index.html` per la cartella `/local/jarvis/`: tutte le prove
  passavano, ma su HA il service worker avrebbe fallito l'installazione (c'era
  `./` nell'elenco dei file). Guardando il codice di HA è venuto fuori che
  `/local/` non ha indice e ha una cache di un mese. Ora il finto server fa lo
  stesso e una prova apposta controlla sia il 403 sia l'elenco del service worker.
- **La libreria `home-assistant-js-websocket` fonde lo stato dopo una
  riconnessione**: le entità cancellate nel frattempo restano. Per questo
  l'iscrizione alle entità è gestita da noi (`stato/entita.ts`). La prova e2e
  "HA che cade e torna" fallisce se si toglie la sostituzione (verificato).
- **v0.1.0 rotta sul tablet vero ("Connesso" ma tutto "non trovato"), prove
  verdi.** HA vero, con `coalesce_messages` (la libreria lo attiva sempre), manda
  risultato dell'iscrizione e foto completa nello STESSO frame, e la libreria li
  processa di fila in modo sincrono: il codice dopo `await subscribeMessage(...)`
  riparte quando la foto è già arrivata. Riarmare lì "il prossimo è completo"
  faceva scambiare il primo `{c:…}` per una foto completa → negozio svuotato.
  Regola: **quello che deve succedere prima della risposta si fa prima di
  mandare la richiesta, mai dopo l'`await`**. Il finto HA ora raggruppa i
  messaggi e manda i cambi come `c`; la prova riproduceva il bug prima della
  correzione. Trovato dalla sessione server leggendo il bundle pubblicato.
- **Mai `pkill -f` o `grep` con il nome del processo scritto per intero** nella
  stessa riga di comando: il pattern compare anche nella riga della shell, che si
  uccide da sola (è successo due volte). Si usa `pkill -f "server[.]mjs"`.
- **Dalle sessioni cloud di Claude il push dei tag non passa** (il proxy git
  accetta solo il branch di lavoro: "remote end hung up"), e nemmeno l'avvio di
  un workflow via API (403). Per questo la release parte dal push sul branch
  principale quando la versione è nuova, e il tag lo crea il workflow.
- **Il branch di default del repo è `claude/new-session-vpjgbq`**, non `main`:
  attenzione ai link "raw" e a "latest".
- **Controprova non conclusiva su `updateViaCache`.** Con `'all'` la prova di
  aggiornamento fallisce, ma non nel punto atteso: il browser trova comunque la
  versione nuova. Si tiene `'none'` perché è corretto con la cache di un mese di HA,
  senza sostenere che sia dimostrato indispensabile.
- **Segnalazione "la diagnostica non vede l'aggiornamento" (29/09), non
  riprodotta.** La diagnostica si ridisegna ogni secondo e rilegge
  `registration.waiting`; la prova e2e che simula il tablet (ricarica su
  indirizzo lento, diagnostica aperta subito) arriva a "pronto". Resta aperto il
  sintomo simile visto nella controprova con `updateViaCache: 'all'`: se si
  ripresenta sul tablet vero, partire da lì. Aggiunto lo stato "in download…".
