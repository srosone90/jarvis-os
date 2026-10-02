import { css, html, nothing, type TemplateResult } from "lit";
import { connessione } from "../connessione";
import { avvisi } from "../comune";
import { RiquadroSicuro, campoScelta, stileBase, stileCampi } from "../interfaccia";
import "./jarvis-collega-spotify";

/** "" nel campo = chiede ogni volta (nessun dispositivo salvato). */
const CHIEDI = "";

/**
 * Impostazioni → Musica (v0.5.9, jarvis_musica 0.5.0): su quale dispositivo
 * Spotify suona QUESTO pannello. La scelta si salva sul server
 * (`imposta_pannello`, col device_id del pannello), così vale anche a voce: «Jarvis,
 * metti la musica» detto qui suona qui. «Chiedi ogni volta» = nessuna scelta:
 * la schermata Musica chiede «Dove la suono?». Gli altri gusti della musica
 * (mini-lettore, stanze, preferite) restano in Impostazioni → Schermate.
 */
export class JarvisImpostazioniMusica extends RiquadroSicuro {
  static override styles = [
    stileBase,
    stileCampi,
    css`
      :host {
        display: block;
      }
      .blocco {
        padding: 12px 0;
        border-bottom: 1px solid #1c2029;
      }
      ol {
        margin: 8px 0 0;
        padding-left: 22px;
        color: var(--attenuato);
        font-size: 15px;
      }
      li {
        margin: 4px 0;
        overflow-wrap: break-word;
      }
    `,
  ];

  private smetti: (() => void)[] = [];

  override connectedCallback(): void {
    super.connectedCallback();
    const ridisegna = () => this.requestUpdate();
    this.smetti = [connessione.musica.ascolta(ridisegna), connessione.ascolta(ridisegna)];
    void connessione.musica.leggiDispositivi();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const f of this.smetti) f();
    this.smetti = [];
  }

  private async cambia(nome: string | null): Promise<void> {
    const errore = await connessione.musica.impostaDispositivo(nome);
    if (errore) avvisi.mostra(`Musica: ${errore}`, "errore");
  }

  private scelta(): TemplateResult {
    const m = connessione.musica;
    const d = m.dispositivi;
    const pannello = m.pannello;
    if (!pannello)
      return html`<div class="nota" data-test="musica-senza-stanza">
        Scegli prima la stanza di questo pannello (Impostazioni → Stanza e nome): la scelta del dispositivo si
        salva per stanza.
      </div>`;
    if (!d)
      return html`<div class="nota" data-test="musica-dispositivi-problema">
        ${
          m.problemaDispositivi
            ? `Non riesco a leggere i dispositivi di Spotify: ${m.problemaDispositivi}. Serve jarvis_musica 0.5.0.`
            : "Leggo i dispositivi di Spotify…"
        }
      </div>`;
    const opzioni: [string, string][] = [[CHIEDI, "Chiedi ogni volta"]];
    for (const x of d.elenco)
      if (x.comandabile) opzioni.push([x.nome, x.tipo ? `${x.nome} (${x.tipo})` : x.nome]);
    if (d.scelto && !d.sceltoVisibile) opzioni.push([d.scelto, `${d.scelto} (Spotify ora non lo vede)`]);
    return html`${campoScelta({
      id: "musica-dispositivo",
      titolo: "Questo pannello suona su:",
      spiegazione:
        "Vale per la schermata Musica e per «Jarvis, metti…» detto qui. Gli altoparlanti delle altre stanze solo se li nomini («in cucina»).",
      valore: d.scelto ?? CHIEDI,
      diSerie: CHIEDI,
      opzioni,
      cambia: (v) => void this.cambia(v === null || v === CHIEDI ? null : v),
    })}
    ${
      d.scelto && !d.sceltoVisibile
        ? html`<div class="nota" role="alert" data-test="musica-dispositivo-sparito">
            Su Spotify adesso non vedo «${d.scelto}»: apri l'app Spotify su quel dispositivo, o tocca
            «Ricollega».
          </div>`
        : nothing
    }`;
  }

  protected disegna(): TemplateResult {
    return html`${this.scelta()}
      <div class="blocco">
        <jarvis-collega-spotify></jarvis-collega-spotify>
        <ol class="nota" data-test="musica-istruzioni">
          <li>Installa l'app Spotify su questo telefono o tablet (su un computer basta il sito).</li>
          <li>
            Tocca «Collega questo dispositivo»: si apre Spotify. Fai il login con lo stesso account della
            casa, se lo chiede.
          </li>
          <li>Torna qui: il pannello riconosce da solo il dispositivo nuovo e lo salva.</li>
        </ol>
      </div>`;
  }
}
customElements.define("jarvis-impostazioni-musica", JarvisImpostazioniMusica);
