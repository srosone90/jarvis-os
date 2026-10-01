import {
  mdiMusic,
  mdiPause,
  mdiPlay,
  mdiSkipNext,
  mdiSkipPrevious,
  mdiSpeaker,
  mdiStar,
  mdiStarOutline,
  mdiVolumeMinus,
  mdiVolumePlus,
} from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { avvisi } from "../comandi/avvisi";
import { connessione } from "../connessione/connessione";
import { minuti, posizioneAdesso, type AzioneMusica } from "../musica/musica";
import { icona, RiquadroSicuro, stileBase } from "./base";

/** Stanze per spostare la musica: quelle scelte, o le aree di Home Assistant. */
export function stanzeMusica(): string[] {
  const scelte = connessione.musica.preferenze.stanze;
  if (scelte.length) return scelte;
  return [...connessione.registri.aree.map((a) => a.name)].sort((a, b) => a.localeCompare(b, "it"));
}

/**
 * Schermata Musica, variante M1 (mockup approvato il 30/09): copertina grande,
 * comandi grandi, volume, le stanze sotto per spostare la musica, e le
 * playlist (un tocco la fa partire). Tutto dallo stato vero di Spotify
 * (`jarvis_musica`); la barra di avanzamento scorre in locale e si riallinea a
 * ogni lettura. Un comando spegne i pulsanti finché Spotify non lo conferma.
 */
