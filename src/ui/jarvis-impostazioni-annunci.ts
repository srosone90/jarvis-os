import { callService } from "home-assistant-js-websocket";
import { css, html, nothing, type TemplateResult } from "lit";
import { PREFERENZE_ANNUNCI_DI_SERIE, SENSORE_SILENZIO } from "../annunci/annunci";
import { avvisi } from "../comandi/avvisi";
import { connessione } from "../connessione/connessione";
import { descriviErrore, log } from "../diagnostica/log";
import { OsservaEntita, RiquadroSicuro, stileBase } from "./base";
import { campoInterruttore, campoNumero, campoOrario, campoTesto, stileCampi } from "./campi";
import { LIMITI_ANNUNCI } from "../annunci/annunci";

/**
 * Impostazioni → «Jarvis parla per primo» (v0.5.4). Due tipi di scelte:
 *  - quelle della CASA stanno in entità di HA (pacchetto annunci, sessione
 *    server del 01/10): qui si mostrano e si cambiano, e valgono per tutti i
 *    pannelli. Il valore di serie è quello del pacchetto;
 *  - quelle di QUESTO pannello (volume, solo testo) stanno sul pannello.
 * Un'entità che manca in HA si dice, non si inventa.
 */

interface Interruttore {
  entita: string;
  titolo: string;
  spiegazione: string;
  diSerie: boolean;
}
interface Orario {
  entita: string;
  titolo: string;
  diSerie: string;
}

const INTERRUTTORI: Interruttore[] = [
  {
    entita: "input_boolean.jarvis_annunci",
    titolo: "Annunci",
    spiegazione: "L'interruttore generale: spento, Jarvis non parla mai per primo.",
    diSerie: true,
  },
  {
    entita: "input_boolean.jarvis_annuncio_caldo_camera",
    titolo: "Avviso del caldo in camera",
    spiegazione: "Di sera, se in camera da letto fa più caldo della soglia.",
    diSerie: true,
  },
  {
    entita: "input_boolean.jarvis_annuncio_buongiorno",
    titolo: "Buongiorno",
    spiegazione: "La prima volta che qualcuno si avvicina al pannello la mattina.",
    diSerie: true,
  },
];
const SOGLIA = { entita: "input_number.jarvis_annuncio_caldo_soglia", diSerie: 27 };
const STANZA = { entita: "input_text.jarvis_annunci_stanza", diSerie: "cucina" };
const ORARI: Orario[] = [
  { entita: "input_datetime.jarvis_annunci_silenzio_da", titolo: "Silenzio dalle", diSerie: "23:00" },
  { entita: "input_datetime.jarvis_annunci_silenzio_a", titolo: "Silenzio fino alle", diSerie: "07:30" },
  { entita: "input_datetime.jarvis_annuncio_caldo_da", titolo: "Avviso del caldo dalle", diSerie: "19:00" },
  {
    entita: "input_datetime.jarvis_annuncio_caldo_a",
    titolo: "Avviso del caldo fino alle",
    diSerie: "23:00",
  },
  { entita: "input_datetime.jarvis_annuncio_buongiorno_da", titolo: "Buongiorno dalle", diSerie: "06:00" },
  { entita: "input_datetime.jarvis_annuncio_buongiorno_a", titolo: "Buongiorno fino alle", diSerie: "11:00" },
];
export const ENTITA_ANNUNCI = [
  ...INTERRUTTORI.map((i) => i.entita),
  SOGLIA.entita,
  STANZA.entita,
  ...ORARI.map((o) => o.entita),
  SENSORE_SILENZIO,
];

const hhmm = (stato: string | undefined): string | null =>
  stato && /^\d{2}:\d{2}/.test(stato) ? stato.slice(0, 5) : null;

