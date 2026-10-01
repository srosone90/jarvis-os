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
| Origine veloce con ripiego sul link di riserva | **v0.4.2** |
| Musica in pausa mentre Jarvis ascolta e parla; mai più una versione vecchia | **v0.4.4** |
| Timer che suonano, pulsante del microfono mai bloccato, tastiera della chat, audio sveglio per il Bluetooth | **v0.4.5** |
| Timer solo sul pannello a cui appartengono, Stop che ferma tutti | **v0.4.6** |
| Timer in pausa fermi, stanza calcolata come il server | **v0.4.7** |
| Fase G: schermo a riposo con la sfera, Hub vocale, impostazioni a sezioni, procedura guidata al primo avvio | **v0.4.8** |
| «Jarvis» sempre in ascolto, stop della suoneria a voce, pronuncia di casa | **v0.5.0** |
| «Jarvis»: prova dal vivo, microfono meno elaborato, prove con audio vero | **v0.5.1** |
| «Jarvis»: la frase intera, anche con la parola alla fine | **v0.5.2** |
| «Jarvis»: il minuto prima come contesto, conversazione continua, bip e soglia personale | **v0.5.3** |
| Navigazione laterale e schermate Stanza, Meteo, poi Musica | Prossima |
| G — gestione dispositivi (stanze, card universali, preferenze in HA) | Da fare |
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

**Due indirizzi, uno da ricordare.** Si apre sempre
`https://casa.tail8392c1.ts.net/local/jarvis/index.html` (origine di riserva:
sempre su, ma sui dati va a ~30 KB/s). All'avvio il pannello prova per 1,5 s
l'origine veloce `https://jarvis-rosone.duckdns.org:8443` (nginx + DuckDNS +
Let's Encrypt sull'app Tailscale del telefono server) e, se risponde, ci passa
da solo con la stessa pagina. Se non risponde resta sul link di riserva e
funziona come sempre. Sulla veloce il login va fatto una volta ("Accedi"). Se lì
Home Assistant manca da 30 s e la riserva risponde, il banner propone "Torna al
link di riserva". Al massimo un passaggio per sessione, quindi niente giri
avanti e indietro. Serve che nginx risponda su `/local/jarvis/*` con
`Access-Control-Allow-Origin: https://casa.tail8392c1.ts.net`. La diagnostica
dice quale origine è in uso e perché. Le origini, per ora, stanno in
`src/configurazione.ts`.

**«Jarvis» sempre in ascolto** (v0.5.0): la prima volta il pannello scarica il
riconoscimento della parola (cartella `parola/` dello zip, circa 17 MB) e lo
tiene in una memoria a parte del browser: gli aggiornamenti successivi
riscaricano solo ciò che cambia. Il microfono funziona solo sull'indirizzo
https. Chi vuole un altro modello o una soglia diversa mette un `parola.json`
accanto a `index.html` (esempio in `src/parola/impostazioni.ts`): non è nello
zip, quindi un aggiornamento non lo tocca.

**Il minuto prima e la conversazione continua** (v0.5.3): il pannello tiene
in memoria, solo in RAM, l'ultimo minuto. Il minuto prima parte SOLO quando
scatta «Jarvis», e solo verso il nostro Home Assistant (che lo manda a Gemini
per trascriverlo), con una pipeline a parte (`device_id` `<pannello>__contesto`,
`no_vad`). Dopo ogni risposta il pannello ascolta ancora 8 secondi senza
«Jarvis»: se nessuno parla si chiude, e verso Home Assistant non è partito
niente. Serve `jarvis_voce` 0.2.7 lato server.

**La vostra pronuncia (verificatore, v0.4.3)**. Il modello di base riconosce
«Giarvìs» all'inglese, non «Giàrvis». Nella sezione "La tua pronuncia" della
pagina di prova:

1. scrivi chi parla e tocca "Registra «…»". Quando lo schermo diventa verde
   ("adesso"), di' la parola con la voce normale, 30 volte. Ripeti per ogni
   persona di casa;
