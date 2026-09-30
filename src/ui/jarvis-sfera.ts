import { css, html, LitElement, nothing, svg, type TemplateResult } from "lit";

/**
 * La sfera di luce (fase G): la stessa per lo schermo a riposo (variante C) e
 * per l'Hub (H1). Solo CSS: niente librerie, niente canvas, al massimo una
 * trasformazione animata; di notte e con "riduci movimento" è ferma.
 *
 * Stati: fioca (riposo, respira piano), notturna (ferma, rosso scuro),
 * ascolto (cresce col volume del microfono: `livello` 0..1), pensa (vortica),
 * risponde (pulsa), errore (colore di avviso, ferma).
 * Gli anelli attorno sono i timer: `frazione` di tempo che resta.
 */
export type StatoSfera = "fioca" | "notturna" | "ascolto" | "pensa" | "risponde" | "errore";

export interface Anello {
  frazione: number;
  pausa: boolean;
}

export class JarvisSfera extends LitElement {
  static override properties = {
    stato: { type: String, reflect: true },
    livello: { type: Number },
    anelli: { attribute: false },
  };
  declare stato: StatoSfera;
  declare livello: number;
  declare anelli: Anello[];

  constructor() {
    super();
    this.stato = "fioca";
    this.livello = 0;
    this.anelli = [];
  }

  static override styles = css`
    :host {
      display: block;
      position: relative;
      aspect-ratio: 1;
      width: var(--lato, 300px);
    }
    .corpo {
      position: absolute;
      inset: 11%;
      border-radius: 50%;
      background: radial-gradient(
        circle at 38% 34%,
        #ffffffcc 0%,
        #9cc0ff 12%,
        var(--accento, #5b8def) 34%,
        #2a4fb0 58%,
        #0d1a40 76%
      );
      box-shadow:
        0 0 60px 14px #5b8def55,
        0 0 160px 40px #2a4fb033;
      transform: scale(var(--scala, 1));
      transition: transform 90ms linear;
    }
    :host([stato="fioca"]) .corpo {
      filter: saturate(0.7) brightness(0.55);
      animation: respira 6s ease-in-out infinite;
    }
    :host([stato="notturna"]) .corpo {
      filter: hue-rotate(160deg) saturate(0.8) brightness(0.35);
      box-shadow: 0 0 40px 6px #b8452f33;
    }
    :host([stato="ascolto"]) .corpo {
      box-shadow:
        0 0 0 10px #5b8def33,
        0 0 0 26px #5b8def1f,
        0 0 120px 30px #5b8def88;
    }
    :host([stato="pensa"]) .corpo {
      background: conic-gradient(from 40deg, #5b8def, #9a7bff, #5b8def, #3ecfcf, #5b8def);
      box-shadow: 0 0 120px 30px #7b6bff77;
      animation: vortica 1.6s linear infinite;
    }
    :host([stato="risponde"]) .corpo {
      animation: pulsa 1.2s ease-in-out infinite;
      box-shadow:
        0 0 0 16px #5b8def26,
        0 0 0 40px #5b8def14,
        0 0 160px 40px #5b8def88;
    }
    :host([stato="errore"]) .corpo {
      background: radial-gradient(circle at 38% 34%, #fff3 0%, #f0a33a 30%, #8a560f 64%, #2a1a05 78%);
      box-shadow: 0 0 120px 30px #f0a33a55;
    }
    @keyframes respira {
      0%,
      100% {
        transform: scale(0.96);
      }
      50% {
        transform: scale(1.02);
      }
    }
    @keyframes vortica {
      to {
        transform: rotate(360deg);
      }
    }
    @keyframes pulsa {
      0%,
      100% {
        transform: scale(0.97);
      }
      50% {
        transform: scale(1.04);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .corpo {
        animation: none !important;
      }
    }
    svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
      pointer-events: none;
    }
  `;

  protected override render(): TemplateResult {
    // ascolto: la sfera segue il volume del microfono
    const scala = this.stato === "ascolto" ? 1 + Math.min(1, this.livello) * 0.12 : 1;
    const notte = this.stato === "notturna";
    return html`<div class="corpo" style="--scala:${scala}"></div>
      ${
        this.anelli.length
          ? svg`<svg viewBox="0 0 100 100" aria-hidden="true">${this.anelli.slice(0, 2).map((a, i) => {
              const r = 48 - i * 5;
              const c = 2 * Math.PI * r;
              const f = Math.max(0, Math.min(1, a.frazione));
              const colore = a.pausa ? "#6b7280" : notte ? "#b8452f" : i === 0 ? "#f3c77a" : "#8fb4ff";
              return svg`<circle cx="50" cy="50" r=${r} fill="none" stroke="#ffffff14" stroke-width="2.2"></circle>
                <circle cx="50" cy="50" r=${r} fill="none" stroke=${colore} stroke-width="2.2"
                  stroke-linecap="round" stroke-dasharray=${`${c * f} ${c}`}></circle>`;
            })}</svg>`
          : nothing
      }`;
  }
}
customElements.define("jarvis-sfera", JarvisSfera);
