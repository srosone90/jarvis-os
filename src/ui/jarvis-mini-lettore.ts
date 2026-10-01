import { mdiMusic, mdiPause, mdiPlay } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { avvisi } from "../comandi/avvisi";
import { connessione } from "../connessione/connessione";
import { posizioneAdesso } from "../musica/musica";
import { navigatore } from "../navigazione/istanza";
import { icona, RiquadroSicuro, stileBase } from "./base";

/** "Queen, David Bowie" → "Queen": nel mini c'è posto per uno, l'elenco intero è nella schermata Musica. */
export function primoArtista(artisti: string): string {
  return artisti.split(",")[0]?.trim() ?? "";
}

/**
 * Mini-lettore A (mockup M, 30/09): nella Casa, solo quando qualcosa suona.
 * Copertina, titolo, pausa; il tocco sul resto apre la schermata Musica.
 * Dove sta (sotto l'orologio o sopra la barra) e se c'è si sceglie in
 * Impostazioni → Schermate.
 */
export class JarvisMiniLettore extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      :host([nascosto]) {
        display: none;
      }
      .mini {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 10px;
        border-radius: 16px;
        background: #1a1330;
        border: 1px solid #3a2a5a;
      }
      .apri {
        all: unset;
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
      }
      img,
      .vuota {
        width: 44px;
        height: 44px;
        border-radius: 8px;
        object-fit: cover;
        background: #241a40;
        flex: none;
        display: grid;
        place-items: center;
        color: #8a7bb8;
      }
      .testo {
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      /* mai testo tagliato coi puntini: i titoli lunghi vanno a capo */
      .titolo {
        font-size: 16px;
        line-height: 1.25;
        overflow-wrap: break-word;
      }
      .sotto {
        font-size: 13px;
        line-height: 1.25;
        color: var(--attenuato);
        overflow-wrap: break-word;
      }
      .traccia {
        height: 3px;
        margin-top: 4px;
        border-radius: 2px;
        background: #2b2540;
        overflow: hidden;
      }
      .traccia i {
        display: block;
        height: 100%;
        background: #a78bfa;
      }
      button.pausa {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: none;
        background: #a78bfa;
        color: #120c24;
        display: grid;
        place-items: center;
        cursor: pointer;
        flex: none;
      }
      button.pausa:disabled {
        opacity: 0.4;
      }
      .icona {
        width: 24px;
        height: 24px;
      }
    `,
  ];

  private smetti: (() => void)[] = [];
  private battito: ReturnType<typeof setInterval> | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    const m = connessione.musica;
    this.smetti = [m.osserva(), m.ascolta(() => this.requestUpdate())];
    this.battito = setInterval(() => this.requestUpdate(), 1000);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const f of this.smetti) f();
    this.smetti = [];
    clearInterval(this.battito);
  }

  protected disegna(): TemplateResult {
    const m = connessione.musica;
    const b = m.brano;
    const visibile = m.preferenze.mini && b?.stato === "in_riproduzione";
    // nascosto del tutto: niente spazio vuoto nella colonna dell'orologio
    this.toggleAttribute("nascosto", !visibile);
    if (!visibile || !b) return html``;
    const pct = b.durataMs > 0 ? Math.min(100, (posizioneAdesso(b, Date.now()) / b.durataMs) * 100) : 0;
    return html`<div class="mini" data-test="mini-lettore">
      <button
        class="apri"
        aria-label="Apri la musica"
        @click=${() => navigatore.vai({ tipo: "musica" }, "mini-lettore")}
      >
        ${b.copertina ? html`<img src=${b.copertina} alt="" />` : html`<span class="vuota">${icona(mdiMusic)}</span>`}
        <span class="testo">
          <span class="titolo" data-test="mini-titolo">${b.titolo}</span>
          <span class="sotto">${[primoArtista(b.artisti), b.stanza].filter(Boolean).join(" · ")}</span>
          ${b.durataMs > 0 ? html`<span class="traccia"><i style="width: ${pct}%"></i></span>` : nothing}
        </span>
      </button>
      <button
        class="pausa"
        aria-label="Pausa"
        data-test="mini-pausa"
        ?disabled=${m.occupata !== null}
        @click=${async () => {
          const errore = await m.comanda("pausa");
          if (errore) avvisi.mostra(`Musica: ${errore}`, "errore");
        }}
      >
        ${icona(m.suona ? mdiPause : mdiPlay)}
      </button>
    </div>`;
  }
}
customElements.define("jarvis-mini-lettore", JarvisMiniLettore);