2. "Registra parlato normale": 2 minuti in cui parlate tra voi senza dire la
   parola, oppure con la TV accesa;
3. "Addestra il verificatore". Dura pochi secondi, sul telefono. La soglia base
   si imposta da sola sui vostri esempi;
4. rifai le serie e il conteggio dei falsi positivi con "Usa il verificatore"
   acceso e spento: nei risultati ogni riga dice se era acceso.

Tutto resta sul telefono: IndexedDB del browser, nessun invio. Del parlato
normale non si tiene l'audio. "Esporta" salva solo i numeri del verificatore,
per importarli su un altro telefono di casa.

**`parola.json` (facoltativo)**. È un file accanto alla pagina, in
`/config/www/jarvis/parola.json`, e non sta nello zip, quindi gli aggiornamenti
non lo toccano. Cambia modello, soglie e verificatore condiviso senza una nuova
release:

```json
{
  "modello": { "id": "jarvis_it_v1", "url": "./modelli-casa/jarvis_it_v1.onnx",
               "parola": "Jarvis", "licenza": "…", "commerciale": false },
  "soglia": 0.5,
  "sogliaBase": 0.05,
  "verificatore": "./modelli-casa/verificatore-casa.json"
}
```

Tutte le chiavi sono facoltative. Se il file è scritto male la pagina lo dice
nel registro e usa i valori predefiniti.

**Musica in pausa durante la voce (v0.4.4)**. Su ogni pannello, una volta:
tieni premuto l'orologio 3 s e in "Stanza" scegli dove sta il pannello (per
esempio Cucina). Da lì in poi, quando parli con Jarvis, la musica di quella
stanza (o di "Tutta la casa") si ferma e poi riparte da sola allo stesso volume.
Senza stanza la musica non si tocca. Serve `jarvis_musica` installato in Home
Assistant (vedi `home-assistant/README.md`).

**Timer (v0.4.5)**. I timer creati a voce li gestisce `jarvis_voce` sul
server, che manda l'evento `jarvis_timer`. Il pannello li mostra sotto
l'orologio col conto alla rovescia. Quando uno finisce, suona a ripetizione e
mostra "Timer … finito" con un grande Stop; dopo 2 minuti si ferma da solo.
Dalla v0.4.6 (con `jarvis_voce` 0.1.8) il timer suona solo sul pannello da
cui l'hai chiesto, o su quello della stanza che hai detto ("metti un timer in
camera da letto"). Per questo ogni pannello deve avere la sua **Stanza** in
diagnostica: il pannello si presenta come `jarvis_<stanza>`. Stop su un
pannello ferma anche gli altri che suonano per lo stesso timer.
Chrome non fa suonare una pagina mai toccata: se il pannello è stato appena
aperto e nessuno l'ha toccato, suona al primo tocco (l'avviso compare
comunque).

**Audio sveglio (v0.4.5)**. Se il tablet esce da un Echo in Bluetooth, il
pannello fa suonare di continuo un rumore che non si sente (-80 dB). Così
l'Echo non si addormenta e non annuncia "In riproduzione da…" prima di ogni
risposta. È acceso di serie; si spegne in diagnostica, alla voce "Audio
sveglio".

**Aggiornare**: si scompatta il nuovo zip sopra il vecchio. Il pannello scarica la
versione nuova da solo, entro 6 ore o alla prima ricarica, e la applica alla
ricarica delle 04:00. Si può anche applicare subito dalla diagnostica, tenendo
premuto l'orologio 3 s e poi "Aggiorna ora". Dalla v0.4.4, se all'apertura c'è
già una versione nuova scaricata e nessuno ha toccato lo schermo, si applica
subito. La diagnostica dice la versione in uso e quella sul server.

## Sviluppo

```bash
npm ci
npm run verifica   # lint, typecheck, unit test, build, prove e2e contro un finto HA
```

Architettura, decisioni e convenzioni sono in [`CLAUDE.md`](CLAUDE.md).
