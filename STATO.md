# STATO — per la sessione server

Aggiornato da Claude Code a ogni passo importante (commit e push sul branch
`claude/new-session-vpjgbq`). La sessione server lo legge da GitHub; le
risposte arrivano tramite Salvatore.

_Ultimo aggiornamento: 30/09/2026 — v0.4.6 (timer solo sul pannello proprietario, per jarvis_voce 0.1.8); sha256 sotto appena la release è verificata._

## Adesso

- **Finito:** v0.4.6, la richiesta urgente sui timer, con tutti e 6 i punti:
  1. device_id `jarvis_<stanza>`, con l'avviso "Scegli la stanza per i
     timer";
  2. device_id mandato sempre, voce e chat;
  3. suona e mostra solo i timer suoi;
  4. Stop → `timer_ferma`, e `fermato` ferma tutti;
  5. `timer_attivi` alla connessione e alla riconnessione (anche al cambio di
     stanza);
  6. stessa stanza = suonano entrambi.

  Sotto, cosa installare e come provarla. Una cosa da sapere: la chat usa
  `assist_pipeline/run` (start_stage intent) e non `conversation/process`.
  Il `device_id` va lì, e lo schema di HA 2026.9.3 lo accetta.
- **Finito:** v0.4.5 del pannello, con le richieste del 30/09 in ordine:
  1. timer che suonano (`jarvis_timer`);
  2. audio sveglio per il Bluetooth, acceso di serie;
  3. pulsante del microfono mai bloccato;
  4. tastiera della chat.

  Sotto, cosa installare e come provarla.
- **Prossimo:** i mockup: fase G, schermo a riposo/AOD con timer attivi e
  "timer finito", Hub. Il riposo non ferma nessun processo.
- **Poi:** v0.5.0. «Jarvis» sempre in ascolto con memoria circolare di circa
  1 s (decisione di Salvatore: la parola vale anche dentro la frase,
  "buongiorno Jarvis"). Dentro anche "stop"/"basta" a voce per la suoneria e
  "Insegna a Jarvis la tua pronuncia" nelle impostazioni del pannello. **Non
  userò `no_vad` né cambierò `audio_settings` senza avvisarti prima qui**
  (richiesta 6: `jarvis_voce` sovrascrive il VAD).
- **Finito prima:** `jarvis_musica` **0.3**, che corregge quanto trovato sull'Echo:
  - risposta che arrivava 10 s dopo;
  - "Queen" che faceva partire Michael Jackson;
  - "riprendi" dopo una pausa lunga.

  Sotto, cosa installare.
- **Finito:** v0.4.4 del pannello:
  - pausa della musica mentre Jarvis ascolta e parla, e ripresa allo stesso
    volume;
  - il pannello non torna più a una versione vecchia.

  Sotto, cosa installare.
- **In parallelo:** il notebook Colab per il modello italiano.

## Ultima release del pannello

| | |
|---|---|
| Versione | **v0.4.6**: il timer suona solo sul pannello a cui appartiene; Stop li ferma tutti |
| Link | https://github.com/srosone90/jarvis-os/releases/tag/v0.4.6 |
| sha256 dello zip | _in arrivo: lo scrivo qui appena scaricato e verificato_ |
| Precedente | v0.4.5, sha256 `fc964090…2edb` |

## Da installare lato server: v0.4.6

1. Scompatta lo zip sopra `/config/www/jarvis/`, come sempre. Serve
   `jarvis_voce` 0.1.8, che hai già.
2. **Su ogni pannello, una volta**: tieni premuto l'orologio 3 s, scegli la
   "Stanza" (per esempio Cucina) e tocca "Chiudi". Sotto la scelta compare
   "Timer e voce di questo pannello: jarvis_cucina". Senza stanza compare
   l'avviso "Scegli la stanza per i timer".

**Come provarla, dentro il pannello:**

1. Dal tablet della cucina: "metti un timer di un minuto per la pasta". Il
   conto alla rovescia compare solo in cucina, e a zero suona solo lì.
2. Sempre dalla cucina: "metti un timer di un minuto in camera da letto". In
   cucina non compare niente; suona il pannello della camera, se c'è.
3. Due pannelli nella stessa stanza: suonano entrambi, e Stop su uno ferma
   anche l'altro.
4. Timer partito, poi Wi-Fi del tablet spento per qualche secondo e riacceso:
   il conto alla rovescia torna giusto.

Nel log della diagnostica: "Timer riletti (connessione): 1 di jarvis_cucina
su 2 in casa", e per gli eventi di altri pannelli "… non per questo pannello".

## v0.4.5: installata

Timer, pulsante mai bloccato, tastiera, audio sveglio. Le prove di allora
valgono ancora, tranne "con più pannelli suonano tutti", superata dalla
v0.4.6.

## Da installare lato server: v0.4.5

Scompatta lo zip sopra `/config/www/jarvis/`, come sempre. Lato server non
serve altro: il pannello usa l'evento `jarvis_timer` di `jarvis_voce` 0.1.5
così come l'hai descritto.

**Come provarla, dentro il pannello:**

1. **Timer**: "metti un timer di un minuto per la pasta". Sotto l'orologio
   compare "pasta 1:00" che scorre. A zero il pannello suona a ripetizione e
   mostra "Timer pasta finito" con Stop: tocca Stop. Rifallo senza toccare:
   si ferma da solo dopo 2 minuti. Prova anche "annulla il timer della
   pasta": il conto alla rovescia sparisce.
2. **Pulsante del microfono**: fai una domanda e, mentre dice "Sto
   pensando…", tocca il pulsante (ora è una X): "Domanda annullata." e puoi
   riparlare subito. Se Gemini non risponde entro 30 s, il pulsante torna
   attivo da solo.
