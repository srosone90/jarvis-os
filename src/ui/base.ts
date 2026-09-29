import {
  css,
  html,
  LitElement,
  svg,
  type ReactiveController,
  type ReactiveControllerHost,
  type TemplateResult,
} from "lit";
import { connessione, SOGLIA_OFFLINE_MS, type InfoConnessione } from "../connessione/connessione";
import { descriviErrore, log } from "../diagnostica/log";

/** Icona SVG da un path di @mdi/js. */
export function icona(percorso: string, etichetta?: string): TemplateResult {
  return html`<svg
    class="icona"
    viewBox="0 0 24 24"
    role=${etichetta ? "img" : "presentation"}
    aria-label=${etichetta ?? ""}
    aria-hidden=${etichetta ? "false" : "true"}
  >
    ${svg`<path d=${percorso}></path>`}
  </svg>`;
}

/**
 * Riquadro protetto ("error boundary"): se il suo disegno va in errore mostra
 * "non disponibile" e annota l'errore nel log, invece di bloccare l'intera
 * interfaccia. Le sottoclassi implementano `disegna()` al posto di `render()`.
 */
export abstract class RiquadroSicuro extends LitElement {
  private guastoSegnalato = false;

  protected abstract disegna(): TemplateResult;

  protected override render(): TemplateResult {
    try {
      const risultato = this.disegna();
      this.guastoSegnalato = false;
      return risultato;
    } catch (errore) {
      if (!this.guastoSegnalato)
        log.errore(`Riquadro ${this.localName} in errore: ${descriviErrore(errore)}`);
      this.guastoSegnalato = true;
      return html`<div class="guasto" role="status">Riquadro non disponibile</div>`;
    }
  }
}

/** Ridisegna l'host solo quando cambiano le entità indicate. */
export class OsservaEntita implements ReactiveController {
  private smetti: (() => void) | null = null;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly ids: () => readonly string[],
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    this.smetti = connessione.negozio.osserva(this.ids(), () => this.host.requestUpdate());
  }

  hostDisconnected(): void {
    this.smetti?.();
    this.smetti = null;
  }
}

/**
 * Stato della connessione per l'host, con `offline` che diventa vero solo dopo
 * SOGLIA_OFFLINE_MS senza HA: una riconnessione di un secondo non fa lampeggiare
 * banner e valori.
 */
export class OsservaConnessione implements ReactiveController {
  private smetti: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly host: ReactiveControllerHost) {
    host.addController(this);
  }

  get info(): InfoConnessione {
    return connessione.stato;
  }

  get offline(): boolean {
    const da = this.info.disconnessoDa;
    return this.info.stato !== "connesso" && da !== null && Date.now() - da >= SOGLIA_OFFLINE_MS;
  }

  hostConnected(): void {
    this.smetti = connessione.ascolta(() => this.aggiorna());
    this.aggiorna();
  }

  hostDisconnected(): void {
    this.smetti?.();
    this.smetti = null;
    clearTimeout(this.timer);
  }

  private aggiorna(): void {
    clearTimeout(this.timer);
    const da = this.info.disconnessoDa;
    if (this.info.stato !== "connesso" && da !== null) {
      const mancano = SOGLIA_OFFLINE_MS - (Date.now() - da);
      if (mancano > 0) this.timer = setTimeout(() => this.host.requestUpdate(), mancano + 50);
    }
    this.host.requestUpdate();
  }
}

export const stileBase = css`
  :host {
    box-sizing: border-box;
    color: var(--testo);
  }
  *,
  *::before,
  *::after {
    box-sizing: inherit;
  }
  .icona {
    width: 28px;
    height: 28px;
    fill: currentColor;
    flex: none;
  }
  .guasto {
    color: var(--attenuato);
    font-size: 15px;
    padding: 12px;
  }
  .riquadro {
    background: var(--superficie);
    border-radius: var(--raggio);
  }
  .non-aggiornato {
    color: var(--avviso);
  }
`;
