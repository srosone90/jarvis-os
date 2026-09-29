# Proposta — Jarvis in altre case (29/09/2026)

Solo proposta e stima: **niente di questo è implementato**. Serve a decidere
oggi le cose della fase G che sarebbe caro rifare dopo. Requisito e decisioni
sono in `CLAUDE.md` (sezione 5, "Multi-casa").

Tutti i fatti su HA sono verificati sul codice di **HA 2026.9.3**.

## 1. Dove siamo oggi (cosa è "di casa Salvatore")

| Dove | Cosa | Destino |
|---|---|---|
| `src/configurazione.ts` | meteo `weather.forecast_casa`, sensori clima delle stanze, zone del mockup, dispositivi a infrarossi, programma dello scaldabagno, entità nascoste | Configurazione salvata in HA + configurazione guidata (fase G) |
| `src/ui/jarvis-chat.ts` | "Gemini" scritto fisso nell'intestazione | Nome dell'agente dalla configurazione |
| Testi visibili, `index.html`, `manifest.webmanifest` | "Jarvis", "Jarvis OS" (una decina di punti) | Nome configurabile (fase G) |
| `home-assistant/packages/jarvis.yaml` | orari dello scaldabagno, soglie del clima, telefono delle notifiche, 67 identificativi `jarvis_*` | Moduli opzionali e parametrici (vedi 3) |
| Server | Redmi + Termux + proot montato a mano | Non si ripete: nelle altre case HA standard (HA Green o mini PC) |

## 2. Distribuzione con HACS: com'è fatta

Una casa nuova = **HA standard + HACS + integrazione Jarvis**.

L'integrazione custom (`custom_components/<dominio>/`) fa tre cose:

1. **Serve l'app** con `hass.http.async_register_static_paths([StaticPathConfig(...)])`
   dalla sua cartella, per esempio `/<dominio>/index.html`. Resta una PWA
   standalone sulla stessa origine di HA: login OAuth e service worker restano
   come oggi. L'app usa già percorsi relativi (`base: './'`), quindi il cambio
   di indirizzo (`/local/jarvis/` → `/<dominio>/`) è da provare ma non da
   riscrivere.
2. **Aggiunge un link nella barra laterale di HA** con `panel_custom` (o un
   pannello iframe). `require_admin` esiste: la parte di gestione può avere il
   suo pannello solo admin.
3. **Gestisce i moduli** (scaldabagno, clima, notifiche) con config flow e
   options flow: si attivano e si regolano dall'interfaccia di HA, senza YAML.
   Le entità le crea l'integrazione in Python, al posto del pacchetto YAML.

**Aggiornamenti**: HACS installa le release di GitHub. Il nostro workflow
pubblica già una release per versione; va solo aggiunto lo zip nel formato di
HACS.

### Stima (ordine di grandezza, da rifare dopo la fase G)

| Pezzo | Peso | Nota |
|---|---|---|
| Scheletro dell'integrazione: static path, pannello, manifest, release per HACS | piccolo (una fase breve) | Tecnica nota, nessuna logica nuova |
| Moduli in Python con config flow + prove su HA vero | **grande** (2-3 fasi) | È la riscrittura del pacchetto YAML: scaldabagno, clima, notifiche, con le stesse 110 verifiche di oggi |
| Pubblicazione su HACS (repo pubblico, validazione HACS, documentazione) | piccolo | |

Strada intermedia più economica per i moduli: **blueprint** di HA
(automazioni parametriche con input: entità, orari, soglie), che si importano
da un link e si configurano dall'interfaccia. Non creano gli aiutanti da sole,
quindi non bastano per tutto, ma coprono "clima con soglie" e "notifiche con
servizio scelto" senza Python. Da valutare quando si arriva lì.

## 3. Esigenze future da servizio: cosa cambia con HACS

Nessuna si implementa ora; le scelte di oggi non devono impedirle.

| Esigenza | Con HACS / HA | Da tenere presente da subito |
|---|---|---|
| **Aggiornamenti controllati** (stable/beta, tornare indietro) | HACS mostra le pre-release a chi le abilita (canale beta) e permette di reinstallare una versione precedente | Release beta = pre-release di GitHub. La configurazione salvata ha un **numero di schema**, con migrazioni in avanti e il rifiuto chiaro di uno schema più nuovo di quello che l'app conosce: tornare indietro non deve corrompere niente |
| **Backup automatici esterni** | La configurazione in `.storage/frontend.system_data` finisce già nei backup standard di HA, che dalla 2025 salvano da soli anche fuori casa (rete o cloud) | Tutto in HA, niente nel localStorage. In più un "esporta/importa configurazione" in JSON nella gestione |
| **Stato di salute leggibile da remoto** (solo col consenso) | L'integrazione può esporre un sensore "salute" (versione, errori, ultima connessione). Chi assiste lo legge con l'accesso remoto della casa (Tailscale o Nabu Casa) | La diagnostica già raccoglie questi dati: vanno resi leggibili da HA. **Niente invii verso l'esterno senza un consenso esplicito** |
| **Nome del prodotto configurabile** | Il nome nella barra laterale e nel manifest li serve l'integrazione: possono essere generati dal nome scelto | Da subito nessun "Jarvis" non sostituibile: i testi visibili leggono il nome dalla configurazione. Gli identificativi tecnici (`jarvis-app`, `jarvis_*`) non si vedono e restano; il **dominio dell'integrazione** invece va scelto neutro una volta sola, perché cambiarlo dopo rompe le installazioni. "Ehi Jarvis" (Hub): parola di attivazione configurabile |

## 4. Cosa della fase G va progettato subito per non rifarlo dopo

1. **Schema della configurazione versionato** (`versione` + migrazioni), nello
   spazio `frontend/system_data`, chiave unica. Domani l'integrazione legge e
   scrive lo stesso schema.
2. **Zero entity_id nel bundle.** `src/configurazione.ts` sparisce come fonte
   di dati: restano solo i valori predefiniti generici. La configurazione di
   casa Salvatore **non** si migra dal bundle (sarebbe comunque "casa Salvatore
   nel codice"). Diventa un file JSON importato una volta dalla gestione, oppure
   la configurazione guidata la ritrova quasi tutta da sola e lui conferma.
3. **Configurazione guidata come percorso normale**, non come eccezione: scopre
   aree, dispositivi, `weather.*` e sensori di temperatura e umidità per area
   (`device_class`); l'admin conferma o corregge.
4. **Nome del prodotto e nome dell'agente nella configurazione**, con i testi
   visibili raccolti in un posto solo.
5. **Card universali per dominio + `supported_features`**: nessuna logica legata
   a un modello o a una marca. Quello che oggi è "scaldabagno" diventa "stato
   del programma collegato a un dispositivo": fino a due entità scelte in
   configurazione.
6. **Permessi**: letture per tutti, scritture solo admin (tabella in CLAUDE.md);
   la gestione non si mostra a chi non può usarla.
7. **Indirizzo dell'app non scritto da nessuna parte**: funziona sotto
   `/local/jarvis/` oggi e sotto `/<dominio>/` domani. Va provato col finto HA
   su due percorsi.
8. **Esposizione ad Assist gestita dalla configurazione**: i sensori interni
   (es. "percepita") si nascondono a Gemini con `homeassistant/expose_entity`
   (solo admin), invece di chiederlo a mano a ogni casa.
