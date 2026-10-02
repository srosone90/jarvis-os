# CLAUDE.md — Jarvis OS

Memoria di lungo periodo del progetto. Va letto a ogni sessione e aggiornato a
ogni fase, insieme alle modifiche che lo riguardano.

## Mappa dei moduli

Indice per navigare: una riga per modulo. Per una modifica si legge la riga,
poi il contratto del modulo, poi i suoi file. Formato: modulo — a cosa serve —
indice — dipende da — test.

**Regole dei confini** (riordino del 02/10):

- ogni modulo è una cartella di `src/`; **fuori dal modulo si importa solo il
  suo contratto**: `index.ts` (la logica) e, se il modulo ha anche
  interfaccia, `componenti.ts` (i suoi elementi Lit). Un modulo di sola
  interfaccia espone tutto da `index.ts`;
- **la logica non importa mai `componenti.ts`**: è quello che tiene il grafo
  senza giri chiusi (`connessione` crea i servizi di quasi tutti i moduli, e
  l'interfaccia usa `connessione`; con un indice unico, logica e interfaccia
  si importerebbero a vicenda e l'avvio potrebbe fermarsi su un valore non
  ancora pronto). Le prove di un modulo possono leggere i suoi file interni;
- un file caricato dopo (`import()`) non si riesporta mai come valore dal
  contratto: finirebbe nel pacchetto iniziale (solo `export type`);
- confini esterni, fuori dal pannello e da non toccare da qui: **Home
  Assistant** (WebSocket), **jarvis_voce** (pipeline `assist_pipeline/run`,
  eventi `jarvis_timer`/`jarvis_annuncio`, servizi), **jarvis_musica**
  (servizi in `home-assistant/custom_components/jarvis_musica`, contratto
  esterno), il **pacchetto** `home-assistant/packages/`;
- prove: `test/unit/<modulo>/` e `test/e2e/<modulo>/`, lanciate da
  `npm run test:<modulo>` (`scripts/test-modulo.mjs`: unitarie, poi build e
  browser); quelle trasversali (layout alle 6 misure) in
  `test/e2e/trasversali/`, con `npm run verifica`.

| Modulo | A cosa serve | Indice | Dipende da | Test |
|---|---|---|---|---|
| diagnostica | registro (`log`), schermata Diagnostica | `src/diagnostica/index.ts`, `componenti.ts` | — (la schermata: connessione, interfaccia, pwa, parola) | `npm run test:diagnostica` |
| comune | configurazione della casa (`PREFERENZE`, `ORIGINI`), avvisi a schermo, numeri con la virgola | `src/comune/index.ts` | diagnostica | `npm run test:comune` |
| interfaccia | base dei componenti (`RiquadroSicuro`, osservatori), campi delle impostazioni, stili, sfera, avvisi a schermo | `src/interfaccia/index.ts` | comune, connessione, diagnostica | `npm run test:interfaccia` |
| connessione | il cuore: WebSocket con HA, login, negozio degli stati, interruzioni; crea i servizi di tutti i moduli | `src/connessione/index.ts`, `componenti.ts` | quasi tutti (è chi li crea) | `npm run test:connessione` |
| pwa | service worker e aggiornamenti, origine veloce/di riserva, ricarica notturna | `src/pwa/index.ts` | comune, diagnostica | `npm run test:pwa` |
| casa | stanze e dispositivi dai registri, comandi, storico, card e schermata Stanza | `src/casa/index.ts`, `componenti.ts` | comune, connessione, diagnostica, interfaccia, meteo | `npm run test:casa` |
| voce | microfono condiviso, pipeline voce→HA→voce, riascolto, riquadro, pausa della musica, audio sveglio, stanza del pannello; Impostazioni → Voce | `src/voce/index.ts`, `componenti.ts` | assistente, comune, connessione, diagnostica, interfaccia (le impostazioni anche parola) | `npm run test:voce` |
| parola | «Jarvis» sempre in ascolto: motore openWakeWord (caricato dopo, `parola/`), verificatore della pronuncia, soglie, contesto, guarda e parla | `src/parola/index.ts`, `componenti.ts` | assistente, comune, connessione, diagnostica, fotocamera, interfaccia, timer, voce | `npm run test:parola` |
| assistente | turni con Gemini via `assist_pipeline/run`, pipeline del contesto, messaggi d'errore; la chat | `src/assistente/index.ts`, `componenti.ts` | casa, comune, connessione, diagnostica, interfaccia, voce | `npm run test:assistente` |
| timer | timer di jarvis_voce per pannello, suoneria, servizi; schermata Timer, timer sotto l'orologio, «Timer finito», timer a tutto schermo | `src/timer/index.ts`, `componenti.ts` | comune, connessione, diagnostica, interfaccia, navigazione, riposo, voce | `npm run test:timer` |
| annunci | Jarvis parla per primo (`jarvis_annuncio`), annunci scritti a riposo; Impostazioni → annunci | `src/annunci/index.ts`, `componenti.ts` | assistente, comune, connessione, diagnostica, interfaccia, voce | `npm run test:annunci` |
| fotocamera | presenza, «Jarvis» più facile da vicino, guarda e parla, spia; modello del volto caricato dopo | `src/fotocamera/index.ts`, `componenti.ts` | comune, connessione, diagnostica, interfaccia | `npm run test:fotocamera` |
| musica | Spotify via jarvis_musica: cosa suona, comandi, playlist, dispositivo del pannello, «Collega»; schermata Musica, mini-lettore | `src/musica/index.ts`, `componenti.ts` | comune, connessione, diagnostica, interfaccia, navigazione | `npm run test:musica` |
| meteo | previsione di HA, testi e icone, dettagli; meteo della Casa e schermata Meteo | `src/meteo/index.ts`, `componenti.ts` | comune, connessione, diagnostica, interfaccia | `npm run test:meteo` |
| clima | schermata Clima: grafico delle stanze, consumi | `src/clima/componenti.ts` | casa, comune, connessione, diagnostica, interfaccia, meteo, navigazione | `npm run test:clima` |
| scene | scene (script/scene di HA), conferma col secondo tocco; schermata Scene | `src/scene/index.ts`, `componenti.ts` | casa, comune, connessione, diagnostica, interfaccia, navigazione | `npm run test:scene` |
| spesa | lista della spesa (`todo` di HA); schermata Spesa | `src/spesa/componenti.ts` | comune, connessione, diagnostica, interfaccia, navigazione | `npm run test:spesa` |
| avvisi | eventi dei dispositivi dal registro di HA, batterie basse; schermata Avvisi | `src/avvisi/componenti.ts` | casa, comune, connessione, diagnostica, interfaccia, navigazione | `npm run test:avvisi` |
| riposo | vista completo/riposo/Hub e quando cambiare (`vista`); schermo a riposo | `src/riposo/index.ts`, `componenti.ts` | comune, connessione, diagnostica, interfaccia, meteo, parola, timer | `npm run test:riposo` |
| hub | modalità Hub: sfera e sottotitoli | `src/hub/index.ts` | assistente, connessione, interfaccia, riposo, timer, voce | `npm run test:hub` |
| navigazione | colonna, Altro, schermate e loro preferenze (`schermate`), indirizzo `#…` | `src/navigazione/index.ts`, `componenti.ts` | comune, diagnostica, interfaccia, riposo | `npm run test:navigazione` |
| impostazioni | Impostazioni a sezioni, Schermate, esporta/importa, procedura guidata | `src/impostazioni/componenti.ts` | quasi tutti (ogni sezione viene dal suo modulo) | `npm run test:impostazioni` |
| app | il guscio: `jarvis-app` (cosa mostrare, sovrapposti), orologio | `src/app/index.ts` | quasi tutti | `npm run test:app` |

_Le sezioni storiche più sotto (fasi, versioni) citano a volte i percorsi di
prima del riordino del 02/10 (`src/ui/…`, `src/stato/…`, `src/vista/…`,
`src/pagine/…`, `src/eventi/…`, `test/e2e/<file>.spec.ts` nella radice): per
dove sta un file oggi vale questa mappa._

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
| `https://casa.tail8392c1.ts.net` | Tailscale **HTTPS**, certificato valido. **Origine di riserva**: lentissima sui dati (~30 KB/s, misurato il 30/09), ma sempre su |
| `https://jarvis-rosone.duckdns.org:8443` | **Origine veloce** (dal 30/09): nginx nativo in Termux + DuckDNS + Let's Encrypt, sull'app Tailscale di Android. 14 MB in ~1 s; sparisce se l'app Tailscale si spegne |

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

**Due origini (v0.4.2).** Il 30/09 la sessione server ha misurato il link https
sui dati: ~30 KB/s (1,3 MB in 36 s; il wasm da 14 MB non finisce in 100 s), e
l'app Tailscale di Android non può rilasciare certificati (ACME disattivato,
issue tailscale #18245). Ha quindi creato l'origine veloce con nginx (HTTP/2,
WebSocket, `proxy_buffering off`, CORS su `/local/jarvis/*` solo per
`https://casa.tail8392c1.ts.net`). **Decisione di Salvatore: si apre sempre e
solo il link vecchio**, niente link nuovi da ricordare. Quindi:

