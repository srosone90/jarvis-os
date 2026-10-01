import {
  mdiAirConditioner,
  mdiBatteryAlert,
  mdiFlash,
  mdiLanDisconnect,
  mdiPowerPlugOutline,
  mdiTelevision,
  mdiToggleSwitchOutline,
} from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { PREFERENZE } from "../configurazione";
import { connessione } from "../connessione/connessione";
import { descriviErrore, log } from "../diagnostica/log";
import { batterieBasse, durataTesto, eventiDaRegistro, quandoTesto, type EventoCasa } from "../eventi/eventi";
import { costruisciStanze } from "../registri/modello";
import { schermate } from "../pagine/preferenze";
import { icona, OsservaEntita, RiquadroSicuro, stileBase } from "./base";
import { stilePagina } from "./stile-pagina";

type Filtro = "tutti" | "dispositivi" | "batterie" | "connessione";
const FILTRI: readonly [Filtro, string][] = [
  ["tutti", "Tutti"],
  ["dispositivi", "Dispositivi"],
  ["batterie", "Batterie"],
  ["connessione", "Connessione"],
];
const RILEGGI_OGNI_MS = 60_000;

const ICONE: Record<string, string> = {
  media_player: mdiTelevision,
  climate: mdiAirConditioner,
  switch: mdiToggleSwitchOutline,
  light: mdiFlash,
};

/**
 * Schermata Avvisi ed eventi (v0.5.7, mockup N2 "8"): cosa è successo in
 * casa, con i filtri del mockup. Dispositivi dal registro di Home Assistant
 * (solo quelli del pannello, ultime N ore), batterie basse adesso, e le
 * interruzioni della connessione viste da questo pannello. Si rilegge ogni
 * minuto finché la schermata è aperta.
 */
export class JarvisPaginaAvvisi extends RiquadroSicuro {
  static override properties = {
    filtro: { state: true },
    eventi: { state: true },
    erroreRegistro: { state: true },
  };
  declare filtro: Filtro;
  declare eventi: EventoCasa[] | null;
  declare erroreRegistro: string | null;

  static override styles = [
    stileBase,
    stilePagina,
    css`
      .filtri {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .filtri button {
        min-height: 44px;
        padding: 0 16px;
        border-radius: 22px;
        border: 1px solid #343a46;
        background: none;
        color: var(--attenuato);
        font: inherit;
        font-size: 16px;
        cursor: pointer;
        touch-action: manipulation;
      }
      .filtri button[aria-pressed="true"] {
        background: #1c2640;
        border-color: var(--accento);
        color: var(--testo);
      }
      .batteria .icona {
        color: #ffb35c;
      }
      .connessione .icona {
        color: #ff8a80;
      }
      .stato {
        color: var(--testo);
      }
    `,
  ];

  private smetti: (() => void)[] = [];
  private giro: ReturnType<typeof setInterval> | undefined;
  private letta = "";

  constructor() {
    super();
    this.filtro = "tutti";
    this.eventi = null;
    this.erroreRegistro = null;
    // le batterie si leggono dallo stato di adesso: si ridisegna quando cambiano
    new OsservaEntita(this, () =>
      Object.keys(connessione.negozio.tutte).filter(
        (e) => connessione.negozio.entitaDi(e)?.attributes["device_class"] === "battery",
      ),
    );
  }

  override connectedCallback(): void {
    super.connectedCallback();
    const ridisegna = () => this.requestUpdate();
    this.smetti = [
      connessione.ascolta(ridisegna),
      connessione.registri.ascolta(ridisegna),
      schermate.ascolta(() => {
        this.letta = "";
        ridisegna();
      }),
    ];
    this.giro = setInterval(() => {
      this.letta = "";
      this.requestUpdate();
    }, RILEGGI_OGNI_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const f of this.smetti) f();
    this.smetti = [];
    clearInterval(this.giro);
    this.letta = "";
  }

  /** Le entità dei dispositivi del pannello (una per card), con il nome della card. */
  private dispositivi(): Map<string, string> {
    const r = connessione.registri;
    const stanze = costruisciStanze(r.aree, r.dispositivi, r.entita, connessione.negozio.tutte, PREFERENZE);
    return new Map(stanze.flatMap((s) => s.card.map((c) => [c.entita, c.nome] as const)));
  }

  private nomeDi(entita: string, carte: Map<string, string>): string {
    const nome = connessione.negozio.entitaDi(entita)?.attributes["friendly_name"];
    return carte.get(entita) ?? (typeof nome === "string" ? nome : entita);
  }

