# Changelog

## v0.5.8

Due correzioni dall'uso reale, i timer coi servizi nuovi del server, la
conferma delle scene.

- **Ascolto dopo la risposta**: «Ti ascolto ancora…» per 8 s solo quando
  Jarvis ha fatto una domanda (`continue_conversation`, o un annuncio che
  aspetta risposta). Dopo un comando eseguito o una risposta chiusa, una
  finestra breve di 2 s **senza scritte**: se continui a parlare la
  conversazione va avanti, se no si chiude subito e torna l'ascolto di
  «Jarvis». Impostazioni → Voce: secondi dopo una domanda (8), dopo
  un'azione (2; 0 = chiude subito), sensibilità del parlato (bassa,
  normale, alta).
- **Errori di Google visibili**: se la trascrizione fallisce
  (`stt-stream-failed`) o Gemini dà errore (sovraccarico, limite di
  richieste) il pannello dice «Google non risponde, riprova tra poco.» e,
  a voce, fa un suono breve (due note che scendono; niente voce). «Non ho
  capito» (nessuna parola riconosciuta) resta silenzioso come prima.
- **Timer dalla schermata con i servizi di jarvis_voce 0.3.0**:
  `timer_stanza` con la stanza del pannello, `timer_comando` per
  **Pausa**, **Riprendi** e **Annulla**. Non passano più da Jarvis e non
  lasciano domande nella chat. Senza la stanza del pannello i pulsanti per
  un timer nuovo sono spenti e la nota dice dove sceglierla. Errori in
  chiaro («Timer non trovato (forse è già finito).», «serve jarvis_voce
  0.3.0 sul server»).
- **Conferma prima delle scene** (Impostazioni → Schermate → Scene,
  spenta di serie): il primo tocco dice «Tocca ancora», il secondo entro
  4 s avvia. Vale nella schermata Scene e nei pulsanti della Casa.
- Layout: il nome lungo di un timer nella Casa non si spezza più a metà
  parola quando la colonna è stretta (il conto scende sotto); i comandi
  dei timer a 320 px vanno sotto il conto.

## v0.5.7

Le altre schermate del mockup: Timer, Clima, Scene, Spesa, Avvisi, e Altro.

