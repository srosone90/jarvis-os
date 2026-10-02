# STATO — per la sessione server

Aggiornato da Claude Code a ogni passo importante (commit e push sul branch
`claude/new-session-vpjgbq`). La sessione server lo legge da GitHub; le
risposte arrivano tramite Salvatore.

_Ultimo aggiornamento: 02/10/2026 — v0.6.0 (fotocamera: presenza, «Jarvis» più facile da vicino, guarda e parla). Piano autonomo in corso._

## Piano autonomo del 01/10 — avanzamento

| Punto | Versione | Stato |
|---|---|---|
| 2. Falsi scatti con la TV + annunci | v0.5.4 | **fatto** (sotto) |
| 3. Navigazione N2 + Stanza + Meteo | v0.5.5 | **fatto** |
| 4. Musica | v0.5.6 | **fatto** |
| 5. Timer, Clima, Scene, Spesa, Avvisi | v0.5.7 | **fatto** |
| B. Riascolto breve, errori di Google, timer coi servizi, conferma scene (messaggio del 02/10) | v0.5.8 | **fatto** |
| M. Musica dal dispositivo del pannello + «Collega questo dispositivo» (priorità alta, 02/10) | v0.5.9 | **fatto** |
| 6. Giro della personalizzazione + esporta/importa | v0.5.10 | **fatto** |
| 7. Fotocamera | v0.6.0 | **fatto** |
| 8. Modello su misura | — | piano scritto (non fattibile qui, vedi sotto) |

**Piano finale del 02/10** (un solo task, in ordine):

| Parte | Stato |
|---|---|
| 1. Instradamento musica | **già fatta con la v0.5.9** (jarvis_musica 0.5.0 + pannello): ricontrollata punto per punto, 1a-f e pannello ci sono tutti, comprese le prove (87/87 sul finto Spotify). Il server ha ancora jarvis_musica 0.4.0: va installata la 0.5.0 (sezione «Prima: v0.5.9» sotto) |
| 2. Ascolto dopo la risposta + errori di Google | **già fatta con la v0.5.8**: 8 s dopo una domanda, 2 s dopo un'azione (0 = chiude subito), sensibilità del parlato, suono breve e «Google non risponde» distinto dal silenzio di stt-no-text-recognized |
| Carattere di Jarvis «in stile Tony Stark» | **fatto**: `docs/ISTRUZIONI-JARVIS.md`, da applicare lato server |
| 3. Modello su misura per «Jarvis» | **non fattibile in questo ambiente**: piano dettagliato in «Modello su misura per «Jarvis»: piano» qui sotto. Resta `hey_jarvis` col verificatore della pronuncia |
| 4. Riordino in moduli | in corso: blocco 1 → v0.6.1; blocco 2 (voce, parola, assistente, timer, annunci, fotocamera) → v0.6.3; blocco 3 dopo |

## Valutazione della fotocamera (v0.6.0, punto 7.1, scritta prima del codice)

- **Modello**: UltraFace RFB-320 (Linzaer, «Ultra-Light-Fast-Generic-Face-
  Detector-1MB»), **licenza MIT** (anche commerciale), **1,27 MB** (file
  `version-RFB-320.onnx`, sha256 `34cd7e60…f88017`, in
  `modelli/volto/` con LICENZA.md). Il grafo fa già softmax e decodifica:
  sul pannello restano soglia e NMS. Scaricato da GitHub (Hugging Face e
  Wikimedia sono bloccati dalla rete di questo ambiente).
- **Misurato** (onnxruntime-web 1.30, wasm, 1 thread, come sul pannello):
  **22 ms** a fotogramma (mediana, p90 28 ms) su questo server x86. Sul
  tablet ARM mi aspetto 3-5 volte tanto (70-110 ms): **da misurare dal vivo**,
  il pannello scrive i suoi tempi nel registro ogni 10 minuti.
- **Prova sul volto vero** (foto NASA di dominio pubblico): volto trovato con
  punteggio 1,00; a ~0,8 m il volto è largo 0,18 dell'inquadratura, a ~2 m
  0,07; un'immagine vuota arriva al massimo a 0,07 di punteggio.
- **Distanza**: dalla larghezza del volto (16 cm) e un campo visivo di ~60°
  della fotocamera frontale: `d ≈ 0,139 / larghezza`. È una stima: va
  tarata col tablet vero (Impostazioni → Fotocamera → distanza).
- **Sguardo**: questo modello trova quasi solo volti di FRONTE, quindi
  «guarda il tablet» = volto frontale vicino e sicuro (punteggio alto,
  proporzioni da volto di fronte). Un modello di sguardo vero non c'è sotto
  i 10 MB con licenza compatibile: approssimazione dichiarata.
- **Batteria**: 3 fotogrammi al secondo di serie (2-5); ogni fotogramma
  costa poco (differenza con il precedente su 64×48 punti), il modello del
  volto gira solo quando qualcosa si muove o qualcuno è già lì, e comunque
  almeno ogni 2 s. Di notte (23-7 di serie) la fotocamera è spenta del tutto.
- **Privacy**: le immagini restano in memoria per il solo fotogramma in
  corso, **mai salvate, mai inviate**: a Home Assistant arriva solo
  `script.jarvis_presenza {pannello}` (al massimo uno ogni 5 minuti). Nessun
  riconoscimento di chi è. Una spia sempre visibile mentre la fotocamera
  lavora; si spegne da Impostazioni → Fotocamera.
- **Evento**: dal websocket `fire_event` è solo per gli amministratori
  (verificato nel sorgente di HA 2026.9.3), e il pannello non usa permessi
  da amministratore: l'evento `jarvis_presenza {pannello}` lo manda lo script
  nuovo `script.jarvis_presenza` del pacchetto `jarvis.yaml` (da installare).

## Scelte fatte da Code, da confermare

Ogni riga: cosa, perché, dove si cambia.

- **«In stile Tony Stark» letto come il maggiordomo digitale di Tony Stark**
  (impeccabile, calmo, ironia asciutta, battuta dopo l'azione), con un po'
  della prontezza di Stark stesso. L'altra lettura (Jarvis che parla *come*
  Tony Stark: sfrontato, sarcastico a ogni frase) l'ho scartata perché su
  errori, bambini e annunci stanca presto. Si cambia nella sezione 1 di
  `docs/ISTRUZIONI-JARVIS.md`.