  protected override updated(): void {
    const conn = connessione.conn;
    const carte = this.dispositivi();
    const entita = [...carte.keys()];
    const ore = schermate.valori.avvisiOre;
    const chiave = `${entita.join("|")}|${ore}`;
    if (!entita.length || !conn?.connected || chiave === this.letta) return;
    this.letta = chiave;
    conn
      .sendMessagePromise<unknown>({
        type: "logbook/get_events",
        start_time: new Date(Date.now() - ore * 3_600_000).toISOString(),
        entity_ids: entita,
      })
      .then(
        (righe) => {
          this.eventi = eventiDaRegistro(righe, (e) => this.nomeDi(e, carte));
          this.erroreRegistro = null;
        },
        (errore: unknown) => {
          log.avviso(`Avvisi: registro non letto (${descriviErrore(errore)})`);
          this.erroreRegistro = descriviErrore(errore);
        },
      );
  }

  private batterie(adesso: number): TemplateResult {
    const soglia = schermate.valori.avvisiSogliaBatteria;
    const basse = batterieBasse(connessione.negozio.tutte, soglia);
    if (!basse.length)
      return html`<div class="nota" data-test="avvisi-batterie-ok">
        Nessuna batteria sotto il ${soglia}%.
      </div>`;
    return html`<div data-test="avvisi-batterie">
      ${basse.map((b) => {
        const cambiata = connessione.negozio.entitaDi(b.entita)?.last_changed;
        const da = cambiata ? Date.parse(cambiata) : NaN;
        return html`<div class="riga batteria" data-test="avviso-batteria">
          ${icona(mdiBatteryAlert)}
          <span class="testo"
            >Batteria bassa: ${b.nome}<small
              ><span class="stato">${b.livello === null ? "bassa" : `${b.livello}%`}</span>${
                Number.isFinite(da) ? ` · da ${quandoTesto(da, adesso)}` : ""
              }</small
            ></span
          >
        </div>`;
      })}
    </div>`;
  }

  private dispositiviEConnessione(
    adesso: number,
    conDispositivi: boolean,
    conConnessione: boolean,
  ): TemplateResult {
    type Riga = { quando: number; html: TemplateResult };
    const righe: Riga[] = [];
    if (conConnessione)
      for (const i of connessione.interruzioni.voci) {
        const fine = i.a === null ? "in corso" : `${durataTesto(i.a - i.da)}`;
        righe.push({
          quando: i.da,
          html: html`<div class="riga connessione" data-test="avviso-connessione">
            ${icona(mdiLanDisconnect)}
            <span class="testo"
              >Home Assistant non raggiungibile<small
                ><span class="stato">${fine}</span> · ${quandoTesto(i.da, adesso)}</small
              ></span
            >
          </div>`,
        });
      }
    if (conDispositivi)
      for (const e of this.eventi ?? [])
        righe.push({
          quando: e.quando,
          html: html`<div class="riga" data-test="avviso-dispositivo">
            ${icona(ICONE[e.dominio] ?? mdiPowerPlugOutline)}
            <span class="testo"
              >${e.titolo}<small
                ><span class="stato">${e.stato}</span> ·
                ${quandoTesto(e.quando, adesso)}${e.da ? ` · ${e.da}` : ""}</small
              ></span
            >
          </div>`,
        });
    righe.sort((a, b) => b.quando - a.quando);
    const ore = schermate.valori.avvisiOre;
    const problemi: TemplateResult[] = [];
    if (conDispositivi && this.erroreRegistro)
      problemi.push(
        html`<div class="nota">Registro di Home Assistant non disponibile (${this.erroreRegistro}).</div>`,
      );
    else if (conDispositivi && this.eventi === null && connessione.stato.stato === "connesso")
      problemi.push(html`<div class="nota">Leggo il registro…</div>`);
    if (!righe.length)
      return html`${problemi}
        <div class="nota" data-test="avvisi-nessuno">
          ${
            conDispositivi
              ? `Niente da segnalare nelle ultime ${ore} ore.`
              : "Nessuna interruzione della connessione registrata da questo pannello."
          }
        </div>`;
    return html`${problemi}
      <div data-test="avvisi-elenco">${righe.map((r) => r.html)}</div>`;
  }

  protected disegna(): TemplateResult {
    const adesso = Date.now();
    const f = this.filtro;
    return html`<h1>Avvisi ed eventi</h1>
      <div class="filtri" role="group" aria-label="Filtri">
        ${FILTRI.map(
          ([id, testo]) =>
            html`<button
              data-test="filtro-${id}"
              aria-pressed=${f === id ? "true" : "false"}
              @click=${() => (this.filtro = id)}
            >
              ${testo}
            </button>`,
        )}
      </div>
      ${f === "tutti" || f === "batterie" ? html`<section>${this.batterie(adesso)}</section>` : nothing}
      ${
        f === "batterie"
          ? nothing
          : html`<section>
              ${this.dispositiviEConnessione(adesso, f !== "connessione", f !== "dispositivi")}
            </section>`
      }`;
  }
}
customElements.define("jarvis-pagina-avvisi", JarvisPaginaAvvisi);