export class JarvisPaginaMusica extends RiquadroSicuro {
  static override styles = [
    stileBase,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-width: 0;
        min-height: 0;
        overflow: auto;
      }
      h1 {
        margin: 0;
        font-size: 26px;
        font-weight: 600;
      }
      .lettore {
        display: grid;
        grid-template-columns: minmax(140px, 220px) minmax(0, 1fr);
        gap: 20px;
        align-items: center;
        padding: 16px;
        border-radius: var(--raggio);
        background: linear-gradient(135deg, #1a1330, var(--superficie));
      }
      .copertina {
        width: 100%;
        aspect-ratio: 1;
        border-radius: 14px;
        object-fit: cover;
        background: #241a40;
        display: grid;
        place-items: center;
        color: #8a7bb8;
      }
      .copertina .icona {
        width: 56px;
        height: 56px;
      }
      .info {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
      }
      .titolo {
        font-size: 24px;
        font-weight: 600;
        overflow-wrap: anywhere;
      }
      .artisti,
      .dove {
        color: var(--attenuato);
        font-size: 16px;
        overflow-wrap: anywhere;
      }
      .barra-tempo {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        color: var(--attenuato);
        font-variant-numeric: tabular-nums;
      }
      .traccia {
        height: 6px;
        border-radius: 3px;
        background: #2b2540;
        overflow: hidden;
      }
      .traccia i {
        display: block;
        height: 100%;
        background: #a78bfa;
      }
      .comandi {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      button {
        min-width: 56px;
        min-height: 56px;
        border-radius: 50%;
        border: none;
        background: var(--superficie-2);
        color: var(--testo);
        display: grid;
        place-items: center;
        cursor: pointer;
        touch-action: manipulation;
      }
      button.principale {
        min-width: 72px;
        min-height: 72px;
        background: #a78bfa;
        color: #120c24;
      }
      button:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .volume {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-left: auto;
        font-variant-numeric: tabular-nums;
      }
      h2 {
        margin: 0 0 8px;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--attenuato);
      }
      .stanze {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .stanze button {
        border-radius: 999px;
        min-height: 48px;
        padding: 0 16px;
        display: inline-flex;
        gap: 8px;
        font: inherit;
        font-size: 16px;
      }
      .stanze button[aria-pressed="true"] {
        background: #2d2250;
        outline: 2px solid #a78bfa;
      }
      .stanze .icona,
      .playlist .icona {
        width: 22px;
        height: 22px;
      }
      .playlist {
        display: flex;
        flex-direction: column;
      }
      .pl {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 0;
        border-bottom: 1px solid #1c2029;
      }
      .pl img,
      .pl .vuota {
        width: 48px;
        height: 48px;
        border-radius: 8px;
        object-fit: cover;
        background: #241a40;
        flex: none;
      }
      .pl .nome {
        all: unset;
        flex: 1;
        min-width: 0;
        min-height: 48px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        cursor: pointer;
        font-size: 17px;
        overflow-wrap: anywhere;
      }
      .pl .nome small {
        color: var(--attenuato);
        font-size: 14px;
      }
      .pl .stella {
        min-width: 48px;
        min-height: 48px;
        background: none;
        color: var(--attenuato);
      }
      .pl .stella[aria-pressed="true"] {
        color: #f3c77a;
      }
      .nota {
        color: var(--attenuato);
        font-size: 15px;
      }
      @media (max-width: 699px) {
        .lettore {
          grid-template-columns: minmax(0, 1fr);
          justify-items: center;
          text-align: center;
        }
        .copertina {
          max-width: 240px;
        }
        .comandi {
          justify-content: center;
        }
        .volume {
          margin-left: 0;
        }
      }
      @media (orientation: landscape) and (max-height: 559px) {
        .lettore {
          grid-template-columns: 120px minmax(0, 1fr);
          padding: 10px 14px;
        }
        button {
          min-width: 48px;
          min-height: 48px;
        }
        button.principale {
          min-width: 56px;
          min-height: 56px;
        }
      }
    `,
  ];

  private smetti: (() => void)[] = [];
  private battito: ReturnType<typeof setInterval> | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    const m = connessione.musica;
    this.smetti = [m.osserva(), m.ascolta(() => this.requestUpdate())];
    void m.leggiPlaylist();
    // la barra di avanzamento: un secondo alla volta, in locale
    this.battito = setInterval(() => this.requestUpdate(), 1000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const f of this.smetti) f();
    this.smetti = [];
    clearInterval(this.battito);
  }

  private async comando(azione: AzioneMusica, dati: { dove?: string; livello?: number } = {}): Promise<void> {
    const errore = await connessione.musica.comanda(azione, dati);
    if (errore) avvisi.mostra(`Musica: ${errore}`, "errore");
  }

  private async playlist(uri: string): Promise<void> {
    const b = connessione.musica.brano;
    // dove suona già (anche in pausa); se non suona niente, decide jarvis_musica (la sua stanza predefinita)
    const dove = b && b.stato !== "niente" && b.stanza ? b.stanza : undefined;
    const errore = await connessione.musica.riproduci(uri, dove);
    if (errore) avvisi.mostra(`Musica: ${errore}`, "errore");
  }

  private lettore(): TemplateResult {
    const m = connessione.musica;
    const b = m.brano;
    const occupata = m.occupata !== null;
    if (!b || b.stato === "niente")
      return html`<div class="lettore" data-test="musica-niente">
        <div class="copertina">${icona(mdiMusic)}</div>
        <div class="info">
          <div class="titolo">Non suona niente</div>
          <div class="dove">
            ${m.problema ? `La musica non risponde: ${m.problema}` : "Scegli una playlist qui sotto."}
          </div>
        </div>
      </div>`;
    const adesso = Date.now();
    const pos = posizioneAdesso(b, adesso);
    const pct = b.durataMs > 0 ? Math.min(100, (pos / b.durataMs) * 100) : 0;
    const suona = b.stato === "in_riproduzione";
    return html`<div class="lettore" data-test="musica-lettore">
      ${
        b.copertina
          ? html`<img class="copertina" src=${b.copertina} alt="Copertina di ${b.titolo}" />`
          : html`<div class="copertina">${icona(mdiMusic)}</div>`
      }
      <div class="info">
        <div class="titolo" data-test="musica-titolo">${b.titolo}</div>
        ${b.artisti ? html`<div class="artisti">${b.artisti}</div>` : nothing}
        <div class="dove" data-test="musica-dove">
          ${suona ? "Suona" : "In pausa"} su ${b.dispositivo}${b.stanza ? ` · ${b.stanza}` : ""}
        </div>
        ${
          b.durataMs > 0
            ? html`<div class="barra-tempo">
                <span data-test="musica-posizione">${minuti(pos)}</span>
                <span
                  class="traccia"
                  role="progressbar"
                  aria-valuenow=${Math.round(pct)}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  ><i style="width: ${pct}%"></i
                ></span>
                <span>${minuti(b.durataMs)}</span>
              </div>`
            : nothing
        }
        <div class="comandi">
          <button
            aria-label="Precedente"
            data-test="musica-precedente"
            ?disabled=${occupata}
            @click=${() => void this.comando("precedente")}
          >
            ${icona(mdiSkipPrevious)}
          </button>
          <button
            class="principale"
            aria-label=${suona ? "Pausa" : "Riprendi"}
            data-test="musica-play"
            ?disabled=${occupata}
            @click=${() => void this.comando(suona ? "pausa" : "riprendi")}
          >
            ${icona(suona ? mdiPause : mdiPlay)}
          </button>
          <button
            aria-label="Successivo"
            data-test="musica-successivo"
            ?disabled=${occupata}
            @click=${() => void this.comando("successivo")}
          >
            ${icona(mdiSkipNext)}
          </button>
          ${
            b.volume !== null
              ? html`<span class="volume">
                  <button
                    aria-label="Abbassa il volume"
                    data-test="musica-abbassa"
                    ?disabled=${occupata}
                    @click=${() => void this.comando("abbassa")}
                  >
                    ${icona(mdiVolumeMinus)}
                  </button>
                  <span data-test="musica-volume">${b.volume}%</span>
                  <button
                    aria-label="Alza il volume"
                    data-test="musica-alza"
                    ?disabled=${occupata}
                    @click=${() => void this.comando("alza")}
                  >
                    ${icona(mdiVolumePlus)}
                  </button>
                </span>`
              : nothing
          }
        </div>
      </div>
    </div>`;
  }

  private stanze(): TemplateResult | typeof nothing {
    const b = connessione.musica.brano;
    if (!b || b.stato === "niente") return nothing;
    const elenco = stanzeMusica();
    if (!elenco.length) return nothing;
    const occupata = connessione.musica.occupata !== null;
    return html`<section>
      <h2>Sposta la musica</h2>
      <div class="stanze" data-test="musica-stanze">
        ${elenco.map(
          (s) =>
            html`<button
              aria-pressed=${s === b.stanza ? "true" : "false"}
              data-test="musica-stanza"
              ?disabled=${occupata || s === b.stanza}
              @click=${() => void this.comando("sposta", { dove: s })}
            >
              ${icona(mdiSpeaker)}${s}
            </button>`,
        )}
      </div>
    </section>`;
  }

  private elencoPlaylist(): TemplateResult {
    const m = connessione.musica;
    const elenco = m.playlist;
    const preferite = m.preferenze.preferite;
    return html`<section>
      <h2>Playlist</h2>
      ${
        elenco === null
          ? html`<div class="nota">Leggo le playlist…</div>`
          : elenco.length === 0
            ? html`<div class="nota">Nessuna playlist da Spotify.</div>`
            : html`<div class="playlist" data-test="musica-playlist">
                ${elenco.map(
                  (p) =>
                    html`<div class="pl" data-test="playlist">
                      ${p.copertina ? html`<img src=${p.copertina} alt="" />` : html`<span class="vuota"></span>`}
                      <button
                        class="nome"
                        data-test="playlist-riproduci"
                        ?disabled=${m.occupata !== null}
                        @click=${() => void this.playlist(p.uri)}
                      >
                        <span data-test="playlist-nome">${p.nome}</span>${
                          p.proprietario ? html`<small>${p.proprietario}</small>` : nothing
                        }
                      </button>
                      <button
                        class="stella"
                        aria-label="Preferita: ${p.nome}"
                        aria-pressed=${preferite.includes(p.uri) ? "true" : "false"}
                        data-test="playlist-preferita"
                        @click=${() => m.preferita(p.uri)}
                      >
                        ${icona(preferite.includes(p.uri) ? mdiStar : mdiStarOutline)}
                      </button>
                    </div>`,
                )}
              </div>`
      }
    </section>`;
  }

  protected disegna(): TemplateResult {
    return html`<h1>Musica</h1>
      ${this.lettore()} ${this.stanze()} ${this.elencoPlaylist()}`;
  }
}
customElements.define("jarvis-pagina-musica", JarvisPaginaMusica);