- **Jarvis chiama Salvatore «signore»**, non a ogni frase; gli altri per nome o
  senza appellativi. Si cambia nella sezione 1 dello stesso file.
- **Mai ironia su errori, salute, sicurezza, soldi, persone in difficoltà e
  bambini.** Sezione 1.
- **Timer a tutto schermo: «sempre» letto come «ogni volta che nessuno
  tocca il pannello da 15 s»**, non «subito e fisso»: fisso, il pannello
  resterebbe inutilizzabile per tutta la durata del timer (10 minuti di
  pasta = 10 minuti senza poter accendere la TV). Un tocco riporta al
  pannello, poi il timer torna. Si cambia in Impostazioni → Schermate →
  Timer (secondi da 5 a 120, o spento).
- **Timer a tutto schermo anche sopra riposo e Hub**, e non mentre Jarvis
  ascolta o parla (la voce deve restare in vista); in grande quello che
  finisce prima tra quelli che scorrono, gli altri sotto (al massimo 3 più
  «+N»). Di notte rosso scuro come «Timer finito».
- **Riordino: due porte per modulo, `index.ts` e `componenti.ts`**, invece
  di un solo file indice: con uno solo, la logica (che `connessione` crea)
  e l'interfaccia (che usa `connessione`) si importerebbero a vicenda, e un
  giro chiuso può fermare l'avvio dell'app. Moduli di sola interfaccia: solo
  `index.ts`. Regola scritta in cima al CLAUDE.md.
- **Riordino: i tre file di prove misti divisi per modulo** (`logica.test`,
  `pannello.spec` e, nei blocchi dopo, `schermate`): ogni prova è rimasta
  identica, ha solo cambiato file. Il confronto prima/dopo è per titolo.
- **Riordino: `scripts/test-modulo.mjs`** dietro tutti i `test:<modulo>`,
  invece di 20 righe quasi uguali nel `package.json`. Lancia il build prima
  delle prove nel browser.
- **I testi del pannello non cambiano tono** («Ti ascolto ancora…», messaggi
  d'errore): restano neutri e chiari. Il carattere vale per ciò che Jarvis
  dice. Se li vuoi anche loro «alla Stark», è un ritocco a parte.

- **Conferma su 2 frame di fila** (160 ms) prima di scattare: con la "TV" di
  prova da sola porta i falsi da 24 a 6 all'ora, e la parola vera resta
  sopra soglia per 5-9 frame. Impostazioni → Voce → Falsi scatti → Conferma.
- **Soglia che si adatta: passo 0,05**, "più di 3 in 10 minuti" e "30 minuti
  tranquilli" come chiesto; tetto a 0,95 (sopra non passerebbe neanche la
  parola vera). Impostazioni → Voce → Falsi scatti.
- **Impara dai falsi scatti, acceso di serie**: ogni falso scatto diventa un
  esempio "non è Jarvis" (solo numeri) e dopo 2 la pronuncia si riaddestra
  da sola. È la misura che ha funzionato di più (verificatore 48 → 0/ora).
  Funziona solo se avete già registrato gli esempi della parola.
  Impostazioni → Voce → Impara dai falsi scatti.
- **Annunci quando HA non è collegato**: invece di perderli si scrivono a
  riposo, come nell'ora del silenzio.
- **Annunci scritti a riposo: al massimo 5, per 12 ore**, un tocco li toglie
  (il tocco sull'annuncio non sveglia il pannello). Fisso nel codice:
  rientra nel giro della v0.5.8.
- **"Notte" degli annunci = notte dello schermo a riposo** (Impostazioni →
  Schermo a riposo), oltre all'ora del silenzio di HA.
- **Riascolto dopo un annuncio con `ascolta=true`**: conta come una domanda
  di Jarvis (8 s di serie, «Ti ascolto ancora»). Impostazioni → Voce →
  Dopo una domanda di Jarvis.

- **Nella colonna solo le schermate che esistono** (v0.5.5): dalla v0.5.7
  ci sono tutte, come nel mockup N2.
- **Ritorno alla schermata iniziale dopo 90 s** senza tocchi (il "~90 s" del
  mockup). Impostazioni → Schermate.
- **Pioggia solo quando c'è**: met.no manda i millimetri e non la
  probabilità; "0 mm" su ogni ora era rumore. Impostazioni → Schermate →
  Pioggia.
- **Pressione spenta di serie**, umidità, vento, alba e tramonto accesi.
  Impostazioni → Schermate.
- **Grafico della stanza: 24 ore, solo temperatura** (umidità attivabile).
  Impostazioni → Schermate → Stanza.
- **Sul tablet la colonna informazioni è a 290 px** (prima 330) e
  l'orologio un po' più piccolo, per far stare la colonna senza che le card
  della camera escano. Fisso nel layout.
- **Musica al secondo posto nella colonna** (Casa, Musica, Meteo), come nel
  mockup N2. Chi aveva già salvato un ordine la trova in fondo. Impostazioni
  → Schermate.
- **Mini-lettore acceso di serie, sotto l'orologio**, solo mentre suona
  (in pausa sparisce). Nel mini solo il **primo artista**: l'elenco intero
  è nella schermata Musica. Sul tablet, mentre c'è, i giorni del meteo
  della Casa si nascondono (come con i timer). Impostazioni → Schermate →
  Musica.
- **Una playlist parte dove suona già** (anche in pausa); se non suona
  niente non si passa la stanza e decide `jarvis_musica` (la sua stanza
  predefinita).
- **Stanze per spostare la musica = le aree di HA**, se non ne scegliete
  altre (Impostazioni → Schermate → Musica). Vedi la proposta sotto.
- **Volume ±10** coi pulsanti: è `alza`/`abbassa` di `jarvis_musica`, il
  passo lo decide lui.
- **Le impostazioni si aprono tenendo premuto l'orologio** (in Casa) **e
  da Altro** (v0.5.7).

- **Colonna di serie come il mockup N2**: Casa, Musica, Meteo, Timer,
  Altro (+ Hub). Clima, Scene, Spesa e Avvisi stanno in Altro; ognuna si
  porta nella colonna o si spegne. Impostazioni → Schermate.
- **Altro mostra tutte le schermate accese** (anche quelle già nella
  colonna), più Impostazioni e Hub, come il menu del mockup.
- **Timer dalla schermata coi servizi di jarvis_voce 0.3.0** (v0.5.8, al
  posto della frase a Jarvis): stanza = quella del pannello; senza stanza i
  pulsanti per un timer nuovo sono spenti (la nota dice di sceglierla in
  Impostazioni). Pulsanti di serie: 1, 3, 5, 10, 15, 30 minuti.
  Impostazioni → Schermate → Timer.
- **Scene attive anche nella Casa** (prima «in arrivo»): le prime 3
  dell'elenco, con un tocco e senza conferma (confermato da Salvatore il
  02/10). Si dice «avviata»: cosa fa davvero lo script si vede nelle card.
  Conferma accendibile (v0.5.8): Impostazioni → Schermate → Scene.

