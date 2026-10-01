# STATO — per la sessione server

Aggiornato da Claude Code a ogni passo importante (commit e push sul branch
`claude/new-session-vpjgbq`). La sessione server lo legge da GitHub; le
risposte arrivano tramite Salvatore.

_Ultimo aggiornamento: 01/10/2026 — v0.5.3 (persona sempre presente). Release: vedi sotto._

## Adesso

- **Finito: v0.5.3, "persona sempre presente"**, punto per punto:
  1. memoria di **60 s**, solo in RAM: mai inviata se la parola non scatta,
     svuotata con «Jarvis» spento, a ogni avvio e dopo ogni scatto;
  2. allo scatto la **richiesta** è come oggi (inizio della frase: ultima
     pausa ≥ 1 s, cercata negli ultimi 10 s, + audio dal vivo). In più, se
     prima c'è parlato (energia, almeno 0,5 s), parte PRIMA la pipeline del
     **contesto**: `assist_pipeline/run`, start/end `stt`, `input
     {sample_rate:16000, no_vad:true}`, `device_id "<id pannello>__contesto"`
     (es. `jarvis_cucina__contesto`; senza stanza `jarvis_pannello__contesto`),
     niente conversation_id. Audio a raffica appena arriva run-start (il
     silenzio iniziale e la pausa prima della frase tolti), poi subito il
     frame vuoto. Niente UI, niente errori a schermo: se fallisce, una riga nel
     registro ("Contesto non trascritto: …"); del testo trascritto il
     registro scrive solo quanti caratteri. Nessun parlato prima → non si
     manda;
  3. il pannello non taglia la richiesta prima di te: chiude da solo solo
     dopo **35 s**;
  4. **conversazione continua**: finito il TTS (non interrotto), il pannello
     riascolta **8 s senza parola**, stesso conversation_id, senza contesto
     né wake_word_phrase; «Ti ascolto ancora…» con l'anello che respira.
     **Scelta di progetto da sapere**: la pipeline verso di te parte solo
     quando il pannello sente parlare (energia, ~130 ms), con ~0,5 s di audio
     prima. Se nessuno parla in 8 s si chiude in silenzio e da noi non arriva
     niente (nessuna pipeline vuota, nessun "non ho capito"). Vale anche dopo
     una domanda fatta col tocco, e anche quando Gemini chiede
     `continue_conversation` (prima riapriva subito una pipeline);
  5. **reattività**: segnale a schermo nello stesso istante dello scatto e
     bip breve (Impostazioni → Voce → "Suono quando sente «Jarvis»", acceso
     di serie). Nel registro, a ogni «Jarvis»: `Reattività «Jarvis»: scatto
     N ms, segnale N ms, run-start N ms, primo audio N ms (dalla fine della
     parola)`. L'audio tenuto da parte parte appena arriva run-start;
  6. **strada veloce**: con «Impara la pronuncia» il pannello calcola una
     **soglia personale** dai 20 esempi + verificatore (10° percentile × 0,8,
     tra 0,2 e 0,5, almeno 0,1 sopra il parlato normale; se non c'è spazio
     resta 0,5). Si vede in Voce → "Come sta andando". Il **modello su
     misura** aspetta la conferma di Salvatore.
- Privacy, nella sezione Voce: "Il minuto prima resta solo nella memoria del
  pannello e parte SOLO quando scatta «Jarvis», e solo verso il nostro Home
  Assistant (che lo manda a Gemini per trascriverlo e capire il discorso)".
- Prove: clip Piper di 47 s (40 s di discussione, 1,4 s di pausa, frase con
  «hey jarvis») col modello vero e come microfono del pannello: nel finto HA
  due pipeline, contesto (~40 s, no_vad, `…__contesto`, tutto in meno di 3 s)
  e richiesta (solo la frase). Conversazione continua: risposta → riascolto →
  seconda domanda senza parola → stesso conversation_id; col silenzio si
  chiude in 8 s senza mandare niente. Controprove: con la memoria a 10 s,
  senza il minimo di parlato, col contesto dopo la richiesta, col seguito
  che apre subito la pipeline, senza invio del contesto, le prove cadono.
- **Ricevuto**: `jarvis_voce` 0.2.7 (contesto a Gemini, attesa trascrizione
  6 s, 3 s dopo «Jarvis» da solo, frase massima 30 s).
- **Prossimo, come deciso**: colonna laterale + Stanza + Meteo, poi Musica.

## Ultima release del pannello

| | |
|---|---|
| Versione | **v0.5.3**: persona sempre presente |
| Link | https://github.com/srosone90/jarvis-os/releases/tag/v0.5.3 |
| sha256 dello zip | _in arrivo dopo la release_ |
| Precedente | v0.5.2, sha256 `faa4b89b9d5919fdc557e4bfd634dbe9457d447602a3b88034b6a1784da138ff` |

## Da installare lato server: v0.5.3

