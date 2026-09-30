# STATO — per la sessione server

Aggiornato da Claude Code a ogni passo importante (commit e push sul branch
`claude/new-session-vpjgbq`). La sessione server lo legge da GitHub; le
risposte arrivano tramite Salvatore.

_Ultimo aggiornamento: 30/09/2026 — v0.4.7 (timer in pausa, slug come il tuo) e jarvis_musica 0.4.0 nel repo, identico al server. Release verificata._

## Adesso

- **Finito: v0.4.7** del pannello, piccola:
  - timer in pausa fermi, con "in pausa" (usa `in_pausa` di jarvis_voce
    0.2.3, sia negli eventi `updated` sia in `timer_attivi`);
  - slug della stanza con la **tua** regola: NFKD, via i combinanti,
    `\p{L}\p{N}` come `str.isalnum`, "_" compressi. Confronto con la regola
    in Python su 17 nomi: 0 differenze. "Camera dell'ospite – Già" →
    `camera_dell_ospite_gia`, "Stanza ½" → `stanza_1_2`.
- **Finito: `jarvis_musica` 0.4.0 nel repo.** Il tuo diff è applicato tale e
  quale (`git apply -p1`, nessuna riga riscritta), quindi repo e server sono
  identici. Ho aggiornato solo la prova `prove/prova_musica.py`, che si
  aspettava tre servizi, e ho aggiunto le verifiche della 0.4: copertina (la
  più piccola sopra i 300 px, null senza immagini), punto e durata, elenco
  delle playlist, uri avviato senza ricerca. Risultato: **65/65** su HA
  2026.9.3. Controprova: col componente 0.3 le prove nuove cadono.
- **Mockup finiti** (`docs/mockup-*.html`), scelte di Salvatore:
  - riposo C (sfera), Hub H1, riposo dopo 2 minuti, "Timer finito" come
    riquadro al centro;
  - impostazioni S1 + procedura guidata al primo avvio;
  - navigazione N2 (colonna laterale); schermate: Stanza, Meteo, Clima,
    Timer, Scene (senza routine), Spesa, Avvisi;
  - musica M1 (copertina grande) e mini-lettore sotto l'orologio.
- **Prossimo: v0.5.0**, «Jarvis» sempre in ascolto, **con la tua proposta**:
  la memoria circolare locale serve solo a riconoscere «Jarvis»; poi apro la
  pipeline normale **senza `no_vad`**, mando ~1 s di audio prima della parola
  più l'audio dal vivo, e la fine della frase la decide `jarvis_voce`. Il muto
  della TV lo fai tu; sul pannello resta la pausa di Spotify della v0.4.4.
  Dentro la v0.5.0 anche "stop"/"basta" per la suoneria e "Insegna a Jarvis
  la tua pronuncia" nelle impostazioni. Se mai servisse `no_vad`, lo scrivo
  qui prima, con il motivo.
- **Dopo la v0.5.0**: fase G (impostazioni S1 + guida), poi navigazione +
  Stanza + Meteo, poi Musica (fase M, con copertina e playlist della 0.4.0).
- **In parallelo:** il notebook Colab per il modello italiano.

## Ultima release del pannello

| | |
|---|---|
| Versione | **v0.4.7**: timer in pausa fermi; slug della stanza come il server |
| Link | https://github.com/srosone90/jarvis-os/releases/tag/v0.4.7 |
| sha256 dello zip | `9c7684eaea06503abdc154ed60df82c1364534d7ce494b47769041c9d356bbc4` (6,8 MB, service worker 0.4.7, verificati) |
| Precedente | v0.4.6, sha256 `02363cce…08b0`, installata il 30/09 |

## Da installare lato server: v0.4.7

Solo lo zip sopra `/config/www/jarvis/`. `jarvis_musica` 0.4.0 e
`jarvis_voce` 0.2.3 li hai già.

**Come provarla, dentro il pannello**: "metti un timer di 5 minuti per la
pasta", poi "metti in pausa il timer della pasta". Sotto l'orologio il conto
si ferma e compare "in pausa"; dopo "riprendi il timer" riparte da lì. Nel log
della diagnostica: `Timer "pasta": updated (…), in pausa`.

## v0.4.6: installata (30/09)

1. Scompatta lo zip sopra `/config/www/jarvis/`, come sempre. Serve
   `jarvis_voce` 0.1.8 o successivo (oggi 0.2.3).
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

## Richieste per la sessione server (musica, scelte da Salvatore il 30/09)

**1 e 2 fatte** (jarvis_musica 0.4.0, installata e nel repo). La 3 resta "per
ora no".

1. ~~**`jarvis_musica.stato`**~~: aggiungere la copertina (URL dell'immagine
   dell'album più piccola sopra i 300 px), `posizione_ms` e `durata_ms`.
   Spotify li ha già in `get_playback`.
2. ~~**Elenco delle playlist**~~: un servizio con `return_response` che restituisca
   le playlist e i preferiti dell'account (nome, uri, immagine), da usare
   nella schermata Musica per sceglierle con un tocco.
3. La radio con Music Assistant per ora no.

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
8. ~~`id` di `finished`~~, 9. ~~chiave `timer`~~, 10. ~~slug~~: risposte
   ricevute il 30/09. Sullo slug mi allineo io alla tua regola (NFKD); non
   serve cambiare niente lato server.
11. ~~**Pausa dei timer**~~ — risolta: arriva come `updated` con `in_pausa`
    (jarvis_voce 0.2.3), usata dalla v0.4.7.
    Testo originale:: arriva anche un evento quando un timer va in pausa
    o riparte (per esempio `updated` con `in_pausa`)? Senza evento, il
    pannello lo saprebbe solo alla rilettura.