- **v0.5.8 — dopo un'azione 2 s di ascolto in silenzio**, dopo una domanda
  di Jarvis 8 s con «Ti ascolto ancora»; sensibilità del parlato «normale»
  (quella della v0.5.3). Impostazioni → Voce.
- **v0.5.8 — conferma delle scene: secondo tocco entro 4 s**. Fisso.

- **v0.5.10 — si esportano solo le preferenze cambiate** (quelle di serie
  non sono salvate, quindi non sono nel file): importando, il resto del
  pannello che riceve resta com'è, non torna di serie.
- **v0.5.10 — dopo l'import il pannello si ricarica**: ogni parte rilegge e
  ripulisce i suoi valori all'avvio, ed è il modo sicuro per applicarli
  tutti insieme.
- **v0.5.10 — la scelta del dispositivo Spotify non è nel file**: sta sul
  server, per stanza (v0.5.9).
- **v0.5.9 — la scelta del dispositivo si salva per stanza del pannello**
  (il device_id `jarvis_<stanza>`): senza stanza non si ricorda niente,
  «Dove la suono?» chiede ogni volta. Due pannelli nella stessa stanza
  condividono la scelta.
- **v0.5.9 — «Dove la suono?» solo per le playlist** toccate nella
  schermata Musica; pausa, volume e gli altri comandi agiscono sulla musica
  in corso, dovunque sia.
- **v0.5.9 — «Collega» salva il dispositivo anche se in «Dove la suono?»
  «Ricorda» è tolto**: collegare è già una scelta esplicita per questo
  pannello.
- **v0.5.9 — sul computer** si apre il sito di Spotify in una nuova scheda
  e si comincia a cercare dopo 5 s anche se il pannello resta in primo
  piano.
- **v0.5.9 — il dispositivo si salva per nome**, non per id: l'app
  Spotify su un telefono cambia id quando si riapre.
- **v0.5.8 — errori di Google: un titolo solo** («Google non risponde,
  riprova tra poco.»), la causa (limite, sovraccarico) nella spiegazione;
  suono di due note che scendono. Il suono segue il bip della voce, non ha
  un interruttore suo.
- **Buonanotte descritta senza la modalità notte del pannello**: lo script
  manda `jarvis_buonanotte`, ma il pannello non lo ascolta ancora (F6).
- **Clima: un grafico solo per tutte le stanze**, stessa scala, 24 ore.
- **Consumi accesi di serie**, ma si vedono solo se c'è un sensore: oggi in
  casa non c'è.
