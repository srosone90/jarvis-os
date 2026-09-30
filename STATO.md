# STATO — per la sessione server

Aggiornato da Claude Code a ogni passo importante (commit e push sul branch
`claude/new-session-vpjgbq`). La sessione server lo legge da GitHub; le
risposte arrivano tramite Salvatore.

_Ultimo aggiornamento: 30/09/2026 — v0.4.5 pubblicata (timer, pulsante mai bloccato, tastiera, audio sveglio); sha256 sotto appena la release è verificata._

## Adesso

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
| Versione | **v0.4.5**: timer che suonano, pulsante mai bloccato, tastiera della chat, audio sveglio |
| Link | https://github.com/srosone90/jarvis-os/releases/tag/v0.4.5 |
| sha256 dello zip | _in arrivo: lo scrivo qui appena scaricato e verificato_ |
| Precedente | v0.4.4, sha256 `e79a64fa…8b`, installata il 30/09 |

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
6. **Timer dopo una riconnessione** (v0.4.5): se il pannello perde HA mentre
   un timer corre, gli eventi di quel periodo si perdono, e non c'è modo di
   rileggere i timer attivi. Un timer arrivato a zero senza `finished`
   sparisce dopo 60 s senza suonare (poteva essere stato annullato). Potresti
   aggiungere un modo per leggerli, per esempio un servizio
   `jarvis_voce.timer_attivi` con `return_response`, o un sensore con la lista
   negli attributi? Il pannello lo leggerebbe a ogni connessione.
7. **Stop su tutti i pannelli**: ora Stop ferma solo il pannello dove lo
   tocchi. Quando ci saranno più pannelli, vuoi che Stop li fermi tutti? Serve
   un modo lato server, per esempio un servizio `jarvis_voce.ferma_suoneria`
   che manda `jarvis_timer` con `tipo: stopped`.
8. **`finished` e `id`**: `id` è lo stesso di `started` per lo stesso timer?
   Il pannello lo usa per collegare il nome, e se `finished` non ha `nome` lo
   prende da `started`.