export class JarvisImpostazioniAnnunci extends RiquadroSicuro {
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
      .nota {
        color: var(--attenuato);
        font-size: 14px;
        margin: 6px 0 0;
      }
      .manca {
        color: var(--avviso-testo);
        font-size: 14px;
      }
    `,
  ];

  constructor() {
    super();
    new OsservaEntita(this, () => ENTITA_ANNUNCI);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.smetti = connessione.annunci.ascolta(() => this.requestUpdate());
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smetti?.();
    this.smetti = null;
  }
  private smetti: (() => void) | null = null;

  /** Servizio di HA per un'entità del pacchetto; l'esito si vede nello stato che torna. */
  private async servizio(
    dominio: string,
    servizio: string,
    entita: string,
    dati: Record<string, unknown> = {},
  ) {
    const conn = connessione.conn;
    if (!conn?.connected) {
      avvisi.mostra("Home Assistant non è raggiungibile: impostazione non cambiata", "errore");
      return;
    }
    try {
      await callService(conn, dominio, servizio, dati, { entity_id: entita });
      log.info(`Annunci: ${entita} → ${servizio} ${JSON.stringify(dati)}`);
    } catch (errore) {
      avvisi.mostra(`Home Assistant ha rifiutato la modifica (${descriviErrore(errore)})`, "errore");
    }
  }

  private stato(entita: string): string | undefined {
    return connessione.negozio.entitaDi(entita)?.state;
  }

  private mancante(entita: string): TemplateResult {
    return html`<div class="campo">
      <div class="testo">
        <small class="manca" data-test="manca-${entita}"
          >${entita} non c'è in Home Assistant: serve il pacchetto degli annunci.</small
        >
      </div>
    </div>`;
  }

  private casa(): TemplateResult {
    const pezzi: TemplateResult[] = [];
    for (const i of INTERRUTTORI) {
      const s = this.stato(i.entita);
      if (s === undefined) {
        pezzi.push(this.mancante(i.entita));
        continue;
      }
      pezzi.push(
        campoInterruttore({
          id: i.entita,
          titolo: i.titolo,
          spiegazione: i.spiegazione,
          valore: s === "on",
          diSerie: i.diSerie,
          cambia: (v) =>
            void this.servizio("input_boolean", (v ?? i.diSerie) ? "turn_on" : "turn_off", i.entita),
        }),
      );
    }
    const soglia = this.stato(SOGLIA.entita);
    pezzi.push(
      soglia === undefined
        ? this.mancante(SOGLIA.entita)
        : campoNumero({
            id: SOGLIA.entita,
            titolo: "Soglia del caldo in camera",
            valore: Number(soglia),
            diSerie: SOGLIA.diSerie,
            min: 18,
            max: 35,
            passo: 0.5,
            cifre: 1,
            unita: "°C",
            cambia: (v) =>
              void this.servizio("input_number", "set_value", SOGLIA.entita, { value: v ?? SOGLIA.diSerie }),
          }),
    );
    const stanza = this.stato(STANZA.entita);
    pezzi.push(
      stanza === undefined
        ? this.mancante(STANZA.entita)
        : campoTesto({
            id: STANZA.entita,
            titolo: "Stanza degli annunci",
            spiegazione: "Il pannello che parla per primo (l'area di Home Assistant, es. cucina).",
            valore: stanza,
            diSerie: STANZA.diSerie,
            cambia: (v) =>
              void this.servizio("input_text", "set_value", STANZA.entita, { value: v ?? STANZA.diSerie }),
          }),
    );
    for (const o of ORARI) {
      const v = hhmm(this.stato(o.entita));
      pezzi.push(
        v === null
          ? this.mancante(o.entita)
          : campoOrario({
              id: o.entita,
              titolo: o.titolo,
              valore: v,
              diSerie: o.diSerie,
              cambia: (x) =>
                void this.servizio("input_datetime", "set_datetime", o.entita, {
                  time: `${x ?? o.diSerie}:00`,
                }),
            }),
      );
    }
    return html`${pezzi}`;
  }

  protected disegna(): TemplateResult {
    const a = connessione.annunci;
    const p = a.preferenze;
    const silenzio = this.stato(SENSORE_SILENZIO);
    return html`<p class="nota">
        Jarvis può parlare per primo: un avviso del caldo, il buongiorno. Di notte e nell'ora del silenzio non
        parla: l'annuncio resta scritto sullo schermo a riposo.
        ${
          silenzio === undefined
            ? nothing
            : html`<span data-test="stato-silenzio"
                >Adesso: ${silenzio === "on" ? "ora del silenzio" : "può parlare"}.</span
              >`
        }
      </p>
      <h2>Per tutta la casa (Home Assistant)</h2>
      ${this.casa()}
      <h2>Solo questo pannello</h2>
      ${campoNumero({
        id: "volume-annunci",
        titolo: "Volume degli annunci",
        spiegazione: "Rispetto al volume del tablet.",
        valore: p.volume,
        diSerie: PREFERENZE_ANNUNCI_DI_SERIE.volume,
        min: 0,
        max: 100,
        passo: 5,
        unita: "%",
        cambia: (v) => a.cambiaPreferenze({ volume: v }),
      })}
      ${campoInterruttore({
        id: "solo-testo",
        titolo: "Solo testo, senza voce",
        spiegazione: "Gli annunci restano scritti sullo schermo a riposo, Jarvis non li dice.",
        valore: p.soloTesto,
        diSerie: PREFERENZE_ANNUNCI_DI_SERIE.soloTesto,
        cambia: (v) => a.cambiaPreferenze({ soloTesto: v }),
      })}
      ${campoNumero({
        id: "annunci-scritti",
        titolo: "Annunci scritti a riposo",
        spiegazione:
          "Quelli non detti a voce (notte, silenzio, solo testo): al massimo tanti, i più vecchi se ne vanno.",
        valore: p.promemoria,
        diSerie: PREFERENZE_ANNUNCI_DI_SERIE.promemoria,
        min: LIMITI_ANNUNCI.promemoria[0],
        max: LIMITI_ANNUNCI.promemoria[1],
        passo: 1,
        unita: "annunci",
        cambia: (v) => a.cambiaPreferenze({ promemoria: v }),
      })}
      ${campoNumero({
        id: "annunci-ore",
        titolo: "Per quante ore restano scritti",
        spiegazione: "Poi spariscono da soli (un tocco li toglie prima).",
        valore: p.promemoriaOre,
        diSerie: PREFERENZE_ANNUNCI_DI_SERIE.promemoriaOre,
        min: LIMITI_ANNUNCI.promemoriaOre[0],
        max: LIMITI_ANNUNCI.promemoriaOre[1],
        passo: 1,
        unita: "ore",
        cambia: (v) => a.cambiaPreferenze({ promemoriaOre: v }),
      })}`;
  }
}
customElements.define("jarvis-impostazioni-annunci", JarvisImpostazioniAnnunci);
