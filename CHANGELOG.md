# Changelog

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
