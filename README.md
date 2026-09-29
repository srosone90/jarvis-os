# Jarvis OS

Pannello domotico a muro (PWA) per Home Assistant, pensato per un tablet 8" in
orizzontale acceso 24/7.

## Stato

| Parte | Stato |
|---|---|
| Pacchetto Home Assistant (scaldabagno, scene, presenza, batterie) | Pronto e provato: [`home-assistant/`](home-assistant/README.md) |
| F1 — scheletro PWA, connessione, orologio e meteo, clima stanze, diagnostica | v0.1.2 |
| F2 — stanze e comandi dei dispositivi | **v0.2.2** (layout per tutte le misure) |
| F4 — assistente testuale (Gemini) | **v0.3.2** |
| F5 — voce "tocca per parlare" | **v0.4.0** |
| G — gestione dispositivi (stanze, card universali, preferenze in HA) | Dopo la F5 |
| Modalità Hub — telefoni-pannello solo vocali, passaggio Hub ↔ completo | Dopo la G |
| F3, F6 — scene, modalità notte e rifiniture | Da fare |

## Installazione sul server (Home Assistant)

1. Scarica `jarvis-dist.zip` dall'[ultima release](https://github.com/srosone90/jarvis-os/releases/latest).
2. Scompatta il **contenuto** dello zip in `/config/www/jarvis/`, così che esista
   `/config/www/jarvis/index.html`. Se la cartella `www` non esisteva, HA va
   riavviato una volta perché la veda.
3. Apri **`<indirizzo di HA>/local/jarvis/index.html`**, con `index.html` nel
   percorso: HA non serve l'indice della cartella, quindi `/local/jarvis/` da solo
   dà errore 403.
4. Tocca **Accedi**, entra con l'utente di HA e il pannello si collega. Il login si
   fa una volta per indirizzo.

Non serve configurare niente in HA: l'app sta sulla stessa origine, quindi niente
CORS, e usa il login OAuth standard. Il microfono (dalla F5) funziona solo
sull'indirizzo **HTTPS**.

**Aggiornare**: si scompatta il nuovo zip sopra il vecchio. Il pannello scarica la
versione nuova da solo, entro 6 ore o alla prima ricarica, e la applica alla
ricarica delle 04:00. Si può anche applicare subito dalla diagnostica, tenendo
premuto l'orologio 3 s e poi "Aggiorna ora".

## Sviluppo

```bash
npm ci
npm run verifica   # lint, typecheck, unit test, build, prove e2e contro un finto HA
```

Architettura, decisioni e convenzioni sono in [`CLAUDE.md`](CLAUDE.md).
