# Jarvis OS — resoconto del piano finale (02/10/2026)

Per Salvatore, in parole semplici. Il piano finale è eseguito dall'inizio alla
fine; qui trovi, per ogni parte, cosa funziona, cosa manca, la release da
installare e come provarla sul pannello. In fondo: i moduli, i comandi di
prova, il controllo del codice, le istruzioni di Jarvis, le scelte da
confermare e gli errori.

## Le release di oggi

| Versione | Cosa | sha256 dello zip (verificato, uguale a quello di GitHub) |
|---|---|---|
| v0.5.10 | Personalizzazione completa, esporta/importa | `08afdd1a33babcfd195539e2027dff12b16f42fe5ffd5b6e06e80ed4ec9973ad` |
| v0.6.0 | Fotocamera: presenza, «Jarvis» più facile da vicino, guarda e parla | `196ba4e9d8b827f93b31247a18f2eb6f5f9d581658d721ae6a4135a9843e5e2f` |
| v0.6.1 | Riordino, blocco 1 (nessun cambiamento visibile) | `a3f383df630f53a67ba17a1aba10930dbd2723af1927d8d4c3729e13b9889970` |
| v0.6.2 | **Timer a tutto schermo** | `b27b87d9257d31280b24f84da75d6a2935c02702597cafea8339482e1e26520d` |
| v0.6.3 | Riordino, blocco 2 | **non pubblicata** (vedi «Errori») — tutto il suo codice è nella v0.6.4 |
| **v0.6.4** | Riordino, blocco 3 — **l'ultima: è quella da installare** | `ffeee604973ee42ef384d86ff1951b33d5b92704b210c6911a0042a465f36c8c` |

Ogni zip è stato scaricato e controllato: sha uguale al digest di GitHub,
versione giusta nel service worker, 8 file in `parola/` (motore di «Jarvis» e
modello del volto), nessun file delle prove.

**Da installare lato server** (lo fa la sessione server):

1. lo zip della **v0.6.4** sopra `/config/www/jarvis/`;
2. il pacchetto `home-assistant/packages/jarvis.yaml` aggiornato (c'è
   `script.jarvis_presenza`, dalla v0.6.0; **non** va esposto ad Assist);
3. **jarvis_musica 0.5.0** (`home-assistant/custom_components/jarvis_musica`):
   oggi sul server c'è la 0.4.0, e senza la 0.5.0 la musica non sa da quale
   dispositivo partire;
4. il testo di `docs/ISTRUZIONI-JARVIS.md` nel prompt di Jarvis (vedi sotto).

## Parte 1 — La musica parte da dove la chiedi

