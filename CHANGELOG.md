# Changelog

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
