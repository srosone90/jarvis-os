# STATO — per la sessione server

Aggiornato da Claude Code a ogni passo importante (commit e push sul branch
`claude/new-session-vpjgbq`). La sessione server lo legge da GitHub; le
risposte arrivano tramite Salvatore.

_Ultimo aggiornamento: 01/10/2026 — v0.5.7 (Timer, Clima, Scene, Spesa, Avvisi). Piano autonomo in corso._

## Piano autonomo del 01/10 — avanzamento

| Punto | Versione | Stato |
|---|---|---|
| 2. Falsi scatti con la TV + annunci | v0.5.4 | **fatto** (sotto) |
| 3. Navigazione N2 + Stanza + Meteo | v0.5.5 | **fatto** |
| 4. Musica | v0.5.6 | **fatto** |
| 5. Timer, Clima, Scene, Spesa, Avvisi | v0.5.7 | **fatto** |
| 6. Giro della personalizzazione + esporta/importa | v0.5.8 | da fare |
| 7. Fotocamera | v0.6.0 | da fare |
| 8. Modello su misura | — | da fare |

## Scelte fatte da Code, da confermare

Ogni riga: cosa, perché, dove si cambia.

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
- **Riascolto dopo un annuncio con `ascolta=true`**: gli stessi secondi del
  riascolto dopo le risposte (8 di serie). Impostazioni → Voce → Ti ascolto
  ancora.

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
- **Timer nuovi e annullati passando da Jarvis** (la frase di voce): il
  server non ha un servizio per farlo. Il turno resta nella chat. Pulsanti
  di serie: 1, 3, 5, 10, 15, 30 minuti. Impostazioni → Schermate → Timer.
- **Scene attive anche nella Casa** (prima «in arrivo»): le prime 3
  dell'elenco, con un tocco e senza conferma, come nel mockup. Si dice
  «avviata»: cosa fa davvero lo script si vede nelle card.
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

## Punti bloccati e cosa serve

- **«Jarvis, apri il meteo»** (dal mockup N2): oggi la frase va a Gemini, e
  il pannello non sa che deve cambiare schermata. Serve uno di questi due:
  (a) lato server, `jarvis_voce` manda un evento `jarvis_apri {pannello,
  schermata}` quando Gemini usa uno strumento "apri"; (b) lato pannello,
  riconoscere la frase dal testo trascritto prima di Gemini, come «stop» col
  timer (ma solo mentre si ascolta, e con il rischio di non mandare a
  Gemini domande vere). **Proposta: (a)**, più pulita. Fatto al posto: tocco
  sul meteo e sul nome della stanza, e `#meteo` nell'indirizzo.

- **Timer**: `jarvis_voce.timer_avvia {minuti, nome?, pannello}` e
  `jarvis_voce.timer_annulla {id}`. Con questi i pulsanti della schermata
  Timer non passerebbero da Gemini.
- **Sveglie e promemoria**: la parte della schermata Timer si accende
  quando il server li avrà.

## Personalizzabile (elenco che cresce a ogni versione)

- **Voce** (pannello): «Jarvis» acceso; bip allo scatto; secondi di
  riascolto (0 = spento); discorso di prima sì/no e quanti secondi; soglia
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
  Scene: quali e in che ordine (le prime 3 anche in Casa); Spesa: quale
  lista, cose prese; Avvisi: ore, soglia della batteria.
- **Musica** (pannello): mini-lettore sì/no, dove (orologio o barra),
  rilettura ogni N secondi, stanze per spostarla, playlist preferite (la
  stella; «Togli le preferite»).
- **Schermo a riposo**: attesa, notte dalle/alle. **Audio**: audio sveglio.
  **Stanza** del pannello.

## Adesso

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
| Versione | **v0.5.7**: Timer, Clima, Scene, Spesa, Avvisi, Altro |
| Link | https://github.com/srosone90/jarvis-os/releases/tag/v0.5.7 |
| sha256 dello zip | _in arrivo dopo la release_ |
| Precedente | v0.5.6, sha256 `00c61e2ba43304f21e8b4af1d4d236f8afe536530de556ab93a3c2eee93fcda6` (6,9 MB, service worker 0.5.6, `parola/` con 5 file, nessun file delle prove; verificati). La prima release della v0.5.6 era caduta in CI su 3 prove degli annunci che dipendevano dall'ora (vedi CLAUDE.md); ripubblicata dopo la correzione (commit `d39777b`) |

## Da installare lato server: v0.5.7

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
