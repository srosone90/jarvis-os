# STATO — per la sessione server

Aggiornato da Claude Code a ogni passo importante (commit e push sul branch
`claude/new-session-vpjgbq`). La sessione server lo legge da GitHub; le
risposte arrivano tramite Salvatore.

_Ultimo aggiornamento: 30/09/2026 — v0.4.3 pubblicata (verificatore della
pronuncia nella pagina di prova)._

## Adesso

- **Finito:** `jarvis_musica` 0.2.1. Corregge l'errore "Failed to load
  services.yaml" e aggiunge i tempi anche ai comandi. Sotto, cosa installare.
- **Finito:** v0.4.3, il verificatore "Ehi Jarvis" nella pagina di prova.
  Sotto, cosa installare e come misurare.
- **In corso:** v0.5.0, "Jarvis" nel pannello come opzione, spenta di default.
- **In parallelo, da preparare:** il notebook Colab per il modello italiano
  (passo 2), con le licenze dei negativi scelte per l'uso commerciale.
- **Dopo ancora:** i mockup (fase G, schermo a riposo e Hub, schermate e
  navigazione, musica).

## Ultima release del pannello

| | |
|---|---|
| Versione | **v0.4.3**: verificatore della pronuncia nella pagina di prova; il pannello non cambia |
| Link | https://github.com/srosone90/jarvis-os/releases/tag/v0.4.3 |
| sha256 dello zip | `de0a265de876c0f377bf08a73d8d04ac7736dc9af367b9dc3e769ac0431ba355` (6,8 MB, service worker 0.4.3, verificati) |
| Precedente | v0.4.2, sha256 `b6d6a61d…`, installata il 30/09 |

## Da installare lato server: v0.4.3

1. Scompatta lo zip sopra `/config/www/jarvis/`, come sempre.
2. Facoltativo: `/config/www/jarvis/parola.json` (NON è nello zip, gli
   aggiornamenti non lo toccano) per cambiare modello, soglie o verificatore
   condiviso senza release. Formato nel README, sezione "`parola.json`".
   Senza il file vanno i valori predefiniti.

**Come misurare** (dal telefono vecchio, link di sempre, poi passa alla veloce):

1. Apri `…/local/jarvis/prova-ehi-jarvis.html`. Se dice ancora v0.4.2, fai
   "Aggiorna ora" dal pannello e riapri.
2. **Prima**: serie da 20 «Giàrvis» con il verificatore spento. Annota i
   riconosciuti.
3. Sezione "La tua pronuncia":
   - 30 «Jarvis» per ogni persona di casa (nome, "Registra", la parola quando
     lo schermo diventa verde);
   - "Registra parlato normale" per 2 minuti (voci o TV, senza la parola);
   - "Addestra il verificatore".
4. **Dopo**: la stessa serie da 20 «Giàrvis» con il verificatore acceso, e
   un'ora di falsi positivi con la TV accesa.
5. "Copia i risultati" e passali a Code. Ogni riga dice se il verificatore era
   acceso, la soglia base e quanti esempi.

Da sapere:

- esempi e verificatore restano solo su quel telefono;
- "Esporta" produce un file con i soli numeri del verificatore, da importare
  su un altro telefono di casa, o da mettere in `parola.json` come
  verificatore condiviso.

## Da installare lato server: `jarvis_musica` 0.2.1

Piccolo aggiornamento sopra la 0.2 già installata. Le stanze
(`packages/jarvis_musica_stanze.yaml`) e il pacchetto degli script **non
cambiano**.

1. In `/config/custom_components/jarvis_musica/` copia i file dal branch
   (cartella `home-assistant/custom_components/jarvis_musica/`):
   - `services.yaml`, **nuovo**: descrizioni in italiano dei tre servizi, e
     niente più errore all'avvio;
   - `__init__.py`: i comandi ora riportano anche `tempi_ms`;
   - `manifest.json`: versione 0.2.1.
2. Riavvia HA.
3. **Per vedere i tempi** (tua domanda sul log), scegli tu:
   - **dalla risposta**: Strumenti per sviluppatori → Azioni →
     `jarvis_musica.riproduci` (o `controllo`), con "restituisci la risposta".
     Ci trovi `tempi_ms`: ricerca, avvio e totale per `riproduci`; comando,
     conferma e totale per `controllo`;
   - **dal log**: aggiungi in `configuration.yaml`, poi riavvia:
     ```yaml
     logger:
       logs:
         custom_components.jarvis_musica: info
     ```
     La riga è `jarvis_musica: … tempi {…} ms`.

**Prove fatte qui**

- HA 2026.9.3: 55 verifiche su 55, compreso `services.yaml` validato con lo
  schema di HA.
- Controprova: un selettore sbagliato in `services.yaml` fa cadere la sua
  verifica.

## Ricevuto dalla sessione server (30/09)

- 0.2 installata. Stanze in `jarvis_musica_stanze.yaml`, predefinita Cucina.
  I tre script sono esposti ad Assist, il media_player Spotify non più.
- Prove dal vivo tutte ok:

  | Comando | Tempo |
  |---|---|
  | "metti i Queen in cucina" (i Queen, da fermo) | 4,9 s |
  | "cosa sta suonando?" | 2,1 s |
  | pausa | 4,2 s |
  | riprendi | 3,4 s |
  | alza | 4,8 s |
  | successiva | 4,4 s |

## Domande aperte per la sessione server

1. **Tempi**: con la 0.2.1, quanto valgono `tempi_ms` per un avvio e per una
   pausa in cucina? Se `ricerca` e `avvio` restano sotto il secondo, i 4-5 s
   sono soprattutto di Gemini e della pipeline, non di Spotify.
2. **"Riprendi"**: riparte dal punto giusto o dall'inizio del brano? Lo hai già
   messo per il prossimo giro.
3. **Echo nel tempo**: restano visibili a Spotify dopo ore di inattività?
4. **"Error fetching spotify data"** dopo il riavvio: se si ripete più di una
   volta, dimmelo. È dell'integrazione di HA, ma `jarvis_musica` lo tradurrebbe
   in "Spotify non risponde".
5. **"Jarvis" dal pannello**: nel pannello l'ascolto della parola **non esiste
   ancora**, c'è solo nella pagina di prova. Arriva con la v0.5.0, su cui sto
   lavorando adesso.
6. **Misure con il verificatore** (v0.4.3): quanti «Giàrvis» su 20 prima e
   dopo, falsi positivi in un'ora con la TV, e la soglia base impostata dagli
   esempi. Mi servono per decidere le impostazioni predefinite della v0.5.0.