- **Spesa: le cose prese restano barrate in fondo** finché non si tolgono.
- **Avvisi: ultime 24 ore, batteria bassa sotto il 20%**, solo i
  dispositivi del pannello (un'entità per card). Chi ha chiesto il cambio:
  «da <script>» o «da un utente» (il nome della persona chiede permessi da
  amministratore: non li uso).
- **Interruzioni della connessione salvate sul pannello** (le ultime 30).
- **Fotocamera (v0.6.0), presenza con uno script**: il pannello chiama
  `script.jarvis_presenza {pannello}`, che manda l'evento
  `jarvis_presenza`. Dal websocket `fire_event` è riservato agli
  amministratori (verificato nel sorgente di HA 2026.9.3), e il pannello
  non usa un token da amministratore. Il pannello prova comunque
  `fire_event` se lo script non c'è.
- **Guarda e parla richiede «Jarvis» acceso**: usa lo stesso ascolto del
  microfono; con «Jarvis» spento il microfono non è aperto, e aprirlo solo
  per lo sguardo sarebbe un secondo ascolto sempre attivo.
- **«Guarda» è un'approssimazione**: volto vicino (entro la distanza) e di
  fronte (proporzioni del riquadro del volto, 0,6-1,15). Il modello non
  stima la direzione degli occhi. Si tara con Impostazioni → Fotocamera
  (ultimo volto visto, punteggio e distanza).
- **Distanza stimata dalla larghezza del volto** (0,139 / larghezza):
  dipende dall'obiettivo del tablet. Se sbaglia, la distanza si regola nelle
  impostazioni guardando la stima mostrata lì.
- **«Jarvis» più facile da vicino: di serie un passo di 0,05**, lo stesso
  della soglia che si adatta (v0.5.4), quindi chi è vicino annulla un
  rialzo dovuto ai falsi scatti ma non va sotto la soglia di serie meno un
  passo. Mai sotto 0,2. «Vicino» = visto negli ultimi 10 s entro la
  distanza; lo sguardo implica la vicinanza. Impostazioni → Fotocamera →
  «Di quanto più facile» (0,01-0,2).
- **Punto 7.3 cambiato il 02/10 (decisione di Salvatore)**: la regola «con
  la TV accesa «Jarvis» conta solo se c'è qualcuno vicino» era già scritta e
  provata, ed è stata **tolta prima della release**: bloccava «Jarvis» dal
  divano. Il file di impostazioni di un pannello che l'avesse non la
  riaccende (chiave ignorata).
- **Nelle prove automatiche la fotocamera è spenta** salvo le prove della
  fotocamera: quella finta di Chromium si muove sempre e sveglierebbe il
  pannello in tutte le altre prove.

## Bug trovati durante il riordino

Per regola del piano qui si annotano e **non** si correggono, così il
riordino resta verificabile a parità di comportamento.

- (nessuno finora)

## Modello su misura per «Jarvis»: piano (Parte 3, 02/10)

**Perché non qui.** Verificato il 02/10, non a memoria:

- **I dati non arrivano**: Hugging Face non risponde dalla rete di questo
  ambiente (connessione rifiutata), e lì stanno le voci italiane di Piper, la
  voce inglese multi-parlante, i negativi pronti di openWakeWord e i corpora
  di parlato italiano. Nelle release GitHub di Piper (v0.0.2) non c'è nessuna
  voce italiana (5 nomi provati, tutti 404).
- **Con quello che c'è** (una sola voce inglese, `lessac`) il modello
  imparerebbe quella voce, non la parola; e la prova dei falsi scatti usa la
  stessa voce: il confronto con `hey_jarvis` risulterebbe migliore per
  finta. Il piano chiede «di serie solo se migliore su entrambi»: con una
  misura falsata non si può decidere.
- Niente GPU (4 CPU, 15 GB): l'addestramento in sé starebbe nei tempi, la
  generazione e l'aumento dei dati sarebbero lenti ma possibili. Il blocco
  vero sono i dati.

**Dove farlo**: Google Colab (GPU T4 gratuita) o un PC con GPU, col notebook
`automatic_model_training` di openWakeWord (codice Apache 2.0). Lì Hugging
Face si scarica normalmente. Tempo: ~1 h di generazione clip, ~30 min di
caratteristiche, ~30-60 min di addestramento; mezza giornata in tutto con le
prove.

**Dati** (licenze lette sulle schede di Hugging Face il 02/10, via connettore):

| Cosa | Da dove | Licenza |
|---|---|---|
| Voce `it_IT-serena` (medium e high) | `rhasspy/piper-voices` | CC BY 4.0 (dataset `committa/serena-synthetic-it-27h`) |
| Voce `it_IT-paola-medium` | idem | «vedi dataset» `paolapersico1/Voice-Dataset-Italian`: da leggere prima |
| Voce `it_IT-riccardo-x_low` | idem | «vedi dataset» M-AILABS: da leggere prima |
| Voce inglese multi-parlante `en_US-libritts_r-medium` (900+ voci, con i fonemi italiani scritti a mano) | idem | dataset LibriTTS-R, CC BY 4.0 |
| Negativi pronti (caratteristiche di ~2000 h di audio vario) | `davidscripka/openwakeword_features` | da leggere prima; i modelli di base di openWakeWord sono già CC BY-NC-SA (solo uso personale) |
| Parlato italiano vero (negativi «TV») | Common Voice italiano / Multilingual LibriSpeech italiano | CC0 / CC BY 4.0 |
| Riverbero delle stanze | MIT IR Survey | CC BY 4.0 |
| **Le pronunce di casa** | gli esempi già registrati nel pannello (Impostazioni → Voce → «Insegna a Jarvis la tua pronuncia») e i falsi scatti imparati: sono già le caratteristiche (16 × 96) che il classificatore usa | nostre |

**Parole**: «Jarvis», «Giàrvis», «Giarvìs» scritte in fonemi (`ˈdʒarvis`,
`dʒarˈvis`) per pilotare l'accento, 3-5 mila clip per variante con velocità
0,8-1,3, rumore e riverbero.

**Misura, uguale per i due modelli** (decisa prima dei numeri):
riconoscimento sulle clip italiane tenute fuori dall'addestramento e sulle
clip delle prove (`test/dati/audio`), più la prova dal vivo sul tablet a 1 e
3 m; falsi scatti all'ora con la prova esistente
(`test/unit/parola-falsi-scatti.test.ts`) e con 1 h di parlato italiano.
**Di serie solo se migliore di `hey_jarvis` su entrambi**; altrimenti
un'opzione «Modello della parola» in Impostazioni → Voce.

**Nel pannello** serve poco: il rilevatore è già un'interfaccia
(`RilevatoreParola`), parola e licenza arrivano dalla descrizione del
modello. Si aggiunge il file in `modelli/openwakeword/` con la sua riga in
`LICENZA.md`, la scelta in Impostazioni → Voce, e le prove.

**Cosa serve per sbloccarlo**: o una sessione con Hugging Face raggiungibile
(cambiando la rete dell'ambiente), o qualcuno che lanci il notebook su Colab
e metta nel repo il file `.onnx` risultante; da lì, misura e integrazione le
faccio io.

## Punti bloccati e cosa serve

- **«Jarvis, apri il meteo»** (dal mockup N2): oggi la frase va a Gemini, e
  il pannello non sa che deve cambiare schermata. Serve uno di questi due:
  (a) lato server, `jarvis_voce` manda un evento `jarvis_apri {pannello,
  schermata}` quando Gemini usa uno strumento "apri"; (b) lato pannello,
  riconoscere la frase dal testo trascritto prima di Gemini, come «stop» col
  timer (ma solo mentre si ascolta, e con il rischio di non mandare a
  Gemini domande vere). **Proposta: (a)**, più pulita. Fatto al posto: tocco
  sul meteo e sul nome della stanza, e `#meteo` nell'indirizzo.

- **Sveglie e promemoria**: la parte della schermata Timer si accende
  quando il server li avrà.

## Personalizzabile (elenco che cresce a ogni versione)

- **Voce** (pannello): «Jarvis» acceso; bip allo scatto; secondi di
  riascolto dopo una domanda di Jarvis (0 = spento) e dopo un'azione (0 =
  chiude subito), sensibilità del parlato (v0.5.8); discorso di prima sì/no e quanti secondi; soglia
  di scatto (automatica o a mano); conferma (frame di fila); soglia che si
  adatta sì/no, quanti falsi scatti, in quanto tempo, passo, dopo quanto
  riscende; impara dai falsi scatti; elaborazione del microfono.
- **Annunci** (casa, entità di HA): interruttore generale, caldo in camera,
  buongiorno, soglia del caldo, stanza, orari del silenzio, del caldo e del
  buongiorno. (Pannello): volume degli annunci, solo testo.
- **Schermate** (pannello): ordine e voci della colonna, schermata iniziale,
  ritorno dopo N secondi (0 = mai); Meteo: ore, giorni, umidità, vento,
  unità del vento, pressione, pioggia, alba e tramonto; Stanza: ore del
  grafico, umidità nel grafico.
- **Schermate v0.5.7** (pannello): dove sta ogni schermata (colonna, solo
  in Altro, spenta); Timer: pulsanti; Clima: ore del grafico, consumi;
  Scene: quali e in che ordine (le prime 3 anche in Casa), conferma prima
  delle scene (v0.5.8); Spesa: quale
  lista, cose prese; Avvisi: ore, soglia della batteria.
- **v0.5.10**: annunci scritti a riposo (quanti 5, per quante ore 12),
  tempo per il secondo tocco delle scene (4 s), riquadro della voce dopo
  la risposta (6 s). E tutto si esporta/importa (Impostazioni → Esporta e
  importa).
- **Musica** (v0.5.9, per stanza del pannello, sul server): su quale
  dispositivo Spotify suona, o «Chiedi ogni volta».
- **Musica** (pannello): mini-lettore sì/no, dove (orologio o barra),
  rilettura ogni N secondi, stanze per spostarla, playlist preferite (la
  stella; «Togli le preferite»).
- **Fotocamera** (v0.6.0, pannello): presenza, guarda e parla, «Jarvis»
  più facile da vicino e di quanto (0,05), distanza (1,5 m), sensibilità (normale), fotogrammi al secondo
  (3), spenta dalle 23 alle 7. Tutto acceso di serie; si esporta.
- **Timer a tutto schermo** (v0.6.2, pannello): acceso/spento, dopo quanti
  secondi senza tocchi (15). Impostazioni → Schermate → Timer.
- **Schermo a riposo**: attesa, notte dalle/alle. **Audio**: audio sveglio.
  **Stanza** del pannello.

## Adesso

- **Finito: v0.6.2, timer a tutto schermo** (tua richiesta del 02/10): con
  un timer attivo, dopo 15 s senza tocchi copre tutto (pannello, riposo,
  Hub); un tocco riporta al pannello, e dopo altri 15 s torna. Non compare
  mentre Jarvis ascolta o parla; quando suona resta «Timer finito».
  Impostazioni → Schermate → Timer: acceso/spento e i secondi.

- **In corso: riordino (Parte 4), blocco 2 → v0.6.3** (voce, parola,
  assistente, timer, annunci, fotocamera). Nessun cambiamento per chi usa il
  pannello. Controllo del codice: tolte 4 costanti mai usate
  (`RIQUADRO_DOPO_MS`, `LUNGHEZZA_CARATTERISTICHE`, `LINGUA`, `ANCORE`), 71
  export resi interni, `virgola` e `limitaIntero` di `comune` al posto di 13
  copie locali; nessun `catch` vuoto (i 5 senza variabile ripiegano sui
  valori di serie). I file di prove «schermate» divisi per modulo (29 + 11
  prove, identiche). Istruzioni di Jarvis: domande senza «Jarvis».

- **Fatto: riordino (Parte 4), blocco 1 → v0.6.1.** Nessun cambiamento
  per chi usa il pannello: stesse schermate, stesse funzioni. Cosa è
  cambiato dentro:
  1. sei moduli con cartella e contratto: diagnostica, comune, interfaccia,
     connessione, pwa, casa;
  2. prove per modulo (`npm run test:<modulo>`); le prove che c'erano sono le
     stesse, con lo stesso titolo e lo stesso esito (confrontati gli elenchi
     prima e dopo: 247 nel browser, nessuna persa), più 8 nuove per comune e
     interfaccia, con le controprove (5 rotture apposta, tutte prese);
  3. controllo del codice: tolti 11 `export` di costanti e tipi usati solo
     nel loro file; unita in `comune` la formattazione dei decimali con la
     virgola; nessun `catch` vuoto (i 4 senza variabile gestiscono il caso);
     l'elenco di esporta/importa copre tutte le chiavi salvate;
  4. istruzioni di Jarvis: la percepita non è esposta ad Assist.

- **Finito: v0.6.0, la fotocamera** (punto 7 del piano; valutazione sopra):
  1. **presenza**: chi si avvicina (entro 1,5 m di serie) sveglia il
     pannello dal riposo e Home Assistant riceve `jarvis_presenza
     {pannello}` (al massimo ogni 5 minuti; serve `script.jarvis_presenza`
     del pacchetto aggiornato);
  2. **«Jarvis» più facile da vicino**: con qualcuno vicino al pannello la
     soglia scende di un passo (0,05). Nessuno visibile, anche con la TV
     accesa = esattamente come prima: la fotocamera non limita mai;
  3. **guarda e parla**: guardi il tablet e parli, ti ascolta senza
     «Jarvis»; se non dici niente si chiude in silenzio;
  4. **spia** sempre visibile mentre la fotocamera lavora, spenta di notte,
     immagini mai fuori dal tablet e mai salvate; tempi del modello nel
     registro ogni 10 minuti;
  5. **Impostazioni → Fotocamera** con tutto personalizzabile e lo stato
     vero (ultimo volto: punteggio e distanza).
  Provato nel browser col modello vero e una fotocamera finta (foto NASA,
  dominio pubblico): presenza mandata una volta sola; lontano niente evento
  a 1,5 m e sì a 2,5 m; ore di riposo; risveglio dal riposo; TV accesa e
  stanza vuota → «Jarvis» scatta a soglia normale; qualcuno vicino → soglia
  0,45 (e 0,50 con l'aiuto spento); un punteggio di 0,47 scatta solo con
  qualcuno vicino (prova unitaria su `AscoltoParola`); guarda e parla, con le controprove (stanza vuota,
  nessuna parola). Pacchetto HA: script e evento provati su HA 2026.9.3.

- **Finito: v0.5.10, esporta/importa e giro della personalizzazione**:
  1. **Impostazioni → Esporta e importa**: un file JSON con le impostazioni
     di questo pannello; all'import si vede cosa cambia e poi il pannello
     si ricarica. Fuori sempre: collegamento a HA (token), stanza,
     registro, interruzioni, pronuncia di «Jarvis»;
  2. **valori che erano fissi, ora personalizzabili**: annunci scritti a
     riposo (quanti, per quante ore), tempo per il secondo tocco delle
     scene, secondi del riquadro della voce dopo la risposta.
  Controprove: un file con dentro il token o la stanza li scarta (anche
  chiamando `importa()` a mano); file rotto, di un altro programma, vuoto
  o già uguale; tolto l'annuncio in cima non ricompare uno vecchio già
  scartato. Trovati col layout: il campo file nascosto contava come testo
  tagliato, e i nomi tecnici delle chiavi scartate si spezzavano.

- **Finito: v0.5.9, la musica parte dal dispositivo da cui la chiedi**
  (problema del Redmi del 02/10):
  1. **jarvis_musica 0.5.0** (`home-assistant/custom_components/jarvis_musica`):
     `dispositivi`, `imposta_pannello` (salvato su disco), `pannello` e
     `dispositivo` in `riproduci` e `controllo`; a voce il pannello da
     `jarvis_voce.pannello_corrente()` (con try/except); dispositivo chiesto
     o salvato non visibile → `dispositivo_assente`, mai un altro
     altoparlante. Prova su HA 2026.9.3: **87/87** (erano 65);
  2. **pannello**: Impostazioni → Musica («Questo pannello suona su:»),
     «Dove la suono?» alla prima playlist, «Collega questo dispositivo» /
     «Ricollega», ogni comando con `pannello` e `dispositivo`, errori della
     musica finalmente visibili (prima un `{esito: "errore"}` spariva).
  Controprove: ripiego sugli altri altoparlanti reintrodotto apposta → 4
  verifiche della prova del server cadono; «Ricorda» tolto → niente
  salvataggio; componente vecchio (0.4) → la playlist parte come prima;
  dispositivo che non compare in 60 s; due nuovi insieme; Ricollega per
  nome. Trovati strada facendo: i dispositivi non si rileggevano se il
  pannello si apriva già sulla Musica; un salvataggio doppio da «Collega»
  dentro «Dove la suono?».

- **Finito: v0.5.8** (messaggio del 02/10):
  1. **B1 ascolto dopo la risposta**: «Ti ascolto ancora» 8 s solo se
     Jarvis ha fatto una domanda; dopo un'azione 2 s in silenzio, e se
     nessuno parla si chiude subito. Impostazioni → Voce;
  2. **B2 errori di Google**: «Google non risponde, riprova tra poco.» e un
     suono breve per `stt-stream-failed` e gli errori di Gemini; «non ho
     capito» resta silenzioso;
  3. **A2 timer coi servizi** `timer_stanza` / `timer_comando`, con Pausa,
     Riprendi e Annulla; tolta la proposta sotto «Punti bloccati»;
  4. **A1 conferma delle scene**, spenta di serie.
  Controprove: con `continue_conversation` true la finestra breve non
  chiude; «Jarvis» + nessuna parola resta silenzioso; sensibilità bassa
  vuole un pezzo di voce in più; timer già finito sul server, server senza
  la 0.3.0, pannello senza stanza; primo tocco su una scena che non avvia
  e scade dopo 4 s. Trovati col layout e corretti: nome lungo del timer
  spezzato a metà parola nella Casa (915x412) e «Annulla» fuori schermo a
  320 px.

- **Finito: v0.5.7, le altre schermate del mockup N2**:
  1. colonna di serie Casa, Musica, Meteo, Timer, Altro (+ Hub); ogni
     schermata nella colonna, in Altro o spenta; **Altro** porta a tutto,
     impostazioni e Hub compresi;
  2. **Timer**: elenco col conto alla rovescia, pulsanti per uno nuovo e
     «Annulla» (passano da Jarvis con la frase di voce);
  3. **Clima**: tutte le stanze in un grafico, stanze, scaldabagno; consumi
     solo con un sensore;
  4. **Scene**: script del pacchetto con un tocco, anche dalla Casa;
  5. **Spesa**: `todo.shopping_list` con aggiungi / segna / togli;
  6. **Avvisi**: batterie basse, eventi dei dispositivi dal registro di HA,
     interruzioni della connessione, con i filtri.
  Controprove: stato «unknown» degli infrarossi mostrato, schermata spenta
  aperta dall'indirizzo, interruzioni non registrate: le prove cadono.
  Trovato e corretto strada facendo: un campo vuoto delle durate dava un
  pulsante «1 min»; la cartella `src/schermate/` era ignorata da Git (vedi
  CLAUDE.md).

- **Finito: v0.5.6, Musica** (mockup M1):
  1. **schermata Musica** nella colonna: copertina, titolo, artisti, dove
     suona, barra del tempo che scorre in locale, precedente / pausa /
     successivo, volume ±; le stanze per spostarla; le playlist (tocco →
     `riproduci` con l'uri), stella per le preferite in cima;
  2. **mini-lettore** nella Casa sotto l'orologio solo mentre suona
     (copertina, titolo, pausa; tocco → Musica), oppure nella barra;
  3. stato riletto ogni 20 s finché qualcuno guarda, subito dopo ogni
     comando e quando HA si ricollega;
  4. **Impostazioni → Schermate → Musica**.
  Controprove: rilettura dopo il comando senza aspettare quella in corso
  (stato vecchio), mini senza rilettura al collegamento (vuoto per 20 s),
  testi coi puntini, mini sul tablet senza fare posto: le prove cadono.
- **Proposta per la sessione server**: `jarvis_musica.stato` potrebbe
  mandare anche l'elenco delle stanze dove può suonare (i dispositivi
  Spotify/Alexa che conosce). Oggi il pannello usa le aree di HA, ma non è
  detto che in ogni area ci sia un Echo.

- **Finito: v0.5.5, navigazione + Meteo + Stanza** (mockup N2):
  1. colonna a sinistra con Casa, Meteo e l'Hub in fondo; sul telefono in
     verticale è una riga in alto. `#meteo` e `#stanza/<area>`
     nell'indirizzo, Indietro di Android, ritorno alla schermata iniziale
     dopo 90 s senza tocchi;
  2. **Meteo**: adesso (umidità, vento con direzione, alba e tramonto da
     `sun.sun`), 12 ore, 5 giorni; pioggia solo quando c'è;
  3. **Stanza**: dal nome della stanza; temperatura delle ultime 24 ore da
     `history/history_during_period`, poi i dispositivi. La cucina non ha
     termometro: niente grafico, niente invenzioni;
  4. **Impostazioni → Schermate**: tutto quello sopra si sceglie.
  Controprove: senza ritorno, Stanza senza livello in cronologia, "0 mm",
  vento non convertito, linea senza buchi, colonna che ignora le voci
  nascoste: le prove cadono.
- Il **CI** aveva un limite di 20 minuti e ha annullato la release della
  v0.5.4: ora 45.

## v0.5.4 — riepilogo

- **Finito: v0.5.4, falsi scatti + annunci**:
  1. **Falsi scatti** — misura con 20 minuti di "TV" sintetica (frasi Piper
     con parole simili a «Jarvis», volumi diversi, musica a tratti) e il
     modello vero:
     - modello di base: **24 → 0 falsi all'ora**;
     - «hey jarvis» dentro la TV: **23/24 (96%)** a due volumi, 0 falsi;
     - verificatore "debole" (pochi negativi, la TV lo convince): 48/ora
       prima; dopo, 2 falsi scatti all'inizio, poi **0/ora**, e le varianti
       di prova non usate per addestrare riconosciute 12/12.
     Come: conferma su 2 frame; soglia personale solo col verificatore;
     soglia che si adatta (+0,05 dopo più di 3 vuoti in 10 min, −0,05 dopo
     30 min tranquilli); i falsi scatti insegnano al verificatore. Registro:
     a ogni scatto punteggio, soglia, verificatore, trascrizione.
     Controprove: senza conferma (24/ora), soglia che non sale, personale
     senza verificatore, senza apprendimento: le prove cadono.
  2. **Annunci**: `jarvis_annuncio` solo per il proprio device_id, in coda,
     mai sopra una domanda; voce con la pipeline **tts→tts** (`input.text`,
     stessa voce delle risposte), Hub in primo piano, poi riascolto se
     `ascolta`. Notte, `binary_sensor.jarvis_annunci_in_silenzio` on o "solo
     testo": scritto a riposo. Sezione **Impostazioni → Jarvis parla per
     primo** con tutte le entità del pacchetto + volume e solo testo.
- **Domanda per la sessione server**: la pipeline tts→tts degli annunci non
  manda `conversation_id`: va bene così, visto che la frase la tenete voi
  come contesto per 3 minuti?

## Ultima release del pannello

| | |
|---|---|
| Versione | **v0.6.2**: timer a tutto schermo |
| Link | https://github.com/srosone90/jarvis-os/releases/tag/v0.6.2 |
| sha256 dello zip | `b27b87d9257d31280b24f84da75d6a2935c02702597cafea8339482e1e26520d` (7,9 MB, service worker 0.6.2, `parola/` con 8 file, nessun file delle prove; verificati, uguale al digest di GitHub). Il primo giro della release era caduto su una prova scritta male (chiedeva 3 s, il minimo è 5): corretta la prova, il pannello era già giusto |
| Precedente | v0.6.1, sha256 `a3f383df630f53a67ba17a1aba10930dbd2723af1927d8d4c3729e13b9889970` (7,9 MB, service worker 0.6.1, `parola/` con 8 file, nessun file delle prove; verificati) |

## Da installare lato server: v0.6.0

1. Lo zip sopra `/config/www/jarvis/`.
2. **`packages/jarvis.yaml` aggiornato**: c'è lo script nuovo
   `script.jarvis_presenza` (campo `pannello`), che manda l'evento
   `jarvis_presenza {pannello}`. **Non** esporlo ad Assist. Poi ricarica
   gli script (o riavvia HA).
3. Se volete che il buongiorno parta quando qualcuno arriva al pannello,
   l'automazione del buongiorno può ascoltare l'evento `jarvis_presenza`
   (oggi parte come prima; l'evento è in più).

**Come provare la v0.6.0**: al primo avvio il tablet chiede il permesso
della fotocamera: consentilo. In alto compare la spia. Allontanati per più
di un minuto, poi avvicinati: il pannello si sveglia e in Strumenti per
sviluppatori → Eventi, ascoltando `jarvis_presenza`, arriva l'evento col
nome del pannello. Impostazioni → Fotocamera mostra la distanza stimata:
se a un metro dice molto altro, regola «Vicino, fino a».

**Lo zip della v0.6.0 ha 8 file in `parola/`** (3 JS, 1 wasm, 4 onnx: in
più il modello del volto): la verifica dello zip va fatta con 8.

## Prima: v0.5.10

Solo lo zip sopra `/config/www/jarvis/`. Lato HA niente di nuovo (vale
quanto scritto per la v0.5.9, se non è ancora installata: jarvis_musica
0.5.0).

**Come provare la v0.5.10**: sul tablet, Impostazioni → Esporta e importa →
**Esporta**: scarica un file. Sul Redmi, Impostazioni → Esporta e importa →
**Importa** → scegli quel file: compare cosa cambia; «Importa e ricarica»;
il Redmi riparte con le stesse impostazioni del tablet, ma resta collegato
a HA e tiene la sua stanza.

## Prima: v0.5.9

1. Lo zip sopra `/config/www/jarvis/`.
2. **jarvis_musica 0.5.0**: sovrascrivi
   `/config/custom_components/jarvis_musica/` con
   `home-assistant/custom_components/jarvis_musica/` del repo (quattro
   file) e riavvia HA. `packages/jarvis_musica.yaml` e il file delle stanze
   non cambiano. Senza la 0.5.0 il pannello funziona come prima e in
   Impostazioni → Musica dice «Serve jarvis_musica 0.5.0».
3. **jarvis_voce 0.3.1** con `pannello_corrente()`: serve perché anche
   «Jarvis, metti la musica» detto da un pannello suoni sul SUO
   dispositivo. Senza, a voce si fa come prima (dove suona già, poi la
   stanza predefinita).
4. Prova del componente: `prove/prova_musica.py` → 87/87.

**Per Salvatore — far suonare la musica sul Redmi (o sul tablet):**

1. Installa **Spotify** dal Play Store sul Redmi e aprila una volta: fai
   il login con **lo stesso account** della casa (lo fai tu, nell'app: il
   pannello non vede né password né token).
2. Sul Redmi, nel pannello: **Impostazioni → Stanza e nome**: scegli la
   stanza (serve per ricordare la scelta).
3. **Impostazioni → Musica → «Collega questo dispositivo»**: si apre
   Spotify; torna al pannello e in pochi secondi compare «Collegato: Redmi
   … ✓». In alternativa scegli il Redmi dall'elenco «Questo pannello suona
   su:» (compare solo se Spotify è aperta).
4. Da lì in poi una playlist toccata sul Redmi suona sul Redmi, e «Jarvis,
   metti …» detto al Redmi anche (con jarvis_voce 0.3.1). «… in cucina»
   suona in cucina.
5. Se Android chiude Spotify, il pannello lo dice («Su Spotify non vedo
   …») e il tasto diventa **«Ricollega»**: toccalo, si riapre Spotify, e
   torna tutto.

**Come provare la v0.5.9**: dal Redmi tocca una playlist → «Dove la
suono?» (se non hai ancora scelto) → scegli; la volta dopo non chiede più
e parte lì. Chiudi Spotify sul Redmi e ritocca una playlist: deve dire
«Su Spotify non vedo …», e NON partire dall'Echo.

## Prima: v0.5.8

Lo zip sopra `/config/www/jarvis/`. Serve **jarvis_voce 0.3.0** (già
installato dalla sessione server) per i pulsanti dei timer: senza, il
pannello dice «serve jarvis_voce 0.3.0 sul server».

**Come provare la v0.5.8, dentro il pannello**:

1. «Jarvis, accendi la TV del salotto»: dopo la conferma **nessuna
   scritta** «Ti ascolto ancora»; se non dici niente, entro ~2 s torna
   l'ascolto di «Jarvis». Se invece continui subito («…e spegni il
   condizionatore») la conversazione va avanti.
2. Una domanda a cui Jarvis risponde con una domanda: «Ti ascolto
   ancora…» per 8 s, rispondi senza «Jarvis».
3. Impostazioni → Voce: «Dopo una domanda di Jarvis», «Dopo un'azione»,
   «Quanto basta per stai parlando».
4. **Timer**: «5 min» → compare (suona qui); «Pausa», «Riprendi»,
   «Annulla». Niente nella chat.
5. Impostazioni → Schermate → Scene → «Chiedi conferma prima delle
   scene»: dalla Casa il primo tocco su Esco dice «Tocca ancora».
6. Quando Google è sovraccarico: «Google non risponde, riprova tra poco.»
   e due note che scendono, invece del pannello che si chiude muto.

## Prima: v0.5.7

Solo lo zip sopra `/config/www/jarvis/` (contiene anche la v0.5.6, la v0.5.5
e la v0.5.4). Lato HA niente di nuovo: usa la lista della spesa
(`todo.shopping_list`, integrazione «Lista della spesa»), il registro, gli
script delle scene del pacchetto `jarvis.yaml` e i sensori di batteria che
ci sono già. Se la lista della spesa non c'è, la schermata Spesa lo dice.

**Come provare la v0.5.7, dentro il pannello** (tablet della cucina):

1. La colonna è Casa, Musica, Meteo, Timer, Altro. Tocca **Altro**: ci
   sono tutte le schermate, Impostazioni e Hub.
2. **Timer**: tocca «5 min». Jarvis crea il timer, che compare
   nell'elenco col conto alla rovescia (e suona qui). «Annulla» lo toglie.
   Dimmi se Gemini capisce sempre le due frasi.
3. **Clima**: il grafico con Soggiorno e Camera; tocca una stanza; c'è lo
   scaldabagno.
4. **Scene**: dalla Casa tocca **Esco**: spegne TV del salotto e
   condizionatore e ti manda la notifica sul telefono.
5. **Spesa**: aggiungi «uova», segnala come presa; poi a voce «Jarvis,
   aggiungi il latte alla lista della spesa»: compare da sola.
6. **Avvisi**: batterie basse (se ce ne sono) ed eventi di oggi. Spegni il
   Wi-Fi del tablet per 30 secondi e riaccendilo: in Connessione compare
   l'interruzione.

## Prima: v0.5.6

Lato HA serve `jarvis_musica` **0.4.0** (copertina, posizione,
`playlist`), che c'è già.

**Come provare la v0.5.6, dentro il pannello** (tablet della cucina):

1. Fai partire una canzone (anche a voce: «Jarvis, metti i Queen in
   cucina»). Sotto l'orologio compare il **mini-lettore** con copertina e
   titolo; premi la pausa: sparisce. Premi play dalla Musica e ricompare.
2. Tocca **Musica** nella colonna: la barra del tempo scorre; prova
   successivo, volume +, e una **stanza** sotto per spostare la musica.
   Dimmi se le stanze elencate sono quelle giuste per voi.
3. Tocca una **playlist**: deve partire dove stava suonando. Tocca la
   **stella** di un'altra: va in cima e ci resta anche dopo aver ricaricato.
4. Tieni premuto l'orologio → **Schermate → Musica**: metti il mini-lettore
   «Nella barra in basso», poi spegnilo; poi «Ripristina».

## Prima: v0.5.5

**Come provarla, dentro il pannello** (tablet della cucina):

1. A sinistra c'è la colonna: Casa, Meteo, e l'Hub in fondo. Tocca
   **Meteo**: adesso, prossime 12 ore e 5 giorni. Alba e tramonto ci sono se
   in HA c'è `sun.sun`.
2. Torna su **Casa** e tocca il nome **Camera da letto**: si apre la
   stanza con la temperatura delle ultime 24 ore e i dispositivi. Il tasto
   Indietro di Android torna a Casa.
3. Lascia il pannello sul Meteo senza toccarlo: dopo 90 secondi torna da
   solo su Casa.
4. Tieni premuto l'orologio → **Schermate**: sposta Meteo in cima, scegli
   "Schermata iniziale: Meteo", accendi la pressione. Ricarica: il pannello
   si apre sul Meteo. Poi «Ripristina».
5. Dimmi se il grafico della camera è giusto (forma e valori minimi e
   massimi) rispetto alla cronologia di HA.

## v0.5.4 (compresa nella v0.5.5)

| | |
|---|---|
| sha256 dello zip | `1801d56881394b01905160adbaf82535bbb4b7ce58cf65e4460eeca1c32cc85a` |

### Passi di prova della v0.5.4

Solo lo zip sopra `/config/www/jarvis/`. Lato HA: `jarvis_voce` 0.2.8 e il
pacchetto annunci (già fatti).

**Come provarla, dentro il pannello** (tablet della cucina):

1. Accendi la TV del salotto e lascia il pannello in pace per mezz'ora.
   Diagnostica → registro: le righe "«Jarvis» delle HH:MM: … trascrizione
   vuota: falso scatto" dovrebbero essere rare; se ce ne sono più di 3 in 10
   minuti deve comparire "«Jarvis»: soglia +0,05 sopra la sua base".
2. Di' «Jarvis, che ore sono?» con la TV accesa: deve rispondere.
3. Impostazioni → Voce → **Falsi scatti**: cambia "Conferma" a 3, compare
   «Ripristina»; toccalo e torna a 2.
4. Impostazioni → **Jarvis parla per primo**: devono comparire le entità del
   pacchetto coi valori di adesso (annunci acceso, soglia 27, cucina, orari).
   Cambia la soglia a 26: in HA `input_number.jarvis_annuncio_caldo_soglia`
   deve diventare 26; poi «Ripristina».
5. Da HA, Strumenti per sviluppatori → Azioni: `jarvis_voce.annuncia` con
   `stanza: cucina`, `testo: Prova di annuncio`, `ascolta: true`. Sul
   pannello: si apre l'Hub, Jarvis lo dice, poi «Ti ascolto ancora…».
6. Rifai il punto 5 con il pannello a riposo dopo le 23 (o con "solo testo"
   acceso): niente voce, l'annuncio resta scritto sotto l'orologio.

## v0.5.3 (compresa nella v0.5.4)

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