Solo lo zip sopra `/config/www/jarvis/`. Lato HA serve `jarvis_voce` 0.2.7
(già fatto).

**Come provarla, dentro il pannello** (tablet della cucina):

1. Parlate tra voi di qualcosa per mezzo minuto (per esempio delle vacanze),
   poi fermatevi un attimo e dite «Jarvis, tu che ne pensi?». Deve sentirsi
   il bip, e la risposta deve parlare di quello di cui parlavate.
2. Subito dopo la risposta, senza dire «Jarvis», fai un'altra domanda («e per
   il weekend?»): sotto la risposta compare «Ti ascolto ancora…», e deve
   rispondere sapendo di cosa si parlava.
3. Dopo una risposta resta in silenzio: «Ti ascolto ancora…» sparisce da solo
   dopo 8 secondi, senza «Non ho capito».
4. Impostazioni → Voce: la frase sul "minuto prima", l'interruttore del
   suono (spegnilo e riprova il punto 1: niente bip, la luce sì).
5. Diagnostica → registro: mandami le righe "«Jarvis» sentito (…) mando …
   e … di contesto prima", "Contesto: … inviati in … ms", "Contesto:
   trascritto da HA in … ms" e "Reattività «Jarvis»: …".
6. Se avete già insegnato la pronuncia, rifate «Impara la pronuncia»: il
   messaggio finale dice la soglia personale. Mandamela.

## v0.5.2 (compresa nella v0.5.3)

| | |
|---|---|
| sha256 dello zip | `faa4b89b9d5919fdc557e4bfd634dbe9457d447602a3b88034b6a1784da138ff` |

## Passi di prova della v0.5.1

| | |
|---|---|
| sha256 dello zip | `1ccd83b880568a821b6e3221da9c0c80beeedac42840a2c2994ab178ed282af5` |

Solo lo zip sopra `/config/www/jarvis/`, come sempre. Lato HA niente.

**Come provarla, dentro il pannello** (tablet della cucina):

1. Tieni premuto l'orologio 3 s → **Voce** → **Prova dal vivo**. Di'
   «Jarvis» a distanza normale, poi «Ehi Jarvis», poi «Giarvìs» (accento in
   fondo, all'inglese). Guarda la barra «Jarvis», ultimi 3 s: deve superare la
   linea bianca. Mentre parli deve muoversi anche la barra **Microfono**.
2. Se il microfono si muove ma «Jarvis» resta vicino a zero, è la pronuncia:
   nella stessa pagina "Insegna a Jarvis la tua pronuncia" (20 volte
   «Jarvis», poi 60 s di parlato normale, poi «Impara la pronuncia»), e
   rifai il punto 1: la barra «Jarvis» deve salire, e sotto compare anche
   quella del modello di base.
3. Se nemmeno il microfono si muove, cambia **Elaborazione del microfono**
   ("Nessuna", poi "Tutta") e rifai il punto 1.
4. Diagnostica → registro: mandami le righe "Microfono aperto (…)",
   "Parola: su … esempi" e "«Jarvis» negli ultimi 30 s: punteggio massimo …".
   Dicono la frequenza vera del tablet, le impostazioni del microfono,
   quanti esempi ci sono su quell'indirizzo, e quanto si è avvicinato.

Nota: la pronuncia imparata vale per l'indirizzo in uso (la sezione Voce lo
scrive). Se il pannello passa da quello veloce a quello di riserva, lì va
insegnata di nuovo.

## v0.5.0 (compresa nella v0.5.1)

| | |
|---|---|
| sha256 dello zip | `563587ecf63c22835cd62d8512fcce3c3bfe171b8cd0688f48ffa2079ea0e843` |

## Passi di prova della v0.5.0

Lo zip sopra `/config/www/jarvis/`, come sempre. **Novità**: nello zip c'è la
cartella `parola/` (circa 17 MB: riconoscimento della parola, modelli
openWakeWord, CC BY-NC-SA 4.0, solo non commerciale). Si può cancellare
`/config/www/jarvis/prova-ehi-jarvis.html` e la cartella `prova/`: non servono
più. Lato HA non cambia niente.

**Domanda per te** (vedi "Domande aperte", 12): il testo trascritto ora
comincia di solito con «Jarvis» ("Jarvis, metti un timer di 5 minuti").

**Come provarla, dentro il pannello** (tablet della cucina):

1. Aggiorna il pannello (all'apertura si aggiorna da solo; la prima volta
   scarica circa 17 MB). In alto, accanto a "Connesso", compare il simbolo
   del microfono: «Jarvis» ascolta.
2. Di' «Jarvis, che temperatura c'è in camera?» tutto di fila. Deve
   rispondere nel riquadro piccolo. Poi prova «Jarvis», una pausa breve (meno
   di un secondo: la fine della frase la decide il server) e la domanda.
