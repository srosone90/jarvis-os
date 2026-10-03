import { css, html, nothing, type TemplateResult } from "lit";
import { connessione } from "../connessione";
import { LIMITI_FOTOCAMERA, PREFERENZE_FOTOCAMERA_DI_SERIE } from "./preferenze";
import type { StatoFotocamera } from "./presenza";
import {
  RiquadroSicuro,
  campoInterruttore,
  campoNumero,
  campoOrario,
  campoScelta,
  stileBase,
  stileCampi,
} from "../interfaccia";
import { virgola } from "../comune";

const STATI: Record<StatoFotocamera, string> = {
  spenta: "Spenta",
  notte: "Spenta (ore di riposo)",
  apertura: "Si sta accendendo…",
  attiva: "Accesa: guarda, le immagini restano sul tablet",
  errore: "Non funziona",
};

/**
 * Impostazioni → Fotocamera (v0.6.0, punto 7.7; v0.6.5): sveglia schermo con
 * presenza e dopo quanto si rispegne, avviso a Home Assistant, distanza,
 * sensibilità, fotogrammi al secondo, orari in cui è spenta. Tutto acceso di
 * serie, spenta di notte. Sopra, lo stato vero e l'ultimo volto visto
 * (punteggio e distanza stimata, per tarare). Dalla v0.6.5 la fotocamera non
 * tocca «Jarvis»: lo dice anche il pannello.
 */
export class JarvisImpostazioniFotocamera extends RiquadroSicuro {
  static override styles = [
    stileBase,
    stileCampi,
    css`
      :host {
        display: block;
      }
      .stato {
        padding: 12px 0;
        border-bottom: 1px solid #1c2029;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .stato b {
        font-weight: 500;
        font-size: 17px;
      }
      .errore {
        color: #ff9a8a;
        overflow-wrap: break-word;
      }
    `,
  ];

  private smetti: (() => void) | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    this.smetti = connessione.presenza.ascolta(() => this.requestUpdate());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smetti?.();
    this.smetti = null;
  }

  private stato(): TemplateResult {
    const p = connessione.presenza;
    const v = p.volto;
    return html`<div class="stato" data-test="fotocamera-stato">
      <b data-test="fotocamera-stato-testo">${STATI[p.stato]}</b>
      ${p.problema ? html`<span class="errore" role="alert" data-test="fotocamera-problema">${p.problema}</span>` : nothing}
      ${
        p.attiva
          ? html`<small class="nota" data-test="fotocamera-volto"
              >${
                v
                  ? `Ultimo volto: ${Math.round(v.punteggio * 100)}%, a circa ${virgola(v.metri, 1)} m.`
                  : "Nessun volto davanti al pannello."
              }</small
            >`
          : nothing
      }
      <small class="nota"
        >Niente si salva e niente esce dal tablet: a Home Assistant arriva solo «qualcuno è vicino a questo
        pannello». La fotocamera non cambia come senti «Jarvis»: funziona uguale anche coperta.</small
      >
    </div>`;
  }

  protected disegna(): TemplateResult {
    const presenza = connessione.presenza;
    const v = presenza.preferenze;
    const d = PREFERENZE_FOTOCAMERA_DI_SERIE;
    const cambia = presenza.cambiaPreferenze.bind(presenza);
    return html`${this.stato()}
    ${campoInterruttore({
      id: "fotocamera-presenza",
      titolo: "Sveglia schermo con presenza",
      spiegazione: "Chi si avvicina riaccende lo schermo a riposo. Se lo schermo è già acceso non fa niente.",
      valore: v.presenza,
      diSerie: d.presenza,
      cambia: (b) => cambia({ presenza: b }),
    })}
    ${campoNumero({
      id: "fotocamera-secondi",
      titolo: "Si rispegne dopo",
      spiegazione:
        "Secondi prima che lo schermo svegliato così torni a riposo, se nessuno lo tocca o gli parla.",
      valore: v.secondiSveglia,
      diSerie: d.secondiSveglia,
      min: LIMITI_FOTOCAMERA.secondiSveglia[0],
      max: LIMITI_FOTOCAMERA.secondiSveglia[1],
      passo: 5,
      unita: "secondi",
      disattivo: !v.presenza,
      cambia: (n) => cambia({ secondiSveglia: n }),
    })}
    ${campoInterruttore({
      id: "fotocamera-casa",
      titolo: "Avvisa Home Assistant",
      spiegazione:
        "Chi si avvicina lo sa anche Home Assistant (per il buongiorno). Al massimo una volta ogni 5 minuti.",
      valore: v.avvisaCasa,
      diSerie: d.avvisaCasa,
      cambia: (b) => cambia({ avvisaCasa: b }),
    })}
    ${campoNumero({
      id: "fotocamera-distanza",
      titolo: "Vicino, fino a",
      spiegazione: "Distanza stimata dalla grandezza del volto: se sbaglia, guardala qui sopra e regola.",
      valore: v.distanza,
      diSerie: d.distanza,
      min: LIMITI_FOTOCAMERA.distanza[0],
      max: LIMITI_FOTOCAMERA.distanza[1],
      passo: 0.1,
      cifre: 1,
      unita: "metri",
      cambia: (n) => cambia({ distanza: n }),
    })}
    ${campoScelta({
      id: "fotocamera-sensibilita",
      titolo: "Sensibilità",
      spiegazione: "Alta trova anche volti meno chiari (luce scarsa); bassa sbaglia meno.",
      valore: v.sensibilita,
      diSerie: d.sensibilita,
      opzioni: [
        ["bassa", "Bassa"],
        ["normale", "Normale"],
        ["alta", "Alta"],
      ],
      cambia: (s) => cambia({ sensibilita: s }),
    })}
    ${campoNumero({
      id: "fotocamera-fps",
      titolo: "Fotogrammi al secondo",
      spiegazione: "Di più = risponde prima, consuma di più.",
      valore: v.fps,
      diSerie: d.fps,
      min: LIMITI_FOTOCAMERA.fps[0],
      max: LIMITI_FOTOCAMERA.fps[1],
      passo: 1,
      unita: "al secondo",
      cambia: (n) => cambia({ fps: n }),
    })}
    ${campoOrario({
      id: "fotocamera-spenta-da",
      titolo: "Spenta dalle",
      spiegazione: "Ore in cui la fotocamera è spenta del tutto. Uguali = mai spenta.",
      valore: v.spentaDa,
      diSerie: d.spentaDa,
      cambia: (o) => cambia({ spentaDa: o }),
    })}
    ${campoOrario({
      id: "fotocamera-spenta-a",
      titolo: "Spenta fino alle",
      valore: v.spentaA,
      diSerie: d.spentaA,
      cambia: (o) => cambia({ spentaA: o }),
    })}`;
  }
}
customElements.define("jarvis-impostazioni-fotocamera", JarvisImpostazioniFotocamera);
