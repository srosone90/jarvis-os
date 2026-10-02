import { mdiMicrophone, mdiMicrophoneOff } from "@mdi/js";
import {
  css,
  html,
  nothing,
  type ReactiveController,
  type ReactiveControllerHost,
  type TemplateResult,
} from "lit";
import { connessione } from "../connessione";
import { RiquadroSicuro, icona, stileBase } from "../interfaccia";

/** Ridisegna l'host quando cambia lo stato di «Jarvis» sempre in ascolto. */
export class OsservaParola implements ReactiveController {
  private smetti: (() => void) | null = null;

  constructor(private readonly host: ReactiveControllerHost) {
    host.addController(this);
  }

  hostConnected(): void {
    this.smetti = connessione.parola.ascolta(() => this.host.requestUpdate());
  }

  hostDisconnected(): void {
    this.smetti?.();
    this.smetti = null;
  }
}

/**
 * Indicatore del microfono (v0.5.0), sempre visibile mentre «Jarvis» ascolta:
 * chi è nella stanza deve sapere che il microfono è aperto (CLAUDE.md,
 * privacy). Microfono barrato se l'ascolto voluto si è fermato. Icone diverse,
 * mai solo il colore, e il testo per chi usa un lettore di schermo.
 */
export class JarvisIndicatoreParola extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        display: inline-flex;
      }
      span {
        display: inline-flex;
        align-items: center;
        color: var(--accento);
      }
      span.fermo {
        color: var(--avviso);
      }
      .icona {
        width: 18px;
        height: 18px;
      }
    `,
  ];

  constructor() {
    super();
    new OsservaParola(this);
  }

  protected disegna(): TemplateResult {
    const p = connessione.parola;
    if (p.stato === "ascolta")
      return html`<span data-test="indicatore-parola" data-stato="ascolta" title="«Jarvis» ti ascolta"
        >${icona(mdiMicrophone, "«Jarvis» ti ascolta")}</span
      >`;
    if (p.acceso && (p.stato === "fermo" || p.stato === "nonDisponibile"))
      return html`<span
        class="fermo"
        data-test="indicatore-parola"
        data-stato="fermo"
        title="«Jarvis» non ascolta: vedi Impostazioni → Voce"
        >${icona(mdiMicrophoneOff, "«Jarvis» non ascolta")}</span
      >`;
    return html`${nothing}`;
  }
}
customElements.define("jarvis-indicatore-parola", JarvisIndicatoreParola);
