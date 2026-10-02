import {
  mdiCellphone,
  mdiCellphoneSound,
  mdiLaptop,
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
import "./jarvis-collega-spotify";

/** L'icona di un dispositivo Spotify: telefono, tablet, computer o altoparlante. */
function iconaDispositivo(tipo: string): string {
  const t = tipo.toLowerCase();
  return t === "smartphone" || t === "tablet" ? mdiCellphone : t === "computer" ? mdiLaptop : mdiSpeaker;
}

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
 *
 * v0.5.9: la musica parte dal dispositivo di QUESTO pannello (Impostazioni →
 * Musica). Se non è stato scelto, alla prima playlist il riquadro «Dove la
 * suono?» con i dispositivi di Spotify, «ricorda per questo pannello» e
 * «Collega questo dispositivo».
 */
export class JarvisPaginaMusica extends RiquadroSicuro {
  static override properties = { dove: { state: true }, ricorda: { state: true } };
  /** «Dove la suono?» aperto per questa playlist (uri). */
  declare dove: string | null;
  declare ricorda: boolean;

  constructor() {
    super();
    this.dove = null;
    this.ricorda = true;
  }

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
      /* v0.5.9: su quale dispositivo suona questo pannello, e «Dove la suono?» */
      .suona-su {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--attenuato);
        font-size: 15px;
        overflow-wrap: break-word;
        min-width: 0;
      }
      .suona-su b {
        color: var(--testo);
        font-weight: 500;
      }
      .velo {
        position: fixed;
        inset: 0;
        z-index: 20;
        background: rgb(0 0 0 / 60%);
        display: grid;
        place-items: center;
        padding: 16px;
        box-sizing: border-box;
      }
      .dove {
        width: min(480px, 100%);
        max-height: 100%;
        overflow: auto;
        box-sizing: border-box;
        padding: 20px;
        border-radius: var(--raggio);
        background: var(--superficie);
        border: 1px solid #2b303a;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .dove h2 {
        margin: 0;
        font-size: 22px;
        font-weight: 600;
        text-transform: none;
        letter-spacing: normal;
        color: var(--testo);
      }
      .dove .scelte {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .dove button {
        min-height: 52px;
        padding: 8px 14px;
        border-radius: 14px;
        border: 1px solid #343a46;
        background: none;
        color: var(--testo);
        font: inherit;
        font-size: 17px;
        text-align: left;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        touch-action: manipulation;
      }
      .dove button small {
        display: block;
        color: var(--attenuato);
        font-size: 13px;
      }
      .dove .annulla {
        justify-content: center;
        color: var(--attenuato);
      }
      .dove .ricorda {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 44px;
        font-size: 16px;
      }
      .dove .ricorda input {
        width: 22px;
        height: 22px;
      }
      .dove .nota {
        color: var(--attenuato);
        font-size: 15px;
        overflow-wrap: break-word;
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
    void m.leggiDispositivi();
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

  /**
   * Una playlist (v0.5.9): sul dispositivo di questo pannello. Prima partiva
   * "dove suona già", e dal Redmi era partita dall'Echo della cucina. Senza
   * una scelta salvata: «Dove la suono?». Se i dispositivi non si leggono
   * (jarvis_musica prima della 0.5.0) decide il server, come prima.
   */
  private async playlist(uri: string): Promise<void> {
    const m = connessione.musica;
    const d = m.dispositivi ?? (await m.leggiDispositivi());
    if (d && !d.scelto) {
      this.ricorda = m.pannello !== null;
      this.dove = uri;
      return;
    }
    await this.suona(uri);
  }

  private async suona(uri: string, dispositivo?: string): Promise<void> {
    const errore = await connessione.musica.riproduci(uri, dispositivo);
    if (errore) avvisi.mostra(`Musica: ${errore}`, "errore");
  }

  /**
   * Scelto in «Dove la suono?»: se «ricorda», si salva per il pannello. Da
   * «Collega» (`giaSalvato`) l'ha già salvato il collegamento: una volta sola.
   */
  private async scelto(nome: string, giaSalvato = false): Promise<void> {
    const uri = this.dove;
    this.dove = null;
    if (!uri) return;
    if (this.ricorda && !giaSalvato) {
      const errore = await connessione.musica.impostaDispositivo(nome);
      if (errore) avvisi.mostra(`Musica: ${errore}`, "errore");
    }
    await this.suona(uri, nome);
  }

  private chiudiDove(): void {
    this.dove = null;
    if (connessione.collegaSpotify.stato.fase !== "collegato") connessione.collegaSpotify.ferma();
  }

  /** Su quale dispositivo suona questo pannello, sopra le playlist. */
  private suonaSu(): TemplateResult | typeof nothing {
    const d = connessione.musica.dispositivi;
    if (!d) return nothing;
    return html`<div class="suona-su" data-test="musica-dispositivo">
      ${icona(mdiCellphoneSound)}
      <span
        >${
          d.scelto
            ? d.sceltoVisibile
              ? html`Questo pannello suona su <b>${d.scelto}</b>`
              : html`Su Spotify non vedo <b>${d.scelto}</b>: apri l'app Spotify, o ricollegalo in Impostazioni
                  → Musica`
            : "Ogni volta ti chiedo dove suonare (Impostazioni → Musica)"
        }</span
      >
    </div>`;
  }

  private riquadroDove(): TemplateResult | typeof nothing {
    if (!this.dove) return nothing;
    const m = connessione.musica;
    const d = m.dispositivi;
    const usabili = d?.elenco.filter((x) => x.comandabile) ?? [];
    const pannello = m.pannello;
    return html`<div class="velo" @click=${(e: Event) => e.target === e.currentTarget && this.chiudiDove()}>
      <div
        class="dove"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titolo-dove"
        data-test="dove-la-suono"
      >
        <h2 id="titolo-dove">Dove la suono?</h2>
        ${
          usabili.length
            ? html`<div class="scelte">
                ${usabili.map(
                  (x) =>
                    html`<button data-test="dove-dispositivo" @click=${() => void this.scelto(x.nome)}>
                      ${icona(iconaDispositivo(x.tipo))}<span
                        >${x.nome}${x.tipo ? html`<small>${x.tipo}</small>` : nothing}</span
                      >
                    </button>`,
                )}
              </div>`
            : html`<div class="nota">Spotify non vede nessun dispositivo acceso.</div>`
        }
        <label class="ricorda">
          <input
            type="checkbox"
            data-test="dove-ricorda"
            .checked=${this.ricorda && pannello !== null}
            ?disabled=${pannello === null}
            @change=${(e: Event) => (this.ricorda = (e.target as HTMLInputElement).checked)}
          />
          Ricorda per questo pannello
        </label>
        ${
          pannello === null
            ? html`<div class="nota">
                Per ricordarlo serve la stanza del pannello (Impostazioni → Stanza e nome).
              </div>`
            : nothing
        }
        <jarvis-collega-spotify
          @collegato=${(e: CustomEvent<string>) => void this.scelto(e.detail, true)}
        ></jarvis-collega-spotify>
        <button class="annulla" data-test="dove-annulla" @click=${() => this.chiudiDove()}>Annulla</button>
      </div>
    </div>`;
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
      ${this.lettore()} ${this.suonaSu()} ${this.stanze()} ${this.elencoPlaylist()} ${this.riquadroDove()}`;
  }
}
customElements.define("jarvis-pagina-musica", JarvisPaginaMusica);
