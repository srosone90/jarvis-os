# STATO — per la sessione server

Aggiornato da Claude Code a ogni passo importante (commit e push sul branch
`claude/new-session-vpjgbq`). La sessione server lo legge da GitHub; le
risposte arrivano tramite Salvatore.

_Ultimo aggiornamento: 30/09/2026 — correzioni di `jarvis_musica` dopo la
prova sull'Echo._

## Adesso

- **Finito:** `jarvis_musica` versione 0.2, che corregge i 3 difetti trovati
  sull'Echo della cucina. Dettagli e installazione più sotto.
- **Prossimo:** v0.4.3, il verificatore "Ehi Jarvis" nella pagina di prova
  (registrazione degli esempi e addestramento sul telefono).
- **Poi:** v0.5.0, "Jarvis" nel pannello come opzione, spenta di default.
- **Dopo ancora:** i mockup (fase G, schermo a riposo e Hub, schermate e
  navigazione, musica).

## Ultima release del pannello

| | |
|---|---|
| Versione | **v0.4.2** (origine veloce con ripiego sul link vecchio) |
| Link | https://github.com/srosone90/jarvis-os/releases/tag/v0.4.2 |
| sha256 dello zip | `b6d6a61d4685ae471fca36aaa491c8c661a44c28404df92114ae8c57c2e2e4ae` |
| Stato | Installata dalla sessione server il 30/09 (sha e SW 0.4.2 verificati) |

## Da installare lato server ADESSO: `jarvis_musica` 0.2

Tutto sta nella cartella `home-assistant/` del branch. Istruzioni complete nel
[README di home-assistant](home-assistant/README.md), sezione "Musica".

**Novità**

1. **"Queen" ora fa partire i Queen.** Il nome identico passa davanti
   all'ordine di Spotify.
2. **Comandi e stato letti da Spotify.** Nuovi servizi
   `jarvis_musica.controllo` (pausa, riprendi, successivo, precedente, volume,
   alza, abbassa, sposta) e `jarvis_musica.stato` ("cosa sta suonando"),
   con i loro script per Gemini: `script.jarvis_musica_controllo` e
   `script.jarvis_musica_stato`. Rileggono lo stato vero e confermano il
   comando.
3. **Media_player aggiornato subito.** Dopo ogni comando riuscito si aggiorna
   (`async_refresh`, come fa HA), invece di aspettare i 30 s.
4. **Tempi.** Le tre richieste iniziali vanno in parallelo, e la risposta di
   `riproduci` contiene `tempi_ms` (ricerca, avvio, totale). Gli stessi tempi
   vanno nel log a livello info.
5. **Stanze in un file separato**, che gli aggiornamenti non toccano più.

**Passi (aggiornamento dalla versione installata stamattina)**

1. **Prima di sovrascrivere**, sposta la sezione `jarvis_musica:` (stanze e
   predefinita) dal vecchio `/config/packages/jarvis_musica.yaml` a
   `/config/packages/jarvis_musica_stanze.yaml`. Puoi copiare
   `home-assistant/esempi/jarvis_musica_stanze.yaml`, che ha già i nomi di
   casa: Cucina "Echo Pop cucina", Camera da letto "echo Pop camera da letto",
   Tutta la casa "Tutta la casa", predefinita Cucina.
2. Sovrascrivi `/config/custom_components/jarvis_musica/` con i 3 file nuovi
   (`__init__.py`, `scelta.py`, `manifest.json`) e
   `/config/packages/jarvis_musica.yaml`, che ora contiene solo i tre script.
3. Esegui la verifica della configurazione. Se la sezione `jarvis_musica:` è
   rimasta in tutti e due i file, la verifica dice "duplicate key": toglila
   dal vecchio file.
4. Riavvia HA: il componente è cambiato.
5. Esponi ad Assist anche `script.jarvis_musica_controllo` e
   `script.jarvis_musica_stato`.

**Come provarlo**

- "Metti i Queen in cucina": deve partire l'artista Queen, non Freddie
  Mercury.
- Subito dopo: "cosa sta suonando?", poi "metti in pausa", "riprendi", "alza",
  "canzone successiva", "sposta la musica in camera da letto".
- Nel log di HA, a livello info, la riga
  `jarvis_musica: … tempi {'ricerca': …, 'avvio': …, 'totale': …} ms`.

**Prove fatte qui**

- HA 2026.9.3 con Spotify finto costruito sui modelli veri di spotifyaio
  2.0.2: 53 verifiche su 53.
- Tre controprove: ognuna fa cadere la verifica giusta.
- `check_config` pulito con la struttura nuova.

## Domande aperte per la sessione server

1. **Tempi**: dopo l'aggiornamento, quanto valgono `ricerca`, `avvio` e
   `totale` per un avvio in cucina? Serve a capire se i 6-12 s sono di
   Spotify, della rete o dell'Echo.
2. **"Riprendi"**: dopo una pausa, riparte dal punto giusto o dall'inizio del
   brano? Usa la stessa chiamata del media_player di HA (`start_playback`,
   che manda `position_ms: 0`).
3. **Echo nel tempo**: gli Echo Pop restano tra i dispositivi Spotify dopo ore
   di inattività, o spariscono finché non li si usa?
4. **`media_player` Spotify esposto ad Assist?** Se sì, propongo di non
   esporlo più: con 30 s di ritardo Gemini rischia di usarlo al posto degli
   script. Dimmi se sei d'accordo.
5. **"Ehi Jarvis"**: le misure sul telefono vecchio sono sempre utili, ma non
   bloccano più niente. Dopo la v0.4.3 si rifanno con il verificatore.
