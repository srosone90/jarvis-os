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
import { navigatore } from "../navigazione/istanza";
import {
  LIMITI_NAVIGAZIONE,
  PREFERENZE_NAVIGAZIONE_DI_SERIE,
  PRINCIPALI,
  spostaVoce,
  type Principale,
} from "../navigazione/navigazione";
import {
  caricaPreferenzeStorico,
  LIMITI_STORICO,
  PREFERENZE_STORICO_DI_SERIE,
  salvaPreferenzeStorico,
  type PreferenzeStorico,
} from "../storico/storico";
import { log } from "../diagnostica/log";
import { icona, RiquadroSicuro, stileBase } from "./base";
import { campoInterruttore, campoNumero, campoScelta, stileCampi } from "./campi";

/**
 * Impostazioni → Schermate (v0.5.5): la colonna di navigazione (ordine,
 * visibilità, schermata iniziale, ritorno), cosa mostra il Meteo e il
 * grafico della Stanza. Tutto di questo pannello, col valore di serie.
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
      .voce-colonna input {
        width: 26px;
        height: 26px;
        accent-color: var(--accento);
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
    this.smetti = navigatore.ascolta(() => this.requestUpdate());
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smetti?.();
    this.smetti = null;
  }
  private smetti: (() => void) | null = null;

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
    const titolo = (id: Principale) => PRINCIPALI.find((x) => x.id === id)?.titolo ?? id;
    return html`<h2>Colonna di navigazione</h2>
      ${p.voci.map(
        (v, i) =>
          html`<div class="voce-colonna" data-test="voce-colonna-${v.id}">
            <input
              type="checkbox"
              aria-label="Mostra ${titolo(v.id)} nella colonna"
              data-test="mostra-${v.id}"
              .checked=${v.visibile}
              ?disabled=${v.id === "casa"}
              @change=${(e: Event) =>
                navigatore.cambiaPreferenze({
                  voci: p.voci.map((x) =>
                    x.id === v.id ? { ...x, visibile: (e.target as HTMLInputElement).checked } : x,
                  ),
                })}
            />
            <span>${titolo(v.id)}${v.id === "casa" ? " (sempre)" : ""}</span>
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
              Ripristina ordine e voci di serie
            </button>`
      }
      ${campoScelta<Principale>({
        id: "iniziale",
        titolo: "Schermata iniziale",
        spiegazione: "Quella che si vede all'apertura e a cui si torna senza tocchi.",
        valore: p.iniziale,
        diSerie: PREFERENZE_NAVIGAZIONE_DI_SERIE.iniziale,
        opzioni: PRINCIPALI.map((x) => [x.id, x.titolo] as const),
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
    return html`${this.colonna()} ${this.schermataMeteo()} ${this.schermataStanza()}`;
  }
}
customElements.define("jarvis-impostazioni-schermate", JarvisImpostazioniSchermate);
