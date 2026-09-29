import type { HassEntity } from "home-assistant-js-websocket";
import { css, type ReactiveController, type ReactiveControllerHost } from "lit";
import type { RichiestaComando } from "../comandi/comandi";
import { connessione } from "../connessione/connessione";
import type { Card } from "../registri/modello";
import { OsservaEntita, RiquadroSicuro, stileBase } from "./base";

/** Ridisegna l'host quando un comando parte, viene confermato o annullato. */
class OsservaComandi implements ReactiveController {
  private smetti: (() => void) | null = null;
  constructor(private readonly host: ReactiveControllerHost) {
    host.addController(this);
  }
  hostConnected(): void {
    this.smetti = connessione.comandi.ascolta(() => this.host.requestUpdate());
  }
  hostDisconnected(): void {
    this.smetti?.();
    this.smetti = null;
  }
}

/**
 * Base delle card dei dispositivi. Ogni card osserva SOLO le sue entità, quindi
 * un sensore che cambia non ridisegna le altre card.
 *
 * `disabilitata` = Home Assistant non collegato (i comandi non partirebbero) o
 * dispositivo non disponibile. `nonAggiornato` = offline da più di 10 s.
 */
export abstract class CardBase extends RiquadroSicuro {
  static override properties = {
    card: { attribute: false },
    offline: { type: Boolean },
    nonAggiornato: { type: Boolean },
  };
  declare card: Card;
  declare offline: boolean;
  declare nonAggiornato: boolean;

  constructor() {
    super();
    this.offline = false;
    this.nonAggiornato = false;
    new OsservaEntita(this, () => (this.card ? [this.card.entita, ...this.altreEntita()] : []));
    new OsservaComandi(this);
  }

  /** Entità in più da osservare (es. quelle del programma dello scaldabagno). */
  protected altreEntita(): string[] {
    return [];
  }

  protected get entita(): HassEntity | undefined {
    return connessione.negozio.entitaDi(this.card.entita);
  }

  /** Stato da mostrare: quello atteso mentre un comando aspetta conferma, altrimenti quello vero. */
  protected get statoMostrato(): string | undefined {
    return connessione.comandi.ottimistico(this.card.entita) ?? this.entita?.state;
  }

  protected get inAttesa(): boolean {
    return connessione.comandi.inAttesa(this.card.entita);
  }

  protected get nonDisponibile(): boolean {
    const s = this.entita?.state;
    return s === undefined || s === "unavailable";
  }

  protected get disabilitata(): boolean {
    return this.offline || this.nonDisponibile;
  }

  protected esegui(r: Omit<RichiestaComando, "entita" | "etichetta">): void {
    if (this.disabilitata) return;
    void connessione.comandi.esegui({ ...r, entita: this.card.entita, etichetta: this.card.nome });
  }
}

export const stileCard = [
  stileBase,
  css`
    :host {
      display: block;
      min-width: 0;
    }
    .card {
      height: 100%;
      border-radius: var(--raggio);
      background: var(--superficie);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: background 250ms;
    }
    .card.acceso {
      background: color-mix(in srgb, var(--accento) 26%, var(--superficie));
    }
    .card.acceso .riga .icona {
      color: var(--accento);
    }
    .riga {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .riga .icona {
      color: var(--attenuato);
    }
    .nome {
      font-size: 18px;
      font-weight: 500;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .stato {
      font-size: 15px;
      color: var(--attenuato);
    }
    .acceso .stato {
      color: var(--testo);
    }
    /* offline da più di 10 s: diventa arancione solo lo stato, non tutta la card */
    .vecchio .stato {
      color: var(--avviso);
    }
    small,
    .nota {
      font-size: 13px;
      color: var(--attenuato);
      line-height: 1.35;
    }
    .etichetta {
      display: inline-flex;
      align-items: center;
      font-size: 13px;
      color: var(--attenuato);
      border: 1px solid #343a46;
      border-radius: 999px;
      padding: 2px 10px;
      width: fit-content;
      max-width: 100%;
    }
    button {
      font: inherit;
      color: inherit;
      cursor: pointer;
      min-height: 48px;
      min-width: 48px;
      border: none;
      border-radius: 12px;
      background: var(--superficie-2);
      touch-action: manipulation;
    }
    button[disabled] {
      opacity: 0.45;
      cursor: not-allowed;
    }
    button.principale {
      background: transparent;
      text-align: left;
      padding: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
    }
    .testo {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .in-attesa::after {
      content: " …";
    }
    .comandi {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: auto;
    }
    .comandi button {
      flex: 1 1 auto;
      font-size: 14px;
      padding: 0 6px;
      white-space: nowrap;
    }
    .comandi button[aria-pressed="true"] {
      background: var(--accento);
      color: var(--sfondo);
      font-weight: 600;
    }
    /* in fondo apposta: deve vincere sulle regole base qui sopra */
    /* compatto (schermi orizzontali bassi, es. telefono): card più basse,
       stessi comandi da 48 px; nome e stato accanto ai pulsanti quando c'è posto */
    @media (orientation: landscape) and (max-height: 559px) {
      .card {
        padding: 8px;
        gap: 4px;
        border-radius: 12px;
      }
      .card.in-riga {
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
      }
      .card.in-riga > .principale,
      .card.in-riga > .testo {
        flex: 1 1 90px;
      }
      .card.in-riga > .comandi,
      .card.in-riga > small {
        flex: 0 1 auto;
        margin-top: 0;
      }
      .riga .icona {
        width: 22px;
        height: 22px;
      }
      .nome {
        font-size: 15px;
      }
      .stato {
        font-size: 13px;
      }
      small,
      .nota {
        font-size: 12px;
      }
      .spiegazione {
        display: none;
      }
      .card small.secondario {
        font-size: 11px;
      }
      .etichetta {
        font-size: 12px;
        padding: 1px 8px;
      }
      .testo {
        gap: 4px;
      }
      .comandi {
        gap: 4px;
      }
      .comandi button {
        font-size: 13px;
        padding: 0 4px;
      }
    }
  `,
];

/** Traduce gli stati di HA più comuni. */
export function statoInItaliano(stato: string | undefined, femminile = false): string {
  switch (stato) {
    case undefined:
      return "Non trovato";
    case "on":
      return femminile ? "Accesa" : "Acceso";
    case "off":
      return femminile ? "Spenta" : "Spento";
    case "unavailable":
      return "Non disponibile";
    case "unknown":
      return "Stato sconosciuto";
    case "standby":
      return "In standby";
    case "playing":
      return "In riproduzione";
    case "paused":
      return "In pausa";
    case "idle":
      return "Inattiva";
    default:
      return stato;
  }
}