3. **Tastiera**: apri la chat e scrivi. Tocca un punto qualsiasi fuori dal
   campo: la tastiera si chiude, la chat no. Riaprila e premi "Indietro":
   prima si chiude la tastiera, poi la chat, e l'app resta aperta. Dopo
   l'invio, sul tablet la tastiera si chiude da sola.
4. **Audio sveglio**: con l'Echo in Bluetooth, fai una domanda dopo qualche
   minuto di silenzio: l'Echo non deve più dire "In riproduzione da Tab90".
   In diagnostica, "Audio sveglio" deve dire "attivo" (se dice "parte al
   primo tocco", tocca lo schermo). L'interruttore lo spegne.

Nel log della diagnostica: "Timer "pasta": started…", "Audio sveglio attivo",
e, se succede, "Audio sveglio sospeso dal sistema".

## v0.4.4: installata (30/09)

Riferimento per la stanza del pannello e la versione vecchia.

1. Scompatta lo zip sopra `/config/www/jarvis/`, come sempre.
2. Serve `jarvis_musica` (meglio la **0.3**, sotto): il pannello usa i suoi
   servizi `stato` e `controllo`. Senza, la voce funziona uguale e la musica
   semplicemente non si ferma (lo dice nel log della diagnostica).

**Passi per Salvatore, dentro il pannello** (una volta per ogni tablet o
telefono):

1. Tieni premuto l'orologio per 3 secondi: si apre la diagnostica.
2. In "Stanza" scegli dove sta questo pannello, per esempio "Cucina".
3. Tocca "Chiudi".

**Come provarla**:

- musica accesa in cucina, tocca il microfono e fai una domanda: la musica si
  ferma subito, Jarvis risponde, poi la musica riparte allo stesso volume;
- musica già in pausa: resta in pausa;
- "metti in pausa la musica": resta in pausa;
- con un errore di Gemini la musica riparte comunque.

Nel log della diagnostica compaiono "Musica in pausa mentre Jarvis ascolta…" e
"Musica ripresa dopo la voce…".

**Versione vecchia**: all'apertura, se c'è una versione nuova già scaricata e
nessuno tocca lo schermo, si applica da sola entro pochi secondi. In
diagnostica ci sono "Versione", "Sul server" e "Origine in uso": se
"Versione" è diversa da "Sul server" per più di qualche minuto, dimmelo.

## v0.4.3: installata (30/09)

Non serve altro. Per decisione di Salvatore le misure del verificatore **non** si
fanno dalla pagina di prova: si faranno dal pannello, nelle impostazioni, con la
v0.5.0.

## Da installare lato server: `jarvis_musica` 0.3

Solo il componente: stanze e pacchetto degli script **non cambiano**.

1. In `/config/custom_components/jarvis_musica/` copia **tutti e quattro** i
   file dal branch: `__init__.py`, `scelta.py`, `services.yaml` e
   `manifest.json` (0.3.0). Questa volta cambia anche `scelta.py`.
2. Verifica della configurazione, poi riavvio.

**Come provarla**

- "Metti i Queen in cucina": devono partire i Queen, non Michael Jackson né
  Freddie Mercury. Prova anche la chiamata diretta
  `jarvis_musica.riproduci {cosa: Queen, tipo: artista}`: nella risposta
  `considerati` dice tra quali nomi ha scelto.
- `tempi_ms`: il `totale` deve essere circa `ricerca` + `avvio` (prima c'erano
  ~10 s in più).
- Pausa, poi aspetta più di 10 minuti (Spotify va "a riposo"), poi "riprendi":
  deve ripartire lo stesso brano sullo stesso Echo, dal punto in cui era.

## Domande aperte per la sessione server

1. **Tempi dei comandi** (`controllo`, con la 0.3): quanto valgono `comando`,
   `conferma` e `totale` per una pausa e un "alza" in cucina?
2. **"Riprendi" dopo una pausa breve** (meno di 10 minuti): riparte dal punto
   giusto o dall'inizio del brano?
3. **Riprendi dopo una pausa lunga** (0.3): riparte lo stesso brano dallo
   stesso punto?
4. **Stanza di ogni pannello** (v0.4.4): la sceglie Salvatore in diagnostica,
   passi sopra. Ci sono altri pannelli o hub oltre al tablet della cucina?
5. **Echo in Bluetooth**: con la v0.4.4 la musica si ferma prima che Jarvis
   parli. Dimmi se l'Echo riparte bene con Spotify dopo la voce, o se resta
   agganciato al Bluetooth.
6. ~~Timer dopo una riconnessione~~ e 7. ~~Stop su tutti i pannelli~~:
   risolte da `jarvis_voce` 0.1.8 (`timer_attivi`, `timer_ferma`/`fermato`),
   usate dalla v0.4.6.
8. **`finished` e `id`**: `id` è lo stesso di `started` per lo stesso timer?
   Il pannello lo usa per collegare il nome, e se `finished` non ha `nome` lo
   prende da `started`.
9. **Chiave della risposta di `timer_attivi`**: il pannello accetta
   `{timer: [...]}`, `{timers: [...]}`, `{attivi: [...]}` o un elenco nudo.
   Qual è quella vera? Se è un'altra, nel log compare "risposta di
   timer_attivi non riconosciuta" con la risposta intera.
10. **Slug della stanza**: il pannello usa le regole di
    `homeassistant.util.slugify`, provate su HA 2026.9.3: minuscolo, senza
    accenti, ogni carattere che non è lettera o cifra diventa "_", niente
    "_" doppi. Per esempio "Camera dell'ospite" → `jarvis_camera_dell_ospite`.
    Lo script `jarvis_timer_stanza` usa la stessa funzione? Se no, con
    apostrofi o trattini i due device_id non coincidono.
