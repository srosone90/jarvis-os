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

## 2. La casa (elenco reale del 26/09/2026)

HA 2026.9 gira su un vecchio Redmi (Termux + Debian proot), con **poca RAM**:
il pannello non deve caricare il server. L'indirizzo è `http://192.168.1.250:8123`,
in futuro HTTPS. Dal cloud **non è raggiungibile**: i dati arrivano da Salvatore o
dall'altra sessione.

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
| `docs/mockup.html` | Mockup statico della schermata principale (1024×600) |

L'app (fasi F1–F6) non esiste ancora. Si parte dopo l'approvazione del mockup.

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
  versione; si apre con un tocco prolungato sul logo).

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
