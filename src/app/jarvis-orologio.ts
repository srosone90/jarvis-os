import { css, html, type TemplateResult } from "lit";
import { RiquadroSicuro, stileBase } from "../interfaccia";

const DURATA_PRESSIONE_MS = 3000;
const TOLLERANZA_MOVIMENTO_PX = 12;

/**
 * Orologio e data. Si aggiorna allo scoccare di ogni minuto (non ogni secondo:
 * meno lavoro per un tablet economico acceso 24/7).
 *
 * Tenendolo premuto 3 secondi apre la schermata diagnostica (evento
 * `apri-diagnostica`).
 */
export class JarvisOrologio extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        display: block;
        user-select: none;
        -webkit-user-select: none;
        touch-action: manipulation;
        cursor: default;
      }
      .ora {
        font-size: var(--dimensione-ora, 108px);
        font-weight: 200;
        line-height: 0.95;
        letter-spacing: -0.03em;
        font-variant-numeric: tabular-nums;
      }
      .data {
        font-size: 22px;
        color: var(--attenuato);
        margin-top: 4px;
      }
      @media (orientation: landscape) and (max-height: 559px) {
        .data {
          font-size: 15px;
          margin-top: 2px;
        }
      }
      .premuto .ora {
        opacity: 0.6;
        transition: opacity 3s linear;
      }
    `,
  ];

  static override properties = { adesso: { state: true }, premuto: { state: true } };
  declare adesso: Date;
  declare premuto: boolean;

  private timer: ReturnType<typeof setTimeout> | undefined;
  private timerPressione: ReturnType<typeof setTimeout> | undefined;
  private inizioPressione: { x: number; y: number } | null = null;

  constructor() {
    super();
    this.adesso = new Date();
    this.premuto = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.pianifica();
    this.addEventListener("pointerdown", this.suPremi);
    this.addEventListener("pointermove", this.suMuovi);
    this.addEventListener("pointerup", this.annullaPressione);
    this.addEventListener("pointercancel", this.annullaPressione);
    this.addEventListener("pointerleave", this.annullaPressione);
    this.addEventListener("contextmenu", this.bloccaMenu);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.timer);
    this.annullaPressione();
    this.removeEventListener("pointerdown", this.suPremi);
    this.removeEventListener("pointermove", this.suMuovi);
    this.removeEventListener("pointerup", this.annullaPressione);
    this.removeEventListener("pointercancel", this.annullaPressione);
    this.removeEventListener("pointerleave", this.annullaPressione);
    this.removeEventListener("contextmenu", this.bloccaMenu);
  }

  /** Prossimo aggiornamento esattamente al cambio di minuto. */
  private pianifica(): void {
    clearTimeout(this.timer);
    const ora = new Date();
    this.adesso = ora;
    const alProssimoMinuto = 60_000 - (ora.getSeconds() * 1000 + ora.getMilliseconds()) + 20;
    this.timer = setTimeout(() => this.pianifica(), alProssimoMinuto);
  }

  private readonly suPremi = (e: PointerEvent): void => {
    this.inizioPressione = { x: e.clientX, y: e.clientY };
    this.premuto = true;
    clearTimeout(this.timerPressione);
    this.timerPressione = setTimeout(() => {
      this.annullaPressione();
      this.dispatchEvent(new CustomEvent("apri-diagnostica", { bubbles: true, composed: true }));
    }, DURATA_PRESSIONE_MS);
  };

  private readonly suMuovi = (e: PointerEvent): void => {
    if (!this.inizioPressione) return;
    const dx = e.clientX - this.inizioPressione.x;
    const dy = e.clientY - this.inizioPressione.y;
    if (Math.hypot(dx, dy) > TOLLERANZA_MOVIMENTO_PX) this.annullaPressione();
  };

  private readonly annullaPressione = (): void => {
    clearTimeout(this.timerPressione);
    this.timerPressione = undefined;
    this.inizioPressione = null;
    this.premuto = false;
  };

  private readonly bloccaMenu = (e: Event): void => e.preventDefault();

  protected disegna(): TemplateResult {
    const ora = this.adesso.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    const data = this.adesso.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
    return html`<div class=${this.premuto ? "premuto" : ""}>
      <div class="ora" data-test="ora" aria-live="off">${ora}</div>
      <div class="data">${data}</div>
    </div>`;
  }
}
customElements.define("jarvis-orologio", JarvisOrologio);
