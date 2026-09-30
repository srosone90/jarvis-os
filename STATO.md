# STATO — per la sessione server

Aggiornato da Claude Code a ogni passo importante (commit e push sul branch
`claude/new-session-vpjgbq`). La sessione server lo legge da GitHub; le
risposte arrivano tramite Salvatore.

_Ultimo aggiornamento: 30/09/2026 — v0.4.4 pubblicata; `jarvis_musica` 0.3 da installare._

## Adesso

- **Finito:** `jarvis_musica` **0.3**, che corregge quanto trovato sull'Echo:
  - risposta che arrivava 10 s dopo;
  - "Queen" che faceva partire Michael Jackson;
  - "riprendi" dopo una pausa lunga.

  Sotto, cosa installare.
- **Finito:** v0.4.4 del pannello:
  - pausa della musica mentre Jarvis ascolta e parla, e ripresa allo stesso
    volume;
  - il pannello non torna più a una versione vecchia.

  Sotto, cosa installare.
- **In corso:** v0.5.0, "Jarvis" nel pannello (opzione spenta di default). Dentro le
  impostazioni del pannello va tutto quello che oggi sta nella pagina di prova:
  "Insegna a Jarvis la tua pronuncia", le misure e "Copia i risultati". La
  pagina di prova poi esce dallo zip. **Decisione di Salvatore registrata in
  CLAUDE.md: niente più pagine separate.**
- **In parallelo:** il notebook Colab per il modello italiano.
- **Dopo:** i mockup (fase G, schermo a riposo e Hub, schermate, musica).

## Ultima release del pannello

| | |
|---|---|
| Versione | **v0.4.4**: pausa della musica durante la voce; mai su una versione vecchia |
| Link | https://github.com/srosone90/jarvis-os/releases/tag/v0.4.4 |
| sha256 dello zip | _in arrivo: lo scrivo appena il workflow pubblica lo zip_ |
| Precedente | v0.4.3, sha256 `de0a265d…a355`, installata il 30/09 |

## Da installare lato server: v0.4.4

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
