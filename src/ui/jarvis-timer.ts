import { mdiAlarm, mdiPause, mdiTimerOutline } from "@mdi/js";
import { css, html, type TemplateResult } from "lit";
import { connessione } from "../connessione/connessione";
import { formattaRimasto, rimastoMs, titoloFinito } from "../timer/timer";
import { icona, RiquadroSicuro, stileBase } from "./base";

/**
 * Timer attivi sotto l'orologio (v0.4.5): nome e conto alla rovescia, un
 * secondo alla volta. Senza timer non occupa spazio.
 */
export class JarvisTimer extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        display: block;
      }
      :host([hidden]) {
        display: none;
      }
      .elenco {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .timer {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 8px;
        min-width: 0;
        max-width: 100%;
        padding: 8px 14px 8px 10px;
        border-radius: 20px;
        background: var(--superficie);
        border: 1px solid #2b303a;
        font-size: 18px;
      }
      .timer .icona {
        width: 22px;
        height: 22px;
        color: var(--accento);
      }
      /* nomi lunghi: vanno a capo tra le parole, mai tagliati; se la colonna è stretta
         il conto e «in pausa» scendono sotto (v0.5.8: «domeni-ca» spezzata a 915x412) */
      .nome {
        flex: 1 1 auto;
        min-width: 0;
        overflow-wrap: break-word;
        color: var(--attenuato);
      }
      .rimasto,
      .in-pausa {
        white-space: nowrap;
      }
      .rimasto {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }
      .pausa .rimasto {
        color: var(--attenuato);
      }
      .pausa .icona {
        color: var(--attenuato);
      }
      .in-pausa {
        font-size: 14px;
        color: var(--attenuato);
      }
      .zero .rimasto {
        color: var(--avviso);
      }
      @media (orientation: landscape) and (max-height: 559px) {
        .timer {
          padding: 4px 10px 4px 8px;
          font-size: 15px;
        }
      }
    `,
  ];

  static override properties = { massimo: { type: Number } };
  /** Quanti timer in vista al massimo (sul tablet la colonna non scorre); gli altri diventano "+N". */
  declare massimo: number;

  constructor() {
    super();
    this.massimo = Infinity;
  }

  private smetti: (() => void) | null = null;
  private battito: ReturnType<typeof setInterval> | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    this.smetti = connessione.timer.ascolta(() => this.requestUpdate());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.smetti?.();
    this.smetti = null;
    clearInterval(this.battito);
    this.battito = undefined;
  }

  protected override updated(): void {
    const ci = connessione.timer.attivi.length > 0;
    this.hidden = !ci;
    // il secondo che scorre solo quando serve (tablet economico acceso 24/7)
    if (ci && this.battito === undefined) this.battito = setInterval(() => this.requestUpdate(), 1000);
    if (!ci && this.battito !== undefined) {
      clearInterval(this.battito);
      this.battito = undefined;
    }
  }

  protected disegna(): TemplateResult {
    const ora = Date.now();
    const tutti = connessione.timer.attivi;
    // i più vicini alla fine restano in vista (l'elenco è già in ordine di scadenza)
    const inVista = tutti.length > this.massimo ? tutti.slice(0, Math.max(1, this.massimo - 1)) : tutti;
    const altri = tutti.length - inVista.length;
    return html`<div class="elenco" role="list" aria-label="Timer attivi" data-test="timer-attivi">
      ${inVista.map((t) => {
        const rimasto = rimastoMs(t, ora);
        return html`<div
          class="timer ${rimasto <= 0 && !t.inPausa ? "zero" : ""} ${t.inPausa ? "pausa" : ""}"
          role="listitem"
          data-test="timer"
          data-id=${t.id}
        >
          ${icona(t.inPausa ? mdiPause : mdiTimerOutline)}
          ${t.nome ? html`<span class="nome">${t.nome}</span>` : ""}
          <span class="rimasto" data-test="timer-rimasto">${formattaRimasto(rimasto)}</span>
          ${t.inPausa ? html`<span class="in-pausa" data-test="timer-in-pausa">in pausa</span>` : ""}
        </div>`;
      })}
      ${
        altri > 0
          ? html`<div class="timer altri" role="listitem" data-test="timer-altri">
              ${icona(mdiTimerOutline)}<span class="rimasto">+${altri}</span>
            </div>`
          : ""
      }
    </div>`;
  }
}
customElements.define("jarvis-timer", JarvisTimer);

/**
 * "Timer … finito" sopra tutto (anche chat e diagnostica), con uno Stop
 * grande da toccare senza guardare. Sparisce con Stop o da solo dopo 2 minuti.
 */
export class JarvisTimerFinito extends RiquadroSicuro {
  /** Sopra il riposo di notte: rosso scuro, niente arancione acceso (fase G). */
  static override properties = { notte: { type: Boolean, reflect: true } };
  declare notte: boolean;

  constructor() {
    super();
    this.notte = false;
  }

  static override styles = [
    stileBase,
    css`
      :host {
        position: fixed;
        inset: 0;
        z-index: 40;
        display: grid;
        place-items: center;
        padding: 24px;
        background: color-mix(in srgb, var(--sfondo) 92%, transparent);
      }
      .finito {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        max-width: 640px;
        text-align: center;
      }
      .finito > .icona {
        width: 72px;
        height: 72px;
        color: var(--avviso);
        animation: squilla 0.8s ease-in-out infinite;
      }
      @keyframes squilla {
        0%,
        100% {
          transform: rotate(0);
        }
        25% {
          transform: rotate(-12deg);
        }
        75% {
          transform: rotate(12deg);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .finito > .icona {
          animation: none;
        }
      }
      h2 {
        margin: 0;
        font-size: clamp(28px, 6vw, 48px);
        font-weight: 600;
        line-height: 1.15;
        overflow-wrap: anywhere;
      }
      .altri {
        margin: 0;
        font-size: 20px;
        color: var(--attenuato);
      }
      button {
        margin-top: 12px;
        min-width: min(320px, 80vw);
        min-height: 96px;
        border: none;
        border-radius: 48px;
        background: var(--avviso);
        color: #1a1204;
        font: inherit;
        font-size: 36px;
        font-weight: 700;
        cursor: pointer;
        touch-action: manipulation;
      }
      :host([notte]) {
        background: #000d;
      }
      :host([notte]) .finito > .icona {
        color: #b8452f;
      }
      :host([notte]) h2 {
        color: #d9a397;
      }
      :host([notte]) button {
        background: #b8452f;
        color: #140806;
      }
      @media (orientation: landscape) and (max-height: 559px) {
        .finito {
          gap: 8px;
        }
        .finito > .icona {
          width: 48px;
          height: 48px;
        }
        button {
          min-height: 72px;
          margin-top: 4px;
        }
      }
    `,
  ];

  protected disegna(): TemplateResult {
    const [primo, ...altri] = connessione.timer.suonano;
    return html`<div class="finito" role="alertdialog" aria-labelledby="titolo" data-test="timer-finito">
      ${icona(mdiAlarm)}
      <h2 id="titolo">${titoloFinito(primo?.nome ?? null)}</h2>
      ${
        altri.length > 0
          ? html`<p class="altri">Finito anche: ${altri.map((a) => a.nome ?? "senza nome").join(", ")}</p>`
          : ""
      }
      <button data-test="timer-stop" @click=${() => connessione.timer.ferma()}>Stop</button>
    </div>`;
  }

  override firstUpdated(): void {
    this.renderRoot.querySelector("button")?.focus();
  }
}
customElements.define("jarvis-timer-finito", JarvisTimerFinito);
