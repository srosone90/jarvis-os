# Pacchetto Home Assistant di Jarvis OS

Questo file è scritto per **chi amministra Home Assistant**, cioè l'altra
sessione di Claude o Salvatore. Tutto quello che Jarvis OS chiede a HA sta in un
solo file: [`packages/jarvis.yaml`](packages/jarvis.yaml).

## Cosa contiene

| Cosa | Entità | A cosa serve |
|---|---|---|
| Programma scaldabagno | `binary_sensor.jarvis_scaldabagno_modalita_inverno`, `binary_sensor.jarvis_scaldabagno_programma`, automazione "segui il programma" | Accende e spegne `switch.scaldabagno` agli orari decisi, solo in modalità inverno |
| Misura nuvole | `sensor.jarvis_copertura_nuvolosa`, `input_number.jarvis_nuvole_somma`/`_campioni`, `counter.jarvis_giorni_nuvolosi`, 3 automazioni | Media della copertura nelle ore di luce, bilancio al tramonto |
| Temperatura percepita | `sensor.jarvis_temperatura_percepita_camera`, `…_soggiorno` | Formula di Steadman da temperatura e umidità dei Meter |
| Soglie clima | `input_number.jarvis_clima_*` (4) | Sopra 26° percepiti raffresca a 24°, sotto 18° riscalda a 21° |
| Scene | `script.jarvis_buonanotte`, `script.jarvis_esco`, `script.jarvis_rientro` | I tre pulsanti del pannello |
| Notifiche | `script.jarvis_notifica` | Unico punto che scrive al telefono |
| Presenza | automazioni "Uscita" (solo notifica + pulsante) e "Rientro" (clima all'arrivo) | |
| Manutenzione | automazione "Batterie basse" | Meter e Bot sotto il 20% |

### Le regole dello scaldabagno, alla lettera

- Si applicano **solo da ottobre a giugno** e **dopo 2 giornate nuvolose di fila**.
- Una giornata è nuvolosa se la copertura media delle ore di luce è **≥ 90%**.
  La soglia è `input_number.jarvis_soglia_nuvole`.
- **Una giornata sotto soglia** azzera il contatore e disattiva la modalità.
- Con la modalità attiva lo scaldabagno si spegne alle 00:00 e si accende alle
  04:30 tutti i giorni. Dal martedì al sabato si spegne anche alle 11:00 e si
  riaccende alle 17:00.
- Se la modalità si attiva o si disattiva dentro una fascia, l'effetto è
  **immediato**. Esempio: si attiva alle 18:30 di martedì → lo scaldabagno si accende
  alle 18:30.
- Tra un orario e l'altro il programma non tocca niente, quindi un'accensione o
  uno spegnimento a mano restano validi fino all'orario successivo.

## Installazione

1. In `configuration.yaml` abilita i pacchetti, se non lo sono già. Se la chiave
   `homeassistant:` esiste già, aggiungi solo la riga `packages`:
   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```
2. Copia `packages/jarvis.yaml` in `/config/packages/jarvis.yaml`.
3. Vai su **Strumenti per sviluppatori → YAML → Verifica configurazione**. Solo se
   è verde, **riavvia** Home Assistant. Ricaricare gli script non basta: ci sono
   aiutanti e template nuovi.

## Da verificare in casa PRIMA di fidarsi (non verificabile da fuori)

Il pacchetto è stato provato su un Home Assistant vero con dispositivi finti che
hanno gli stessi entity_id (vedi *Prove* più sotto). Queste cose però dipendono
dai dispositivi reali e vanno controllate sul posto:

1. **Il Bot dello scaldabagno deve essere in modalità "Interruttore"** (switch)
   nell'app SwitchBot, non "Premi" (press). In modalità "Premi", sia l'accensione
   sia lo spegnimento fanno una sola pressione, quindi il programma **invertirebbe**
   lo stato. Prova: da HA accendi e spegni `switch.scaldabagno` e guarda che lo
   scaldabagno faccia davvero la stessa cosa.
   Se qualcuno preme il pulsante fisico a mano, HA non lo sa e lo stato si
   disallinea fino al comando successivo.
2. **Nome del servizio notifiche.** Il pacchetto usa `notify.mobile_app_xiaomi_salvo`,
   il servizio dell'app HA del telefono, che è diverso dall'entità
   `notify.xiaomi_salvo`. Controllalo in *Strumenti per sviluppatori → Azioni*.
   Se il nome è diverso va corretto **solo** in `script.jarvis_notifica`. Prova:
   esegui `script.jarvis_notifica` con `messaggio: prova`.
3. **`weather.forecast_casa` deve avere l'attributo `cloud_coverage`**. Si controlla in
   *Strumenti per sviluppatori → Stati*. Se manca, `sensor.jarvis_copertura_nuvolosa`
   resta non disponibile e ogni sera arriva la notifica "non sono riuscito a
   leggere la copertura".
4. **Il condizionatore deve accettare le modalità `cool` e `heat`**: guarda
   l'attributo `hvac_modes` di `climate.condizionatore`.
5. **Il servizio `logbook.log` deve esistere.** C'è se in `configuration.yaml` hai
   `default_config:`. Le note nel registro sono sempre l'ultimo passo, quindi se
   manca le automazioni fanno comunque il loro lavoro.

## Stato di partenza

- Il contatore delle giornate nuvolose parte da 0, quindi la modalità inverno
  si attiva dopo 2 giornate nuvolose **a partire dall'installazione**. Se oggi
  serve già, imposta a mano `counter.jarvis_giorni_nuvolosi` a 2.
- **I backup automatici di HA non sono configurati**:
  `sensor.backup_next_scheduled_automatic_backup` risulta `unknown`. HA gira su un
  vecchio telefono, e se la memoria si guasta si perde tutto. Conviene attivarli
  (Impostazioni → Sistema → Backup) con una copia fuori dal telefono.

## Rischio infrarossi (TV camera)

`switch.tv_camera_da_letto` passa da un hub a infrarossi: HA non sa se la TV è
accesa, e su molte TV il comando "spegni" è lo stesso tasto dell'accensione. Per
questo **nessuna automazione e nessuna scena la tocca**: "spegni tutto"
rischierebbe di accenderla. Sul pannello compare come un tasto del telecomando.

## Limiti noti

- Se HA è spento proprio a un orario del programma, quel cambio si perde fino
  all'orario successivo. Esempio: spento alle 04:30 → niente acqua calda fino al
  cambio dopo.
- Se HA è spento al tramonto, quella giornata non viene contata. Il contatore
  resta com'era e si azzerano solo i campioni.
- Se HA resta acceso ma Met.no non risponde per quasi tutto il giorno (meno di 6
  campioni, cioè 1 ora), la giornata non si conta e arriva una notifica.

## Prove

`prove/prova_pacchetto.py` avvia un Home Assistant vero con il pacchetto, finge i
dispositivi (stessi entity_id) e verifica 85 casi:
- orari del programma giorno per giorno;
- attivazione e disattivazione immediata;
- comando a mano rispettato;
- soglie delle nuvole (89% non conta);
- giornata senza dati;
- fuori stagione;
- Rientro caldo, freddo e neutro;
- Uscita solo con notifica;
- pulsante della notifica;
- Buonanotte;
- batterie.

```bash
uv venv -p 3.13 .venv-ha && VIRTUAL_ENV=.venv-ha uv pip install homeassistant
.venv-ha/bin/python home-assistant/prove/prova_pacchetto.py
.venv-ha/bin/hass --script check_config -c <cartella con configuration.yaml + packages/>
```

Provato con Home Assistant 2026.2.3, l'ultima versione installabile col Python
3.13 del banco di prova. La casa gira la 2026.9. La sintassi usata (`triggers:`,
`actions:`, `trigger: state`, template) è quella stabile da fine 2024.
