# Pacchetto Home Assistant di Jarvis OS

Questo file è scritto per **chi amministra Home Assistant**, cioè l'altra
sessione di Claude o Salvatore. Tutto quello che Jarvis OS chiede a HA sta in un
solo file: [`packages/jarvis.yaml`](packages/jarvis.yaml).

## Cosa contiene

| Cosa | Entità | A cosa serve |
|---|---|---|
| Programma scaldabagno | `binary_sensor.jarvis_scaldabagno_modalita_inverno`, `binary_sensor.jarvis_scaldabagno_programma`, automazione "segui il programma" | Accende e spegne `switch.scaldabagno` agli orari decisi, solo in modalità inverno |
| Testo per il pannello | `sensor.jarvis_scaldabagno_prossimo_cambio` | "Si spegne alle 11:00", "Si accende domani alle 04:30", "Modalità inverno spenta" |
| Misura nuvole | `sensor.jarvis_copertura_nuvolosa`, `input_number.jarvis_nuvole_somma`/`_campioni`, `counter.jarvis_giorni_nuvolosi`, 3 automazioni | Media della copertura nelle ore di luce, bilancio al tramonto |
| Temperatura percepita | `sensor.jarvis_temperatura_percepita_camera`, `…_soggiorno` | Formula di Steadman da temperatura e umidità dei Meter |
| Soglie clima | `input_number.jarvis_clima_*` (4) | Sopra 26° percepiti raffresca a 24°, sotto 18° riscalda a 21° (valori di partenza, vedi sotto) |
| Scene | `script.jarvis_buonanotte`, `script.jarvis_esco`, `script.jarvis_rientro` | I tre pulsanti del pannello |
| Presenza (pannello v0.6.0) | `script.jarvis_presenza` (`pannello`) | Lo chiama la fotocamera di un pannello quando qualcuno si avvicina (al massimo ogni 5 minuti): manda l'evento `jarvis_presenza {pannello}`, da usare per il buongiorno lato server. Uno script perché dal websocket `fire_event` è solo per gli amministratori. **Non** esporlo ad Assist |
| Previsioni per l'assistente | `script.jarvis_previsioni` | Restituisce le previsioni (giornaliere 5 giorni, orarie 12 ore) a Gemini; va **esposto ad Assist** |
| Notifiche | `script.jarvis_notifica` | Unico punto che scrive al telefono |
| Presenza | automazioni "Uscita" (solo notifica + pulsante) e "Rientro" (clima all'arrivo) | |
| Manutenzione | automazione "Batterie basse" | Meter e Bot sotto il 20% |

### Le regole dello scaldabagno, alla lettera

- Si applicano **solo da ottobre a giugno** e **dopo 2 giornate nuvolose di fila**.
- Una giornata è nuvolosa se la copertura media delle ore di luce è **≥ 90%**.
  La soglia è `input_number.jarvis_soglia_nuvole`.
- **Una giornata sotto soglia** azzera il contatore e disattiva la modalità.
- Con la modalità attiva lo scaldabagno si spegne alle 00:00 e si accende alle
  04:30 tutti i giorni. Dal martedì al sabato si spegne anche alle 11:00 e si
  riaccende alle 17:00.
- Se la modalità si attiva o si disattiva dentro una fascia, l'effetto è
  **immediato**. Esempio: si attiva alle 18:30 di martedì → lo scaldabagno si accende
  alle 18:30.
- Tra un orario e l'altro il programma non tocca niente, quindi un'accensione o
  uno spegnimento a mano restano validi fino all'orario successivo.

## Installazione

1. In `configuration.yaml` abilita i pacchetti, se non lo sono già. Se la chiave
   `homeassistant:` esiste già, aggiungi solo la riga `packages`:
   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```
2. Copia `packages/jarvis.yaml` in `/config/packages/jarvis.yaml` **e**
   `custom_templates/jarvis.jinja` in `/config/custom_templates/jarvis.jinja` (crea la
   cartella se non c'è). Il secondo file contiene gli orari dello scaldabagno, usati
   da due sensori del pacchetto: senza, quei due sensori non partono.
3. Vai su **Strumenti per sviluppatori → YAML → Verifica configurazione**. Solo se
   è verde, **riavvia** Home Assistant. Ricaricare gli script non basta: ci sono
   aiutanti e template nuovi.
4. **Subito dopo il riavvio, imposta i valori di partenza** (sezione qui sotto).
   Va fatto una volta sola.
5. **Esponi ad Assist** (Impostazioni → Assistenti vocali → Esponi) gli script
   `jarvis_buonanotte`, `jarvis_esco`, `jarvis_rientro` e `jarvis_previsioni`,
   così Gemini li può usare. **Non** esporre `jarvis_notifica` e i due sensori
   `jarvis_temperatura_percepita_*`: con questi ultimi esposti, alla domanda
   "che temperatura c'è in camera?" Gemini ha letto la percepita invece di
   quella vera (29/09).

## Valori di partenza (da impostare una volta sola)

I 5 aiutanti regolabili **non hanno `initial:`**, ed è voluto. Con `initial`,
Home Assistant li riporterebbe a quel valore a **ogni riavvio**, e sul server i
riavvii sono frequenti (blackout, guardiano): le regolazioni fatte dal pannello si
perderebbero. Senza `initial`, HA ripristina l'ultimo valore salvato.

Il rovescio della medaglia: alla **prima installazione** ogni aiutante parte dal suo
**minimo**. Finché non imposti i valori qui sotto, il Rientro raffredderebbe a 16°
appena la camera supera 20° percepiti. Per questo il passo 4 va fatto subito.

| Aiutante | Valore di partenza | Minimo (se non lo imposti) |
|---|---|---|
| `input_number.jarvis_soglia_nuvole` | **90** % | 50 % |
| `input_number.jarvis_clima_soglia_caldo` | **26** °C | 20 °C |
| `input_number.jarvis_clima_temp_raffresca` | **24** °C | 16 °C |
| `input_number.jarvis_clima_soglia_freddo` | **18** °C | 10 °C |
| `input_number.jarvis_clima_temp_riscalda` | **21** °C | 16 °C |

Il modo più veloce è **Strumenti per sviluppatori → Azioni**, in modalità YAML:
una chiamata a `input_number.set_value` per ogni riga della tabella. Per esempio:

```yaml
action: input_number.set_value
target:
  entity_id: input_number.jarvis_soglia_nuvole
data:
  value: 90
```

Poi controlla i 5 valori in *Strumenti per sviluppatori → Stati*.
In alternativa si impostano da *Impostazioni → Dispositivi e servizi → Aiutanti*.

Il contatore `counter.jarvis_giorni_nuvolosi` non va impostato: parte da 0 e
anche lui sopravvive ai riavvii (`restore: true`).

## Da verificare in casa PRIMA di fidarsi (non verificabile da fuori)

Il pacchetto è stato provato su un Home Assistant vero con dispositivi finti che
hanno gli stessi entity_id (vedi *Prove* più sotto). Queste cose però dipendono
dai dispositivi reali e vanno controllate sul posto:

1. **Il Bot dello scaldabagno deve essere in modalità "Interruttore"** (switch)
   nell'app SwitchBot, non "Premi" (press). In modalità "Premi", sia l'accensione
   sia lo spegnimento fanno una sola pressione, quindi il programma **invertirebbe**
   lo stato. Prova: da HA accendi e spegni `switch.scaldabagno` e guarda che lo
   scaldabagno faccia davvero la stessa cosa.
   Se qualcuno preme il pulsante fisico a mano, HA non lo sa e lo stato si
   disallinea fino al comando successivo.
2. **Nome del servizio notifiche.** Il pacchetto usa `notify.mobile_app_xiaomi_salvo`,
   il servizio dell'app HA del telefono, che è diverso dall'entità
   `notify.xiaomi_salvo`. Controllalo in *Strumenti per sviluppatori → Azioni*.
   Se il nome è diverso va corretto **solo** in `script.jarvis_notifica`. Prova:
   esegui `script.jarvis_notifica` con `messaggio: prova`.
3. **`weather.forecast_casa` deve avere l'attributo `cloud_coverage`**. Si controlla in
   *Strumenti per sviluppatori → Stati*. Se manca, `sensor.jarvis_copertura_nuvolosa`
   resta non disponibile e ogni sera arriva la notifica "non sono riuscito a
   leggere la copertura".
4. **Il condizionatore deve accettare le modalità `cool` e `heat`**: guarda
   l'attributo `hvac_modes` di `climate.condizionatore`.
5. **Il servizio `logbook.log` deve esistere.** C'è se in `configuration.yaml` hai
   `default_config:`. Le note nel registro sono sempre l'ultimo passo, quindi se
   manca le automazioni fanno comunque il loro lavoro.

## Stato di partenza

- Il contatore delle giornate nuvolose parte da 0, quindi la modalità inverno
  si attiva dopo 2 giornate nuvolose **a partire dall'installazione**. Se oggi
  serve già, imposta a mano `counter.jarvis_giorni_nuvolosi` a 2.
- **I backup automatici di HA non sono configurati**:
  `sensor.backup_next_scheduled_automatic_backup` risulta `unknown`. HA gira su un
  vecchio telefono, e se la memoria si guasta si perde tutto. Conviene attivarli
  (Impostazioni → Sistema → Backup) con una copia fuori dal telefono.

## Rischio infrarossi (TV camera)

`switch.tv_camera_da_letto` passa da un hub a infrarossi: HA non sa se la TV è
accesa, e su molte TV il comando "spegni" è lo stesso tasto dell'accensione. Per
questo **nessuna automazione e nessuna scena la tocca**: "spegni tutto"
rischierebbe di accenderla. Sul pannello compare come un tasto del telecomando.

## Limiti noti

- Se HA è spento proprio a un orario del programma, quel cambio si perde fino
  all'orario successivo. Esempio: spento alle 04:30 → niente acqua calda fino al
  cambio dopo.
- Se HA è spento al tramonto, quella giornata non viene contata. Il contatore
  resta com'era e si azzerano solo i campioni.
- Se HA resta acceso ma Met.no non risponde per quasi tutto il giorno (meno di 6
  campioni, cioè 1 ora), la giornata non si conta e arriva una notifica.
- HA salva su disco i valori da ripristinare **ogni 15 minuti** e allo spegnimento
  ordinato. Con un blackout, cioè uno spegnimento brusco, una regolazione fatta
  dal pannello negli ultimi 15 minuti può tornare al valore precedente, non al
  minimo. Lo stesso vale per il contatore delle giornate nuvolose.

## Prove

`prove/prova_pacchetto.py` avvia un Home Assistant vero con il pacchetto (e la macro
di `custom_templates/`), finge i dispositivi (stessi entity_id) e verifica 115 casi:
- orari del programma giorno per giorno, e il testo del prossimo cambio;
- attivazione e disattivazione immediata;
- comando a mano rispettato;
- soglie delle nuvole (89% non conta);
- giornata senza dati;
- fuori stagione;
- Rientro caldo, freddo e neutro;
- Uscita solo con notifica;
- pulsante della notifica;
- Buonanotte;
- batterie;
- previsioni per l'assistente: giornaliere e orarie, liste accorciate (5 e 12);
- valori di partenza e **riavvio**: le 5 regolazioni e il contatore sopravvivono
  a uno spegnimento e riaccensione veri di HA.

```bash
uv venv -p 3.13 .venv-ha && VIRTUAL_ENV=.venv-ha uv pip install homeassistant
.venv-ha/bin/python home-assistant/prove/prova_pacchetto.py
.venv-ha/bin/hass --script check_config -c <cartella con configuration.yaml + packages/>
```

Provato con Home Assistant 2026.2.3, l'ultima versione installabile col Python
3.13 del banco di prova. La casa gira la 2026.9. La sintassi usata (`triggers:`,
`actions:`, `trigger: state`, template) è quella stabile da fine 2024.

## Musica: `jarvis_musica` (componente + pacchetto a parte)

**Perché serve.** Verificato nel codice di HA 2026.9.3
(`components/spotify/media_player.py`): finché sull'account Spotify non suona
niente, il media_player dichiara solo `SELECT_SOURCE`. Ne seguono due cose:

- `media_player.play_media` viene rifiutato e `select_source` da solo non avvia
  niente: la musica non parte "dal silenzio";
- il media_player **vede i cambi solo ogni 30 s**. Provato sull'Echo il 30/09:
  subito dopo un avvio Gemini rispondeva "non sta suonando nulla" e non sapeva
  mettere in pausa.

**Tempi (0.3).** Sull'Echo la risposta arrivava in 11-12 s anche se la musica
partiva in 1-3 s. Quasi 10 s se ne andavano ad aspettare l'aggiornamento del
media_player di HA, che ha un suo lucchetto e rilegge anche la playlist. Ora
quell'aggiornamento va in background: si risponde appena Spotify conferma che
suona (0,8-2,5 s misurati).

**Cosa fa.** `custom_components/jarvis_musica` riusa il client spotifyaio **già
autenticato** dall'integrazione ufficiale Spotify: niente credenziali nuove,
niente scraping né cookie. Legge sempre lo stato **vero** da Spotify.
spotifyaio 2.0.2 non segnala molti rifiuti di Spotify, quindi ogni comando si
**controlla rileggendo lo stato**. Dopo ogni comando riuscito aggiorna subito il
media_player di HA (`async_refresh`, come fa HA stesso).

| Servizio | Script per Gemini | Cosa fa |
|---|---|---|
| `jarvis_musica.riproduci` (`cosa`, `dove`, `tipo`, `pannello`, `dispositivo`) | `script.jarvis_musica` | Con un uri Spotify in `cosa` (`spotify:playlist:…`, `album`, `artist`, `show`, `track`, `episode`; è quello che manda il pannello toccando una playlist) avvia quello, senza ricerca. Altrimenti cerca e avvia sul dispositivo Spotify Connect della stanza, anche da fermo. Nella scelta vince il nome identico ("Queen" → Queen, non Freddie Mercury). Se il nome esatto non è tra i 10 risultati, fa una seconda ricerca col filtro di Spotify (`artist:"Queen"`); poi vale l'ordine di Spotify. Se un risultato non parte davvero prova il successivo (al massimo 3). Nella risposta, `considerati` elenca i nomi tra cui ha scelto |
| `jarvis_musica.controllo` (`azione`, `dove`, `livello`, `pannello`, `dispositivo`) | `script.jarvis_musica_controllo` | pausa, riprendi, successivo, precedente, volume (0-100), alza e abbassa (10 punti), sposta (in un'altra stanza). "Riprendi" funziona anche quando Spotify è tornato "a riposo" dopo una pausa lunga: riparte dall'ultima cosa ricordata, stesso dispositivo e stesso punto, e il ricordo resta anche dopo un riavvio di HA |
| `jarvis_musica.stato` | `script.jarvis_musica_stato` | "Cosa sta suonando": titolo, artisti, dispositivo, stanza, volume, oppure "in pausa" o "niente". Dalla 0.4 anche `copertina` (URL, la più piccola sopra i 300 px, null se manca), `posizione_ms` e `durata_ms`, per la schermata Musica del pannello |
| `jarvis_musica.playlist` | — | Le playlist dell'account (sue e seguite, al massimo 48): `nome`, `uri`, `copertina`, `proprietario`. Per il pannello |
| `jarvis_musica.dispositivi` (`pannello`) — 0.5.0 | — | I dispositivi Spotify Connect visibili adesso: `nome`, `tipo`, `attivo`, `volume`, `comandabile`; con `pannello` anche `scelto` (il dispositivo salvato per quel pannello) e `scelto_visibile`. Per il pannello |
| `jarvis_musica.imposta_pannello` (`pannello`, `dispositivo`) — 0.5.0 | — | Su quale dispositivo Spotify suona un pannello (`jarvis_cucina`, `jarvis_camera_da_letto`…), salvato su disco (`.storage/jarvis_musica.pannelli`). `dispositivo` vuoto = cancella (il pannello chiede ogni volta) |

**Da dove parte la musica (0.5.0, regola di Salvatore del 02/10).** La musica
parte dal dispositivo da cui la chiedi; gli altoparlanti di altre stanze solo
se li nomini. Ordine: `dove` detto («in cucina») > `dispositivo` passato >
dispositivo salvato per il `pannello` > dove sta già suonando > stanza
predefinita. Senza `pannello` nei dati (le richieste a voce passano da
Gemini) il pannello lo dà `jarvis_voce` con `pannello_corrente()` (0.3.1, un
ContextVar col device_id della pipeline); se `jarvis_voce` non c'è o è più
vecchio, si fa come prima. Se il dispositivo chiesto o salvato non è tra
quelli che Spotify vede, **niente ripiego su altri altoparlanti**: errore
`dispositivo_assente`, «Su Spotify non vedo «<nome>»: apri l'app Spotify su
quel dispositivo e riprova.». `pausa`, `volume` e gli altri comandi agiscono
sulla musica in corso, dovunque sia; `sposta` senza `dove` va sul dispositivo
del pannello.

Tutti rispondono con `esito` ok o errore e un `messaggio` breve in italiano.
`riproduci` e `controllo` aggiungono `tempi_ms`, che servono a capire dove se
ne vanno i secondi sull'Echo vero: ricerca, avvio e totale per `riproduci`;
comando, conferma e totale per `controllo`.

Come leggere i tempi:

- **dalla risposta**: Strumenti per sviluppatori → Azioni →
  `jarvis_musica.riproduci`, con "restituisci la risposta" attivo;
- **dal log**: sono a livello info, quindi se il logger di HA è a warning
  servono queste righe in `configuration.yaml`:
  ```yaml
  logger:
    logs:
      custom_components.jarvis_musica: info
  ``` Chiamati senza risposta, per esempio da un'automazione, gli errori
arrivano come eccezione con lo stesso messaggio.

Errori, con un `codice` stabile:

| Codice | Quando |
|---|---|
| `nessun_risultato` | La ricerca non trova niente |
| `stanza_sconosciuta` | La stanza non è configurata |
| `stanza_ambigua` | Per esempio "camera" con due camere configurate |
| `stanza_mancante` | Non si è detto dove |
| `dispositivo_non_disponibile` | L'Echo è spento o addormentato; nella risposta c'è l'elenco dei dispositivi visibili |
| `dispositivo_non_comandabile` | Il dispositivo esiste ma non accetta comandi da remoto |
| `avvio_non_riuscito` | Spotify ha accettato l'avvio ma non suona niente |
| `comando_non_confermato` | Spotify ha accettato pausa, volume o altro, ma non risulta eseguito entro 5 s |
| `niente_in_riproduzione` | Un comando senza musica in corso |
| `livello_mancante` | Volume senza numero |
| `volume_non_regolabile` | Il dispositivo non regola il volume da Spotify |
| `non_consentito` | Errore 403: serve Premium |
| `spotify_irraggiungibile` | Spotify non risponde |
| `accesso_scaduto` | Il login a Spotify va rifatto: HA apre da solo la richiesta |
| `spotify_non_configurato` | L'integrazione Spotify non c'è o non è partita |

**File** (dal 30/09 le stanze sono separate dagli script):

| File | Si aggiorna? |
|---|---|
| `custom_components/jarvis_musica/` (`__init__.py`, `scelta.py`, `services.yaml`, `manifest.json`) | Sì, si sovrascrive a ogni versione |
| `packages/jarvis_musica.yaml` (solo gli script) | Sì, si sovrascrive a ogni versione |
| `packages/jarvis_musica_stanze.yaml` (le stanze di questa casa) | **No.** Si crea una volta da `esempi/jarvis_musica_stanze.yaml` e poi non si tocca più |

**Installazione (prima volta).**

1. Serve l'integrazione ufficiale **Spotify** già configurata e funzionante, con
   un account **Premium**: senza Premium Spotify non permette il controllo
   remoto.
2. Copia `custom_components/jarvis_musica/` in `/config/custom_components/` e
   `packages/jarvis_musica.yaml` in `/config/packages/`.
3. Copia `esempi/jarvis_musica_stanze.yaml` in
   `/config/packages/jarvis_musica_stanze.yaml` e compila le stanze con i
   **nomi esatti** dei dispositivi Spotify Connect. Li trovi nell'attributo
   `source_list` del media_player Spotify, con i dispositivi accesi.
   Facoltativa: `predefinita`.
4. Esegui la verifica della configurazione, poi **riavvia** HA.
5. **Esponi ad Assist** `script.jarvis_musica`, `script.jarvis_musica_controllo`
   e `script.jarvis_musica_stato`.

**Aggiornare dalla prima versione (quella del 30/09 mattina)**. Nel vecchio
`packages/jarvis_musica.yaml` c'è la sezione `jarvis_musica:` con le stanze
già compilate:

1. spostala in `/config/packages/jarvis_musica_stanze.yaml` (puoi partire da
   `esempi/`, che contiene già i nomi di casa: Cucina, Camera da letto, Tutta
   la casa);
2. sovrascrivi componente e `packages/jarvis_musica.yaml`;
3. esegui la verifica e riavvia;
4. esponi ad Assist i due script nuovi.

Se la sezione `jarvis_musica:` resta in tutti e due i file, la verifica della
configurazione segnala il doppione.

**Da provare sugli Echo veri** (qui non si può):

- i `tempi_ms`;
- se "riprendi" continua dal punto giusto. Usa la stessa chiamata del
  media_player di HA: `start_playback` senza contenuto;
- se gli Echo Pop restano tra i dispositivi Spotify dopo ore di inattività.

**Prova.** `prove/prova_musica.py` avvia HA **2026.9.3** con componente, script
e un file di stanze di prova. Al posto di Spotify c'è un client finto che
restituisce oggetti costruiti con i **modelli veri di spotifyaio 2.0.2**. Si
comporta come l'API: nessun comando conferma niente, e certi comandi vengono
accettati senza effetto. Verifica 65 casi:

- avvio: artista, brano, genere; secondo dispositivo della stanza; candidato
  che non parte;
- "Queen" contro Freddie Mercury e Michael Jackson (seconda ricerca filtrata);
- la risposta non aspetta l'aggiornamento lento del media_player;
- "riprendi" da Spotify a riposo, dallo stesso punto;
- stanza predefinita e stanza già attiva;
- stato subito dopo l'avvio;
- tutti i comandi, compreso quello accettato ma mai eseguito;
- tutti gli errori;
- i tre script con la risposta per Gemini;
- 0.4: copertina (la più piccola sopra i 300 px, null senza immagini), punto
  del brano e durata; elenco delle playlist; uri Spotify avviato senza
  nessuna ricerca;
- `services.yaml` valido con lo schema di HA 2026.9.3. Senza quel file HA
  scriveva un errore a ogni avvio, e la prova non lo vedeva perché nessuno
  chiedeva le descrizioni;
- log senza errori.

Controprove:

- con l'ordine di Spotify al posto del nome esatto cade la prova "Queen";
- senza rilettura dopo i comandi cade la prova "accettato ma mai eseguito";
- senza rilettura dopo l'avvio cadono 3 prove;
- con un selettore sbagliato in `services.yaml` cade la sua prova;
- con l'aggiornamento di nuovo atteso cade la prova dei tempi;
- senza ricerca filtrata parte Michael Jackson;
- senza "riprendi da riposo" risponde "non sta suonando niente";
- col componente 0.3 cadono le prove della 0.4 (copertina, punto del brano,
  servizi).

```bash
uv python install 3.14.7   # HA 2026.9.3 vuole Python ≥ 3.14.2
uv venv -p 3.14.7 .venv-ha-2026-9 && VIRTUAL_ENV=.venv-ha-2026-9 uv pip install homeassistant==2026.9.3 spotifyaio==2.0.2
.venv-ha-2026-9/bin/python home-assistant/prove/prova_musica.py            # atteso: 87/87
.venv-ha-2026-9/bin/hass --script check_config -c <cartella con configuration.yaml, packages/, custom_components/>
```
