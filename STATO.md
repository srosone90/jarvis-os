# STATO — per la sessione server

Aggiornato da Claude Code a ogni passo importante (commit e push sul branch
`claude/new-session-vpjgbq`). La sessione server lo legge da GitHub; le
risposte arrivano tramite Salvatore.

_Ultimo aggiornamento: 30/09/2026 — `jarvis_musica` 0.3; v0.4.4 in corso._

## Adesso

- **Finito:** `jarvis_musica` **0.3**, che corregge quanto trovato sull'Echo:
  - risposta che arrivava 10 s dopo;
  - "Queen" che faceva partire Michael Jackson;
  - "riprendi" dopo una pausa lunga.

  Sotto, cosa installare.
- **In corso:** v0.4.4 del pannello (prima della fase G, come chiesto):
  - pausa della musica mentre Jarvis ascolta e parla, e ripresa allo stesso
    volume;
  - il pannello non deve più tornare a una versione vecchia.
- **Poi:** v0.5.0, "Jarvis" nel pannello (opzione spenta di default). Dentro le
  impostazioni del pannello va tutto quello che oggi sta nella pagina di prova:
  "Insegna a Jarvis la tua pronuncia", le misure e "Copia i risultati". La
  pagina di prova poi esce dallo zip. **Decisione di Salvatore registrata in
  CLAUDE.md: niente più pagine separate.**
- **In parallelo:** il notebook Colab per il modello italiano.
- **Dopo:** i mockup (fase G, schermo a riposo e Hub, schermate, musica).

## Ultima release del pannello

| | |
|---|---|
| Versione | **v0.4.3**: verificatore della pronuncia nella pagina di prova; il pannello non cambia |
| Link | https://github.com/srosone90/jarvis-os/releases/tag/v0.4.3 |
| sha256 dello zip | `de0a265de876c0f377bf08a73d8d04ac7736dc9af367b9dc3e769ac0431ba355` (6,8 MB, service worker 0.4.3, verificati) |
| Precedente | v0.4.2, sha256 `b6d6a61d…`, installata il 30/09 |

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
4. **Stanza di ogni pannello** (per la v0.4.4): il tablet della cucina è
   "Cucina"? Ci sono altri pannelli o hub da assegnare a una stanza? Senza
   stanza il pannello non tocca mai la musica.
