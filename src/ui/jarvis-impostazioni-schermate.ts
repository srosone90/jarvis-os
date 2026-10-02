import { mdiArrowDown, mdiArrowUp } from "@mdi/js";
import { css, html, type TemplateResult } from "lit";
import {
  caricaPreferenzeMeteo,
  LIMITI_METEO,
  PREFERENZE_METEO_DI_SERIE,
  salvaPreferenzeMeteo,
  type PreferenzeMeteo,
  type UnitaVento,
} from "../meteo/dettagli";
import { connessione } from "../connessione";
import { LIMITI_MUSICA, PREFERENZE_MUSICA_DI_SERIE, type PosizioneMini } from "../musica/musica";
import { navigatore } from "../navigazione/istanza";
import {
  cambiaDove,
  FISSE,
  LIMITI_NAVIGAZIONE,
  PREFERENZE_NAVIGAZIONE_DI_SERIE,
  spostaVoce,
  titoloDi,
  type Dove,
  type Principale,
} from "../navigazione/navigazione";
import {
  durateDa,
  LIMITI_SCHERMATE,
  PREFERENZE_SCHERMATE_DI_SERIE,
  sceneDa,
  schermate,
} from "../pagine/preferenze";
import {
  LIMITI_STORICO,
  PREFERENZE_STORICO_DI_SERIE,
  caricaPreferenzeStorico,
  salvaPreferenzeStorico,
  type PreferenzeStorico,
} from "../casa";
import { log } from "../diagnostica";
import {
  RiquadroSicuro,
  campoInterruttore,
  campoNumero,
  campoScelta,
  campoTesto,
  campoTestoLungo,
  icona,
  stileBase,
  stileCampi,
} from "../interfaccia";

/**
 * Impostazioni → Schermate (v0.5.5): la colonna di navigazione (ordine, dove
 * sta ogni schermata: colonna, Altro o spenta, schermata iniziale, ritorno),
 * la Musica (v0.5.6: mini-lettore, rilettura, stanze), cosa mostrano Meteo,
 * Stanza e (v0.5.7) Timer, Clima, Scene, Spesa e Avvisi. Tutto di questo
 * pannello, col valore di serie.
 */
export class JarvisImpostazioniSchermate extends RiquadroSicuro {
  static override styles = [
    stileBase,
    stileCampi,
    css`
      :host {
        display: block;
      }
      h2 {
        font-size: 15px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--attenuato);
        margin: 20px 0 0;
      }
      .voce-colonna {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
        border-bottom: 1px solid #1c2029;
      }
      .voce-colonna span {
        flex: 1;
        min-width: 0;
        font-size: 17px;
      }
      .voce-colonna button {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        border: 1px solid #343a46;
        background: var(--superficie);
        color: var(--testo);
        display: grid;
        place-items: center;
        cursor: pointer;
      }
      .voce-colonna button:disabled {
        opacity: 0.35;
        cursor: default;
      }
      .voce-colonna .icona {
        width: 22px;
        height: 22px;
      }
      .voce-colonna select {
        min-height: 44px;
        max-width: 46%;
        border-radius: 10px;
        border: 1px solid #343a46;
        background: var(--superficie);
        color: var(--testo);
        font: inherit;
        font-size: 15px;
      }
      .voce-colonna .fissa {
        color: var(--attenuato);
        font-size: 14px;
      }
      .ripristina {
        margin-top: 8px;
        min-height: 40px;
        border-radius: 10px;
        border: 1px solid #343a46;
        background: none;
        color: var(--attenuato);
        font: inherit;
        font-size: 14px;
        padding: 0 10px;
        cursor: pointer;
      }
    `,
  ];

  private meteo: PreferenzeMeteo = caricaPreferenzeMeteo();
  private storico: PreferenzeStorico = caricaPreferenzeStorico();