3. Metti il pannello a riposo (Impostazioni → Schermo a riposo → Metti a
   riposo) e di' «Jarvis, che ore sono?»: si apre l'Hub con domanda e
   risposta scritte sotto la sfera.
4. Timer: «Jarvis, metti un timer di un minuto». Quando suona, di' «Jarvis»:
   la suoneria tace subito. Poi, entro un secondo, «stop» (o tutto di fila:
   «Jarvis, stop»): il riquadro "Timer finito" sparisce.
   Rifallo e, invece di «stop», chiedi un'altra cosa: risponde, la suoneria
   non riparte, e il riquadro resta finché non tocchi Stop.
5. Se Jarvis capisce male «Jarvis» (lo dici «Giàrvis», con l'accento
   sulla prima): tieni premuto l'orologio 3 s → Voce → "Insegna a Jarvis la
   tua pronuncia". Scrivi il tuo nome, tocca «Registra «Jarvis»» e ripeti la
   parola ogni volta che compare «adesso» (20 volte, circa un minuto). Poi
   «Registra 60 s» con la TV accesa o parlando d'altro, e «Impara la
   pronuncia». Rifai la prova 2.
6. In Impostazioni → Voce, "Come sta andando": dimmi i **ms di calcolo** e il
   **carico** sul tablet, e quante volte «Jarvis» è scattato senza che
   nessuno l'abbia detto in un'ora con la TV accesa.
7. L'interruttore in Impostazioni → Voce spegne tutto: il simbolo del
   microfono sparisce.

Nel log della diagnostica: "«Jarvis» in ascolto (…)", "«Jarvis» sentito
(punteggio …)", "suoneria zittita", "«Jarvis» sentito anche da un altro
pannello, risponde lui".

## v0.4.8 (compresa nella v0.5.0)

Solo lo zip sopra `/config/www/jarvis/`, come sempre. Contiene anche la
v0.4.7 (timer in pausa), se non l'avevi ancora messa. Lato HA non cambia
niente.

**Come provarla, dentro il pannello** (tablet della cucina):

1. **Pannello già installato**: all'apertura **non** deve comparire la
   procedura guidata (la stanza era già scelta).
2. **Riposo**: non toccare niente per 2 minuti. Compare la sfera che respira
   con accanto ora, data, meteo e temperature delle stanze; se suona musica,
   anche il brano. Tocca un punto fuori dalla sfera: torni al pannello.
3. **Timer sul riposo**: "metti un timer di 2 minuti per la pasta", poi
   aspetta il riposo. Attorno alla sfera c'è un anello che si accorcia, e
   sotto la pastiglia "pasta" col conto alla rovescia. "Metti in pausa il
   timer della pasta": sulla pastiglia compare il simbolo della pausa
   e il tempo si ferma, in grigio. Riprendilo e
   lascialo finire: compare al centro "Timer pasta finito" con Stop grande,
   il riposo resta sotto. Tocca Stop: torni al riposo.
4. **Hub**: a riposo tocca la sfera. Jarvis ascolta subito: chiedi "che
   temperatura c'è in camera?". Sotto la sfera compaiono la domanda e la
   risposta come sottotitoli. Dopo 30 s senza toccare niente torna al
   riposo. Il tasto con i quadratini in alto a destra porta al pannello
   completo.
5. **Impostazioni**: tieni premuto l'orologio 3 s. Sezioni: Stanza e nome, Schermo a
   riposo, Audio, Diagnostica. In "Schermo a riposo" prova "Metti a riposo"
   (va a riposo subito) e cambia l'attesa (1, 2, 5, 10 minuti o mai) e gli
   orari della notte. "Indietro" di Android chiude le impostazioni senza
   uscire dall'app.
6. **Notte** (di serie dalle 23 alle 7): a riposo restano solo ora e timer,
   la sfera è ferma e fioca, e "Timer finito" è in rosso scuro.
7. **Procedura guidata**: in Impostazioni → "Stanza e nome", sotto
   "Procedura guidata" tocca "Rifalla". Tre passi: stanza, schermo a riposo, riepilogo; "Inizia" la
   chiude. Su un telefono nuovo compare da sola al primo avvio.

Nel log della diagnostica: "Vista: completo → riposo (…)", "Vista: riposo →
hub (…)", "Procedura guidata finita".

## v0.4.7 (compresa nella v0.4.8)

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
12. ~~**Frasi che cominciano con «Jarvis»**~~ — risolta da `jarvis_voce` 0.2.4
    (01/10), che toglie la parola dall'inizio. Testo originale: (v0.5.0): l'STT ora trascrive di
    solito anche la parola ("Jarvis, metti un timer di 5 minuti"). Gemini lo
    regge; le frasi riconosciute in locale da HA o da `jarvis_voce` (timer,
    pausa…) funzionano anche con «Jarvis» davanti? Se no, meglio toglierla
    lato server (il pannello potrebbe mandare meno memoria, ma allora
    "spegni la TV, Jarvis" perderebbe l'inizio).
