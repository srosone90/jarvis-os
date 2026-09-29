# Changelog

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