- all'avvio, **solo se** la pagina viene dalla riserva, `src/pwa/origine.ts`
  chiede `sw.js` (c'è sempre nello zip, accanto alla pagina) all'origine veloce,
  `cache: 'no-store'`, `mode: 'cors'`, con 1,5 s di tempo; se risponde `ok` →
  `location.replace()` alla stessa pagina (percorso, parametri, frammento). La
  prova parte in parallelo all'avvio: niente attesa, mai pagina bianca;
- vale per il pannello (fino alla v0.4.8 anche per `prova-ehi-jarvis.html`, tolta con la v0.5.0);
- **al massimo un passaggio per sessione** (`sessionStorage` della riserva);
  la veloce non rimanda mai alla riserva da sola. Se sulla veloce HA manca da
  30 s (non per un login da fare) e la riserva risponde (`no-cors`: la riserva
  non manda CORS), il banner propone "Torna al link di riserva", che apre la
  riserva con `?origine=riserva` (tolto appena arrivati): lì non si riparte;
- tornando dal login (`?auth_callback`) la veloce non si prova: il codice del
  login vale solo sull'origine dove è stato fatto;
- ogni origine ha **il suo login** (la prima volta sulla veloce si tocca
  "Accedi"), il suo service worker e la sua cache;
- diagnostica: riga "Origine in uso" (veloce / di riserva / altra + motivo);
  nella prova "Ehi Jarvis" la riga "Indirizzo" dei risultati;
- origini in `ORIGINI` di `src/configurazione.ts`: **costante ora, preferenza
  nella fase G** (multi-casa). Le prove le sostituiscono con
  `window.__JARVIS_ORIGINI__` (localhost = riserva, 127.0.0.1 = veloce, stesso
  finto HA: `/__prova/veloce?stato=su|giu|lenta`).

Effetto da sapere: se il pannello è **installato come app** dalla riserva,
dopo il passaggio Chrome può mostrare in alto una barra sottile con
l'indirizzo, perché la veloce è fuori dall'app installata. In un browser kiosk
non succede.

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

**Il codice del pannello (`src/`) e le sue prove sono per modulo: vedi la
«Mappa dei moduli» in cima.** Qui il resto.

| Percorso | Cosa |
|---|---|
| `src/main.ts`, `src/globali.d.ts` | Avvio (gestori d'errore globali, service worker, origine, connessione, app) e la costante `__VERSIONE__` |
| `src/<modulo>/` | Un modulo per cartella, col suo contratto (`index.ts`, `componenti.ts`): mappa in cima |
| `test/unit/<modulo>/`, `test/e2e/<modulo>/` | Prove del modulo, `npm run test:<modulo>` (`scripts/test-modulo.mjs`) |
| `test/e2e/trasversali/layout.spec.ts` | Layout a 6 misure di tutto il pannello: niente sovrapposizioni, testi tagliati né scorrimento orizzontale. Screenshot in `schermate/layout/` (ignorata da Git) |
| `test/e2e/aiuti.ts`, `test/e2e/stato-iniziale.json`, `test/finto-ha/server.mjs` | Aiuti comuni delle prove nel browser, stato iniziale (guida già fatta), finto Home Assistant fedele (OAuth, WebSocket, `/local/`, registri, servizi, Spotify finto) |
| `test/dati/audio/`, `test/dati/video/`, `test/unit/dati/` (ognuna con `LICENZA.md` dove serve) | Clip Piper, rumore, video della fotocamera finta, riferimento scikit-learn del verificatore |
| `modelli/openwakeword/`, `modelli/volto/` | Modelli ONNX («Jarvis»: CC BY-NC-SA 4.0, solo non commerciale; volto: MIT) con `LICENZA.md` e sha256 |
| `home-assistant/packages/jarvis.yaml` | Tutto ciò che il pannello chiede a HA: aiutanti, sensori, scene, automazioni, `script.jarvis_presenza` |
| `home-assistant/custom_templates/jarvis.jinja` | Macro con gli orari dello scaldabagno: UNICO posto dove sono scritti |
| `home-assistant/custom_components/jarvis_musica/`, `home-assistant/packages/jarvis_musica.yaml`, `home-assistant/esempi/jarvis_musica_stanze.yaml` | Musica lato HA (contratto esterno del modulo `musica`): ricerca e avvio su Spotify Connect, comandi, dispositivi per pannello; tre script per Gemini |
| `home-assistant/prove/prova_pacchetto.py`, `prova_musica.py` | Prove su un HA vero (117 e 87 verifiche) |
| `home-assistant/README.md` | Istruzioni di installazione e verifiche per chi amministra HA |
| `docs/ISTRUZIONI-JARVIS.md` | **Testo ufficiale di carattere e regole di Jarvis**, da applicare lato server |
| `docs/mockup*.html`, `docs/proposta-multicasa.md` | Mockup approvati delle fasi; proposta per le altre case |
| `STATO.md` | **Per la sessione server** (la legge da GitHub): cosa si sta facendo, ultima release con sha256 e cosa installare, scelte da confermare, bug trovati |
| `scripts/dopo-build.mjs`, `scripts/crea-zip.sh`, `scripts/riferimento-verificatore.py` | `dist/sw.js` e controlli dei limiti (file, KB, `parola/`); lo zip; il riferimento del verificatore |
| `.github/workflows/` | `ci.yml` (app + pacchetto HA), `release.yml` (sul push del branch, se la versione è nuova; una alla volta, in coda) |

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
- **Preferenze** in `src/configurazione.ts`: cambiarle richiede un nuovo build.
  Stanze e dispositivi invece arrivano dai registri di HA.

### F2 (v0.2.0): stanze e comandi

- **Registri**: `config/area_registry/list`, `config/device_registry/list`,
  `config/entity_registry/list_for_display` (nessuno richiede admin, verificato
  nel codice di HA). Riletti a ogni (ri)connessione e 1 s dopo un evento
  `area|device|entity_registry_updated` (ascoltabili anche da non admin).
- **Una card per dispositivo**, con l'entità di dominio più importante
  (climate > media_player > cover > fan > light > lock > vacuum > switch). Niente
  card per sensori, remote, entità nascoste o di configurazione/diagnostica.
  L'area dell'entità vince su quella del dispositivo. Stanze delle preferenze
  prima, con la loro zona del mockup; le aree nuove in coda da sole; una stanza
  senza card e senza clima non si vede.
- **Tipi di card**: `clima` (4 modalità + "Altro", temperatura −/+ con un solo
  invio 1,2 s dopo l'ultimo tocco), `media` (accendi/spegni + volume e muto),
  `interruttore` (normale con conferma; a infrarossi = "Tasto accensione" unico;
  col programma dello scaldabagno letto dal pacchetto HA), `non-supportato`
  (nome e stato, nessun controllo).
- **Comandi**: offline non partono (card disattivate appena HA manca). Con stato
  affidabile: stato atteso mostrato subito, poi conferma entro un tempo (TV 40 s
  in accensione, Bot 30 s, altrimenti 15 s); se HA rifiuta o non conferma si torna
  allo stato vero con un avviso. A infrarossi: solo "comando inviato".

### Context degli stati (v0.3.1)

- Lo stato di un'entità **viene da un comando vero** solo se il suo context ha
  `user_id` (utente: pannello, HA, assistente) o `parent_id` (automazione):
  `scrittoDaUnAzione()` in `stato/entita.ts`. Uno stato "di sistema" (avvio,
  stato assunto da un dispositivo a infrarossi) non ha nessuno dei due; un
  comando rifiutato non scrive lo stato. È in HA, quindi vale per tutti i
  pannelli. Dopo un riavvio di HA si torna a "Nessun comando inviato".
- Formato (verificato su HA 2026.2.3, invariato da anni): nello stato completo
  il context è una stringa se user_id e parent_id sono vuoti; nelle differenze
  è una stringa se è cambiato solo l'id, altrimenti un oggetto con i SOLI campi
  cambiati, da **fondere** col precedente (prima della v0.3.1 lo sostituivamo).

### F4 (v0.3.0): assistente testuale

- **Errori di Gemini** (v0.3.2, `src/assistente/messaggi.ts`): arrivano come
  risposta con `response_type: "error"`. All'invio (dove cade di solito il 429)
  il testo è solo "Sorry, I had a problem getting a response from Google
  Generative AI." **senza la causa**; durante la risposta c'è in coda il
  messaggio di Google ("Resource has been exhausted…", "The model is
  overloaded…"). Si riconoscono quota e occupato quando la causa c'è; quando non
  c'è, un messaggio onesto che copre entrambe. Mai inglese a schermo: il
  dettaglio va nel log.

- **Motore unico** in `src/assistente/`: la chat è solo una faccia; voce (F5) e
  Hub useranno lo stesso `connessione.assistente`.
- Usa **`assist_pipeline/run` da `intent` a `intent`** (non `conversation/process`):
  stesso comando che userà la voce, risposta che arriva a pezzi, risultati degli
  strumenti visibili. Pipeline predefinita (quella in italiano), `timeout: 60`.
- **`resubscribe: false` sempre**: la libreria, dopo una riconnessione, rimanda
  da sola le sottoscrizioni; una pipeline "spegni la TV" rimandata la
  eseguirebbe due volte. La prova "connessione persa a metà" controlla che dopo
  la riconnessione HA abbia ricevuto una richiesta sola.
- A fine risposta **ci si disiscrive**: HA non toglie da solo la pipeline finita
  da `connection.subscriptions`, e la libreria la terrebbe nella sua mappa: in
  mesi di domande crescerebbero entrambe. Se `run-end` non arriva, si pulisce
  dopo 10 s.
- Tempi: "più del solito" dopo 15 s, errore dopo 60 s. HA dimentica il contesto
  dopo 5 minuti senza messaggi, quindi la chat mostra solo la conversazione in
  corso e riparte vuota dopo 5 minuti (o con "Nuova conversazione").
- **Etichette delle azioni** ("TV Salotto · spenta") dai `tool_result` di HA
  (`data.success/failed`) e dallo stato vero nel negozio, mai dal testo di
  Gemini; gli strumenti senza bersagli (es. script) non hanno etichetta.
- Offline: barra e campo spenti con spiegazione, nessuna domanda parte. Caduta a
  metà: errore "connessione persa", la domanda resta, "Rimanda" con un tocco e
  l'avviso di guardare le card prima (il comando può essere già partito).
- **Posizione**: sul tablet la chat prende il posto di stanze e barra (orologio,
  meteo e scene restano in vista); se c'è il banner offline, la chat si ferma
  sopra la barra. Altrove è a tutto schermo e il resto non si disegna. Si chiude
  da sola dopo 60 s senza tocchi.
- **Tastiera virtuale**: niente `interactive-widget=resizes-content`, che
  rimpicciolirebbe la pagina e farebbe uscire il tablet dalla schermata unica
  (il layout salterebbe). La chat misura con `visualViewport` quanto copre la
  tastiera e si accorcia di tanto. Provato simulando `visualViewport`: **da
  confermare sul tablet vero**.

### Layout (v0.2.1): tre modi, mai sovrapposizioni

Tutto in `src/ui/jarvis-app.ts` (griglia con le aree `stato/info/scene/destra/barra`);
i componenti hanno solo le loro regole "compatte".

| Modo | Quando (media query) | Com'è |
|---|---|---|
| **Tablet** (schermata unica) | `(min-width: 900px) and (min-height: 560px)` | Come il mockup: `height: 100dvh`, niente scorrimento, pallino in alto a destra, il banner offline prende il posto della barra |
| **Orizzontale basso** (telefono) | `(orientation: landscape) and (max-height: 559px)` | Due colonne compatte, la pagina **scorre**; banner in cima |
| **Verticale** | `(max-width: 699px)` | Una colonna, la pagina scorre; banner in cima |

- Niente `position: fixed/absolute` nel flusso della pagina (solo il pallino sul
  tablet, e i pannelli sovrapposti apposta: avvisi, accesso, diagnostica).
- Il banner offline esiste in **un posto solo**: `OsservaSchermata` (matchMedia
  della schermata unica) decide se sta nella barra o in cima. Due copie, una
  nascosta dal CSS, rompono la modalità stretta di Playwright.
- Le card con `.in-riga` mettono nome/stato accanto ai pulsanti quando c'è posto;
  nel compatto le spiegazioni lunghe (`.spiegazione`) spariscono. Touch target
  sempre ≥ 48 px.
- Il pannello sui telefoni è una comodità, non la loro destinazione: vedi la
  Modalità Hub nel piano delle fasi.

## 5. Dispositivi e piano delle fasi (aggiornato il 29/09/2026)

### Chi usa l'app

Tutti aprono la **stessa app sullo stesso indirizzo**
(`https://casa.tail8392c1.ts.net/local/jarvis/index.html`):

| Dispositivo | Modalità predefinita |
|---|---|
| **Tablet a muro**, orizzontale, stile Echo Show | Completo |
| **Vecchi smartphone fissi nelle stanze**, orizzontali, in Bluetooth agli **Echo Pop** usati solo come casse | Hub, con la loro stanza |
| **Telefono personale di Salvatore**, anche fuori casa via Tailscale | Completo |

Sugli hub il **microfono è sempre quello del telefono** (l'Echo in Bluetooth non
passa il suo); la voce esce dall'uscita audio del telefono, cioè dall'Echo.

### Piano delle fasi

Ordine in vigore (29/09, ultimo cambio): **F5 → G → Hub → F3 → F6**. La voce
passa prima della gestione dispositivi perché Salvatore usa **solo il pannello**,
non l'app di HA. L'Hub viene anticipato, scene e notte vanno dopo.

| Fase | Cosa | Stato |
|---|---|---|
| F1 | Scheletro PWA, connessione, orologio e meteo, clima, diagnostica | v0.1.2 |
| F2 | Stanze e comandi dei dispositivi | v0.2.0, layout v0.2.1–v0.2.2, clima v0.3.1; prove sui dispositivi veri in corso |
| F4 | **Assistente testuale** (barra + chat con Gemini) | v0.3.0, errori umani v0.3.2 |
| F5 | Voce **"tocca per parlare"** (vedi "Voce") | v0.4.0; prova vera da fare (telefono, tablet, Echo Pop) |
| G | **Gestione dispositivi** dentro Jarvis (vedi sotto) | Dopo la F5 |
| Hub | **Modalità Hub** + tasto di passaggio Hub ↔ completo (vedi sotto) | Da fare |
| F3 | Scene (Buonanotte, Esco, Rientro) | Da fare |
| F6 | Modalità notte e rifiniture | Da fare |

Ogni fase parte con mockup e domande e finisce con release e resoconto. Finché
non c'è la F3 le scene restano "in arrivo" sul pannello, ma gli script
`script.jarvis_buonanotte`, `jarvis_esco` e `jarvis_rientro` esistono già in HA:
Gemini li può usare se l'agente li vede.

### G — Gestione dispositivi (proposta da Salvatore il 29/09)

**Home Assistant resta l'unica fonte di verità**: Jarvis è un'interfaccia che
scrive nei registri di HA via WebSocket, mai un elenco parallelo. Contenuto:

1. **Da sistemare**: dispositivi comandabili senza stanza (oggi spariscono in
   silenzio) → assegna stanza e nome. Badge quando ce ne sono, e la voce in
   diagnostica "N dispositivi senza stanza in HA: …".
2. **Cerca dispositivi nuovi**: reload delle integrazioni (SwitchBot Cloud e
   altre) con esito visibile.
3. Per dispositivo: nome, stanza, icona, mostra/nascondi, ordine, entità
   principale da comandare.
4. Stanze: crea/rinomina/riordina, sensore del clima della stanza.
5. **Card universali per dominio**, guidate da `supported_features` e attributi
   (light: on/off, luminosità, colore se supportati; cover: apri/chiudi/stop/
   posizione; poi fan, lock, vacuum), con conferma e rollback come le altre: un
   dispositivo nuovo di un tipo noto funziona senza nuove release. Oggi hanno la
   card vera solo climate, media_player e switch; gli altri comandabili hanno
   quella generica "non ancora comandabile".
6. **Crescita del layout sul tablet**: regola esplicita per una stanza con più
   card di quante ne entrano (mai fuori schermo, mai sovrapposte). Prova con
   stanze da 3, 6 e 10 dispositivi e una stanza aggiunta mentre il pannello è
   aperto.
7. **Accesso protetto** (utente admin di HA e/o PIN locale): chi non è admin
   vede il pannello ma non la gestione.
8. **Preferenze salvate in HA** e condivise da tutti i pannelli, non nel bundle
   né nel localStorage. La configurazione di casa Salvatore non si migra dal
   bundle: la ritrova la configurazione guidata, o si importa una volta da un
   JSON (vedi "Multi-casa").
9. **Tutto quello che chiede il requisito multi-casa** (sotto), che vale già
   da questa fase.
10. **Clima a infrarossi "DIY" che degrada a solo on/off.** Un climate che HA
    rifiuta sempre (es. SwitchBot "DIY Air Conditioner": il cloud risponde 190 a
    ogni `setAll`) deve poter usare come entità principale lo switch dello
    stesso dispositivo. **Impostazione per dispositivo** (rilevarlo dal modello
    "DIY …" è solo un indizio, non affidabile) + messaggio chiaro quando HA
    risponde errore.

Verificato sul codice di HA 2026.9.3 (`components/config/*`,
`frontend/storage.py`):

| Serve admin | Non serve admin |
|---|---|
| `config/area_registry/create·update·delete·reorder` | tutti i `.../list` dei registri |
| `config/device_registry/update·remove` | `config/entity_registry/get·get_entries` |
| `config/entity_registry/update·remove` | `config_entries/get`, `config_entries/subscribe` |
| `config/label_registry/create·update·delete` | `frontend/get_system_data`, `frontend/subscribe_system_data` |
| `frontend/set_system_data`, `lovelace/config/save` | `lovelace/config` |

**Proposta per le preferenze condivise** (da confermare in fase G):
`frontend/set_system_data` con una chiave `jarvis`. HA la salva in
`.storage/frontend.system_data`: la scrive solo un admin, la leggono tutti, e
`frontend/subscribe_system_data` avvisa **in tempo reale** tutti i pannelli
aperti. Da verificare prima: il reload delle integrazioni per chi non è admin, e
cosa fa HA con valori grandi in quello spazio. Il reload delle integrazioni è
**solo admin** in entrambe le strade (REST `/api/config/config_entries/entry/{id}/reload`
e servizio `homeassistant.reload_config_entry`: verificato dalla sessione server).

### Multi-casa (requisito di Salvatore, 29/09/2026)

**Jarvis deve essere abbastanza autosufficiente da installarlo e usarlo
agevolmente in altre case.** Vale per tutto il progetto, a partire dalla fase G.
Si valutano sia parenti e amici sia un possibile **servizio a pagamento**: la
decisione sul servizio arriva dopo 1-2 case pilota. Intanto si progetta tutto
"multi-casa". Proposta completa, stima e piano HACS: `docs/proposta-multicasa.md`.

1. **Niente di specifico di casa Salvatore nel bundle**: meteo, sensori del
   clima, stanze e zone, programmi, nascoste vanno nella configurazione salvata
   in HA, con la **configurazione guidata** al primo avvio (scopre aree,
   dispositivi, `weather.*`, sensori di temperatura e umidità per area; l'admin
   conferma).
2. **Pacchetto HA → moduli opzionali e parametrici** (scaldabagno a fasce, clima
   con soglie, notifiche con il servizio scelto), attivabili e regolabili senza
   toccare YAML.
3. **Distribuzione**: integrazione custom installabile da HACS (serve l'app come
   static path, gestisce i moduli con config flow, si aggiorna da HACS). Casa
   nuova = HA standard (HA Green o mini PC, non Termux) + HACS + Jarvis. Per ora
   **solo proposta**.
4. **Dispositivi e marche diversi**: card universali per dominio e
   `supported_features`, niente logica legata a un modello.

Esigenze future da servizio, **da non implementare ora** ma da non impedire:

- aggiornamenti controllati (canali stable/beta, possibilità di tornare
  indietro): la configurazione ha un numero di schema con migrazioni;
- backup automatici esterni della configurazione: tutto in HA, niente nel
  localStorage, più esporta/importa in JSON;
- stato di salute della casa leggibile da remoto, **solo col consenso** del
  proprietario;
- **nome del prodotto configurabile**: "Jarvis" non si potrà usare
  commercialmente (è un personaggio Marvel). Niente "Jarvis" non sostituibile nei
  testi visibili, nella parola di attivazione, nel manifest. Gli identificativi
  tecnici invisibili (`jarvis-app`, `jarvis_*`) possono restare; il dominio
  dell'integrazione HACS va scelto neutro una volta sola.

### Voce: misure vere e regole per la F5 (sessione server, 29/09)

Configurazione di HA ottimizzata e misurata dalla sessione server:

| Pezzo | Scelta | Tempo |
|---|---|---|
| Conversazione | `gemini-3.5-flash-lite`, thinking minimo (budget 0) | ~2 s (prima 7,5 s con 503 frequenti) |
| STT `stt.google_ai_stt` | `gemini-flash-lite-latest`, thinking 0, temperatura 0, prompt italiano | ~1,5 s (prima 9,8 s) |
| Pipeline | `prefer_local_intents: true`: comandi e domande base li risolve HA | ~0,1 s, risposta standard di HA ("Sono le 20:35") |
| TTS | `tts.google_translate_en_com`, lingua `it` | Piper sul Redmi più lento (1 s), Gemini TTS 6-7 s: scartati |
| **Totale** (fine del parlato → primo audio) | | 3,3-4,1 s con Gemini, ~2 s per i comandi locali |

Scartato `gemini-3.5-flash` (~2,5 s): il piano gratuito dà 5 richieste al minuto
per modello.

Regole per la F5 (requisiti di Salvatore e fatti verificati):

- **Microfono**: `getUserMedia` + **AudioWorklet** a 16 kHz mono PCM 16 bit,
  mandato come frame binari con lo `stt_binary_handler_id` di
  `assist_pipeline/run` (`start_stage: stt`, `end_stage: tts`). **Mai
  `setTimeout` nello streaming**: nelle schede in secondo piano i timer vengono
  rallentati.
- **Audio della risposta**: l'URL della TTS si scarica e si riproduce **subito**,
  a `tts-start`/`tts-end`, mai aspettando `run-end`. Verificato dalla sessione
  server: per le risposte locali in streaming `run-end` non arriva finché
  qualcuno non consuma l'audio, e la pipeline resta appesa.
- **Fine del parlato**: rilevamento del silenzio + tocco per fermare + tempo
  massimo.
- **Stati visivi**: ascolto (con il livello del microfono), pensa, risponde,
  errore. Trascrizione e risposta finiscono nella chat, **stesso motore della
  F4** (`src/assistente/`).
- **Errori umani in italiano**: microfono negato, HTTPS assente, quota di Gemini
  (429), Gemini occupato (503), rete persa a metà. I testi stanno in
  `src/assistente/messaggi.ts`, già condivisi con la chat.
- Deve funzionare su Chrome Android (telefono di Salvatore, HTTPS Tailscale) e
  sul tablet; uscita audio anche verso un altoparlante Bluetooth (Echo Pop).
- Prove: finto HA con pipeline stt→tts (audio finto), microfono negato, caduta
  a metà, risposta locale in streaming.

**Decisioni di Salvatore sulla F5** (29/09, mockup `docs/mockup-f5.html`):

- **Chat aperta** + microfono della chat → la voce avviene nella chat (barra
  della voce al posto del campo). **Chat chiusa** + microfono della barra → un
  **riquadro piccolo** (stato + risposta breve; toccandolo si apre la chat). Lo
  stesso riquadro servirà a "Ehi Jarvis" quando arriverà (dopo la prova di
  fattibilità). L'Hub ha la sua schermata.
- **Seguito come un Echo**: se HA dice `continue_conversation: true`, finito
  l'audio il microfono si riapre da solo (il VAD di HA lo chiude dopo al
  massimo 15 s).
- **Bip leggero** all'apertura e alla chiusura del microfono.
- Niente trascrizione parziale mentre si parla: l'STT di HA restituisce il testo
  solo a `stt-end`.

**Protocollo verificato sul codice di HA 2026.9.3** (`assist_pipeline/`,
`websocket_api/`):

- `assist_pipeline/run` con `start_stage: stt`, `end_stage: tts`,
  `input: {sample_rate}`. L'audio è PCM 16 bit mono; se `sample_rate` non è
  16000 HA ricampiona da solo (`audioop.ratecv`).
- L'id per l'audio arriva in `run-start` → `runner_data.stt_binary_handler_id`.
  Ogni frame binario è `[id (1 byte)][PCM]`; un frame col **solo** id chiude
  l'audio.
- **VAD di HA acceso per default** (`no_vad: false`): chiude dopo 0,7 s di
  silenzio, massimo 15 s (`assist_pipeline/vad.py`), con gli eventi
  `stt-vad-start` / `stt-vad-end`. Si usa quello, più il tocco per fermare.
- Errori tipici: `stt-no-text-recognized`, `stt-stream-failed`, `timeout`.
- L'URL dell'audio (`/api/tts_proxy/<token>…`, non richiede login) c'è già in
  `run-start.tts_output`, con `stream_response`; è confermato in
  `tts-end.tts_output.url`.

### "Ehi Jarvis": prova di fattibilità (29/09, v0.4.1)

> Storia: dalla v0.5.0 la pagina di prova non c'è più, «Jarvis» è nel pannello
> (sezione "«Jarvis» sempre in ascolto" più sotto). I fatti verificati qui valgono ancora.

Solo una prova, **non** la funzione: pagina `…/local/jarvis/prova-ehi-jarvis.html`,
build a parte (`vite.prova.config.ts`, ~17 MB in `dist/prova/`), fuori dal
service worker del pannello e dai suoi limiti. Il service worker ora risponde
con `index.html` solo alle navigazioni verso `/` e `index.html` (controprova:
col comportamento vecchio la pagina di prova non si apre).

**Fatti verificati:**

- **Modello**: openWakeWord `hey_jarvis_v0.1` + `melspectrogram` + `embedding`
  (release v0.5.1), con onnxruntime-web 1.30.0 (MIT, WASM in un thread, nel
  bundle, niente CDN). **I modelli pre-addestrati sono CC BY-NC-SA 4.0: solo non
  commerciali** (`modelli/openwakeword/LICENZA.md`). Il rilevatore è
  un'interfaccia (`RilevatoreParola`): per un servizio si cambia modello
  (microWakeWord, Apache 2.0, o uno addestrato apposta). Parola e licenza
  arrivano dalla descrizione del modello, mai dal codice.
- **Fedeltà**: `src/parola/rilevatore.ts` riproduce `utils.py`/`model.py` di
  openWakeWord 0.6.0 (melspettrogramma /10+2, finestre da 76 righe ogni 8, 16
  embedding, prime 5 previsioni a 0). Sulle stesse 8 clip i punteggi sono
  **identici all'originale in Python frame per frame** (differenza 0,0000).
  Nel browser, con una clip come microfono, 3 attivazioni esatte su 3 e 0 sulle
  frasi negative; ~6 ms per frame su un server (su 80 ms).
- **"Jarvis" da solo e in qualsiasi punto** (voce sintetica Piper inglese
  `lessac`, testo italiano letto da voce inglese): "Jarvis." 0,976-0,990;
  all'inizio 0,918; in mezzo 0,996; alla fine 0,999; dopo la frase di un'altra
  persona 0,999; "Buongiorno Jarvis"/"Spegni la TV Jarvis" 0,997-0,999; **"Good
  morning Jarvis" 0,239 (mancato)**; parole simili (Travis, nervous, service,
  Jason, harvest, Mavis) 0,000-0,001. Una sola voce sintetica: i numeri veri li
  dà la prova sul telefono.
- **VAD di HA e audio che inizia col parlato** (segmentatore di `vad.py` 2026.9.3
  con `pymicro-vad` 1.0.1, stessa versione di HA): il pre-roll col parlato **non
  è un problema** (servono 0,3 s di voce per "partire"). Il problema è DOPO la
  parola: con il VAD di serie (0,7 s) una **pausa ≥ 1,0 s dopo "Jarvis" chiude
  l'ascolto prima della domanda**; con "rilassato" (1,25 s) regge fino a 1,0 s ma
  non 1,5 s. Chi dice "Jarvis", aspetta il bip e poi parla fa proprio quella
  pausa. **Per la funzione vera**: fine del parlato decisa sul telefono
  (`no_vad: true` in `assist_pipeline/run`, VAD locale tipo Silero, MIT) con
  regole pensate per la parola in qualsiasi punto: dopo la parola si aspetta
  fino a ~3 s che la frase cominci; se era già stata detta prima (es. "spegni la
  TV, Jarvis") si manda il pre-roll.
- **Privacy**: la memoria circolare (`src/parola/memoria.ts`, 3,5 s di default,
  1-8 regolabile) vive **solo in RAM**, si sovrascrive di continuo, si azzera
  davvero (`fill(0)`) quando l'ascolto si ferma; nella prova non parte niente
  verso HA. Indicatore rosso **sempre visibile** mentre il microfono ascolta.
  Per le altre case va detto nell'informativa: il microfono ascolta di continuo
  solo sul dispositivo, e invia audio solo dopo la parola.
- **Android**: il microfono funziona solo con la pagina in primo piano e lo
  schermo acceso: Wake Lock + ripresa automatica quando la pagina torna visibile;
  la chiusura del microfono da parte del sistema finisce nel registro.
- Niente ascolto continuo lato server: il Redmi non regge l'audio di più pannelli.

**Criteri della raccomandazione, decisi prima dei numeri:**

| Esito | Tempo medio per frame | Serie a 1 m | Serie a 3 m | Falsi positivi con la TV | Calore dopo 1 h |
|---|---|---|---|---|---|
| **Si fa** | < 40 ms (carico < 50%) | ≥ 18/20 | ≥ 15/20 | ≤ 1 all'ora | tiepido o meno |
| **Si fa con limiti** | 40-72 ms | 14-17/20 | 10-14/20 | 2-3 all'ora | caldo |
| **Non si fa** | > 72 ms (non sta al passo) | < 14/20 | < 10/20 | > 3 all'ora | molto caldo |

Vale il caso peggiore tra le colonne. "Con limiti" = si fa con accorgimenti
(soglia più alta, parola più lunga "Ehi Jarvis" invece di "Jarvis", modello
dedicato, solo su alcuni telefoni).

**Modello dedicato "Jarvis"** (da valutare solo se la prova vera lo chiede): la
procedura di openWakeWord genera migliaia di clip sintetiche (Piper), le mescola
con rumore e parlato negativo (decine di GB di dati) e addestra il classificatore,
di solito su una GPU (es. Colab), in circa un'ora. La pronuncia italiana si può
aggiungere con le voci italiane di Piper, ma sono poche: poca varietà. Qui non si
può fare (niente GPU, e Hugging Face è bloccato dalla rete). Da verificare prima:
licenza dei modelli melspettrogramma ed embedding, se un servizio a pagamento
può usarli anche con un classificatore nostro.

### Verificatore della pronuncia (v0.4.3, 30/09)

**Perché.** Prova di Salvatore: `hey_jarvis` scatta con «Giarvìs» (accento
sull'ultima, all'inglese) e non con «Giàrvis». È addestrato su voci sintetiche
inglesi.

**Cosa.** È il "custom verifier" di openWakeWord 0.6.0
(`custom_verifier_model.py` e `Model.predict`, letti nel codice), rifatto in
`src/parola/verificatore.ts` per addestrarsi SUL TELEFONO.

- **Caratteristiche**: `get_features(16)`, cioè gli ultimi 16 embedding × 96 =
  1536 valori, lo stesso ingresso del classificatore. Il rilevatore le dà per
  ogni frame (`EsitoFrame.caratteristiche`). Non dipendono dal classificatore:
  se cambia il modello base, gli esempi si ripunteggiano con `valuta()` senza
  registrarli di nuovo.
- **Modello**: `StandardScaler` (ddof 0, scala 1 dove la deviazione è ~0) più
  `LogisticRegression(C=0.001)`. Stesso obiettivo di scikit-learn,
  ½‖w‖² + C·Σ perdita, intercetta non penalizzata, risolto con L-BFGS con
  tolleranza 1e-9 sul gradiente.
- **Uso**: se il punteggio base ≥ `sogliaBase` (`custom_verifier_threshold`,
  0,1 nell'originale), il punteggio diventa la probabilità del verificatore;
  poi vale la soglia di sempre.

**Verificato.**

- Contro scikit-learn 1.9.1 su dati riproducibili: il riferimento è
  `scripts/riferimento-verificatore.py`, il test
  `test/unit/verificatore.test.ts`. Pesi entro 1e-5 relativo, probabilità
  entro 1e-6.
- Su caratteristiche VERE di openWakeWord (clip di prova, 1536 dimensioni):
  scarto 3e-8 in doppia precisione.
- Tempo di addestramento: 2300 esempi × 1536 in 0,5 s su un Xeon; su un
  telefono vecchio stimati pochi secondi.

**Unica deviazione voluta, la scelta dei positivi.**

- L'originale li prende solo dove il modello base supera 0,5. Con «Giàrvis»
  non ci arriva quasi mai, e non si raccoglierebbe niente.
- Qui: i frame della finestra di 2,5 s dopo l'invito con punteggio base ≥
  `sogliaBase`. Se non ce n'è nessuno, i 3 frame attorno al massimo
  (`scegliPositivi`).
- La soglia base si imposta da sola sulla consigliata, cioè 0,8 × il più basso
  dei massimi degli esempi, tra 0,005 e 0,1. Non succede se è stata scelta a
  mano o da `parola.json`. Motivo: con una soglia base sopra i punteggi della
  pronuncia di casa il verificatore non verrebbe mai consultato.
- Negativi: tutti i frame del parlato normale, come l'originale (al massimo
  2000, a intervalli regolari).

**Registrazione** (pagina di prova):

- esempi della parola: un invito ogni 3 s, il primo dopo 1,5 s, finestra di
  2,5 s. Presi dal flusso vivo del rilevatore, quindi con lo stesso contesto
  dell'ascolto vero, senza il riscaldamento di un rilevatore azzerato;
- niente bip durante la registrazione (finirebbe nell'audio) e niente
  attivazioni contate;
- tutto in IndexedDB (`src/parola/archivio.ts`):
  - esempi della parola: audio di 3 s per riascoltarli, più le caratteristiche;
  - parlato normale: SOLO le caratteristiche, niente audio;
- "Esporta" salva solo i pesi del verificatore;
- microfono fermato a metà: la registrazione si annulla e lo si dice.

**`parola.json`** (`src/parola/impostazioni.ts`): sta accanto alla pagina e
fuori dallo zip. Contiene modello (id, url, parola, licenza, commerciale),
`soglia`, `sogliaBase` e l'indirizzo di un verificatore condiviso. Cambia tutto
senza release (requisito multi-casa). Scritto male: avvisi nel registro e
valori predefiniti.

**Prove.**

- e2e:
  - registrazione guidata, addestramento, uso, persistenza, esportazione e
    importazione, cancellazione;
  - **nessuna richiesta di rete** oltre ai file della pagina;
  - microfono fermato a metà;
  - `parola.json` valido e rotto;
  - "decide davvero": un verificatore che dice sempre sì fa scattare, spento
    no. Controprova: col verificatore scollegato nella pagina la prova cade.
- Layout guardato a 360 e 1024 px: la tabella degli esempi sbordava a 360, ora
  sono righe che vanno a capo.

**Passo 2, ancora da fare**: il modello italiano dedicato (notebook Colab,
licenze dei negativi da scegliere compatibili con l'uso commerciale).

### Profili di voce: tono per tipo di voce (deciso il 29/09, dopo "Ehi Jarvis")

> **Dal 02/10 il testo ufficiale di carattere e regole di Jarvis è
> `docs/ISTRUZIONI-JARVIS.md`** (carattere «in stile Tony Stark», richiesto da
> Salvatore). Lo cura il repo, lo applica la sessione server; ogni modifica
> va motivata nel suo «Registro modifiche». Quanto sotto resta come storia.

- Tono della risposta in base al tipo di voce: **uomo adulto / donna adulta /
  bambino-a**. Riconoscimento preferito: classificatore leggero **nel browser**
  (WASM, stesso tipo di modello di "Ehi Jarvis", nessun audio in più inviato),
  con prova di fattibilità (accuratezza su frasi di 2-3 s, a 1 e 3 m, TV
  accesa). Scartato salvo prove: etichetta chiesta allo STT di Gemini (rompe i
  comandi locali, rallenta).
- **Solo per il tono. I permessi non dipendono mai dalla voce** (fase G, per
  dispositivo/profilo). Correzione a voce: "Jarvis, sono X".
- Toni (testi originali della sessione server, niente citazioni dei film):
  uomo = geniale, sicuro, sarcastico, battuta pronta, risposte brevi (prima
  l'azione, poi la battuta); bambino/a = semplice, paziente, allegro, frasi
  corte, niente sarcasmo; donna = da confermare con la moglie di Salvatore
  (proposta: elegante, cordiale, ironia leggera, diretta). Testi configurabili
  (multi-casa).
- **Come passare il tono a Gemini** (codice di HA 2026.9.3): `assist_pipeline/run`
  e `conversation/process` **non** accettano `extra_system_prompt` dal WebSocket
  (c'è solo nell'API interna `async_pipeline_from_audio_stream`). Il prompt di
  Gemini è un template che vede `llm_context.device_id` (quello mandato dal
  pannello). Strade: (1) prima di ogni richiesta il pannello scrive il tono in un
  aiutante legato al dispositivo, e il prompt lo legge; (2) l'integrazione HACS
  offre un comando WebSocket suo che chiama l'API interna con
  `extra_system_prompt`. Da decidere con mockup e prova.

### Modalità Hub

Schermata minimal solo voce. Dipende dall'assistente (F4) e dalla voce (F5). Si
progetta con **mockup animato e domande prima di scrivere codice**.

- Al centro una **sfera di luce animata**, uno stato per ogni momento:
  - **riposo**: respira lentamente e si sposta di poco (anti burn-in);
  - **ascolto**: reagisce al volume del microfono;
  - **pensa**: vortica;
  - **risponde**: reagisce all'audio in uscita;
  - **errore/offline**: colore di avviso, ferma.
- **Sottotitoli** di domanda e risposta, che poi sfumano.
- In un angolo, piccoli: ora, temperatura della stanza del dispositivo, pallino
  di connessione. **Di notte** luminosità bassa e solo orologio.
- Telefoni vecchi: animazione CSS o canvas, **niente librerie pesanti**, al
  massimo 30 fps, **ferma** a riposo prolungato e di notte, nessuna perdita di
  memoria in mesi di funzionamento.
- Se la cassa Bluetooth si scollega a metà risposta, il pannello va avanti
  (sottotitoli) e non si blocca.

**Passaggio Hub ↔ completo, su tutti i dispositivi:**

- Un **tasto sempre visibile**, piccolo, in un angolo: nell'Hub un'icona
  "griglia" porta al completo, nel completo un'icona "sfera" porta all'Hub. Area
  di tocco ≥ 48 px, mai sopra altri controlli.
- La **modalità predefinita** si sceglie una volta e **si salva sul dispositivo**
  ("Hub, stanza X" oppure "Completo"). All'avvio e alla ricarica parte da quella.
  **Mai** decisa dalla misura dello schermo: il telefono personale, fuori casa,
  deve poter aprire il completo.
- **Ritorno automatico**: se il predefinito è Hub e si passa al completo, dopo
  ~90 s senza tocchi si torna all'Hub da solo (valore configurabile). Se il
  predefinito è Completo non c'è ritorno automatico.
- Il passaggio **non ricarica la pagina e non riapre il WebSocket**: cambia solo
  la vista. Una risposta vocale in corso non si interrompe cambiando vista.
- La **stanza del dispositivo** serve all'Hub per la temperatura nell'angolo e,
  in futuro, come contesto per l'assistente ("spegni la TV" = la TV di questa
  stanza). HA 2026.9.3 accetta un `device_id` in `conversation/process` e in
  `assist_pipeline/run`: è la strada da verificare per quel contesto.

**"Ehi Jarvis"** è l'obiettivo per l'Hub, ma solo dopo una **prova di fattibilità
su un telefono vecchio vero**: CPU, calore, batteria sempre in carica, falsi
positivi, falsi negativi con la TV accesa. **"Tocca per parlare" deve funzionare
sempre**, anche quando esisterà la parola di attivazione.

### F5 (v0.4.0): com'è fatta la voce

- **Una faccia del motore**: `connessione.voce` usa `connessione.assistente`
  (`parla`, `inviaAudio`, `fineAudio`); domanda sentita e risposta sono turni
  come quelli scritti e finiscono nella chat. I messaggi d'errore sono gli
  stessi (`assistente/messaggi.ts`), più quelli del microfono.
- **Microfono**: `AudioContext({sampleRate: 16000})` (se il browser rifiuta,
  la sua frequenza, e HA ricampiona) + AudioWorklet caricato da un Blob URL (il
  build resta un file solo). Pezzi da 1024 campioni: il ritmo lo dà il worklet,
  mai un timer. L'audio arrivato prima dell'id di HA si tiene da parte (max ~10 s).
- **Fine dell'ascolto**: VAD di HA (0,7 s di silenzio) o tocco su "ferma"; rete
  di sicurezza a 20 s. Chiuso il microfono si fermano le tracce (si spegne
  l'indicatore di Android) e si manda il frame di fine una volta sola.
- **Il turno a voce resta aperto fino a tts-end**: chiuderlo alla risposta
  scritta (come per il testo) cancellerebbe la pipeline prima della TTS.
- **Audio**: `new Audio(url)` subito a tts-end (a tts-start se
  `stream_response`). La promessa si risolve sempre: fine, errore, pausa non
  chiesta (altoparlante Bluetooth scollegato) o tempo massimo. Il testo resta.
- **Seguito**: solo se l'audio è finito da solo (non interrotto) e HA ha detto
  `continue_conversation`. Se al seguito nessuno risponde, il turno vuoto si
  scarta in silenzio, come un Echo.
- **Dove**: chat aperta → barra della voce al posto del campo; chat chiusa →
  riquadro piccolo (sopra le stanze sul tablet, mai sopra la barra; in fondo sul
  telefono), che sparisce 6 s dopo la risposta. "Chiedi a Jarvis…" o un tocco sul
  riquadro portano la voce nella chat.
- **Prove**: il microfono finto di Chromium (`--use-fake-device-for-media-stream`)
  suona di continuo; il finto HA chiude l'ascolto dopo ~0,6 s di audio o col
  frame di fine (`stt=manuale`). Controprove fatte: audio fatto partire a run-end
  → la risposta locale resta appesa; microfono non chiuso → bocciano 3 prove.

### Assistente: protocollo verificato (codice di HA 2026.9.3)

- **Agente**: `conversation.google_ai_conversation` (Gemini), dentro la pipeline
  Assist predefinita in italiano: STT `stt.google_ai_stt` → Gemini → TTS
  `tts.google_translate_en_com` con lingua `it` (verificato dalla sessione
  server il 29/09: "en_com" è il dominio google.com, non la lingua).
- `conversation/process`: `text`, `conversation_id`, `language`, `agent_id`,
  `device_id`, `satellite_id`. Risponde tutto insieme alla fine:
  `{response: {response_type, speech: {plain: {speech}}, data}, conversation_id,
  continue_conversation}`.
- `assist_pipeline/run` con `start_stage` e `end_stage` = `intent` e
  `input: {text}`: stessa conversazione, ma a **eventi**. `run-start`,
  `intent-start`, poi `intent-progress` con `chat_log_delta` (il testo mentre
  Gemini lo scrive, e le chiamate agli strumenti), `intent-end` con lo stesso
  risultato di `conversation/process`, `run-end`; oppure `error`. Accetta un
  `timeout` lato server (predefinito 300 s). È lo stesso comando che userà la
  voce (F5), cambiando solo `start_stage`/`end_stage`. Non richiede admin.
- **Gli errori dell'agente non sono errori del WebSocket**: arrivano come
  risultato normale con `response_type: "error"` e `data.code`. Vanno
  riconosciuti apposta.
- **HA dimentica una conversazione dopo 5 minuti** senza messaggi
  (`CONVERSATION_TIMEOUT` in `helpers/chat_session.py`): oltre, anche mandando
  il vecchio `conversation_id`, riparte da zero con un id nuovo.

### Pausa della musica durante la voce (v0.4.4, 30/09)

Richiesta della sessione server dopo la prova con l'Echo in Bluetooth
(`src/voce/pausa-musica.ts`). Osserva le fasi della `Voce`, quindi vale per
tutte le sue facce (tocca per parlare, "Jarvis", Hub).

- **Inizio** (da `spenta`/`errore` a un'altra fase): IN PARALLELO all'ascolto,
  `jarvis_musica.stato`. Se `in_riproduzione` nella stanza del pannello, o in
  una di `STANZE_OVUNQUE` ("tutta la casa"), si chiama `controllo pausa` e ci
  si ricorda il volume.
- **Fine** (a `spenta`/`errore`, dopo `ATTESA_RIPRESA_MS` = 1,5 s, così il
  seguito come un Echo e le domande di fila restano nello stesso gruppo): si
  riprende SOLO se l'abbiamo fermata noi, e si rimette il volume. L'Echo lo
  cambia da solo, 30→40 visto il 30/09.
- **Niente ripresa** se un turno ha usato uno strumento `jarvis_musica…`. I
  nomi arrivano da `chat_log_delta` (`tool_calls[].tool_name` e
  `tool_result.tool_name`): gli script esposti si chiamano `script__<nome>`,
  `ActionTool` in `helpers/llm.py` di HA 2026.9.3. Il turno li tiene in
  `strumenti`.
- La voce finita prima che Spotify risponda: non si ferma niente dopo.
- Errori (componente assente, Spotify giù): solo nel log, una volta; la voce
  non aspetta mai.
- **Stanza del pannello**: impostazione del dispositivo (`localStorage`,
  `src/voce/stanza-pannello.ts`), scelta in diagnostica tra le aree di HA.
  Senza stanza non si tocca niente. Con l'Hub e la fase G diventa una
  preferenza del dispositivo.
- Chiamate con `call_service` + `return_response: true`, cioè lo stato vero di
  Spotify, non il media_player di HA.
- Prove: 9 unitarie (ogni regola, orologio finto) e 7 e2e contro il finto
  `jarvis_musica`. Controprova: con la pausa scollegata cade la prova
  principale (build riuscito).

### Mai su una versione vecchia (v0.4.4, 30/09)

Il 30/09 il tablet si è riaperto su una versione senza la voce. Causa
probabile, legata alle due origini: la ricarica delle 04:00 applica la versione
in attesa solo sull'origine dove si trova la pagina (la veloce). Sulla riserva
la versione nuova restava in attesa per giorni, e il pannello ci ricadeva. Non
è verificabile da qui sul tablet vero. Rimedi (`src/pwa/aggiornamenti.ts`,
`src/pwa/origine.ts`):

- **all'avvio, finché nessuno tocca lo schermo** (al massimo 2 minuti), una
  versione in attesa, già presente o scaricata in quel momento, si applica
  subito. Protezione contro i giri: al massimo una volta al minuto per
  sessione (`sessionStorage`). Dopo il primo tocco vale la regola di sempre
  (04:00 o "Aggiorna ora"). Le due prove esistenti "non a sorpresa" restano
  verdi: in entrambe qualcuno ha già toccato;
- **prima di passare alla veloce**, la riserva attiva la sua versione in
  attesa (`attiva-subito`): la pagina se ne va comunque;
- **diagnostica**: "Sul server", cioè `VERSIONE` letta da `sw.js` con
  `no-store`, accanto a versione e origine in uso.

Controprova: senza l'applicazione all'avvio la prova e2e cade.

### Timer che suonano sul pannello (v0.4.5, 30/09)

I timer li gestisce il server (`jarvis_voce` 0.1.5, lato HA): "metti un timer
di 10 minuti per la pasta" lo crea là, e HA manda l'evento `jarvis_timer` con
`data: {tipo: started|updated|cancelled|finished, id, nome, secondi_totali,
secondi_rimasti}`. Il pannello (`src/timer/`) non decide niente:

- `subscribe_events` su `jarvis_timer` a ogni connessione nuova. La libreria
  rinnova da sola l'iscrizione dopo le riconnessioni: c'è una prova e2e dopo
  un riavvio di HA. Con più pannelli l'evento arriva a tutti, e suonano tutti.
- **Conto alla rovescia** sotto l'orologio: scadenza = arrivo +
  `secondi_rimasti`, ridisegno ogni secondo solo se ci sono timer. La **fine
  la decide solo `finished`**: un timer a zero senza `finished` sparisce dopo
  60 s senza suonare, perché può essere stato annullato mentre il pannello era
  scollegato. Dopo una riconnessione non si possono rileggere i timer attivi:
  domanda aperta alla sessione server.
- Sul tablet la colonna di sinistra non scorre: con timer attivi i prossimi
  giorni del meteo lasciano il posto ai timer, e se ne vedono al massimo 3
  (oltre, due più "+N"). Sui telefoni tutti, la pagina scorre.
- **`finished`**: suoneria WebAudio (tre note ripetute ogni 1,6 s, niente file,
  funziona anche offline) e overlay "Timer [nome] finito" sopra tutto
  (z-index 40, sopra chat e diagnostica), con uno Stop grande. Si ferma con
  Stop o da sola dopo `SUONERIA_MASSIMA_MS` (2 minuti, che ripartono a ogni
  timer finito). Lo stop a voce («Jarvis, stop», «basta») c'è dalla v0.5.0
  (sezione "«Jarvis» sempre in ascolto").
- **Autoplay**: Chrome non fa suonare una pagina mai toccata. Il contesto
  audio si prepara al primo tocco. Se al momento della suoneria è bloccato,
  va nel log una volta e suona al primo tocco; l'overlay si vede comunque.
- La **ricarica notturna** delle 04:00 aspetta se c'è un timer in corso o che
  suona: la finestra dura un'ora.
- Stop su un pannello ferma solo quello (v0.4.5). Superato dalla v0.4.6,
  sezione sotto: suona solo il pannello proprietario, e Stop ferma tutti.

### Timer per pannello (v0.4.6, 30/09, con jarvis_voce 0.1.8)

Richiesta di Salvatore: un timer suona SOLO sul pannello da cui è stato
chiesto, a meno che non si dica un'altra stanza. Contratto con il server
(`src/timer/pannello.ts`, `src/timer/timer.ts`):

- **device_id** del pannello = `jarvis_` + slug della Stanza scelta in
  diagnostica. Lo slug deve essere **identico a quello del server** (script
  `jarvis_timer_stanza`), non a `homeassistant.util.slugify`, che differisce
  su simboli rari. Regola del server (v0.4.7): NFKD, via i segni combinanti,
  minuscolo, ogni carattere che non è lettera o cifra Unicode (come
  `str.isalnum`) diventa "_", niente "_" doppi né ai bordi. Esempi:
  "Camera dell'ospite – Già" → `camera_dell_ospite_gia`, "Stanza ½" →
  `stanza_1_2`. I valori della prova unitaria sono calcolati con la regola
  in Python; confronto fatto su 17 nomi, 0 differenze.
- Si manda con OGNI `assist_pipeline/run`, voce e chat: lo schema di HA
  2026.9.3 ha `vol.Optional("device_id")`. Senza stanza non si manda, e il
  server usa `jarvis_pannello`: il pannello considera suoi i timer di
  `jarvis_pannello`. Due pannelli nella stessa stanza hanno lo stesso
  device_id e suonano entrambi, come voluto.
- L'evento `jarvis_timer` ha `pannello`. Il pannello mostra e fa suonare solo
  i suoi. Senza `pannello` (server vecchio) il timer vale per tutti.
- **Stop** ferma subito qui e chiama `jarvis_voce.timer_ferma {id}`. Il server
  manda `{tipo: "fermato", id}` a tutti, e chi suona per quell'id si ferma.
  Lo stop automatico dopo 2 minuti non chiama il server: ogni pannello ha i
  suoi 2 minuti.
- **Rilettura** con `jarvis_voce.timer_attivi` (return_response): dopo
  l'iscrizione all'evento, a ogni riconnessione e quando cambia la stanza.
  Sostituisce l'elenco dei timer attivi, filtrato per pannello; quelli che
  suonano restano. La chiave dell'elenco nella risposta non è scritta nel
  contratto: si accettano `timer`, `timers`, `attivi` o un elenco nudo, e una
  forma diversa va nel log. Se il servizio manca, avviso nel log una volta e
  restano gli eventi.
- In diagnostica, sotto Stanza: "Timer e voce di questo pannello:
  jarvis_cucina", oppure l'avviso "Scegli la stanza per i timer".

**Pausa (v0.4.7, con jarvis_voce 0.2.3).** Pausa e ripresa arrivano come
`updated` con `in_pausa` e `secondi_rimasti` aggiornati; anche
`timer_attivi` ha `in_pausa`. Un timer in pausa è fermo a `fermoMs`, non
scade (la pulizia dei timer a zero lo salta) e mostra "in pausa"; alla
ripresa la scadenza riparte da `secondi_rimasti`.

### Pulsante del microfono mai bloccato (v0.4.5, 30/09)

La sessione server ha visto il pulsante restare bloccato. Causa trovata nel
codice: in "pensa" il pulsante era disabilitato e `ferma()` non faceva niente,
fino ai 60 s dell'assistente; "apertura" non aveva limiti. Ora:

- **"pensa"**: il pulsante è "Annulla la domanda", e il tocco chiude la
  pipeline (errore `annullata`, "Domanda annullata.", con Riprova). Limite
  `PENSA_MASSIMO_MS` = 30 s (errore `tempo`). Se il testo della risposta è già
  arrivato e manca solo l'audio, resta la risposta scritta, senza errore.
- **"apertura"**: limite `APERTURA_MASSIMA_MS` = 10 s (getUserMedia che non
  risponde), con il messaggio "Il microfono non si è aperto". Il limite lascia
  il tempo di toccare "Consenti" la prima volta.
- `stt-stream-failed` (lo stream audio verso l'STT si interrompe) vale come
  `stt-no-text-recognized`: "Non ho capito, puoi ripetere?". Era un errore
  generico.
- "ascolto" (20 s) e "risponde" (90 s o durata + 10 s) avevano già i loro
  limiti; WebSocket caduto = errore "connessione", già c'era.

### Tastiera della chat (v0.4.5, 30/09)

- Un tocco ovunque fuori dal campo (anche fuori dalla chat, sul tablet) chiude
  solo la tastiera: `blur()` su `pointerdown` in cattura. Su Android un tocco
  che fa scorrere i messaggi manda solo `pointerdown`, senza il clic che
  sposterebbe il focus: per questo la prova e2e manda proprio quello (col
  mouse del desktop il focus si sposta da solo, e la prova non distingueva).
- "Indietro" di Android: la chat aperta ha una sua voce nella cronologia
  (`pushState`), quindi Indietro chiude la chat invece di uscire dall'app. La
  tastiera la chiude Android da solo col primo Indietro. Chiusa con la X o da
  sola, la voce si toglie (`history.back()`, ignorando quel `popstate`).
- Dopo l'invio, sul tablet (`SCHERMATA_UNICA`, ora in `base.ts`) il campo
  perde il focus, così si vede la risposta; sul telefono resta per il seguito.

### Audio sveglio per l'Echo in Bluetooth (v0.4.5, 30/09)

Con il tablet collegato all'Echo Pop in Bluetooth, dopo un po' di silenzio
l'Echo annuncia "In riproduzione da Tab90" sopra l'inizio della risposta.
`src/voce/audio-sveglio.ts` fa suonare di continuo un rumore bianco a -80 dB
(ampiezza 1e-4, buffer di 2 s in loop), che tiene aperto il collegamento.

- Acceso di serie, spegnibile in diagnostica ("Audio sveglio", in
  `localStorage` alla chiave `jarvis-audio-sveglio`, "0" = spento). Decisione
  di Salvatore del 30/09.
- Ha un `AudioContext` suo: non tocca il microfono né l'`<audio>` della
  risposta. C'è una prova e2e con la voce e l'audio sveglio acceso.
- Parte subito se il browser lo permette, altrimenti al primo tocco. Se il
  sistema lo sospende (chiamata, altra app), `statechange` lo scrive nel log e
  riprende al tocco dopo.
- Da verificare sul tablet vero: che l'Echo smetta davvero di annunciarlo, e
  che non cambi il comportamento con la musica di Spotify.

### Musica: jarvis_musica (lato HA, 30/09) e fase M

**Scoperta della sessione server, verificata nel codice di HA 2026.9.3**
(`components/spotify/media_player.py`, identico nel pacchetto installato):
senza una riproduzione attiva sull'account, `supported_features` è solo
`SELECT_SOURCE`. Quindi `play_media` viene rifiutato ("does not support action
media_player.play_media") e `select_source` non avvia niente: con
l'integrazione standard la musica non parte dal silenzio.

**Soluzione**: componente `jarvis_musica`. Riusa `entry.runtime_data.coordinator.client`
(lo SpotifyClient di spotifyaio già autenticato dall'integrazione, token
rinnovato dalla sua `OAuth2Session`: nessuna credenziale nuova), cerca e chiama
`start_playback(device_id=…)`. Stanza → dispositivo Spotify Connect **in
configurazione** (`jarvis_musica: stanze:`), mai nel codice (multi-casa).

**spotifyaio 2.0.2, letto nel codice** (`_request`):
- solleva errore solo per 403 (`SpotifyForbiddenError`), timeout
  (`SpotifyConnectionError`) e un 404 riconosciuto cercando il testo
  `"status": 404`;
- tutti gli altri rifiuti di Spotify tornano **in silenzio**;
- `start_playback` non restituisce niente.

Quindi il componente **rilegge `get_playback()`** (ogni 0,5 s, fino a 8 s) e
considera partito solo lo stesso contesto o brano sullo stesso dispositivo.
Altrimenti prova il candidato successivo (al massimo 3), poi risponde
`avvio_non_riuscito`.

Il rinnovo del token in HA 2026.9.3 alza `OAuth2TokenRequestReauthError`
(accesso da rifare, HA apre già la richiesta) oppure
`OAuth2TokenRequestTransientError` (un `ClientResponseError`, passeggero).

**Provato sull'Echo vero (sessione server, 30/09)**, con le stanze Cucina,
Camera da letto e Tutta la casa (gruppo Alexa), predefinita Cucina:

- avvio dal silenzio ok in circa 12 s; via Gemini risposta in 5,7 s;
- volume, successivo e pausa dal media_player: ok.

Due difetti, corretti lo stesso giorno:

1. "Queen" come artista faceva partire Freddie Mercury (primo nell'ordine di
   Spotify). Ora per ogni tipo passano davanti i nomi identici normalizzati.
   La popolarità non si può usare: nella ricerca spotifyaio dà
   `SimplifiedArtist` senza quel campo.
2. Subito dopo un avvio Gemini diceva "non sta suonando nulla": il
   media_player di HA si aggiorna ogni 30 s. Ora ci sono i servizi `controllo`
   (pausa, riprendi, successivo, precedente, volume, alza, abbassa, sposta) e
   `stato`, che leggono da Spotify e confermano rileggendo. Ogni comando
   riuscito fa `coordinator.async_refresh()`, che è ciò che fa HA stesso con
   `async_refresh_after`. Prima usavo `async_request_refresh()`, che passa dal
   debouncer da 10 s.

Tempi: le tre richieste iniziali (dispositivi, stato, ricerca) ora vanno in
parallelo, e la risposta porta `tempi_ms` per misurare invece di indovinare.

**Seconda prova sull'Echo (sessione server, 30/09) e correzioni della 0.3:**

1. **Tempi**: `tempi_ms` era {ricerca 429, avvio 2531, totale 12657}; ~10 s
   passavano DOPO la conferma, ad aspettare `coordinator.async_refresh()`. Il
   coordinator ha un suo lucchetto (`_debounced_refresh.async_lock()`) e con una
   playlist la rilegge. Ora l'aggiornamento va in background
   (`hass.async_create_task`). La conferma "suona davvero?" resta: costa
   0,8-2,5 s ed è la difesa contro i rifiuti silenziosi.
2. **"Queen" come artista → Michael Jackson.** Con la sola ricerca di artisti e
   `limit=5` Queen non era tra i risultati. Ora `limit=10` e, se il nome
   esatto manca, una seconda ricerca col filtro di campo `artist:"…"`
   (`track:`/`album:` per gli altri tipi). La risposta porta `considerati`.
3. **"Riprendi" dopo ~10 min di pausa**: Spotify torna "a riposo" (niente
   stato) e il componente rispondeva "non suona niente". Ora ricorda
   dispositivo, contesto, brano, punto e volume (`Store`
   `jarvis_musica.ultimo`, vale anche dopo un riavvio). Riparte:
   - scaletta (playlist o album): con `uri_offset` e `position`;
   - artista: solo il contesto, Spotify non accetta un brano di partenza;
   - brano singolo: con la posizione.
4. Echo visibili a Spotify dopo ~40 min e un riavvio di HA: sì.

**Echo in Bluetooth come cassa del tablet (prova del 30/09): così non si usa.**
L'Echo mescola la musica via Wi-Fi e Jarvis via Bluetooth, oppure passa al
Bluetooth, mette in pausa Spotify e non riparte. Da qui la **pausa della musica
durante la voce** (v0.4.4). Direzione futura, non ora: Music Assistant con
Sendspin, con il pannello come player sincronizzato. Serve un mini PC:
decisione di Salvatore in sospeso.
Resta da verificare sugli Echo: se "riprendi" riparte dal punto giusto. Usa la
stessa chiamata di HA, cioè `start_playback()` con `position_ms: 0`.

**Fase M (pannello, dopo la G)**:
- card "In riproduzione" solo quando suona;
- schermata Musica;
- ducking durante la voce;
- piattaforme e uscite configurabili.

Prima mockup e domande, insieme alle nuove schermate e alla navigazione.

### Fase G (v0.4.8, 30/09): riposo, Hub, impostazioni, guida

Scelte di Salvatore sui mockup: riposo **C**, Hub **H1**, impostazioni **S1**,
guida **S3**. In questo giro niente navigazione laterale né schermate Stanza,
Meteo, Musica. Solo dati che il server manda davvero.

- **Tre viste, una sola istanza** (`src/vista/istanza.ts`): completo, riposo,
  hub. Cambiare vista non ricarica niente e non tocca timer, voce, musica.
  - completo → riposo dopo `attesaMin` minuti senza `pointerdown`/`keydown`
    (di serie 2; 1/2/5/10 o `null` = mai), **solo se** `puoRiposare`: niente
    chat, impostazioni o guida aperte, niente login richiesto, voce ferma,
    assistente libero (`jarvis-app.ts`, `quandoPuoRiposare`);
  - riposo → hub toccando la sfera (parte subito la voce, `DoveVoce = "hub"`);
    tocco altrove → completo;
  - hub → riposo dopo 30 s senza attività; i cambi di voce e assistente
    contano come attività, quindi una risposta lunga non viene tagliata.
- **Impostazioni del riposo** in localStorage `jarvis-riposo`
  `{attesaMin, notteDa, notteA}` (di serie 2/23/7). Notte con `da = a` = mai
  notte. Momento: mattina 5-11, giorno 11-18, sera, notte dalle impostazioni.
- **Riposo**: sfera + ora, data, righe (meteo, temperature delle stanze da
  `PREFERENZE`, musica da `jarvis_musica.stato` ogni 60 s), al massimo 3
  pastiglie dei timer (+N), anelli SVG (massimo 2). **Di notte** solo ora e
  un timer, sfera `notturna` ferma. Anti burn-in: contenuto con `inset: 8px`
  spostato di ±6 px ogni minuto.
- **Timer finito** resta sopra il riposo (non riporta al completo); di notte in
  rosso scuro (attributo `notte`).
- **Hub**: griglia a due righe (testa con ora/stanza/pallino, timer, tasto
  griglia; centro con sfera e sottotitoli). Stato della sfera letto dalle fasi
  della voce.
- **Impostazioni**: pressione lunga di 3 s sull'orologio (come la vecchia
  diagnostica, che ora è una sezione), niente PIN. Esc e "Indietro" di Android
  le chiudono. Sotto i 700 px le sezioni diventano linguette.
- **Guida**: `jarvis-guida` = "fatta" nel localStorage. Un pannello che ha già
  la stanza è "di prima della fase G" e non la vede. Si rifà dalle impostazioni.

### «Jarvis» sempre in ascolto (v0.5.0, 30/09)

Decisioni: sempre in ascolto, **acceso di serie**, memoria di ~1 s solo per la
parola, pipeline normale **senza `no_vad`** (la fine della frase la decide
`jarvis_voce`, tarato sul server), «Jarvis» ferma la suoneria (log del 30/09).

- **Due pezzi.** `src/parola/ascolto.ts` sta nel bundle iniziale (leggero);
  `src/parola/motore.ts` arriva con un `import()` pigro e si porta dietro
  onnxruntime-web (WASM, un thread) e i tre modelli: ~17 MB in `dist/parola/`.
  `vite.config.ts` manda il pezzo pigro in `parola/motore-*.js` e `.wasm`/`.onnx`
  in `parola/`; `scripts/dopo-build.mjs` li tiene fuori dal limite dei file e
  dei 200 KB (controlla invece 1 JS, il .wasm e 3 .onnx, massimo 25 MB).
- **Service worker**: cache `jarvis-parola` che sopravvive alle versioni. I
  nomi hanno l'impronta del contenuto, quindi a ogni versione si scarica solo
  ciò che è cambiato. La cache si riempie **al primo uso** (il fetch del
  service worker), **mai durante l'installazione**: vedi la lezione qui sotto.
  All'attivazione si tolgono dalla cache i file che la versione non usa più.
- **Elaborazione del microfono (v0.5.1)**: di serie `solo-eco`
  (echoCancellation sì, noiseSuppression e autoGainControl no), oppure
  `nessuna` o `tutta` (com'era fino alla v0.5.0); localStorage
  `jarvis-microfono`. Cambiandola a microfono aperto lo si riapre. All'apertura
  il registro scrive la frequenza dell'AudioContext e `getSettings()` della
  traccia.
- **Diagnostica dal vivo (v0.5.1)**: `AscoltoParola.dalVivo` (punteggio e base
  più alti degli ultimi 3 s, livello del microfono), mostrato da
  `jarvis-parola-dal-vivo` (4 volte al secondo, solo finché è a schermo).
  Riepilogo nel registro: ogni 30 s nei primi 10 minuti di ascolto e quando il
  massimo è ≥ 0,05, poi ogni 10 minuti (`riepilogoDaScrivere`): il registro ha
  200 voci e un riepilogo fisso le riempirebbe in meno di due ore.
- **Esempi e pronuncia stanno nell'IndexedDB DELL'INDIRIZZO in uso**: veloce e
  riserva sono due origini, con due memorie separate. All'avvio il registro
  dice quanti esempi ci sono su quell'indirizzo; la sezione Voce lo avvisa.
- **Microfono condiviso** (`MicrofonoCondiviso`): uno solo, sempre a 16 kHz
  (ricampiona se il browser non li concede) e a HA si dichiara sempre 16000.
  La voce si aggancia al microfono aperto; staccandosi non lo chiude se
  l'ascolto continuo è acceso. Con «Jarvis» spento tutto come prima.
- **Scatto** (`puoScattare`): punteggio ≥ soglia (0,5, o `parola.json`), non
  durante una domanda (un errore a schermo come "Non ho capito" NON conta come
  domanda in corso: altrimenti «Jarvis» resterebbe sordo finché qualcuno lo
  chiude), non entro 2 s dal precedente, non entro 1,5 s dalla
  fine della risposta (la coda dell'audio dall'altoparlante), mai durante la
  registrazione degli esempi. Se il dispositivo resta indietro di oltre 25
  frame si butta l'audio vecchio (e si conta).
- **Allo scatto (v0.5.2)**: la memoria è di **10 s** (solo RAM, svuotata con
  «Jarvis» spento e a ogni avvio). Si manda dall'**inizio della frase**
  (`inizioFrase`): tornando indietro dalla parola, la prima pausa di almeno
  1,0 s (la soglia di fine frase di `jarvis_voce`) segna l'inizio, con 0,25 s
  di margine; senza pause, tutti i 10 s. Voce/silenzio con l'RMS a finestre
  da 20 ms, soglia = max(150, 3 × il 10° percentile della memoria): nel
  dubbio si vede silenzio (meno contesto), mai una pausa vera come voce (il
  server chiuderebbe prima di «Jarvis»). Il silenzio dopo la parola non
  conta. La frase va a HA tutta insieme appena HA dà l'id, poi l'audio dal
  vivo; poi la memoria si azzera davvero. La voce tiene da parte fino a 400
  pezzi (~25 s) prima dell'id: col vecchio limite (160) l'audio dopo la parola
  si sarebbe perso. Si manda
  `input.wake_word_phrase: "Jarvis"`: HA 2026.9.3 scarta un secondo risveglio
  con la stessa parola entro 2 s (`WAKE_WORD_COOLDOWN`, errore
  `duplicate_wake_up_detected`, letto in `pipeline.py`). Sul pannello che
  perde: turno scartato in silenzio (tipo d'errore `doppione`). Col tocco
  niente `wake_word_phrase`.
- **Falso scatto**: se dopo «Jarvis» nessuno parla (`stt-no-text-recognized`
  senza testo) la voce si chiude in silenzio, come il seguito: niente "Non ho
  capito" a ogni falso positivo. Col tocco invece il messaggio resta.
- **Dove si vede**: dal riposo o dall'Hub → Hub; chat aperta → chat;
  altrimenti riquadro piccolo (`doveParlare`, deciso in `jarvis-app`).
- **Suoneria**: allo scatto `timer.silenzia()` (riquadro e 2 minuti restano).
  La pipeline va da stt a **stt** (solo testo, ammesso da HA: `end_stage` ≥
  `start_stage`). Col testo: se `eComandoStop` (tolte la parola e i
  riempitivi restano solo stop/basta/ferma/zitto…) → `timer.ferma()` con
  `timer_ferma` agli altri, turno chiuso con "Timer fermato." e nessuna
  chiamata a Gemini; altrimenti sullo stesso turno parte una pipeline da
  **intent a tts** col testo (`Assistente.dopoTrascrizione`).
- **Android**: Wake Lock mentre ascolta; microfono chiuso dal sistema →
  stato "fermo", ripresa quando la pagina torna visibile.
- **Impostazioni → Voce**: interruttore (`jarvis-parola` nel localStorage,
  `{acceso, suono}` dalla v0.5.3), stato, misure (frame, ms per frame, carico, scatti), modello e
  licenza, verificatore; "Insegna a Jarvis la tua pronuncia" (20 esempi per
  persona, 60 s di parlato normale, «Impara la pronuncia»), cancellazioni con
  conferma che dice che non si recuperano.
- **Prove**: il microfono finto di Chromium (dalla v0.5.3 di serie un fruscio
  bassissimo, `test/dati/audio/silenzio.wav`) non dice «Jarvis», quindi la parola la
  fa "sentire" un verificatore "sempre sì" servito da `parola.json`, con un
  ritardo del finto HA (`/__prova/file` con `ritardo`) che decide QUANDO parte
  il motore (dopo aver messo a riposo, dopo che il timer suona). Le altre prove
  partono con «Jarvis» spento (`stato-iniziale.json`). Il finto HA misura i
  byte arrivati nei primi 150 ms (`byteSubito`): la memoria arriva subito.

### Il minuto prima e la conversazione continua (v0.5.3, 01/10)

Requisito di Salvatore, "persona sempre presente"; lato server `jarvis_voce`
0.2.7 (contesto a Gemini in automatico, aspetta la trascrizione fino a 6 s;
dopo «Jarvis» da solo aspetta fino a 3 s; frase massima 30 s).

- **Memoria di 60 s** (`SECONDI_MEMORIA`), solo RAM, svuotata con «Jarvis»
  spento, a ogni avvio e dopo ogni scatto. La **richiesta** resta quella della
  v0.5.2, ma cercata solo negli ultimi 10 s (`inizioRichiesta`,
  `FINESTRA_FRASE_S`): senza limite un minuto senza pause diventerebbe una
  "domanda" di 60 s.
- **Contesto** (`contestoPrima`/`intervalloContesto`): l'audio PRIMA della
  richiesta, senza il silenzio iniziale e finale (margine 0,25 s); voce con la
  stessa energia di `inizioFrase`, soglia presa da tutta la memoria; sotto
  0,5 s di parlato (`MINIMO_PARLATO_S`) non si manda. Parte **prima** della
  richiesta e solo se la richiesta può partire (assistente non occupato).
- **`Assistente.inviaContesto`**: pipeline a parte, `start_stage`/`end_stage`
  `stt`, `input {sample_rate:16000, no_vad:true}`, `device_id
  "<pannello>__contesto"` (`jarvis_pannello__contesto` senza stanza), niente
  `conversation_id`. A run-start tutto l'audio a raffica (pezzi da 1024) e
  subito il frame col solo id; il PCM si azzera appena inviato. Nessun turno,
  nessuna interfaccia: errori solo come riga nel registro; della trascrizione
  si scrive solo la lunghezza. Chiusa da run-end o dopo 30 s.
- **Conversazione continua** (`Voce`): dopo ogni risposta finita da sola (non
  interrotta), anche col tocco, il microfono si riapre per **8 s**
  (`SEGUITO_MS`) senza parola: `ascoltoAncora`, «Ti ascolto ancora…», anello
  tratteggiato che respira. **La pipeline verso HA parte solo se qui si sente
  parlare** (`RilevaParlato`: RMS per pezzo ≥ max(150, min(3 × fondo, 1000)),
  due pezzi di fila); si manda da ~0,5 s prima (8 pezzi). Stesso
  conversation_id (lo tiene l'assistente), nessun contesto, nessuna
  `wake_word_phrase`. Nessuno parla → chiusura in silenzio, nulla inviato,
  nessun turno. `continue_conversation` di HA non apre più una pipeline
  subito: il seguito è sempre questo.
- **Reattività**: allo scatto il bip (se `suono`, di serie acceso) parte prima
  di tutto e la fase "apertura" va a schermo subito; con «Jarvis» niente
  secondo bip all'apertura (col tocco il bip resta). La coda si svuota appena
  arriva run-start (`allinea`), non al pezzo dopo. Riga nel registro
  `Reattività «Jarvis»: scatto, segnale (requestAnimationFrame), run-start,
  primo audio` in ms dalla fine della parola (arrivo del pezzo).
- **Strada veloce** (`sogliaPersonale`): addestrando la pronuncia, 10°
  percentile dei punteggi finali più alti di ogni esempio × 0,8, al massimo
  0,5, mai sotto 0,2 né a meno di 0,1 dal parlato normale; se non c'è spazio,
  resta la soglia di serie. Salvata nel verificatore (`soglia`, facoltativa);
  `parola.json` con `soglia` vince. Il modello su misura viene dopo, se
  Salvatore lo conferma.
- **`ASCOLTO_MASSIMO_MS` 35 s**: il pannello non taglia la frase prima del
  server (30 s).
- **Prove**: `discussione-poi-jarvis.wav` (Piper, 47 s: 40 s di discussione,
  1,4 s di pausa, frase con «hey jarvis»), col modello vero in Vitest e come
  microfono nel pannello: due pipeline nel finto HA, contesto (~40 s, a
  raffica, chiuso subito) e richiesta (solo la frase). Il finto HA riconosce
  il contesto dal device_id e registra `device_id`, `contesto`, `noVad`,
  `msFine`. Conversazione continua col fruscio (si chiude) e con una frase in
  loop (seconda domanda, stesso conversation_id).

### Falsi scatti e annunci (v0.5.4, 01/10)

- **Fatto**: cucina, 12:27-12:40, 10 scatti con la TV del salotto accesa,
  trascrizione sempre vuota. **Misura** (`test/unit/parola-falsi-scatti.test.ts`,
  20 minuti di "TV" sintetica da `sottofondo-parlato.wav` + discussione + musica
  generata, e il modello vero): un frame sopra 0,5 bastava → 24 falsi
  all'ora; un verificatore con pochi negativi e soglia base bassa → 48.
- **`DecisioneScatto`** (`src/parola/decisione.ts`, logica pura usata dal
  pannello e dalla prova): `pazienza` frame di fila sopra soglia (di serie
  2); la soglia personale solo se `verificato`; soglia che si adatta (più di
  `vuoti` scatti a vuoto in `finestra` → +`passo`; dopo `quiete` senza
  scatti a vuoto −`passo`, mai sotto la base; massimo 0,95). Risultato:
  base 24 → 0/ora, «hey jarvis» nella TV 23/24.
- **Impara dai falsi scatti** (`MotoreParola.imparaDaFalsoScatto`): allo
  scatto si fotografano gli ultimi 16 frame (`istantanea`); se la
  trascrizione torna vuota (`OpzioniVoce.dopoScatto(null)`) diventano un
  esempio "normale" con persona `(falso scatto)` (solo caratteristiche) e
  dopo 2 il verificatore si riaddestra da solo (se ci sono esempi della
  parola). Nell'addestramento i falsi entrano tutti, non diradati. Nella
  prova: verificatore "convinto dalla TV" 48 → 0/ora dopo 2 falsi, parola
  vera 12/12.
- **Registro**: a ogni scatto la soglia usata; all'esito "«Jarvis» delle
  HH:MM: punteggio, (verificatore), trascrizione «…»" o "vuota: falso
  scatto"; a ogni cambio di soglia il motivo.
- **Preferenze** (`src/parola/preferenze.ts`, localStorage `jarvis-parola`):
  acceso, suono, sogliaManuale (null = automatica), pazienza, adattiva,
  passo, finestraMinuti, vuoti, quieteMinuti, impara, contesto,
  secondiContesto. Ogni campo letto per sé, con limiti; un campo rotto torna
  di serie da solo. `jarvis-voce`: riascoltoSecondi (0 = spento).
- **Campi delle impostazioni** (`src/ui/campi.ts`): numero, numero con
  "automatico", interruttore, orario, testo, scelta; ognuno scrive "Di
  serie: …" e mostra «Ripristina» solo quando il valore è diverso
  (`data-test` `campo-<id>`, `serie-<id>`, `ripristina-<id>`). Da usare per
  OGNI impostazione nuova (requisito del 01/10).
- **Annunci** (`src/annunci/annunci.ts`): evento `jarvis_annuncio
  {pannello, testo, ascolta}` (jarvis_voce 0.2.8), solo con `pannello` =
  `proprietarioTimer()`. Coda, mai sopra una domanda. Voce: pipeline
  **tts→tts** con `input.text` (`Assistente.annuncia`, turno con
  `annuncio: true`, già "fatto", aspetta tts-end), poi `Voce.annuncia` nel
  luogo che decide l'app (porta l'Hub in primo piano), con il volume degli
  annunci; `ascolta` = gli 8 s di riascolto. Silenzio (preferenza "solo
  testo", notte dello schermo a riposo, `binary_sensor.jarvis_annunci_in_silenzio`
  on) o HA scollegato → scritto sullo schermo a riposo (max 5, 12 ore, un
  tocco lo toglie).
- **Impostazioni → Jarvis parla per primo**: le entità del pacchetto
  (`input_boolean.jarvis_annunci`, `_annuncio_caldo_camera`,
  `_annuncio_buongiorno`, `input_number.jarvis_annuncio_caldo_soglia`,
  `input_text.jarvis_annunci_stanza`, sei `input_datetime`) si cambiano coi
  servizi di HA; valore di serie = quello del pacchetto. Un'entità mancante
  si dice. Volume e "solo testo" in localStorage `jarvis-annunci`.
- **Finto HA**: entità del pacchetto, servizi `input_*`, pipeline tts→tts,
  `/__prova/annuncio`.

### Navigazione, Meteo, Stanza (v0.5.5, 01/10)

- **`Navigatore`** (`src/navigazione/navigazione.ts`, istanza in
  `navigazione/istanza.ts`, avviato da `main.ts`): pagina attuale (`casa`,
  `meteo`, `{stanza, area}`), `#nome` nell'indirizzo (`hashDi`,
  `paginaDaHash`). Le principali fanno `replaceState`, la Stanza
  `pushState` (secondo livello: Indietro torna a Casa); `popstate` senza
  chat/impostazioni aperte e `hashchange` passano da `suIndirizzo`. Dopo
  `ritornoSecondi` (90) senza tocchi si torna alla schermata iniziale.
  A ogni cambio `window.scrollTo(0, 0)` (sul telefono la pagina restava
  scorsa giù e la riga di navigazione fuori schermo).
- **Solo schermate vere nella colonna**: `PRINCIPALI` cresce con le
  versioni (Musica, Timer, Altro arrivano dopo). Le preferenze salvate con
  voci sconosciute le scartano, le voci nuove si aggiungono in fondo.
- **Layout** (`jarvis-app`): area `nav` a sinistra (sticky nei modi che
  scorrono), riga in alto sotto i 700 px; sul tablet la colonna è attaccata
  al bordo, info a 290 px e orologio a 104 px (con 330 px le card della
  camera uscivano dalla stanza). Una schermata va in `.pagina` (colonne
  2→fine) e sul tablet scorre dentro il suo spazio. Le impostazioni si
  aprono ancora dall'orologio, che sta in Casa.
- **Meteo** (`jarvis-pagina-meteo`, `src/meteo/dettagli.ts`): previsione
  `daily` e `hourly` (`osservaPrevisione` col tipo), `sun.sun` per alba e
  tramonto. Pioggia: probabilità se c'è, altrimenti mm, mai "0". Vento
  convertito solo tra km/h e m/s. Pressione senza separatore delle migliaia.
  Preferenze `jarvis-meteo`.
- **Stanza** (`jarvis-pagina-stanza`, `src/storico/storico.ts`):
  `history/history_during_period` (`minimal_response`, `no_attributes`,
  formato compresso `s`/`lu`), stati non numerici = buchi nella linea,
  l'ultimo valore prosegue fino ad adesso. Poi `jarvis-stanza` con
  `senzaTitolo`. Il nome della stanza nella Casa è un pulsante (evento
  `apri-stanza`), con l'area da toccare allargata dal padding (alzare la
  riga faceva uscire le card della camera). Preferenze `jarvis-storico`.
- **Finto HA**: previsione oraria (met.no: mm, niente probabilità), storico
  a 30 minuti con un buco, `sun.sun` con orari di Roma, meteo con
  pressione e vento.

### Musica (v0.5.6, 01/10)

- **`Musica`** (`src/musica/musica.ts`, istanza `connessione.musica`): un
  solo stato per schermata, mini-lettore e riposo. `osserva()` conta chi
  guarda: si rilegge `jarvis_musica.stato` ogni `intervalloSecondi` (20)
  solo con almeno un osservatore. `comanda`/`riproduci`: un comando alla
  volta (`occupata` spegne i pulsanti), poi si **aspetta la lettura già in
  corso e se ne fa una nuova** (quella partita prima del comando portava lo
  stato di prima). `alCollegamento()` da `segnaConnesso`: chi guardava da
  scollegato rilegge subito (prima il mini restava vuoto 20 s). Funzioni
  pure: `branoDa`, `posizioneAdesso` (scorre solo in riproduzione, mai
  oltre la durata), `playlistDa`, `ordinaPlaylist`. Preferenze
  `jarvis-musica`.
- **Schermata** `jarvis-pagina-musica`: playlist con `riproduci` (`cosa` =
  uri, `dove` = stanza dove suona, solo se suona o è in pausa: con
  "niente" decide `jarvis_musica`). Stanze: `preferenze.stanze` o le aree
  di HA (`stanzeMusica`).
- **Mini-lettore** `jarvis-mini-lettore`: attributo `nascosto` quando non
  suona (niente spazio vuoto). Testi **a capo, mai coi puntini** (il
  controllo di layout li segna come tagliati); sotto solo il primo artista.
  Sul tablet `senzaGiorni` sul meteo anche col mini sotto l'orologio; nella
  barra `flex: 0 1 480px` (a 380 un titolo lungo andava su 3 righe e
  alzava la barra), sul telefono riga intera.
- **Prove: comandi, non letture.** Il finto HA mette in `chiamate` anche
  le letture periodiche (`jarvis_voce.timer_attivi`, e dalla v0.5.6
  `jarvis_musica.stato` del mini-lettore, anche quando la musica non c'è).
  Una prova che guarda "l'ultima chiamata", conta le chiamate o vuole
  l'elenco vuoto passa da `soloComandi` (`test/e2e/aiuti.ts`), altrimenti
  fallisce sempre o a caso (una lettura ogni 20 s capita nel mezzo).
  Trovato in v0.5.6 su `navigazione.spec` e `dispositivi.spec`, che nelle
  prove mirate non erano state rilanciate: **quando cambia qualcosa che
  vale per tutto il pannello (colonna, letture periodiche) si rilanciano
  tutte le prove nel browser, non solo quelle nuove.**
- **Prove che dipendono dall'ora: si fissa la notte.** La release della
  v0.5.6 è caduta in CI su 3 prove degli annunci: girava alle 23 di Roma, e
  di notte (la notte del riposo, 23-7 di serie) gli annunci si scrivono e non
  si dicono. In locale passavano solo perché era giorno. Le prove degli
  annunci ora mettono `jarvis-riposo` con `notteDa = notteA = 0` (nessuna
  notte), come già fase-g e layout. Prima ho creduto a una gara tra
  iscrizione ed evento: c'è anche quella (il pannello segna "connesso" prima
  di iscriversi), e le prove aspettano `iscrittiAnnunci`, ma da sola non
  bastava. Lezione: una prova che cade solo in CI si riproduce **all'ora
  della CI** prima di cambiare il codice.
- **Finto HA**: `stato` con artisti, dispositivo, copertina, posizione e
  durata; `controllo` con successivo/precedente (3 brani), alza/abbassa
  (±10), sposta; `playlist`; `riproduci` ("Primo brano di <playlist>").

### Timer, Clima, Scene, Spesa, Avvisi, Altro (v0.5.7, 01/10)

- **Navigazione**: `Principale` ha tutte le schermate del mockup; ogni voce
  ha `dove` (`colonna` / `altro` / `spenta`) al posto di `visibile` (una
  voce nascosta fino alla v0.5.6 diventa "altro"). `FISSE`: Casa e Altro,
  sempre nella colonna. Una schermata spenta non si apre nemmeno
  dall'indirizzo (`accesa()`), se era aperta si torna a Casa, e non può
  essere l'iniziale. La colonna accende Altro per una schermata aperta da
  lì. Con tante voci la colonna scorre dentro (tablet) o va su due righe
  (telefono): mai di lato.
- **Preferenze delle schermate** (`src/pagine/preferenze.ts`, istanza
  `schermate`, chiave `jarvis-schermate`): durate dei timer, ore e consumi
  del Clima, scene, lista della spesa, ore e soglia batteria degli Avvisi.
- **Il `.gitignore` ha `schermate/`** (gli screenshot delle prove), che vale
  per QUALUNQUE cartella con quel nome: il modulo stava in `src/schermate/`
  e non sarebbe mai entrato nel commit (prettier, che segue il
  `.gitignore`, lo saltava pure). Il `.gitignore` non si tocca: la cartella
  si chiama `src/pagine/`. Prima di committare file nuovi:
  `git status --short --ignored src test`.
- **Timer** (`jarvis-pagina-timer`, `src/timer/frasi.ts`,
  `src/assistente/chiedi.ts`): il server non ha un servizio per creare o
  annullare i timer, quindi i pulsanti mandano a Jarvis la frase di voce
  («Imposta un timer di 5 minuti», «Annulla il timer pasta» o «… di 10
  minuti») con `assistente.chiedi`, cioè col device_id del pannello: il
  timer suona qui. `chiediEAspetta` aspetta la fine del turno e dà l'errore
  in parole (`messaggioErrore`). Il turno resta nella chat.
- **Clima** (`jarvis-pagina-clima`, `src/clima/consumi.ts`): un grafico
  per tutte le stanze con termometro con `scalaComune` (stessa scala, se no
  le linee non si confrontano); consumi solo da sensori con `device_class`
  power/energy (oggi nessuno); lo scaldabagno è la stessa
  `jarvis-card-interruttore` della Casa.
- **Scene** (`src/scene/scene.ts`, `src/scene/attiva.ts`): `script.turn_on`
  o `scene.turn_on` con l'entità come target; si dice "avviata", mai
  "fatta". Colori del mockup del 26/09. Le descrizioni dicono solo quello
  che lo script fa oggi (Buonanotte: la modalità notte del pannello è F6,
  non si promette). In Casa le prime 3 dell'elenco, non più "in arrivo".
- **Spesa** (`src/spesa/spesa.ts`, `jarvis-pagina-spesa`):
  `todo/item/subscribe` e servizi `todo.*` (verificati sul sorgente di HA
  2026.9.3); niente stato ottimistico: la lista sullo schermo è sempre
  quella che manda HA.
- **Avvisi** (`src/eventi/eventi.ts`, `src/connessione/interruzioni.ts`,
  `jarvis-pagina-avvisi`): `logbook/get_events` sulle entità delle card
  (ultime N ore, `when` in secondi). Il registro salta i sensori che
  cambiano di continuo: le batterie si leggono dallo stato di adesso.
  Stati senza genere ("accensione", non "accesa": il nome può essere
  maschile o femminile); "unknown" e passaggi intermedi saltati; "da
  <script>" da `context_entity_id`, "da un utente" da `context_user_id`.
  Le interruzioni le scrive il pannello (`jarvis-interruzioni`, le ultime
  30): HA irraggiungibile non le può registrare.
- **`OsservaEntita`** si iscrive di nuovo se l'elenco cambia
  (`hostUpdated`): prima l'elenco calcolato all'apertura restava quello
  (stanze arrivate dopo dai registri, sensori nuovi, scene scelte).
- **Finto HA**: `todo.shopping_list` (+ `/__prova/spesa`),
  `logbook/get_events` con un registro iniziale e ogni cambio di stato,
  `script.jarvis_*` (stato "on" per 1,2 s), batterie con `device_class`.
  Entità: 35.

### Fotocamera: presenza, «Jarvis» più facile da vicino, guarda e parla (v0.6.0, 02/10)

- **Modello**: UltraFace RFB-320 (MIT, 1,27 MB, `modelli/volto/` con
  LICENZA.md). Il grafo fa già softmax e decodifica (`scores`, `boxes`):
  restano soglia e NMS (`src/fotocamera/volto.ts`). Distanza = 0,139 /
  larghezza del volto; «guarda» = volto vicino e di fronte (proporzioni),
  approssimazione dichiarata. Caricato con `import()` (`motore-volto.ts`):
  finisce in `parola/` con onnxruntime condiviso. **`parola/` ora ha 8 file**
  (3 JS, 1 wasm, 4 onnx): `scripts/dopo-build.mjs` lo controlla, e la verifica
  dello zip dopo ogni release va fatta con 8, non più 5. La parola da sola ne
  carica 6 nella cache `jarvis-parola` (onnxruntime è ora un pezzo JS a sé,
  condiviso): `parola.spec.ts` lo controlla, e controlla che a fotocamera
  spenta il modello del volto non si scarichi.
- **`Presenza`** (`src/fotocamera/presenza.ts`): fotogrammi a `fps`, movimento
  su grigio 64×48, modello solo se qualcosa si muove, se qualcuno è già lì, o
  ogni 2 s. Arrivo = vicino dopo ≥ 60 s di assenza → `alArrivo` (main.ts:
  dal riposo al pannello completo) e `script.jarvis_presenza {pannello}`
  (al massimo ogni 5 min; `fire_event` dal websocket è solo per
  amministratori, verificato nel sorgente di HA 2026.9.3). Nelle sue ore di
  riposo (23-7) la fotocamera è chiusa. L'errore «non consentita» non si
  riprova da solo.
- **La fotocamera AIUTA l'attivazione, non la limita MAI** (7.3, decisione di
  Salvatore del 02/10): niente regole che ignorano «Jarvis» perché non si
  vede nessuno (si chiama anche dal divano, pannello in un'altra zona).
  `Presenza.scontoSoglia()` = `passoVicino` (di serie 0,05) se qualcuno è
  vicino negli ultimi 10 s, altrimenti 0; `AscoltoParola.soglie()` lo mette
  in `Soglie.sconto` e `DecisioneScatto.soglia()` lo toglie DOPO la soglia
  che si adatta (mai sotto `SOGLIA_MINIMA` 0,2, mai sopra la soglia senza
  sconto). Vale anche per la conferma su più frame e per la linea della
  barra dal vivo. Nessuno visibile o fotocamera spenta = identico a prima.
  Contro i falsi scatti restano la soglia che si adatta (v0.5.4) e il filtro
  di jarvis_voce 0.3.1 lato server (trascrizione senza «Jarvis» →
  `stt-no-text-recognized`, che il pannello chiude già in silenzio).
- **Guarda e parla** (7.4): `forseSguardo()` nell'ascolto di «Jarvis» (stesso
  microfono): `RilevaParlato` mentre `staGuardando()`, poi `voce.parla` con
  ~1 s di audio prima e `silenziosoSeVuoto` (OpzioniVoce nuova: senza parole
  si chiude in silenzio, come un falso scatto). **Serve «Jarvis» acceso.**
- **Prove**: fotocamera finta di Chromium da un y4m
  (`--use-file-for-fake-video-capture`, `dispositiviFinti()` in aiuti.ts) con
  una foto NASA di dominio pubblico (`test/dati/video/`, `rifai.py`); il
  modello vero gira nel pannello compilato e in `volto-modello.test.ts`
  (Node). **`accedi()` spegne la fotocamera** se la prova non la chiede con
  `fotocameraAccesa()`: la fotocamera finta di serie si muove sempre. Il
  browser delle prove è su **Europe/Rome** (playwright.config.ts) e Node su
  UTC: gli orari calcolati nelle prove vanno nel fuso del browser.

### Esporta / importa e giro della personalizzazione (v0.5.10, 02/10)

- **`src/impostazioni/copia.ts`**: un elenco CHIUSO di chiavi copiabili
  (`CHIAVI_COPIABILI`) e uno di chiavi mai copiate (`CHIAVI_MAI`: token,
  registro, interruzioni, stanza, guida), controllato sia all'esportazione
  sia all'importazione (anche `importa()` chiamata a mano scarta le
  vietate). Si copiano le stringhe così come sono salvate: ogni modulo le
  ripulisce all'avvio coi suoi `leggiPreferenze…`, quindi dopo l'import il
  pannello si RICARICA. Chiave nuova di preferenze → va aggiunta qui, se no
  non si esporta (e non lo dice nessuno).
- **Valori resi personalizzabili**: `promemoria`/`promemoriaOre` negli
  annunci (si tagliano alla scrittura, non nel getter: se no, tolto quello
  in cima, ricompariva uno vecchio già scartato), `sceneConfermaSecondi`
  nelle schermate, `riquadroSecondi` nella voce.
- **Layout**: un `<input type=file>` nascosto con 1 px conta come testo
  tagliato: `display: none` (il `<label>` lo apre lo stesso, e Playwright
  `setInputFiles` funziona). Nomi tecnici mai davanti alle persone
  (`descriviScartate`). «mini‑lettore» col trattino che non spezza (U+2011)
  dove può andare a capo.

### Musica dal dispositivo del pannello (v0.5.9 + jarvis_musica 0.5.0, 02/10)

- **Il problema vero**: dal Redmi una playlist era partita dall'Echo della
  cucina. Il pannello passava `dove` = "dove suona già", e senza musica il
  server usava la stanza predefinita. Regola di Salvatore: la musica parte
  dal dispositivo da cui la chiedi, le altre stanze solo se nominate.
- **Server** (`jarvis_musica` 0.5.0, `scegli_per_richiesta` in
  `scelta.py`): `dispositivi`, `imposta_pannello` (Store
  `jarvis_musica.pannelli`, per NOME: l'id dell'app Spotify su un telefono
  cambia), `pannello`/`dispositivo` in `riproduci` e `controllo`, il
  pannello dalla pipeline vocale con `from custom_components.jarvis_voce
  import pannello_corrente` (try/except). Dispositivo chiesto o salvato non
  visibile → `dispositivo_assente`, mai un altro altoparlante. C'era già una
  `stanza_di(nome)` in `scelta.py`: una seconda con un altro argomento
  l'aveva sovrascritta in silenzio (TypeError solo a runtime). Prima di
  aggiungere una funzione: `grep -n "def <nome>"`.
- **Con `return_response` jarvis_musica NON solleva errori**: risponde
  `{esito: "errore", codice, messaggio}`. Fino alla v0.5.8 il pannello lo
  prendeva per buono e l'errore spariva. Ora `chiamaControllato`
  (`src/musica/dispositivi.ts`) lo trasforma in errore col messaggio del
  server; `messaggioDi()` toglie "Error:" davanti.
- **Pannello** (`Musica.daDove`): ogni `riproduci`/`controllo` passa
  `pannello` (`dispositivoPannello()`) e `dispositivo` (quello scelto). Senza
  scelta, «Dove la suono?» (`jarvis-pagina-musica`), con «ricorda per questo
  pannello» (spento senza stanza). Impostazioni → Musica
  (`jarvis-impostazioni-musica`): «Questo pannello suona su:». I dispositivi
  si rileggono anche in `alCollegamento` (pannello aperto sulla Musica
  prima che HA risponda: trovato dal layout).
- **«Collega questo dispositivo»** (`CollegaDispositivo`,
  `jarvis-collega-spotify`): elenco PRIMA di aprire; Android → intent
  `intent://open#Intent;scheme=spotify;package=com.spotify.music;S.browser_fallback_url=<Play Store>;end`,
  altrove `https://open.spotify.com` in una nuova scheda; al ritorno
  (`visibilitychange`, o comunque dopo 5 s) rilegge ogni 2 s per 60 s:
  nuovo (o diventato attivo, tipo telefono/tablet/computer) = questo
  pannello → `imposta_pannello`; più nuovi → si sceglie; Ricollega cerca
  per nome. Mai credenziali nel pannello.
- **Prove nel browser**: i dispositivi devono comparire DOPO il tocco su
  «Collega» (`collega()` in `musica-dispositivo.spec.ts` aspetta «Apro
  Spotify»), se no sono già nell'elenco di partenza e non risultano nuovi.
  Il sito di Spotify si serve finto con `context.route` (senza rete la
  scheda finisce in `chrome-error://`). I 60 s si saltano con
  `page.clock.fastForward`. Finto HA: `/__prova/spotify-compare`,
  `/__prova/musica-pannello`, `versione: "0.4.0"` per il componente vecchio.

### Timer a tutto schermo (v0.6.2, 02/10)

- `src/timer/jarvis-timer-pieno.ts`: montato da jarvis-app (tra i
  sovrapposti, z-index 35, sotto «Timer finito» a 40) solo con un timer
  attivo e senza login, impostazioni e guida aperti; **decide lui quando
  aprirsi** con un battito di 1 s: `timerPienoSiApre` (acceso, timer attivi,
  nessuno che suona, voce non attiva, `Date.now() - vista.ultimaAttivita ≥
  secondi`) e, aperto, `timerPienoPuoRestare` (le stesse senza il conto dei
  secondi: lo chiude il tocco). Il tocco sul timer fa `stopPropagation`: non
  arriva a ciò che c'è sotto. `vista.ultimaAttivita` (nuovo getter) è il
  conto del riposo: tocchi, tasti e ogni cambio della voce.
- Preferenze in `jarvis-schermate` (`timerPieno`, `timerPienoSecondi`
  5-120): si esportano già con le altre.
- Cifre: `grandezzaCifre()` dal numero di caratteri (stima prudente, 80%
  della larghezza), con tetto al 42% dell'altezza: «1:58:56» sta a 320 px.
- Notte (sopra il riposo di notte): rosso scuro come «Timer finito».
- Prove: `test/e2e/timer-pieno.spec.ts` (secondi a 3), unitarie in
  `test/unit/timer-pieno.test.ts`; la regola «via mentre la voce è attiva»
  la tengono le unitarie (nel browser ogni cambio della voce azzera già il
  conto, la prova non la distinguerebbe). Layout alle 6 misure, di notte a
  1024 e 360, e oltre l'ora a 915×330 e 320.

### Riascolto breve, errori di Google, timer coi servizi, conferma scene (v0.5.8, 02/10)

- **Riascolto** (`src/voce/voce.ts`, `src/voce/preferenze-voce.ts`):
  `rispondi()` decide tra domanda (turno con `continua`, cioè
  `continue_conversation`, o annuncio con `ascolta`) e azione. Domanda →
  `riascoltoSecondi` (8) con «Ti ascolto ancora» (`ascoltoAncora`); azione →
  `riascoltoAzioneSecondi` (2) con `ascoltoBreve`: stesso `RilevaParlato`,
  ma nessuna scritta, nessun anello, sfera dell'Hub quieta. 0 = niente
  riascolto. Il seguito lo passa `prossimoSeguito` a `parla(…, true)`.
  `RilevaParlato(sensibilita)`: soglie × 0,6 / 1 / 1,6, pezzi di fila 2 / 2 / 3.
  **Nel finto HA le risposte NON hanno `continue_conversation`** se non si
  chiede `assistente?continua=N`: una prova che si aspetta «Ti ascolto
  ancora» deve chiederlo.
- **Errori di Google** (`src/assistente/eventi.ts`, `messaggi.ts`):
  `stt-stream-failed` → tipo `servizio` (prima era `nonSentito`, e con
  «Jarvis» si chiudeva in silenzio). `erroreDiGoogle()`: `servizio`, o
  `agente` con causa quota/occupato/gemini. Titolo unico
  `GOOGLE_NON_RISPONDE`, la causa nella spiegazione. La voce suona
  `Bip.suona("errore")` (520 → 390 Hz), mai il TTS.
  `stt-no-text-recognized` resta `nonSentito`, silenzioso.
- **Timer** (`src/timer/timer.ts`: `avvia`, `comando`,
  `esitoServizioTimer`): `jarvis_voce.timer_stanza {stanza, minuti, nome?}`
  con `slugStanza(stanzaPannello())` (per "Cucina" → "cucina", il server fa
  `jarvis_cucina`) e `timer_comando {id, azione}`; risposta `{esito:
  "ok"|"errore", messaggio}`. Il timer compare con l'evento `started` come a
  voce: niente stato ottimistico. `chiedi.ts` e le frasi per Jarvis tolte.
  Finto HA: `timer_stanza`, `timer_comando`, `/__prova/timer-server` (il
  server dimentica i timer senza eventi).
- **Conferma scene** (`ConfermaScena` in `src/scene/attiva.ts`,
  `sceneConferma` in `pagine/preferenze`): primo tocco → «Tocca ancora»
  per 4 s; un tocco su un'altra scena sposta la richiesta. Stessa classe
  per la Casa e la schermata Scene.

## 6. Decisioni di prodotto (log)

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
- **2026-09-29** — **F2**: condizionatore con 4 modalità sempre visibili
  (Spento, Freddo, Caldo, Ventola) + "Altro" (Deumidifica, Auto); TV salotto
  accendi/spegni + volume e muto; scaldabagno con lo stato del programma; i
  dispositivi nuovi in HA compaiono da soli; offline comandi disattivati; TV
  della camera con un solo "Tasto accensione" (Salvatore ha provato: con la TV
  accesa `switch.turn_on` la spegne).
- **2026-09-29** — **Layout = mockup approvato** (`docs/mockup.html`),
  confermato di nuovo dopo che una richiesta descriveva le linguette del primo
  mockup: stanze tutte insieme, clima nell'intestazione della stanza, 3 scene in
  riga, barra assistente in basso. Le zone delle fasi future si vedono ma sono
  dichiarate "in arrivo" e non toccabili (v0.1.2).
- **2026-09-29** — **v0.1.1 verificata su HA vero** (Chrome desktop su
  `https://casa.tail8392c1.ts.net`, dalla sessione server): 65 entità ricevute,
  latenza WebSocket 23 ms, un `{c:…}` reale non svuota più niente, "Aggiorna ora"
  passa dalla 0.1.0 alla 0.1.1 in ~15 s. Manca solo la conferma sul tablet.
- **2026-09-27** — Le 5 regolazioni (soglia nuvole, soglie e temperature del
  clima) **non hanno `initial:`**, così sopravvivono ai riavvii del server. I
  valori di partenza (90%, 26°, 24°, 18°, 21°) li imposta Salvatore una volta sola
  lato server, subito dopo l'installazione.
- **2026-09-29** — **Il pannello completo non si sovrappone mai, a nessuna
  misura da 320 px in su.** Sul tablet 1024×600 resta la schermata unica del
  mockup; sui telefoni (e sugli schermi bassi) la pagina scorre: niente
  schermata unica forzata sul telefono (v0.2.1). Annulla l'idea, discussa lo
  stesso giorno, di un pannello da telefono compresso in una schermata sola.
- **2026-09-29** — **Modalità Hub** per i telefoni-pannello, scelta e salvata sul
  dispositivo; è una fase a sé dopo la F5 (dettagli nel piano delle fasi).
  Anche il tablet resta in orizzontale.
- **2026-09-29** — **"Ehi Jarvis": prova di fattibilità prima della fase G**
  (pagina separata, v0.4.1). Richieste di Salvatore: anche "Jarvis" da solo, la
  parola in qualsiasi punto della frase con memoria circolare (pre-roll) solo in
  RAM, indicatore di privacy. Criteri del verdetto scritti prima dei numeri
  (sezione 5).
- **2026-09-29** — **Profili di voce (tono)**: uomo/donna/bambino-a, solo per il
  tono, mai per i permessi; dopo "Ehi Jarvis", con mockup e prova.
- **2026-09-29** — **F5**: chat aperta → voce nella chat; chat chiusa → riquadro
  piccolo; seguito come un Echo; bip leggero. v0.4.0.
- **2026-09-29** — **La F5 (voce) passa prima della fase G**: Salvatore usa solo
  il pannello, non l'app di HA. Ordine: F5 → G → Hub → F3 → F6. Annulla l'ordine
  F4 → G → F5 scritto poche ore prima. Mockup e domande della G non erano
  ancora iniziati.
- **2026-09-29** — **Errori di Gemini in italiano** (v0.3.2): 429 e 503 arrivano
  come testo tecnico in inglese; il pannello li riconosce e mostra un messaggio
  umano. **Script `jarvis_previsioni`** nel pacchetto HA, da esporre ad Assist:
  senza, Gemini rispondeva "non ho le previsioni per domani".
- **2026-09-29** — **Prova vera F2, condizionatore**: `climate.condizionatore` è
  un SwitchBot "DIY Air Conditioner"; il cloud rifiuta ogni cambio di modalità
  (9 su 9 falliti), funziona solo on/off con `switch.condizionatore`. Il
  pannello ha fatto rollback e avviso come previsto. Salvatore prova a ricreare
  il telecomando come condizionatore standard della libreria della marca.
  Il pannello mostrava "Ultimo comando: Ventola · 21°", che era lo stato
  iniziale assunto da HA e mai inviato: corretto in v0.3.1 ("Nessun comando
  inviato" finché lo stato non è scritto da un'azione).
- **2026-09-29** — **Requisito multi-casa**: Jarvis deve poter essere installato
  e usato agevolmente in altre case (parenti e amici, forse un servizio a
  pagamento: si decide dopo 1-2 case pilota). Dalla fase G niente dati di casa
  Salvatore nel bundle, configurazione guidata, moduli opzionali, nome del
  prodotto configurabile, distribuzione via HACS come proposta
  (`docs/proposta-multicasa.md`). Dettagli nella sezione 5.
- **2026-09-29** — **F4 verificata su HA vero** (sessione server): risposta in
  italiano in ~10 s; pipeline preferita corretta; script Buonanotte, Esco e
  Rientro esposti ad Assist (`jarvis_notifica` no, apposta). Difetto: alla
  domanda sulla temperatura in camera Gemini ha letto il sensore "percepita"
  (27,9°) invece di quello vero (25,9°).
- **2026-09-29** — **F4, chat**: sul tablet al posto delle stanze (variante A
  del mockup), solo la conversazione in corso, etichetta dell'azione + risposta,
  chiusura da sola dopo 60 s senza tocchi.
- **2026-09-29** — **Gestione dispositivi (fase G) subito dopo la F4**, prima
  della voce: card universali e preferenze condivise in HA sono fondamenta su
  cui si appoggiano F5, Hub e scene. Nuovo ordine: F4 → G → F5 → Hub → F3 → F6.
  Dentro la G anche la crescita del layout, le card mancanti e i dispositivi
  senza stanza.
- **2026-09-29** — **Architettura dei dispositivi** e **nuovo ordine delle fasi**
  (F4 → F5 → Hub → F3 → F6), con il **tasto di passaggio Hub ↔ completo** su
  tutti i dispositivi, la modalità predefinita salvata sul dispositivo e il
  ritorno automatico all'Hub dopo ~90 s. Dettagli nella sezione 5. Annulla
  l'ordine F3 → F4 → F5 → F6 → Hub scritto poche ore prima.
- **2026-09-30** — **Si apre sempre e solo il link vecchio**
  (`https://casa.tail8392c1.ts.net`), che passa da solo all'origine veloce
  (`https://jarvis-rosone.duckdns.org:8443`) quando risponde, con ripiego
  obbligatorio sulla riserva: l'app Tailscale di Android può spegnersi (è
  successo la notte del 30/09 alle 02:19) ed è l'unico pezzo fuori dal
  guardiano. Dettagli nella sezione 2, "Due origini".
- **2026-09-30** — **Musica: fase M dopo la G**, con Spotify tramite il
  componente `jarvis_musica`: l'integrazione standard non parte dal silenzio.
  Music Assistant (altre piattaforme) resta da valutare lato server, per il
  peso sul Redmi. Nuove schermate e navigazione: tutte disegnate ora a livello
  di mockup, implementate per fasi dopo la G: prima navigazione, Stanza e
  Meteo, poi Musica, poi il resto.
- **2026-09-30** — **«Jarvis» è sempre in ascolto** (v0.5.0), con una memoria
  circolare di circa 1 s, così la parola vale anche dentro la frase
  ("buongiorno Jarvis", "c'è un po' freddo qui, non trovi Jarvis"). In
  modalità pannello il microfono resta aperto, con l'indicatore visibile.
  Ricordato da Salvatore: era già la decisione presa per la voce.
- **2026-09-30** — **Audio sveglio per il Bluetooth: acceso di serie,
  spegnibile** dalla diagnostica (v0.4.5).
- **2026-09-30** — Ordine: **v0.4.5** (timer, pulsante mai bloccato, tastiera,
  audio sveglio) → **mockup** (G, schermo a riposo/AOD con i timer, Hub) →
  **v0.5.0** («Jarvis» sempre in ascolto). Vincolo per lo schermo a riposo:
  non ferma nessun processo (timer, voce, musica).
- **2026-09-30** — **Il timer suona solo sul pannello da cui è chiesto** (o su
  quello della stanza detta a voce), e Stop li ferma tutti. Annulla il "con
  più pannelli suonano tutti" della v0.4.5. Contratto con `jarvis_voce` 0.1.8
  nella sezione "Timer per pannello".
- **2026-09-30** — **Mockup gruppo 1, scelte di Salvatore**
  (`docs/mockup-riposo-hub.html`):
  - **schermo a riposo = variante C, "sfera"**: la sfera dell'Hub fioca che
    respira, orologio accanto, timer come anelli attorno alla sfera. Toccando
    la sfera parte Jarvis (riposo e Hub sono lo stesso oggetto); toccando
    fuori si apre il pannello completo;
  - **Hub = H1, sfera al centro**, sottotitoli sotto che sfumano, angolo con
    ora, stanza e pallino, tasto "griglia" per il completo;
  - il riposo parte **dopo 2 minuti senza tocchi**, di giorno e di notte. Dopo
    la risposta l'Hub torna al riposo in 30 s; dal completo si torna al
    riposo dopo ~90 s;
  - **"Timer finito" sul riposo = riquadro al centro** con Stop grande, il
    resto si abbassa senza accendersi; di notte in rosso scuro;
  - vincolo invariato: il riposo cambia solo la vista. WebSocket, timer, voce,
    musica e «Jarvis» restano accesi.
- **2026-09-30** — **Mockup gruppo 2, impostazioni** (`docs/mockup-impostazioni.html`):
  **S1, elenco a sezioni** (sezioni a sinistra, contenuto a destra) per l'uso
  di tutti i giorni, più la **procedura guidata S3 al primo avvio** di una casa
  nuova (stanza, vista, voce, pronuncia, prova). Si aprono **tenendo premuto
  l'orologio 3 s**, come oggi la diagnostica, che ne diventa una sezione.
  **Nessun PIN**: si cambia solo questo dispositivo; il login a HA resta
  protetto.
- **2026-09-30** — **Mockup gruppo 3, navigazione e schermate**
  (`docs/mockup-navigazione.html`):
  - **N2, colonna laterale**: Casa, Musica, Meteo, Timer, Altro, e in fondo
    l'Hub. La barra «Chiedi a Jarvis» resta;
  - schermate tenute: Stanza, Meteo, Clima (consumi solo se c'è un sensore),
    Timer (sveglie e promemoria quando il server le avrà), Scene (senza
    creazione di routine dal pannello), Lista della spesa, Avvisi ed eventi.
    Musica nel gruppo 4; la Diagnostica è una sezione delle impostazioni;
  - in tutte: tocco su un riquadro → la sua schermata, «Jarvis, apri…»,
    Indietro di Android, `#nome` nell'indirizzo, massimo 2 livelli, ritorno al
    riposo dopo ~90 s;
  - ordine dopo la G: **navigazione + Stanza + Meteo**, poi Musica (fase M),
    poi le altre.
- **2026-09-30** — **Mockup gruppo 4, musica** (`docs/mockup-musica.html`):
  schermata **M1, copertina grande** (comandi grandi, volume, stanze sotto
  per spostare la musica); **mini-lettore A**, sotto l'orologio nella colonna
  sinistra, solo quando qualcosa suona. Lato server si chiedono **copertina e
  avanzamento del brano** in `jarvis_musica.stato` e **l'elenco delle
  playlist**; la radio con Music Assistant per ora no.
- **2026-09-30** — **«Jarvis» sempre in ascolto (v0.5.0): la fine della frase
  la decide il server.** Proposta della sessione server, accettata: la voce è
  tarata lato server (`jarvis_voce`: fine frase dopo 1,0 s di silenzio,
  soglia 0,5, massimo 10 s, filtro del sottofondo, TV del salotto in muto
  durante l'ascolto, frasi inventate da Gemini sul silenzio scartate), e
  tutto questo vale solo se il VAD è quello del server. Quindi la memoria
  circolare locale serve **solo** a riconoscere «Jarvis»; poi si apre la
  pipeline normale **senza `no_vad`** e le si manda ~1 s di audio prima della
  parola più l'audio dal vivo. "Jarvis, spegni la TV" arriva intero. Se un
  giorno `no_vad` servisse davvero: prima si scrive in STATO.md perché, e
  come il pannello decide la fine della frase.
- **2026-09-30** — **Cambio d'ordine deciso da Salvatore: prima la fase G
  (v0.4.8), poi subito la v0.5.0.** Nella G: riposo C, "Timer finito" al
  centro, Hub H1 toccando la sfera, impostazioni S1 (orologio premuto 3 s,
  niente PIN), guida S3 solo al primo avvio. Solo dati che il server manda
  davvero (timer con `in_pausa`, `timer_attivi`, `jarvis_musica.stato`).
  Escluse da questo giro navigazione laterale e schermate Stanza, Meteo,
  Musica. La guida per ora chiede stanza e riposo; voce, pronuncia e prova
  entrano con la v0.5.0. Il riposo parte sempre dopo l'attesa scelta (di serie
  2 minuti): i ~90 s del gruppo 3 valgono per le schermate della navigazione,
  che non esistono ancora.

- **2026-09-30** — **v0.5.0, due scelte di Salvatore.** (1) Mentre suona un
  timer basta «Jarvis»: la suoneria tace subito e Jarvis ascolta; «stop»,
  «basta» o «ferma» chiudono il timer (anche sugli altri pannelli), un'altra
  domanda ha la sua risposta e la suoneria non riparte. Scartato «Jarvis»
  che abbassa solo la suoneria. Riconoscere «stop» da solo servirebbe un
  secondo modello, che non c'è. (2) «Jarvis» **acceso di serie** su ogni
  pannello, si spegne in Impostazioni → Voce (annulla il "spento di default"
  pensato per la prova).

- **2026-10-01** — **Il contesto PRIMA di «Jarvis» è un requisito di Salvatore**
  ("C'è un po' di freddo in questa stanza, cosa ne pensi, Jarvis?" arriva
  intera). Annulla la memoria di ~1 s "solo per la parola" del 30/09: ora 10 s,
  sempre solo in RAM e mai inviata senza la parola, e si manda dall'inizio
  della frase (ultima pausa ≥ 1,0 s). Lato server (`jarvis_voce` 0.2.5): toglie
  «Jarvis» all'inizio e alla fine della trascrizione, passa a Gemini la stanza
  del pannello dal device_id `jarvis_<area>` ("qui", "questa stanza"), frase
  massima 15 s. Il device_id del pannello resta `jarvis_<area_id>` esatto.

- **2026-10-01** — **v0.5.3, "persona sempre presente"** (Salvatore). Annulla i
  10 s della v0.5.2: memoria di **60 s**, sempre solo RAM e mai inviata senza
  la parola. Il minuto prima va a HA come **contesto** su una pipeline a parte
  (`…__contesto`, `no_vad`), la richiesta resta solo la frase. Dopo ogni
  risposta **8 s di riascolto senza parola**; scelta di progetto: la pipeline
  parte solo se il pannello sente parlare, così se nessuno parla non esce
  niente (né audio né costi di trascrizione). Bip allo scatto acceso di serie,
  si spegne in Impostazioni → Voce. Frase sulla privacy nella sezione Voce.

- **2026-10-01** — **Piano autonomo di Salvatore** (v0.5.4 → v0.6.0): niente
  domande, si decide e si rende tutto personalizzabile (valore di serie +
  «Ripristina»); le scelte da confermare vanno in STATO.md. Le preferenze
  del pannello stanno sul pannello, quelle della casa in entità di HA.
- **2026-10-01** — **v0.5.4**: conferma su 2 frame, soglia che si adatta e
  apprendimento dai falsi scatti, tutti accesi di serie (misurati). Annunci:
  di notte e nell'ora del silenzio niente voce, scritti a riposo.

- **2026-10-01** — **v0.5.5**: nella colonna solo le schermate che esistono
  (Casa, Meteo + Hub); Musica, Timer e Altro con le loro versioni. «Jarvis,
  apri…» rimandato (STATO.md, punti bloccati).
- **2026-10-01** — **v0.5.6**: Musica nella colonna al secondo posto (come
  nel mockup N2); mini-lettore sotto l'orologio di serie, solo mentre suona.
- **2026-10-01** — **v0.5.7**: colonna di serie come il mockup N2 (Casa,
  Musica, Meteo, Timer, Altro); ogni schermata nella colonna, in Altro o
  spenta. Scene attive anche in Casa. Timer dalla schermata passando da
  Jarvis finché il server non ha un servizio apposta.
- **2026-10-01** — **Workflow con 45 minuti di limite**: la release della
  v0.5.4 è stata annullata dai 20 minuti (verifica ~25 + Chromium 5).

## 7. Convenzioni

- Tutto in italiano: codice, commenti, commit, documentazione, e **anche i
  messaggi a Salvatore**. Mai risposte in inglese (30/09: è successo e lo ha
  irritato, a ragione).
- **Niente pagine di prova separate (decisione di Salvatore del 30/09, per
  sempre).** Tutto si prova DENTRO il pannello, sul link di sempre. Le misure e
  gli strumenti (es. "Insegna a Jarvis la tua pronuncia") stanno nelle
  impostazioni del pannello. Le istruzioni per Salvatore sono passi dentro il
  pannello, in italiano semplice, senza link. `prova-ehi-jarvis.html` è uscita
  dallo zip con la v0.5.0.
- **`STATO.md` sempre aggiornato**, con commit e push a ogni passo importante:
  la sessione server lo legge da GitHub e non può scrivere nel repo.
- In HA tutto ciò che crea Jarvis ha nome/ID che inizia con `jarvis`.
- In HA le notifiche passano **solo** da `script.jarvis_notifica`.
- Niente emoji nei controlli: icone SVG (`@mdi/js` nell'app).
- Touch target ≥ 48 px. Lo stato si scrive sempre a parole, mai solo col colore.
- Mai `catch` vuoti: ogni errore va nel log diagnostico.
- Mai finti successi: un dispositivo a infrarossi si mostra come "ultimo comando"
  o "stato non verificabile", mai come "Acceso".

## 8. Comandi (tutti eseguiti)

```bash
npm ci
npm run verifica        # lint + typecheck + test + build + e2e: è il comando che conta
npm run build           # dist/ (7 file) + controllo dei limiti
npm test                # Vitest
npm run e2e             # Playwright contro il finto HA (serve dist/ già compilata)
npx playwright test test/e2e/trasversali/layout.spec.ts   # solo la prova di layout (serve dist/)
npm run test:<modulo>   # le prove di un modulo (unitarie, poi build e browser); elenco nella mappa
bash scripts/crea-zip.sh
node test/finto-ha/server.mjs   # finto HA a mano: http://localhost:18123/local/jarvis/index.html

# Release: versione in package.json + sezione "## vX.Y.Z" in CHANGELOG.md, poi
# push sul branch principale. Il workflow "Release" vede che vX.Y.Z non esiste,
# rifà tutte le verifiche, crea il tag e allega jarvis-dist.zip. Se la release
# esiste già non fa niente.

# Prova di jarvis_musica (HA 2026.9.3 vuole Python ≥ 3.14.2; l'uv vecchio
# conosceva solo 3.14.0rc2: `pip install -U uv` in un venv a parte)
uv python install 3.14.7 && uv venv -p 3.14.7 .venv-ha-2026-9
VIRTUAL_ENV=.venv-ha-2026-9 uv pip install homeassistant==2026.9.3 spotifyaio==2.0.2
.venv-ha-2026-9/bin/python home-assistant/prove/prova_musica.py   # atteso: 87/87

# Prova del pacchetto HA (serve Python 3.13)
uv venv -p 3.13 .venv-ha && VIRTUAL_ENV=.venv-ha uv pip install homeassistant
.venv-ha/bin/python home-assistant/prove/prova_pacchetto.py   # atteso: 117/117
.venv-ha/bin/hass --script check_config -c <cartella con configuration.yaml + packages/>
scripts/segui-release.sh <sha> [minuti]   # segue la release di un commit fino a un esito qualunque
```

## 9. Lezioni imparate

- **Aspettare una release: `scripts/segui-release.sh <sha>`, mai un ciclo che
  aspetta solo il successo.** Il 02/10 tre attese si sono bloccate (una
  guardava solo l'intestazione del file, una non vedeva il fallimento, una
  aspettava una release fallita prima di un'altra): il lavoro si è fermato
  finché Salvatore non se n'è accorto. Lo script segue il workflow del commit
  esatto e si ferma su qualunque esito (0 pubblicata, 1 fallita/annullata, 2
  già esistente, 3 tempo scaduto). Non si chiude mai un turno su un'attesa che
  non copra anche il fallimento.

- **Committare un file solo: `git commit -- <file>`, mai `git add <file> &&
  git commit`** quando nell'indice c'è altro. `git mv` registra subito lo
  spostamento: il 02/10, a riordino del blocco 3 a metà, un commit «solo lo
  sha in STATO» si è portato dietro 50 file spostati senza gli import
  riscritti (commit f4fd966, codice che non compila sul branch per mezz'ora).
  Nessuna release rotta (la release rifà la verifica completa prima di
  pubblicare), ma la CI di quel commit è rossa. Prima di ogni commit «di un
  file solo»: `git diff --cached --stat`.

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
  (sezione 16), che fallisce se si rimette `initial:`.
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
- **Gli orari dello scaldabagno stanno in un posto solo**: la macro
  `scaldabagno_in_fascia` in `custom_templates/jarvis.jinja`. Il "prossimo
  cambio" la interroga a passi di 30 minuti invece di ripetere gli orari: se si
  cambia un orario, cambia tutto insieme.
- **Mai `pkill -f` con un pattern per fermare il finto HA**: il testo compare
  anche nella riga di comando della shell (anche nel comando che lo AVVIA, se è
  nella stessa riga), che si uccide da sola: è successo tre volte. Si avvia con
  `node test/finto-ha/server.mjs & PID=$!` e si ferma con `kill $PID` **nello
  stesso comando** (un server lanciato da una shell che poi si chiude può
  restare vivo sulla porta con il codice vecchio: è successo).
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
- **v0.2.0 si sovrapponeva sui telefoni, prove verdi.** Le prove giravano solo a
  1024×600: a 412×915 la barra fissa copriva il pulsante della TV. Ora
  `layout.spec.ts` prova 6 misure (anche offline, che allunga le stanze) e
  controlla intersezioni tra riquadri, card fuori dalla stanza e testi tagliati.
  **Controprova fatta**: rimettendo la barra `position: fixed` bocciano tutte e
  5 le misure da telefono.
- **Nel CSS dei componenti le regole "compatte" vanno in fondo.** A parità di
  specificità vince quella scritta dopo: il blocco `@media` messo in mezzo veniva
  annullato dalle regole base successive, senza nessun errore.
- **Una scritta in più può rompere un layout "a schermata unica".** Sul tablet
  offline la riga "Valori non aggiornati" allungava la Camera fuori schermo: il
  "non aggiornato" ora si mostra colorando il clima di arancione, e a parole
  nel banner ("valori non aggiornati"), senza righe in più. Ogni testo nuovo va provato offline.
- **"Nessuna sovrapposizione" non basta: v0.2.1 spezzava le parole.** Con
  `overflow-wrap: anywhere` e un pulsante che può stringersi fino a 48 px, a
  915×412 usciva «Scaldabagn|o». La prova passava perché nulla si sovrapponeva
  né sbordava. Ora conta anche le parole su più righe (Range per parola) e,
  prima della correzione, bocciava 2 misure su 6. Regola: nomi con
  `overflow-wrap: break-word`, e nel compatto il blocco del nome non scende
  sotto `min-content`. **Gli screenshot si guardano sempre, anche con le prove
  verdi**: è lì che è venuto fuori.
- **Una controprova vale solo se il build della versione rotta è riuscito.**
  La prima controprova della F4 (tolta la gestione della caduta a metà) è
  "passata": il metodo rimasto inutilizzato faceva fallire il typecheck, il
  build non partiva e Playwright provava il `dist/` vecchio. Si rompe il codice
  in modo che compili (un `return` in testa), e si controlla l'esito del build.
- **Con `page.clock` si fa passare il tempo solo a risposta finita.** Un
  `fastForward` appena compare il primo pezzo della risposta fa scattare i 60 s
  massimi a metà: sembra un difetto dell'app e non lo è.
- **Il riquadro può stare al suo posto mentre il contenuto esce.** Con tre timer
  sotto l'orologio, sul tablet le previsioni finivano sopra le scene e la prova
  di layout era verde: misurava `.info`, che per la griglia non cresceva. Ora
  misura i figli di `.info`, e con quel controllo la prova cade. Visto solo
  guardando lo screenshot.
- **Una prova del focus col mouse non dice niente sul tablet.** Il clic del
  mouse sposta il focus da solo: la prova "tocco fuori chiude la tastiera"
  passava anche senza il codice. Su Android il tocco che fa scorrere manda
  solo `pointerdown`, ed è quello che la prova deve mandare. Controprova fatta.
- **Prima di allargare una tolleranza, misura chi dei due sbaglia.** Il
  verificatore differiva da scikit-learn di 1,6e-5 (test a 1e-5). Misurando il
  gradiente nei due punti, era il mio a fermarsi prima (7e-8 contro 9e-9): si
  è stretta la tolleranza di L-BFGS, non il test. Sui dati veri, invece, lo
  scarto di 2e-4 era di scikit-learn, che con ingressi float32 lavora in
  precisione singola: in doppia lo scarto è 3e-8.
- **Negli script Playwright fuori dal runner `getByTestId` cerca `data-testid`**:
  questo progetto usa `data-test` (`selectors.setTestIdAttribute`). E mai
  `pkill -f <testo>` da una shell il cui comando contiene quel testo, perché
  uccide la shell stessa (uscita 144): il server lo avvia e lo spegne lo script.
- **Un componente che registra servizi vuole `services.yaml`.** Senza, HA 2026.9.3
  scrive "Failed to load services.yaml" a ogni avvio. La prova non lo vedeva:
  HA legge il file solo quando qualcuno chiede le descrizioni (interfaccia,
  Assist). Ora la prova lo valida con lo schema di HA (`_SERVICES_SCHEMA`).
  Controprova: un selettore sbagliato la fa cadere.
- **I dati di una casa non stanno nel file che si aggiorna.** La prima
  versione di `jarvis_musica.yaml` conteneva le stanze da compilare: al primo
  aggiornamento, copiarlo avrebbe cancellato i nomi veri degli Echo. Ora le
  stanze stanno in `packages/jarvis_musica_stanze.yaml`, creato una volta da
  `esempi/`. Regola per tutto ciò che è configurazione di una casa (anche la
  multi-casa).
- **Un `reset` del finto HA a metà prova cancella anche i login**: il pannello
  resta senza accesso e il pulsante non si attiva. Una situazione nuova = una
  prova nuova.
- **Una controprova che toglie l'unico uso di un import non compila** (tipi
  "non usato"): il build fallisce e la prova gira sul `dist/` vecchio. Si rompe
  in modo che compili (es. `() => (x() ? null : null)`) e si guarda BUILD OK.
- **Una libreria che non segnala gli errori va controllata dal risultato.**
  spotifyaio 2.0.2 lascia passare in silenzio quasi tutti i rifiuti di Spotify:
  fidarsi di "`start_playback` non ha sollevato" avrebbe fatto dire a Gemini
  "sta suonando" con le casse mute. Si rilegge lo stato. **Controprova fatta**:
  togliendo la rilettura, 3 verifiche su 29 falliscono. Nella stessa prova, i
  dati finti costruiti coi modelli veri della libreria hanno scoperto due errori
  della prova stessa: un nome non esportato e un campo mancante.
- **Il finto HA accettava un solo login alla volta.** Valeva solo l'ultimo
  token rilasciato: con due origini il login sulla veloce "scollegava" la
  riserva ("HA non riconosce più questo pannello"). HA vero tiene validi tutti i
  refresh token; ora anche il finto. Un finto più severo del vero nasconde
  scenari reali quanto uno più permissivo.
- **Una prova può dare per buono un difetto.** Quella del condizionatore
  controllava "Ultimo comando: Ventola" all'avvio: era lo stato assunto da HA,
  mai inviato, e la prova lo certificava. Il finto HA scriveva ogni stato con
  lo stesso context, quindi non poteva distinguere un comando da un avvio. Ora
  è fedele (context con `user_id` dopo un comando, stringa all'avvio). Quando
  una prova si aspetta un valore, chiedersi da dove viene davvero in HA.
- **Un controllo automatico può scambiare il design per un difetto: si corregge
  il markup, non la prova.** L'anello del livello, dentro il pulsante, lo faceva
  "sbordare" e la prova lo segnava come testo tagliato. L'anello ora sta accanto
  al pulsante, in un contenitore: il pulsante non sborda più e la prova resta
  severa.
- **Gli screenshot hanno trovato due difetti della F5 con tutte le prove verdi**:
  "Sto pensando…" sotto una risposta già scritta (HA stava preparando l'audio) e
  il pulsante blu invece che grigio (selettore rimasto indietro dopo lo
  spostamento dell'anello).
- **Per verificare un'implementazione di un modello, confrontala con
  l'originale sugli stessi dati, frame per frame.** Il rilevatore JS è stato
  controllato contro openWakeWord in Python su clip generate con Piper (voce
  sintetica, offline): stessa uscita a 4 decimali. Senza una sintesi vocale non
  c'era modo di sapere se riconoscesse davvero "hey jarvis".
- **Un comando con `rm -rf` va evitato anche nella scratchpad**: è stato
  rifiutato di nuovo; si crea una cartella con un nome nuovo invece di cancellare.
- **Una condizione che dipende da ciò che l'utente sta cambiando va decisa una
  volta sola.** La guida valutava "stanza già scelta = guida fatta" a ogni
  ridisegno: appena si sceglieva la stanza al passo 1 si chiudeva da sola. Ora
  si decide alla prima domanda (`primaStanza`). L'ha trovato la prova e2e.
- **L'anti burn-in sposta il contenuto: va lasciato il margine.** Con
  `inset: 0` la traslazione di ±6 px faceva uscire l'orologio dallo schermo sui
  telefoni bassi; con `inset: 8px` resta dentro. Visto negli screenshot a
  915×330, non nelle prove.
- **Le prove che dipendono dall'ora vanno fissate.** Le prove del riposo sono
  cadute alle 23:07: era notte, quindi niente righe e un solo timer. L'aiuto
  `senzaNotte` (notte da 0 a 0 = mai) le rende indipendenti dall'orario; la
  notte ha una prova a parte che la imposta sull'ora corrente.
- **L'installazione del service worker non deve scaricare file grandi,
  nemmeno "in modo non bloccante".** Con i 17 MB del motore scaricati
  all'installazione, la prova "indirizzo lento" cadeva a volte: circa una
  ricarica su due il JavaScript del pannello arrivava dalla rete (1,5 s) invece
  che dalla cache. Sulla v0.4.8, stessa prova, 6 volte su 6 sotto gli 80 ms;
  tolto lo scaricamento dall'installazione, 8 su 8. Il motore si mette in cache
  al primo uso. Un tempo che "a volte" sfora non è un caso: si confronta con la
  versione precedente prima di dirlo instabile.
- **Le prove di una funzione "sempre accesa" non devono cambiare le altre.**
  Con «Jarvis» acceso di serie il microfono resta aperto, e le prove della
  voce che controllano "microfono chiuso dopo la risposta" sarebbero cadute
  per il motivo sbagliato. Come per la guida: le prove esistenti partono con
  «Jarvis» spento, e i casi incrociati (tocco con «Jarvis» in ascolto) hanno
  prove loro.
- **Un verificatore finto "sempre sì" prova il cablaggio, non il riconoscimento.**
  La v0.5.0 aveva tutte le prove verdi e sul tablet «Jarvis» non è mai
  scattato: il percorso vero (microfono → worklet → modelli) non era mai stato
  provato con una voce. Dalla v0.5.1 c'è una clip vera usata come microfono di
  Chromium. Quella prova ha mostrato che il percorso è giusto (0,98-1,00), e
  quindi che il problema va cercato sul tablet: pronuncia, elaborazione del
  microfono di Android, indirizzo in uso. Da qui l'indicatore dal vivo.
- **Il modello regge il volume, non la quantizzazione.** Ipotesi del 01/10:
  "audio in scala float → punteggio ~0". Misurato: la clip divisa per 32768 in
  virgola mobile dà ancora 0,999. Quello che rompe è la scala float messa in
  interi (diventa silenzio): la controprova che conta è nel worklet, e la prova
  e2e con audio vero la prende. Un'ipotesi plausibile si misura prima di
  scriverci una prova sopra.
- **Prima di dare la colpa al codice, controlla lo strumento di misura.** Le
  prove del contesto cadevano: nel finto HA arrivavano 1,4 s invece di 3,4 s.
  Il registro del pannello diceva "mando 3,6 s" ogni volta: era il finto HA a
  contare male. Contava i byte nei primi 150 ms dall'apertura (la frase arriva
  dopo l'id di HA) e, dopo la sua fine finta dell'ascolto (0,6 s di audio),
  buttava i byte senza contarli. Ora conta dal primo byte, a parte.
- **Un turno "vecchio" ancora agganciato inganna chi lo segue.** Nel
  riascolto la voce teneva l'id del turno appena risposto; appena partiva la
  domanda nuova, l'assistente avvisava e `allinea` leggeva quel turno finito
  come "pensa": la voce smetteva di mandare audio. La prova unitaria l'ha
  preso (0 pezzi inviati). Prima di aprire un turno nuovo si stacca il
  vecchio.
- **Il microfono finto delle prove fa parte del comportamento.** Col tono
  continuo di Chromium il riascolto di 8 s l'avrebbe preso per voce, e ogni
  prova della voce sarebbe diventata una conversazione infinita. Il microfono
  di serie delle prove è ora un fruscio: chi vuole voce la mette con
  `microfonoDaFile`.
- **Un verificatore può peggiorare le cose.** Addestrato su pochi negativi e
  consultato già da punteggi base minimi, nella prova con la TV faceva
  scattare il doppio del modello di base, e nel rumore riconosceva meno la
  parola vera. Più regole non bastavano: è servito dargli i suoi errori come
  esempi. Prima di aggiungere soglie, misurare chi sta sbagliando.
- **La finestra di misura fa parte della prova.** Una variante "persa" lo
  era solo perché la frase finiva dopo la parola ("hey jarvis, what time is
  it"): la finestra partiva dalla fine della frase. Riconoscimento contato
  sull'intervallo della frase intera.
- **Un job annullato non è un job fallito, ma la release non c'è.** La
  v0.5.4 risultava "in corso" e poi spariva: il workflow era stato
  annullato dal limite di tempo. Dopo ogni push di versione si controlla la
  release per tag, non solo che il workflow sia partito.