  override connectedCallback(): void {
    super.connectedCallback();
    this.smetti = [
      navigatore.ascolta(() => this.requestUpdate()),
      connessione.musica.ascolta(() => this.requestUpdate()),
      schermate.ascolta(() => this.requestUpdate()),
    ];
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const f of this.smetti) f();
    this.smetti = [];
  }
  private smetti: (() => void)[] = [];

  private cambiaMeteo(cambi: Partial<{ [K in keyof PreferenzeMeteo]: PreferenzeMeteo[K] | null }>): void {
    const nuovo: Record<string, unknown> = { ...this.meteo };
    for (const [k, v] of Object.entries(cambi))
      nuovo[k] = v === null ? PREFERENZE_METEO_DI_SERIE[k as keyof PreferenzeMeteo] : v;
    this.meteo = nuovo as unknown as PreferenzeMeteo;
    salvaPreferenzeMeteo(this.meteo);
    log.info(`Meteo: ${JSON.stringify(this.meteo)}`);
    this.requestUpdate();
  }

  private cambiaStorico(
    cambi: Partial<{ [K in keyof PreferenzeStorico]: PreferenzeStorico[K] | null }>,
  ): void {
    const nuovo: Record<string, unknown> = { ...this.storico };
    for (const [k, v] of Object.entries(cambi))
      nuovo[k] = v === null ? PREFERENZE_STORICO_DI_SERIE[k as keyof PreferenzeStorico] : v;
    this.storico = nuovo as unknown as PreferenzeStorico;
    salvaPreferenzeStorico(this.storico);
    log.info(`Grafico della stanza: ${JSON.stringify(this.storico)}`);
    this.requestUpdate();
  }

  private colonna(): TemplateResult {
    const p = navigatore.preferenze;
    const diSerie = JSON.stringify(p.voci) === JSON.stringify(PREFERENZE_NAVIGAZIONE_DI_SERIE.voci);
    const titolo = titoloDi;
    const posti: readonly [Dove, string][] = [
      ["colonna", "Nella colonna"],
      ["altro", "Solo in Altro"],
      ["spenta", "Spenta"],
    ];
    return html`<h2>Schermate e colonna</h2>
      <div class="nota">
        Ogni schermata può stare nella colonna, solo in Altro, o essere spenta. Casa e Altro restano nella
        colonna: da lì si arriva a tutto, impostazioni comprese.
      </div>
      ${p.voci.map(
        (v, i) =>
          html`<div class="voce-colonna" data-test="voce-colonna-${v.id}">
            <span>${titolo(v.id)}</span>
            ${
              FISSE.includes(v.id)
                ? html`<span class="fissa">sempre nella colonna</span>`
                : html`<select
                    aria-label="Dove sta ${titolo(v.id)}"
                    data-test="dove-${v.id}"
                    @change=${(e: Event) =>
                      navigatore.cambiaPreferenze({
                        voci: cambiaDove(p.voci, v.id, (e.target as HTMLSelectElement).value as Dove),
                      })}
                  >
                    ${posti.map(([d, t]) => html`<option value=${d} ?selected=${v.dove === d}>${t}</option>`)}
                  </select>`
            }
            <button
              aria-label="Sposta ${titolo(v.id)} su"
              data-test="su-${v.id}"
              ?disabled=${i === 0}
              @click=${() => navigatore.cambiaPreferenze({ voci: spostaVoce(p.voci, v.id, -1) })}
            >
              ${icona(mdiArrowUp)}
            </button>
            <button
              aria-label="Sposta ${titolo(v.id)} giù"
              data-test="giu-${v.id}"
              ?disabled=${i === p.voci.length - 1}
              @click=${() => navigatore.cambiaPreferenze({ voci: spostaVoce(p.voci, v.id, 1) })}
            >
              ${icona(mdiArrowDown)}
            </button>
          </div>`,
      )}
      ${
        diSerie
          ? html``
          : html`<button
              class="ripristina"
              data-test="ripristina-colonna"
              @click=${() => navigatore.cambiaPreferenze({ voci: null })}
            >
              Ripristina ordine e posti di serie
            </button>`
      }
      ${campoScelta<Principale>({
        id: "iniziale",
        titolo: "Schermata iniziale",
        spiegazione: "Quella che si vede all'apertura e a cui si torna senza tocchi.",
        valore: p.iniziale,
        diSerie: PREFERENZE_NAVIGAZIONE_DI_SERIE.iniziale,
        // una schermata spenta non può essere quella iniziale
        opzioni: p.voci.filter((x) => x.dove !== "spenta").map((x) => [x.id, titolo(x.id)] as const),
        cambia: (v) => navigatore.cambiaPreferenze({ iniziale: v }),
      })}
      ${campoNumero({
        id: "ritorno",
        titolo: "Torna alla schermata iniziale dopo",
        spiegazione: "Secondi senza tocchi su un'altra schermata. 0 = mai.",
        valore: p.ritornoSecondi,
        diSerie: PREFERENZE_NAVIGAZIONE_DI_SERIE.ritornoSecondi,
        min: LIMITI_NAVIGAZIONE.ritornoSecondi[0],
        max: LIMITI_NAVIGAZIONE.ritornoSecondi[1],
        passo: 10,
        unita: "secondi",
        cambia: (v) => navigatore.cambiaPreferenze({ ritornoSecondi: v }),
      })}`;
  }

  private schermataMusica(): TemplateResult {
    const m = connessione.musica;
    const p = m.preferenze;
    const d = PREFERENZE_MUSICA_DI_SERIE;
    return html`<h2>Musica</h2>
      ${campoInterruttore({
        id: "musica-mini",
        titolo: "Mini-lettore nella Casa",
        spiegazione: "Copertina, titolo e pausa, solo mentre suona qualcosa.",
        valore: p.mini,
        diSerie: d.mini,
        cambia: (v) => m.cambiaPreferenze({ mini: v }),
      })}
      ${campoScelta<PosizioneMini>({
        id: "musica-posizione",
        titolo: "Dove sta il mini-lettore",
        valore: p.posizioneMini,
        diSerie: d.posizioneMini,
        opzioni: [
          ["orologio", "Sotto l'orologio"],
          ["barra", "Nella barra in basso"],
        ],
        disattivo: !p.mini,
        cambia: (v) => m.cambiaPreferenze({ posizioneMini: v }),
      })}
      ${campoNumero({
        id: "musica-intervallo",
        titolo: "Rileggi cosa suona ogni",
        spiegazione: "Da Spotify, finché la musica è sullo schermo. Dopo ogni comando si rilegge subito.",
        valore: p.intervalloSecondi,
        diSerie: d.intervalloSecondi,
        min: LIMITI_MUSICA.intervalloSecondi[0],
        max: LIMITI_MUSICA.intervalloSecondi[1],
        passo: 5,
        unita: "secondi",
        cambia: (v) => m.cambiaPreferenze({ intervalloSecondi: v }),
      })}
      ${campoTestoLungo({
        id: "musica-stanze",
        titolo: "Stanze per spostare la musica",
        spiegazione:
          "Separate da virgole, come le chiama jarvis_musica. Vuoto = le stanze di Home Assistant.",
        segnaposto: "Cucina, Camera da letto",
        valore: p.stanze.join(", "),
        diSerie: d.stanze.join(", "),
        cambia: (v) =>
          m.cambiaPreferenze({
            stanze:
              v === null
                ? null
                : v
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
          }),
      })}
      ${
        p.preferite.length
          ? html`<button
              class="ripristina"
              data-test="ripristina-preferite"
              @click=${() => m.cambiaPreferenze({ preferite: null })}
            >
              Togli le ${p.preferite.length} playlist preferite
            </button>`
          : html``
      }`;
  }

  private schermataTimer(): TemplateResult {
    const v = schermate.valori;
    return html`<h2>Timer</h2>
      ${campoTesto({
        id: "timer-durate",
        titolo: "Pulsanti per un timer nuovo",
        spiegazione: `Minuti, separati da virgole (al massimo ${LIMITI_SCHERMATE.quanteDurate}). Vuoto = nessun pulsante.`,
        segnaposto: "1, 5, 10",
        valore: v.timerDurate.join(", "),
        diSerie: PREFERENZE_SCHERMATE_DI_SERIE.timerDurate.join(", "),
        cambia: (t) => schermate.cambia({ timerDurate: t === null ? null : durateDa(t) }),
      })}
      ${campoInterruttore({
        id: "timer-pieno",
        titolo: "Timer a tutto schermo",
        spiegazione:
          "Con un timer attivo, quando nessuno tocca il pannello il timer copre tutto lo schermo (anche a riposo e nell'Hub). Un tocco riporta al pannello.",
        valore: v.timerPieno,
        diSerie: PREFERENZE_SCHERMATE_DI_SERIE.timerPieno,
        cambia: (b) => schermate.cambia({ timerPieno: b }),
      })}
      ${campoNumero({
        id: "timer-pieno-secondi",
        titolo: "Dopo quanti secondi senza tocchi",
        valore: v.timerPienoSecondi,
        diSerie: PREFERENZE_SCHERMATE_DI_SERIE.timerPienoSecondi,
        min: LIMITI_SCHERMATE.timerPienoSecondi[0],
        max: LIMITI_SCHERMATE.timerPienoSecondi[1],
        passo: 1,
        unita: "secondi",
        disattivo: !v.timerPieno,
        cambia: (n) => schermate.cambia({ timerPienoSecondi: n }),
      })}`;
  }

  private schermataClima(): TemplateResult {
    const v = schermate.valori;
    const d = PREFERENZE_SCHERMATE_DI_SERIE;
    return html`<h2>Clima</h2>
      ${campoNumero({
        id: "clima-ore",
        titolo: "Grafico delle temperature",
        spiegazione: "Quante ore indietro, dal registro di Home Assistant.",
        valore: v.climaOre,
        diSerie: d.climaOre,
        min: LIMITI_SCHERMATE.climaOre[0],
        max: LIMITI_SCHERMATE.climaOre[1],
        passo: 6,
        unita: "ore",
        cambia: (n) => schermate.cambia({ climaOre: n }),
      })}
      ${campoInterruttore({
        id: "clima-consumi",
        titolo: "Consumi",
        spiegazione: "Solo se in Home Assistant c'è un sensore di potenza o di energia.",
        valore: v.climaConsumi,
        diSerie: d.climaConsumi,
        cambia: (b) => schermate.cambia({ climaConsumi: b }),
      })}`;
  }

  private schermataScene(): TemplateResult {
    const v = schermate.valori;
    return html`<h2>Scene</h2>
      ${campoTestoLungo({
        id: "scene",
        titolo: "Quali scene, in ordine",
        spiegazione:
          "Script o scene di Home Assistant, separati da virgole. Le prime 3 stanno anche nella Casa.",
        segnaposto: "script.jarvis_esco, scene.cena",
        valore: v.scene.join(", "),
        diSerie: PREFERENZE_SCHERMATE_DI_SERIE.scene.join(", "),
        cambia: (t) => schermate.cambia({ scene: t === null ? null : sceneDa(t) }),
      })}
      ${campoInterruttore({
        id: "scene-conferma",
        titolo: "Chiedi conferma prima delle scene",
        spiegazione:
          "Il primo tocco chiede «Tocca ancora», il secondo avvia la scena (entro il tempo qui sotto).",
        valore: v.sceneConferma,
        diSerie: PREFERENZE_SCHERMATE_DI_SERIE.sceneConferma,
        cambia: (b) => schermate.cambia({ sceneConferma: b }),
      })}
      ${campoNumero({
        id: "scene-conferma-secondi",
        titolo: "Tempo per il secondo tocco",
        spiegazione: "Con la conferma accesa: dopo questi secondi «Tocca ancora» torna com'era.",
        valore: v.sceneConfermaSecondi,
        diSerie: PREFERENZE_SCHERMATE_DI_SERIE.sceneConfermaSecondi,
        min: LIMITI_SCHERMATE.sceneConfermaSecondi[0],
        max: LIMITI_SCHERMATE.sceneConfermaSecondi[1],
        passo: 1,
        unita: "secondi",
        disattivo: !v.sceneConferma,
        cambia: (n) => schermate.cambia({ sceneConfermaSecondi: n }),
      })}`;
  }

  private schermataSpesa(): TemplateResult {
    const v = schermate.valori;
    const d = PREFERENZE_SCHERMATE_DI_SERIE;
    return html`<h2>Spesa</h2>
      ${campoTesto({
        id: "spesa-lista",
        titolo: "Lista di Home Assistant",
        spiegazione: "Un'entità todo. Di serie quella dell'integrazione «Lista della spesa».",
        segnaposto: "todo.shopping_list",
        valore: v.spesaLista,
        diSerie: d.spesaLista,
        cambia: (t) => schermate.cambia({ spesaLista: t === null || t === "" ? null : t }),
      })}
      ${campoInterruttore({
        id: "spesa-presi",
        titolo: "Anche le cose già prese",
        spiegazione: "Barrate in fondo alla lista, finché non si tolgono.",
        valore: v.spesaPresi,
        diSerie: d.spesaPresi,
        cambia: (b) => schermate.cambia({ spesaPresi: b }),
      })}`;
  }

  private schermataAvvisi(): TemplateResult {
    const v = schermate.valori;
    const d = PREFERENZE_SCHERMATE_DI_SERIE;
    return html`<h2>Avvisi</h2>
      ${campoNumero({
        id: "avvisi-ore",
        titolo: "Eventi dei dispositivi",
        spiegazione: "Quante ore indietro, dal registro di Home Assistant.",
        valore: v.avvisiOre,
        diSerie: d.avvisiOre,
        min: LIMITI_SCHERMATE.avvisiOre[0],
        max: LIMITI_SCHERMATE.avvisiOre[1],
        passo: 1,
        unita: "ore",
        cambia: (n) => schermate.cambia({ avvisiOre: n }),
      })}
      ${campoNumero({
        id: "avvisi-soglia",
        titolo: "Batteria bassa sotto il",
        valore: v.avvisiSogliaBatteria,
        diSerie: d.avvisiSogliaBatteria,
        min: LIMITI_SCHERMATE.avvisiSogliaBatteria[0],
        max: LIMITI_SCHERMATE.avvisiSogliaBatteria[1],
        passo: 5,
        unita: "%",
        cambia: (n) => schermate.cambia({ avvisiSogliaBatteria: n }),
      })}`;
  }

  private schermataMeteo(): TemplateResult {
    const m = this.meteo;
    const d = PREFERENZE_METEO_DI_SERIE;
    return html`<h2>Meteo</h2>
      ${campoNumero({
        id: "meteo-ore",
        titolo: "Previsione ora per ora",
        spiegazione: "Quante ore. 0 = niente.",
        valore: m.ore,
        diSerie: d.ore,
        min: LIMITI_METEO.ore[0],
        max: LIMITI_METEO.ore[1],
        passo: 1,
        unita: "ore",
        cambia: (v) => this.cambiaMeteo({ ore: v }),
      })}
      ${campoNumero({
        id: "meteo-giorni",
        titolo: "Prossimi giorni",
        valore: m.giorni,
        diSerie: d.giorni,
        min: LIMITI_METEO.giorni[0],
        max: LIMITI_METEO.giorni[1],
        passo: 1,
        unita: "giorni",
        cambia: (v) => this.cambiaMeteo({ giorni: v }),
      })}
      ${campoInterruttore({
        id: "meteo-umidita",
        titolo: "Umidità",
        valore: m.umidita,
        diSerie: d.umidita,
        cambia: (v) => this.cambiaMeteo({ umidita: v }),
      })}
      ${campoInterruttore({
        id: "meteo-vento",
        titolo: "Vento",
        valore: m.vento,
        diSerie: d.vento,
        cambia: (v) => this.cambiaMeteo({ vento: v }),
      })}
      ${campoScelta<UnitaVento>({
        id: "meteo-unita-vento",
        titolo: "Unità del vento",
        valore: m.unitaVento,
        diSerie: d.unitaVento,
        opzioni: [
          ["ha", "Come Home Assistant"],
          ["kmh", "km/h"],
          ["ms", "m/s"],
        ],
        disattivo: !m.vento,
        cambia: (v) => this.cambiaMeteo({ unitaVento: v }),
      })}
      ${campoInterruttore({
        id: "meteo-pressione",
        titolo: "Pressione",
        valore: m.pressione,
        diSerie: d.pressione,
        cambia: (v) => this.cambiaMeteo({ pressione: v }),
      })}
      ${campoInterruttore({
        id: "meteo-pioggia",
        titolo: "Pioggia",
        spiegazione: "Probabilità, o millimetri se Home Assistant manda solo quelli.",
        valore: m.pioggia,
        diSerie: d.pioggia,
        cambia: (v) => this.cambiaMeteo({ pioggia: v }),
      })}
      ${campoInterruttore({
        id: "meteo-alba",
        titolo: "Alba e tramonto",
        spiegazione: "Dall'entità sun.sun di Home Assistant, se c'è.",
        valore: m.alba,
        diSerie: d.alba,
        cambia: (v) => this.cambiaMeteo({ alba: v }),
      })}`;
  }

  private schermataStanza(): TemplateResult {
    const s = this.storico;
    return html`<h2>Stanza</h2>
      ${campoNumero({
        id: "storico-ore",
        titolo: "Grafico della temperatura",
        spiegazione: "Quante ore indietro, dal registro di Home Assistant.",
        valore: s.ore,
        diSerie: PREFERENZE_STORICO_DI_SERIE.ore,
        min: LIMITI_STORICO.ore[0],
        max: LIMITI_STORICO.ore[1],
        passo: 6,
        unita: "ore",
        cambia: (v) => this.cambiaStorico({ ore: v }),
      })}
      ${campoInterruttore({
        id: "storico-umidita",
        titolo: "Anche l'umidità nel grafico",
        valore: s.umidita,
        diSerie: PREFERENZE_STORICO_DI_SERIE.umidita,
        cambia: (v) => this.cambiaStorico({ umidita: v }),
      })}`;
  }

  protected disegna(): TemplateResult {
    return html`${this.colonna()} ${this.schermataMusica()} ${this.schermataMeteo()} ${this.schermataStanza()}
    ${this.schermataTimer()} ${this.schermataClima()} ${this.schermataScene()} ${this.schermataSpesa()}
    ${this.schermataAvvisi()}`;
  }
}
customElements.define("jarvis-impostazioni-schermate", JarvisImpostazioniSchermate);
