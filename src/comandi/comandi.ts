import { callService, type Connection } from "home-assistant-js-websocket";
import { descriviErrore } from "../diagnostica/log";
import type { Negozio } from "../stato/negozio";
import { avvisi } from "./avvisi";

export interface RichiestaComando {
  entita: string;
  dominio: string;
  servizio: string;
  dati?: Record<string, unknown>;
  /** Nome leggibile per gli avvisi, es. "TV Salotto". */
  etichetta: string;
  /**
   * Stato che il dispositivo deve raggiungere (solo per i dispositivi con
   * stato affidabile). Intanto la card lo mostra subito (feedback ottimistico);
   * se non arriva entro `attesaMs` si torna allo stato vero e lo si dice.
   * Assente per gli infrarossi: lì si può solo dire "comando inviato".
   */
  attesoStato?: string;
  attesaMs?: number;
  /** Niente avviso "comando inviato" (es. volume: si sente subito se ha funzionato). */
  silenzioso?: boolean;
}

const ATTESA_PREDEFINITA_MS = 15_000;

interface InCorso {
  ottimistico: string | undefined;
  fine: () => void;
}

/**
 * Esecuzione dei comandi con feedback ottimistico e rollback.
 * Regola del progetto: mai finti successi. Offline il comando non parte.
 */
export class Comandi {
  private readonly inCorso = new Map<string, InCorso>();
  private readonly ascoltatori = new Set<() => void>();

  constructor(
    private readonly connessione: () => Connection | null,
    private readonly negozio: Negozio,
  ) {}

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  /** Lo stato da mostrare mentre il comando aspetta conferma, se c'è. */
  ottimistico(entita: string): string | undefined {
    return this.inCorso.get(entita)?.ottimistico;
  }

  inAttesa(entita: string): boolean {
    return this.inCorso.has(entita);
  }

  async esegui(r: RichiestaComando): Promise<boolean> {
    const conn = this.connessione();
    if (!conn?.connected) {
      avvisi.mostra(`${r.etichetta}: Home Assistant non è raggiungibile, comando non inviato`, "errore");
      return false;
    }
    this.inCorso.get(r.entita)?.fine();

    let risolvi: (ok: boolean) => void = () => undefined;
    const esito = new Promise<boolean>((ris) => (risolvi = ris));
    // timer e ascoltatore si creano dopo, ma `fine()` li deve poter chiudere
    const risorse: { timer?: ReturnType<typeof setTimeout>; smetti?: () => void } = {};
    const voce: InCorso = {
      ottimistico: r.attesoStato,
      fine: () => {
        clearTimeout(risorse.timer);
        risorse.smetti?.();
        if (this.inCorso.get(r.entita) === voce) this.inCorso.delete(r.entita);
        this.avvisa();
      },
    };
    this.inCorso.set(r.entita, voce);
    this.avvisa();

    try {
      await callService(conn, r.dominio, r.servizio, r.dati, { entity_id: r.entita });
    } catch (errore) {
      voce.fine();
      avvisi.mostra(
        `${r.etichetta}: Home Assistant ha rifiutato il comando (${messaggio(errore)})`,
        "errore",
      );
      return false;
    }

    if (r.attesoStato === undefined) {
      voce.fine();
      if (!r.silenzioso) avvisi.mostra(`${r.etichetta}: comando inviato`);
      return true;
    }
    if (this.negozio.entitaDi(r.entita)?.state === r.attesoStato) {
      voce.fine();
      return true;
    }
    const atteso = r.attesoStato;
    risorse.smetti = this.negozio.osserva([r.entita], () => {
      if (this.negozio.entitaDi(r.entita)?.state === atteso) {
        voce.fine();
        risolvi(true);
      }
    });
    risorse.timer = setTimeout(() => {
      voce.fine();
      avvisi.mostra(`${r.etichetta}: il dispositivo non ha confermato, mostro lo stato reale`, "errore");
      risolvi(false);
    }, r.attesaMs ?? ATTESA_PREDEFINITA_MS);
    return esito;
  }

  private avvisa(): void {
    for (const f of this.ascoltatori) f();
  }
}

function messaggio(errore: unknown): string {
  if (errore && typeof errore === "object" && "message" in errore && typeof errore.message === "string")
    return errore.message;
  return descriviErrore(errore);
}