- **Colonna come nel mockup N2**: Casa, Musica, Meteo, Timer, Altro, e
  l'Hub in fondo. **Altro** porta a tutte le schermate, alle impostazioni
  (ora si aprono anche da lì, non solo tenendo premuto l'orologio) e all'Hub.
- **Timer**: i timer di questo pannello col conto alla rovescia, e i
  pulsanti per un timer nuovo (1, 3, 5, 10, 15, 30 minuti) e «Annulla».
  Chiedono a Jarvis la stessa frase che si direbbe a voce, così il timer
  suona qui.
- **Clima**: le temperature delle ultime 24 ore di tutte le stanze con un
  termometro, in un grafico solo; le stanze con temperatura, umidità e
  percepita (un tocco apre la stanza); lo scaldabagno col suo programma. I
  consumi compaiono solo se in Home Assistant c'è un sensore di potenza o
  di energia (oggi non c'è).
- **Scene**: Buonanotte, Esco e Rientro partono con un tocco, dalla
  schermata Scene e dai tre pulsanti della Casa (non più «in arrivo»).
  Mentre lo script gira, la scena è evidenziata col suo colore. Le routine
  non si creano dal pannello.
- **Lista della spesa**: quella di Home Assistant (`todo.shopping_list`),
  la stessa che si riempie a voce: aggiungi, segna come presa, togli, togli
  le cose prese. Se cambia da un'altra parte, cambia da sola anche qui.
- **Avvisi ed eventi**: le batterie sotto il 20%, cosa è successo ai
  dispositivi nelle ultime 24 ore (dal registro di Home Assistant:
  accensioni, spegnimenti, modi del condizionatore, e chi li ha chiesti) e
  le volte che Home Assistant non era raggiungibile da questo pannello.
  Filtri: Tutti, Dispositivi, Batterie, Connessione.
- **Impostazioni → Schermate**: ogni schermata nella colonna, solo in
  Altro, o spenta; e cosa mostrano Timer (pulsanti), Clima (ore, consumi),
  Scene (quali e in che ordine), Spesa (quale lista, cose prese) e Avvisi
  (ore, soglia della batteria). Tutto col valore di serie e «Ripristina».

## v0.5.6

Musica.

- **Schermata Musica** (mockup M1), nella colonna tra Casa e Meteo:
  copertina grande, titolo, artisti, dove suona, barra del tempo che scorre,
  precedente / pausa / successivo, volume. Sotto, le **stanze** per spostare
  la musica (quella dove suona è segnata) e le **playlist** di Spotify: un
  tocco la fa partire dove suona già. La stella mette una playlist tra le
  **preferite**, in cima. Tutto dallo stato vero di Spotify
  (`jarvis_musica` 0.4.0); dopo ogni comando lo stato si rilegge.
- **Mini-lettore** nella Casa, sotto l'orologio, **solo mentre suona
  qualcosa**: copertina, titolo, primo artista e stanza, pausa; un tocco
  apre la Musica. Sul tablet fa posto togliendo i giorni del meteo, come i
  timer.
- **Impostazioni → Schermate → Musica**: mini-lettore sì/no, dove (sotto
  l'orologio o nella barra in basso), ogni quanti secondi rileggere (20 di
  serie), stanze per spostare la musica (vuoto = le stanze di HA), togli le
  preferite. Tutto col valore di serie e «Ripristina».
- Lo stato della musica si legge in un solo posto per tutto il pannello
  (schermata, mini-lettore, riposo), solo finché qualcuno la guarda, e
  subito quando Home Assistant si ricollega.

## v0.5.5

Navigazione, schermate Meteo e Stanza.

- **Colonna a sinistra** (mockup N2): Casa, Meteo e in fondo l'Hub. Sul
  telefono in verticale diventa una riga in alto. Ogni schermata ha il suo
  indirizzo (`…/index.html#meteo`), il tasto Indietro di Android torna
  indietro, e dopo 90 secondi senza tocchi si torna alla schermata iniziale.
- **Meteo**: adesso (temperatura, umidità, vento con la direzione, alba e
  tramonto), le prossime 12 ore e i prossimi 5 giorni, con la pioggia solo
  quando c'è. Solo dati veri di `weather.forecast_casa` (e `sun.sun`). Si
  apre dalla colonna o toccando il meteo della casa.
- **Stanza**: si apre toccando il nome di una stanza. Temperatura delle
  ultime 24 ore dal registro di Home Assistant (i buchi restano buchi), poi
  tutti i dispositivi della stanza, comandabili. Dove non c'è un termometro
  (la cucina) il grafico non c'è.
- **Impostazioni → Schermate**: ordine e voci della colonna, schermata
  iniziale, dopo quanto si torna lì; cosa mostra il meteo (ore, giorni,
  umidità, vento e la sua unità, pressione, pioggia, alba e tramonto); ore
  del grafico della stanza e umidità nel grafico. Tutto col valore di serie
  e «Ripristina».

## v0.5.4

Meno falsi scatti con la TV accesa, e Jarvis che parla per primo.

- **Falsi scatti**: in cucina, con la TV del salotto accesa, «Jarvis» era
  partito 10 volte in 13 minuti senza che nessuno parlasse. Ora:
  - la parola deve restare sopra la soglia per **due momenti di fila**
    (160 ms), non uno solo;
  - la **soglia si adatta**: più di 3 scatti senza parole in 10 minuti e
    sale di un passo (lo scrive nel registro); dopo 30 minuti tranquilli
    riscende, mai sotto quella di partenza;
  - la **soglia personale** vale solo quando decide il verificatore della
    pronuncia;
  - **impara dai falsi scatti**: quando scatta e nessuno parla, quel suono
    diventa un esempio di "non è Jarvis" (solo numeri, niente audio) e la
    pronuncia imparata si aggiorna da sola;
  - nel registro, per ogni scatto: punteggio, verificatore e trascrizione.
  Misurato con 20 minuti di "TV" e il modello vero: da 24 a **0 falsi
  scatti all'ora**, «hey jarvis» in mezzo alla TV riconosciuto 23 volte su
  24 (96%).
- **Jarvis parla per primo** (annunci di `jarvis_voce` 0.2.8): l'Hub si apre
  e Jarvis dice l'annuncio con la sua voce; se l'annuncio lo chiede, poi ti
  ascolta 8 secondi senza «Jarvis». Più annunci insieme vanno in coda. Di
  notte e nell'ora del silenzio niente voce: l'annuncio resta scritto sullo
  schermo a riposo finché non lo tocchi.
- **Impostazioni → Jarvis parla per primo**: tutte le scelte del pacchetto
  annunci di Home Assistant (interruttori, soglia del caldo, stanza, orari)
  si vedono e si cambiano dal pannello; in più volume degli annunci e "solo
  testo" per questo pannello.
- **Tutto personalizzabile**, con il valore di serie scritto accanto e il
  tasto «Ripristina»: soglia di scatto, conferma, soglia che si adatta
  (quanti falsi scatti, in quanto tempo, di quanto, dopo quanto riscende),
  impara dai falsi scatti, quanti secondi di riascolto dopo la risposta
  (0 = spento), il discorso di prima (sì/no e quanti secondi).

## v0.5.3

Una persona sempre presente: Jarvis sa di cosa si stava parlando, e dopo la
risposta ti ascolta ancora.

- **Il minuto prima di «Jarvis»**: il pannello tiene in memoria 60 secondi
  (solo in RAM). Quando scatta «Jarvis», oltre alla frase con la parola (come
  la v0.5.2) manda a Home Assistant, con una pipeline a parte, il parlato che
  c'era prima: il server lo fa trascrivere e Gemini risponde sapendo di cosa
  si parlava. Se prima nessuno parlava non si manda niente; se «Jarvis» non
  scatta non esce niente. Nessun errore a schermo se il contesto non arriva:
  la domanda va avanti lo stesso.
- **Conversazione continua**: finita la risposta, il pannello ti ascolta
  ancora per 8 secondi senza bisogno di ridire «Jarvis» («Ti ascolto
  ancora…», con l'anello che respira). La domanda parte verso Home Assistant
  solo se qui si sente parlare, nella stessa conversazione; se nessuno parla
  si chiude in silenzio, senza «Non ho capito». Vale anche dopo una domanda
  fatta col tocco.
- **Reattività**: segnale a schermo subito allo scatto e un «bip» breve
  (disattivabile in Impostazioni → Voce). L'audio tenuto da parte parte
  appena Home Assistant risponde, senza aspettare il pezzo successivo. Nel
  registro, per ogni «Jarvis», i tempi: fine della parola → scatto →
  segnale → risposta di Home Assistant → primo audio inviato.
- **Strada veloce**: insegnando la pronuncia, il pannello calcola una soglia
  di scatto personale dai tuoi esempi (più bassa di quella di serie se la
  tua voce lo permette, mai sotto 0,2 né vicina al parlato normale). Si vede
  in Impostazioni → Voce.
- Il pannello non taglia più la frase prima del server: fino a 30 secondi
  (prima 20).
- Prove con una clip vera di 47 secondi: 40 s di discussione, una pausa, poi
  la frase con «hey jarvis».

## v0.5.2

La frase intera, anche con «Jarvis» alla fine.

- "C'è un po' di freddo in questa stanza, cosa ne pensi, Jarvis?" ora arriva
  **tutta**: il pannello tiene in memoria fino a 10 secondi (solo in RAM, mai
  inviati se la parola non c'è) e allo scatto manda la frase **dal suo
  inizio**, non solo il secondo prima di «Jarvis».
- L'inizio della frase è dopo l'ultima pausa di almeno 1 secondo (la stessa
  soglia di fine frase del server): una pausa vera prima non viene mandata,
  così il server non chiude la frase prima di «Jarvis».
- «Jarvis» alla fine o in mezzo ("Jarvis… accendi la TV"): nessuna attesa né
  errore sul pannello; la fine della frase la decide il server.
- L'Hub mostra la domanda intera: se è lunga, scorre invece di essere tagliata.
- Prove con voci vere (Piper) e il modello vero: frase con «hey jarvis» in
  fondo, in mezzo, e con una pausa di 1,6 s prima.

## v0.5.1

«Jarvis» col microfono vero: strumenti per capire perché non scatta, e
microfono meno elaborato.

- **Impostazioni → Voce → Prova dal vivo** (e in Diagnostica): una barra col
  punteggio più alto degli ultimi 3 secondi, con la linea della soglia, e il
  livello del microfono. Dicendo «Jarvis» si vede subito se la parola arriva.
- **Elaborazione del microfono**: di serie ora solo la cancellazione dell'eco,
  senza riduzione del rumore né volume automatico, che su Android possono
  schiacciare la voce. Si può scegliere anche "nessuna" o "tutta" (come prima).
- **Registro della diagnostica**: frequenza vera dell'audio e impostazioni
  effettive del microfono all'apertura; il punteggio più alto ogni 30 secondi
  nei primi 10 minuti e ogni volta che qualcosa somiglia alla parola, poi ogni
  10 minuti; all'avvio quanti esempi della pronuncia ci sono su questo
  indirizzo.
- La sezione Voce dice che esempi e pronuncia imparata valgono per
  l'indirizzo in uso: se il pannello passa dall'indirizzo veloce a quello di
  riserva (o il contrario), lì vanno insegnati di nuovo.
- Prove nuove col modello vero e una voce vera: «hey jarvis» supera la soglia
  (0,999), anche da un microfono a 48 o 44,1 kHz; il rumore resta sotto 0,01.

## v0.5.0

«Jarvis» sempre in ascolto.

- **Di' «Jarvis» e poi la domanda**, anche nella stessa frase ("Jarvis, spegni
  la TV"). Il pannello riconosce la parola da solo, sul dispositivo; a Home
  Assistant va solo quello che dici dopo, più il secondo prima (tenuto solo in
  memoria). La fine della frase la decide il server (`jarvis_voce`), come
  concordato: nessun `no_vad`.
- **Acceso di serie** su ogni pannello. In alto, accanto a "Connesso" (e
  nell'angolo dello schermo a riposo), c'è sempre il simbolo del microfono
  mentre ascolta; barrato se si è fermato. Si spegne in Impostazioni → Voce.
- Dallo schermo a riposo «Jarvis» apre l'Hub, con domanda e risposta come
  sottotitoli; con la chat aperta risponde nella chat; altrimenti nel riquadro
  piccolo.
- **Timer che suona**: «Jarvis» zittisce subito la suoneria. «Stop», «basta» o
  «ferma» chiudono il timer, anche sugli altri pannelli, senza passare da
  Gemini. Un'altra domanda ha la sua risposta e la suoneria non riparte; il
  riquadro "Timer finito" resta finché non tocchi Stop.
- **Due pannelli vicini** che sentono la stessa «Jarvis»: risponde uno solo
  (Home Assistant scarta il secondo), e l'altro non mostra errori.
- **Impostazioni → Voce** (sezione nuova): interruttore, stato, come sta
  andando (tempo di calcolo, quante volte ha sentito la parola), e **"Insegna
  a Jarvis la tua pronuncia"**: 20 volte «Jarvis» come lo dici tu, 60 secondi
  di parlato normale, poi «Impara la pronuncia». Tutto resta sul pannello.
- La procedura guidata del primo avvio chiede anche se «Jarvis» deve essere
  sempre in ascolto.
- Il riconoscimento della parola (circa 17 MB) si scarica una volta sola, in
  una memoria a parte: gli aggiornamenti successivi riscaricano solo ciò che
  cambia. Il pannello si apre veloce come prima.
- Tolta la pagina di prova `prova-ehi-jarvis.html`: tutto quello che serviva
  ora è nel pannello.
- Il microfono è uno solo per «Jarvis» e per il tocco sul microfono.

## v0.4.8

Fase G: schermo a riposo con la sfera, Hub vocale, impostazioni nuove e
procedura guidata al primo avvio.

- **Schermo a riposo** (variante C): dopo 2 minuti senza tocchi il pannello
  mostra una sfera che respira, con accanto ora, data, meteo, temperature delle
  stanze e cosa suona (da `jarvis_musica`). I timer compaiono come anelli
  attorno alla sfera e come pastiglie col conto alla rovescia; un timer in
  pausa resta fermo. Un tocco fuori dalla sfera torna al pannello. Il riposo
  cambia solo la vista: timer, voce e musica restano accesi.
- **Di notte** (di serie dalle 23 alle 7) a riposo restano solo ora e timer,
  con la sfera ferma e fioca. Il contenuto si sposta di pochi pixel ogni minuto
  per non segnare lo schermo.
- Il pannello **non va a riposo** mentre la chat, le impostazioni o la guida
  sono aperte, né mentre Jarvis ascolta o risponde.
- **"Timer finito"** compare come riquadro al centro con Stop grande, sopra il
  riposo; di notte in rosso scuro.
- **Hub**: toccando la sfera Jarvis ascolta subito. Domanda e risposta
  compaiono come sottotitoli sotto la sfera; in alto ora, stanza, timer e il
  tasto griglia per il pannello completo. Dopo 30 s senza attività torna a
  riposo.
- **Impostazioni** (tieni premuto l'orologio 3 s, senza PIN): elenco a sezioni
  come su Android. Stanza del pannello, schermo a riposo (dopo 1/2/5/10 minuti
  o mai, orari della notte, "Metti a riposo" per provarlo subito), audio
  sveglio, diagnostica. Esc e "Indietro" di Android le chiudono.
- **Procedura guidata** al primo avvio, per i pannelli nuovi: stanza e schermo
  a riposo, poi un riepilogo. I pannelli già installati (stanza già scelta) non
  la vedono. Si rifà dalle impostazioni, sezione "Stanza".
- Nessuna modifica lato server: usa solo `jarvis_timer` (con `in_pausa`),
  `timer_attivi` e `jarvis_musica.stato`.

## v0.4.7

Timer in pausa, e nome della stanza calcolato esattamente come il server.

- Un timer messo in pausa a voce si ferma anche sul pannello, con la scritta
  "in pausa", e riparte da lì quando lo riprendi. Prima continuava a scorrere e
  poi spariva. Serve `jarvis_voce` 0.2.3 lato server.
- Il nome con cui il pannello si presenta ai timer (`jarvis_<stanza>`) ora si
  calcola con la stessa regola del server anche per nomi di stanza con simboli
  particolari (per esempio "Stanza ½"). Per le stanze di casa non cambia niente.
- Lato Home Assistant: `jarvis_musica` 0.4.0 (già installato dal server) dà
  anche copertina, punto del brano, durata e l'elenco delle playlist, per la
  futura schermata Musica.

## v0.4.6

Il timer suona solo sul pannello da cui l'hai chiesto.

- Ogni pannello dice a Home Assistant chi è ("jarvis_cucina",
  "jarvis_camera_da_letto"…), in base alla stanza scelta in diagnostica.
  Vale per la voce e per la chat.
- Un timer suona e compare solo sul pannello a cui appartiene: quello da cui
  l'hai chiesto, oppure quello della stanza che hai detto ("metti un timer in
  camera da letto").
- Stop su un pannello ferma anche gli altri che suonano per lo stesso timer.
- Quando il pannello si ricollega a Home Assistant, rilegge i timer in corso:
  quelli partiti mentre era scollegato compaiono lo stesso.
- In diagnostica, sotto "Stanza": con che nome il pannello si presenta ai
  timer, oppure l'avviso "Scegli la stanza per i timer".
- Serve `jarvis_voce` 0.1.8 lato server.

## v0.4.5

Timer che suonano sul pannello, pulsante del microfono mai bloccato, tastiera
della chat più comoda, Echo in Bluetooth sempre sveglio.

- **Timer**: quelli creati a voce ("metti un timer di 10 minuti per la pasta")
  compaiono sotto l'orologio col conto alla rovescia. Quando finiscono il
  pannello suona a ripetizione e mostra "Timer pasta finito" con un grande
  tasto Stop. Si ferma con Stop o da sola dopo 2 minuti. Con più pannelli
  suonano tutti. Servono i timer di `jarvis_voce` (lato server, evento
  `jarvis_timer`).
- Sul tablet, con timer attivi, le previsioni dei prossimi giorni lasciano il
  posto ai timer; se sono più di tre compare "+N".
- La ricarica di sicurezza delle 04:00 aspetta se c'è un timer in corso.
- **Pulsante del microfono**: mentre Jarvis pensa ora si può toccare per
  annullare la domanda (prima restava bloccato fino a un minuto). Se la
  risposta non arriva entro 30 s, o il microfono non si apre entro 10 s, il
  pulsante torna attivo con un messaggio.
- Quando lo stream audio verso il riconoscimento si interrompe, Jarvis dice
  "Non ho capito, puoi ripetere?" invece di un errore generico. Lo stesso
  messaggio vale quando non riconosce nessuna parola.
- **Tastiera della chat**: un tocco fuori dal campo chiude la tastiera, e la
  chat resta aperta. "Indietro" di Android chiude prima la tastiera, poi la
  chat, e non esce più dall'app. Sul tablet, dopo l'invio la tastiera si
  chiude e si vede la risposta.
- **Audio sveglio**: il pannello fa suonare di continuo un rumore che non si
  sente (-80 dB), così l'Echo in Bluetooth non annuncia più "In riproduzione
  da…" prima di ogni risposta. È acceso di serie e si spegne in diagnostica
  ("Audio sveglio"). Se il sistema lo sospende, lo scrive nel log.

## v0.4.4

Musica in pausa mentre Jarvis ascolta e parla, e il pannello non torna più a
una versione vecchia.

- Quando parli con Jarvis, la musica di Spotify della stanza del pannello si
  mette in pausa subito, e riparte allo stesso volume appena Jarvis ha finito.
  Vale anche con un errore, o se Jarvis non ha capito. Con più domande di fila
  riparte solo dopo l'ultima.
- Non riparte se l'avevi già messa in pausa tu, né se hai chiesto proprio a
  Jarvis di fermarla ("metti in pausa la musica").
- Nuova impostazione nella diagnostica: "Stanza" di questo pannello. Senza
  stanza il pannello non tocca mai la musica. La musica su "Tutta la casa" si
  ferma da qualunque pannello che ha una stanza.
- Se la musica non risponde, la voce funziona lo stesso; l'errore va solo nel
  log.
- All'apertura, se c'è una versione nuova già scaricata e nessuno ha ancora
  toccato lo schermo, si applica subito. Prima di passare al link veloce, il
  link di sempre applica la sua versione in attesa. Così il pannello non si
  riapre più su una versione vecchia.
- Diagnostica: nuova riga "Sul server" con la versione presente sul server. Sul
  telefono ora si legge bene: due colonne e sfondo pieno.

## v0.4.3

"Ehi Jarvis": il telefono impara la vostra pronuncia (solo nella pagina di
prova, il pannello non cambia).

- Nuova sezione "La tua pronuncia". Registrazione guidata: circa 30 «Jarvis» a
  testa, con l'invito "adesso" sullo schermo, più un po' di parlato normale o
  TV. Poi "Addestra il verificatore", in pochi secondi sul telefono.
- È il verificatore personale di openWakeWord, rifatto per il telefono. Il
  modello di base resta, e quando sente qualcosa di simile decide il
  verificatore. Numeri identici a quelli dell'originale (scikit-learn).
- La soglia base si imposta da sola sui vostri esempi.
- Tutto resta sul telefono: esempi e verificatore sono nel browser, niente
  viene inviato. Del parlato normale non si tiene l'audio. Si può riascoltare
  e cancellare tutto.
- "Esporta" e "Importa" portano il verificatore su un altro telefono di casa
  (solo numeri, niente voce).
- Le serie e i falsi positivi dicono se il verificatore era acceso: il
  confronto prima/dopo esce dai risultati da copiare.
- `parola.json` (facoltativo, fuori dallo zip) cambia modello, soglie e
  verificatore condiviso senza una nuova release.

## v0.4.2

Link veloce automatico, con il link di sempre come riserva.

- Si continua ad aprire solo `https://casa.tail8392c1.ts.net/local/jarvis/index.html`.
  All'avvio il pannello prova per 1,5 s l'indirizzo veloce
  (`https://jarvis-rosone.duckdns.org:8443`) e, se risponde, ci passa da solo
  con la stessa pagina. Se non risponde resta dov'è e funziona come prima:
  niente attese, niente pagina bianca.
- Lo stesso per la pagina di prova "Ehi Jarvis", che ora si apre veloce anche
  dal link di sempre.
- Sull'indirizzo veloce il login si fa una volta ("Accedi").
- Un solo passaggio per sessione, niente giri avanti e indietro.
- Se sull'indirizzo veloce Home Assistant manca da 30 s e il link di riserva
  risponde, il banner propone "Torna al link di riserva".
- Ogni indirizzo ha la sua cache offline.
- Diagnostica: nuova riga "Origine in uso" (veloce / di riserva), con il motivo.

## v0.4.1

Prova di fattibilità di "Ehi Jarvis" (non è ancora la funzione).

- Nuova pagina separata `prova-ehi-jarvis.html`, da aprire a mano sul telefono
  (`…/local/jarvis/prova-ehi-jarvis.html`, indirizzo https). Riconosce la parola
  sul telefono, senza mandare audio a Home Assistant, e misura: punteggio in
  tempo reale con soglia regolabile, attivazioni, tempo di calcolo per frame,
  serie da 20 a 1 m e a 3 m ("Ehi Jarvis", "Jarvis" da solo, "Jarvis" in una
  frase), falsi positivi con la TV accesa, batteria. Risultati da copiare.
- Memoria circolare degli ultimi secondi (regolabile) solo in memoria, con
  "Ascolta l'ultimo scatto" per sentire cosa verrebbe inviato; indicatore rosso
  sempre visibile mentre il microfono ascolta.
- Il pannello non cambia. Il service worker ora lascia passare le pagine che non
  sono il pannello.
- Modello openWakeWord "hey_jarvis": licenza non commerciale (va bene per casa e
  case pilota, non per un servizio a pagamento).

## v0.4.0

Fase F5: voce "tocca per parlare".

- Microfono nella chat e nella barra. Con la chat aperta si parla nella chat;
  con la chat chiusa compare un riquadro piccolo con quello che hai detto e la
  risposta (toccandolo si apre la chat; sparisce da solo dopo qualche secondo).
- Bip leggero quando il microfono si apre e si chiude. Home Assistant capisce da
  solo quando hai finito di parlare; puoi anche toccare "ferma".
- La risposta si legge e si sente. L'audio parte subito, anche per i comandi
  che HA risolve da solo. Se l'altoparlante (anche Bluetooth) si scollega a
  metà, il pannello va avanti e il testo resta.
- Seguito come un Echo: se Jarvis fa una domanda, il microfono si riapre da solo.
- Errori in italiano: microfono non consentito (con cosa toccare), serve
  l'indirizzo https, microfono occupato o assente, non ho sentito niente,
  Gemini al limite o occupato, connessione persa a metà.
- Nessuna modifica al pacchetto HA.

## v0.3.2

- Errori di Gemini in italiano: quando Gemini ha raggiunto il limite di
  richieste (429) o è occupato (503) la chat lo dice con parole semplici e
  propone di riprovare tra un minuto. Quando Home Assistant non dice la causa,
  il messaggio copre entrambe. Mai più testo tecnico in inglese a schermo; il
  dettaglio resta nel log della diagnostica.
- **Pacchetto HA**: nuovo `script.jarvis_previsioni`, che dà a Gemini le
  previsioni del tempo (5 giorni o 12 ore). Va copiato il nuovo `jarvis.yaml`,
  ricaricati gli script ed **esposto ad Assist** lo script.

## v0.3.1

Correzione dalla prova vera della F2 (condizionatore).

- Il condizionatore a infrarossi mostrava "Ultimo comando: Ventola · 21°", ma
  quello era lo stato iniziale che Home Assistant assume all'avvio: nessun
  comando era mai partito. Ora la card dice "Nessun comando inviato", senza
  modalità evidenziata né temperatura, finché un comando non va a buon fine
  (dal pannello, da HA, dall'assistente o da un'automazione). Lo si legge dallo
  stato in HA, quindi tutti i pannelli vedono la stessa cosa.
- Un comando rifiutato da HA (come succede col condizionatore "DIY" di
  SwitchBot) non cambia questa scritta: torna allo stato vero con l'avviso,
  come prima.
- Corretto come si leggono le informazioni su chi ha cambiato uno stato
  quando HA le manda solo in parte.

## v0.3.0

Fase F4: assistente testuale.

- "Chiedi a Jarvis…" funziona: si apre la chat con Gemini (la pipeline Assist
  predefinita di HA, in italiano). Sul tablet prende il posto delle stanze,
  orologio, meteo e scene restano in vista; sul telefono è a tutto schermo.
- La risposta compare mentre Gemini la scrive; "Sto pensando…" finché non
  arriva niente, "ci sta mettendo più del solito" dopo 15 s, errore dopo 60 s.
- Quando Gemini esegue un comando compare un'etichetta con lo stato vero preso
  da HA (es. "TV Salotto · spenta"); le card si aggiornano da sole.
- Il contesto resta tra una domanda e l'altra; dopo 5 minuti senza messaggi (il
  limite di HA) la chat riparte vuota. Pulsante "Nuova conversazione".
- Offline: barra e campo disattivati con spiegazione, nessuna risposta finta.
  Se la connessione cade a metà risposta: errore chiaro, la domanda resta e si
  rimanda con un tocco; non viene mai rimandata da sola.
- Errori di Gemini: messaggio chiaro e "Riprova". Tutti gli errori nel log
  della diagnostica.
- La chat si chiude da sola dopo 60 s senza tocchi; la tastiera virtuale non
  copre il campo.
- Nessuna modifica al pacchetto HA.

## v0.2.2

Correzione di layout della v0.2.1.

- Sui telefoni in orizzontale i nomi delle card andavano a capo a metà parola
  («Scaldabagn|o»). Ora vanno a capo solo tra una parola e l'altra: se non c'è
  posto scendono i pulsanti, non le lettere.
- La prova di layout controlla anche le parole spezzate, a tutte e 6 le misure.

## v0.2.1

Solo layout, nessuna funzione nuova: il pannello non si sovrappone più a
nessuna misura da 320 px di larghezza in su.

- Tablet 1024×600: invariato, schermata unica come il mockup.
- Telefono in orizzontale e schermi bassi: due colonne compatte e la pagina
  scorre. Telefono in verticale: una colonna, la pagina scorre. La barra
  "Chiedi a Jarvis…" non è più fissa sopra le stanze (copriva i pulsanti).
- Offline: sui telefoni il banner sta in cima alla pagina; sul tablet prende il
  posto della barra come prima. Il "non aggiornato" delle stanze si vede dal
  clima in arancione, senza la riga in più che allungava la Camera.
- Card: nomi lunghi vanno a capo invece di essere tagliati, i pulsanti vanno a
  capo se non c'è posto; sui telefoni in orizzontale nome e stato stanno accanto
  ai pulsanti e le spiegazioni lunghe si nascondono.
- Nuova prova di layout a 6 misure (1024×600, 915×412, 915×330, 412×915,
  360×740, 320×640), con la TV accesa e poi offline.

## v0.2.0

Fase F2: stanze e comandi dei dispositivi.

- Stanze e dispositivi letti dai registri di Home Assistant: una card per
  dispositivo, stanze nell'ordine del mockup, Cucina nascosta finché è vuota. Un
  dispositivo nuovo in HA compare da solo, senza ricaricare.
- Condizionatore (infrarossi): ultimo comando inviato, 4 modalità + "Altro"
  (Deumidifica, Auto), temperatura −/+ con un solo invio.
- TV del salotto: accendi/spegni con conferma dallo stato vero, volume e muto.
- TV della camera (infrarossi): un solo "Tasto accensione", mai un finto stato.
- Scaldabagno: acceso/spento con conferma e lo stato del programma ("Inverno
  attivo · 2 gg nuvolosi · Si spegne alle 00:00"), dal pacchetto HA.
- Comandi: feedback immediato, conferma dal dispositivo, ritorno allo stato vero
  con avviso se HA rifiuta o il dispositivo non conferma; offline disattivati.
- Pacchetto HA: nuovo `sensor.jarvis_scaldabagno_prossimo_cambio` e macro
  `custom_templates/jarvis.jinja` (da installare anche lei).

## v0.1.2

Solo layout, nessuna funzione nuova: la pagina torna alla struttura del mockup
approvato (`docs/mockup.html`), così le fasi successive riempiono zone già pronte.

- Sinistra: orologio, meteo con previsione, sotto le 3 scene (Buonanotte, Esco,
  Rientro). Destra: le stanze tutte insieme, Soggiorno e Veranda sopra, Camera
  sotto; il pallino di connessione in alto a destra. In basso, a tutta
  larghezza, la barra "Chiedi a Jarvis…" con il microfono.
- Il clima (temperatura · umidità · percepita) passa nell'intestazione di ogni
  stanza, al posto dei due grandi riquadri.
- Scene, comandi dei dispositivi e assistente sono al loro posto ma dichiarati
  "in arrivo" (F2, F3, F4, F5), bordo tratteggiato e niente di toccabile.
- Il banner offline sta sopra la barra dell'assistente (inattiva senza HA),
  non sopra orologio o stanze.
- Diagnostica: "Aggiornamento app" mostra anche "in download…" mentre la
  versione nuova si sta scaricando (sull'HTTPS richiede qualche secondo).
- Nuova prova e2e che simula il tablet: versione nuova sul server, ricarica
  sull'indirizzo lento, diagnostica aperta subito → deve arrivare a "pronto".

## v0.1.1

Correzione bloccante trovata sul tablet vero.

- Con Home Assistant vero il pannello risultava "Connesso" ma tutte le entità
  "non trovato". HA raggruppa in un solo pacchetto la conferma dell'iscrizione
  e la foto completa degli stati; il pannello riarmava il segnale "il prossimo
  messaggio è la foto completa" DOPO averla già ricevuta, e il primo piccolo
  aggiornamento cancellava tutte le altre entità. Ora il segnale si arma solo
  quando l'iscrizione viene (ri)mandata.
- Il finto Home Assistant delle prove ora raggruppa i messaggi come quello vero
  e manda i cambi come differenze: le prove riproducevano il bug prima della
  correzione e passano dopo.
- Diagnostica: il numero di "entità ricevute" è verificato dalle prove.

## v0.1.0

Prima versione (fase F1).

- Scheletro PWA: manifest, icone, service worker che mette in cache tutta l'app
  (si apre all'istante anche sull'indirizzo HTTPS lento o con HA spento).
  Aggiornamenti controllati: si applicano con la ricarica notturna delle 04:00.
- Connessione a Home Assistant: login OAuth (nessun token nel codice), entità
  in push, riconnessione automatica con attese crescenti e casuali, ping ogni
  30 s che scopre i collegamenti morti, risincronizzazione completa dopo ogni
  riconnessione (niente entità "fantasma").
- Stato offline esplicito: pallino sempre visibile, banner e valori "non
  aggiornati" dopo 10 s senza HA.
- Orologio, data, meteo attuale e previsione a 4 giorni da `weather.forecast_casa`.
- Clima interno di Soggiorno e Camera: temperatura, umidità, percepita.
- Schermata diagnostica (orologio tenuto premuto 3 s): versione, indirizzo,
  stato, latenza WebSocket, riconnessioni, log degli errori.
- Ricarica di sicurezza alle 04:00 se il pannello non è in uso.