**Funziona** (era già fatta con la v0.5.9, ricontrollata punto per punto):
ogni pannello ha il suo altoparlante Spotify, scelto in Impostazioni →
Musica; il tasto «Collega questo dispositivo a Spotify» apre l'app Spotify
(o il Play Store se manca) e riconosce da solo il dispositivo nuovo; se la
scelta non c'è, alla prima playlist chiede «Dove la suono?»; se Spotify non
vede il dispositivo, lo dice col nome, senza mai ripiegare su un altro
altoparlante (niente più musica che parte dall'Echo della cucina).

**Manca**: solo l'installazione di jarvis_musica 0.5.0 sul server.

**Come provarla**: sul Redmi apri una volta l'app Spotify (stesso account).
Poi sul pannello: Impostazioni → Musica → «Collega questo dispositivo a
Spotify» → torna al pannello: compare «Collegato: <nome> ✓». Dalla schermata
Musica tocca una playlist: deve suonare dal Redmi, non dalla cucina.

## Parte 2 — Ascolto dopo la risposta ed errori di Google

**Funziona** (v0.5.8): dopo una domanda di Jarvis il pannello ti ascolta 8
secondi; dopo un'azione solo 2 secondi, e se nessuno parla si chiude subito
senza «Ti ascolto ancora». Se Google non risponde senti un suono breve e leggi
«Google non risponde, riprova tra poco», invece del silenzio. Tutto
regolabile in Impostazioni → Voce.

**Come provarla**: «Jarvis, spegni la TV»: dopo la risposta il pannello si
chiude da solo dopo 2 secondi. «Jarvis, che film mi consigli?»: se Jarvis ti
fa una domanda, resta in ascolto 8 secondi.

## Il carattere di Jarvis «in stile Tony Stark»

**Fatto**: `docs/ISTRUZIONI-JARVIS.md`. Jarvis diventa il maggiordomo
digitale impeccabile, calmo, con ironia asciutta all'inglese: prima fa la
cosa, poi la conferma, poi (forse) una battuta. Ti chiama «signore», senza
esagerare. Mai battute su errori, salute, sicurezza, soldi, o con i bambini.
Niente citazioni dei film: il carattere è quello, le parole sono sue.

**Manca**: applicarlo lato server (lo fa la sessione server copiando le
sezioni 1-3 nel prompt).

## Il timer a tutto schermo (tua richiesta)

**Funziona** (v0.6.2): con un timer attivo, quando nessuno tocca il pannello
per 15 secondi il timer copre tutto lo schermo (anche a riposo e nell'Hub),
grande, con gli altri timer sotto. Un tocco riporta al pannello; dopo altri
15 secondi il timer torna. Non compare mentre Jarvis parla; quando il timer
suona resta lo Stop di «Timer finito». Di notte è in rosso scuro.

**Come provarlo**: «Jarvis, timer di 2 minuti», poi non toccare niente per
15 secondi. Impostazioni → Schermate → Timer: acceso/spento e i secondi.

## Parte 3 — Il modello su misura per «Jarvis»

**Non fatto, e perché**: per addestrarlo servono voci italiane e ore di
parlato italiano, che stanno tutte su Hugging Face, e Hugging Face non è
raggiungibile da qui. Con l'unica voce inglese disponibile il modello
imparerebbe quella voce, e il confronto con quello di oggi sarebbe falsato.

**Cosa c'è**: il piano completo in STATO.md («Modello su misura per
«Jarvis»: piano»): dati e licenze (lette una per una), dove farlo girare
(Google Colab, mezza giornata), come misurarlo contro quello di oggi, e cosa
cambia nel pannello (poco: il modello è già sostituibile). Intanto resta
`hey_jarvis` col verificatore della tua pronuncia.

## Parte 4 — Il riordino del codice

**Fatto** (v0.6.1, v0.6.3, v0.6.4): il pannello si comporta **esattamente**
come prima; è cambiato com'è organizzato dentro, per rendere veloce e sicura
ogni modifica futura.

- 23 moduli, uno per cartella, ognuno con il suo «contratto» (quello che
  espone agli altri). Nessun modulo pesca più nei file interni di un altro.
- Ogni modulo ha le sue prove e il suo comando (`npm run test:musica` e così
  via).
- Prova che nulla è cambiato: l'elenco di tutte le prove è stato fotografato
  prima di cominciare e confrontato dopo ogni blocco: **nessuna prova persa,
  stessi titoli, stesso esito** (329 unitarie e 262 nel browser alla fine,
  comprese quelle nuove).

**Come provarlo**: niente di nuovo da provare. Se vuoi un giro di controllo:
Casa, Musica, Meteo, Timer, Impostazioni, una domanda a Jarvis.

### I moduli e i loro confini

La mappa completa (a cosa serve, contratto, da chi dipende, comando di prova)
è in cima al CLAUDE.md. In breve:

| Gruppo | Moduli |
|---|---|
| Fondamenta | `diagnostica` (registro), `comune` (configurazione, avvisi, numeri), `interfaccia` (base dei pezzi a schermo), `connessione` (il cuore: collega HA e crea tutti i servizi), `pwa` (aggiornamenti, origine veloce) |
| Casa | `casa` (stanze, dispositivi, comandi, storico) |
| Voce | `voce`, `parola` («Jarvis» sempre in ascolto), `assistente` (Gemini e chat), `annunci`, `fotocamera` |
| Schermate | `timer`, `musica`, `meteo`, `clima`, `scene`, `spesa`, `avvisi` |
| Viste e guscio | `riposo`, `hub`, `navigazione`, `impostazioni`, `app` |

Confini esterni, che il pannello non tocca: Home Assistant, **jarvis_voce**
(il cuore della voce sul server) e **jarvis_musica** (la musica sul server),
usati solo tramite pipeline, eventi e servizi già in uso.

### I comandi di prova

`npm run test:<modulo>` per ognuno dei 23 moduli (prove unitarie, poi il
pannello compilato e le prove nel browser); `npm run verifica` per tutto,
comprese le prove di layout alle 6 misure.

### Il controllo del codice

- **Tolto**: 4 costanti che nessuno usava; 110 «export» (nomi visibili fuori
  dal file) che servivano solo dentro il loro file sono diventati interni.
- **Unito**: la formattazione dei numeri con la virgola (13 copie) e il
  limite dei valori delle impostazioni (2 copie) ora stanno in un posto solo.
- **Allineato**: l'elenco di esporta/importa copre tutte le impostazioni
  salvate; i 6 file di prove che mescolavano più moduli sono divisi per
  modulo senza cambiare una prova; il modello del volto si carica dal
  contratto della fotocamera e resta fuori dal pacchetto iniziale; voce e
  «Jarvis» non dipendono più l'uno dall'altro a vicenda.
- **Nessun «catch» vuoto** che nasconda errori.

### Come sono cambiate le istruzioni di Jarvis

Il testo ufficiale ora vive nel repo, **`docs/ISTRUZIONI-JARVIS.md`, ed è
pronto da applicare lato server.** Rivisto modulo per modulo; ogni modifica è
motivata nel suo «Registro modifiche». Oltre al carattere:

- la temperatura percepita non è esposta ad Assist: Jarvis dà quella vera e
  dice che la percepita è sul pannello;
- il conto alla rovescia si vede sul pannello: Jarvis non lo ripete se non
  glielo chiedono;
- le domande possono arrivare senza «Jarvis» (guardando il tablet, o subito
  dopo una sua domanda);
- con la stessa importanza delle altre, le parti che mancavano: lista della
  spesa (la stessa del pannello), playlist, scene scelte sul pannello,
  batterie scariche.

## Scelte da confermare

L'elenco completo, con il perché e dove si cambia ciascuna, è in STATO.md
(«Scelte fatte da Code, da confermare»). Quelle di oggi:

- «in stile Tony Stark» = il **maggiordomo** di Tony Stark (non Jarvis che
  parla *come* Stark); «signore» per te; niente ironia su errori, salute e
  bambini;
- i testi del pannello («Ti ascolto ancora…») restano neutri;
- timer a tutto schermo: «sempre» = **ogni volta che nessuno tocca da 15
  s**, non fisso (fisso, il pannello non si userebbe per tutto il timer);
  anche sopra riposo e Hub, mai mentre Jarvis parla;
- fotocamera: «Jarvis» più facile da vicino di un passo di 0,05;
- riordino: due file di contratto per modulo (logica e interfaccia), per
  evitare giri chiusi che possono bloccare l'avvio.

**Domanda per la sessione server**: la lista della spesa è esposta ad Assist?

## Bug trovati durante il riordino, ed errori miei

- **Bug del pannello trovati durante il riordino: nessuno.**
- **Errore mio** (corretto): un commit che doveva contenere solo una riga di
  STATO.md si è portato dietro mezzo blocco 3 del riordino (commit
  `f4fd966`): per mezz'ora il codice sul branch non compilava. Nessuna
  release rotta ne è uscita (la release rifà tutte le prove prima di
  pubblicare); il commit della v0.6.4 lo ha completato. Lezione scritta nel
  CLAUDE.md.
- **Release v0.6.3 non pubblicata**: è caduta su una prova vecchia della chat
  che dipende dai tempi (passata invece in locale e nella v0.6.4, che contiene
  tutto). Non l'ho ripubblicata perché uscirebbe dopo la v0.6.4. La prova va
  resa robusta: è un lavoro a parte, non un difetto del pannello.
- **Attese che si bloccavano** (corretto): tre volte oggi ho aspettato una
  release con un controllo che riconosceva solo il caso buono, e il lavoro si
  è fermato finché non te ne sei accorto tu. Ora c'è
  `scripts/segui-release.sh`, che segue la release di un commit preciso e si
  ferma su qualunque esito (pubblicata, fallita, annullata, tempo scaduto).
- **Prova scritta male** (corretta): la prima release della v0.6.2 è caduta
  perché una prova del timer a tutto schermo chiedeva 3 secondi, sotto il
  minimo di 5. Il pannello era giusto; ho corretto la prova e ripubblicato.
