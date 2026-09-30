import type { Connection } from "home-assistant-js-websocket";
import { descriviErrore, log } from "../diagnostica/log";

/**
 * Timer di Jarvis (v0.4.5). Li gestisce il server (`jarvis_voce` 0.1.5, lato
 * HA): "metti un timer di 10 minuti per la pasta" crea il timer là, e HA manda
 * l'evento `jarvis_timer` a ogni cambio:
 *   data: {tipo: started|updated|cancelled|finished, id, nome, secondi_totali, secondi_rimasti}
 * Il pannello non decide niente: mostra il conto alla rovescia e, a `finished`,
 * suona e mostra "Timer … finito" finché qualcuno non tocca Stop (o 2 minuti).
 * Con più pannelli l'evento arriva a tutti: suonano tutti.
 *
 * Il conto alla rovescia si calcola qui (scadenza = arrivo + secondi_rimasti),
 * ma la fine la decide solo `finished`: un timer arrivato a zero senza
 * `finished` resta "in scadenza" e poi sparisce, senza suonare (può essere
 * stato annullato mentre il pannello era scollegato).
 */
export type TipoEventoTimer = "started" | "updated" | "cancelled" | "finished";

export interface EventoTimer {
  tipo: TipoEventoTimer;
  id: string;
  nome: string | null;
  secondiTotali: number | null;
  secondiRimasti: number | null;
}

export interface TimerAttivo {
  id: string;
  nome: string | null;
  secondiTotali: number | null;
  /** ms (orologio del pannello) in cui arriva a zero. */
  scadenza: number;
}

export interface TimerFinito {
  id: string;
  nome: string | null;
  alle: number;
}

/** Un timer a zero senza `finished` sparisce dopo tanto (evento perso o annullato da scollegati). */
export const OLTRE_LO_ZERO_MS = 60_000;
/** La suoneria si ferma da sola dopo tanto (richiesta della sessione server). */
export const SUONERIA_MASSIMA_MS = 120_000;
export const EVENTO = "jarvis_timer";

const TIPI: readonly TipoEventoTimer[] = ["started", "updated", "cancelled", "finished"];

const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Legge i dati dell'evento; null se non è un evento di timer valido (lo si annota e basta). */
export function leggiEvento(dati: unknown): EventoTimer | null {
  if (typeof dati !== "object" || dati === null) return null;
  const d = dati as Record<string, unknown>;
  const tipo = TIPI.find((t) => t === d["tipo"]);
  const id = typeof d["id"] === "string" || typeof d["id"] === "number" ? String(d["id"]) : null;
  if (!tipo || !id) return null;
  const nome = typeof d["nome"] === "string" && d["nome"].trim() ? d["nome"].trim() : null;
  return {
    tipo,
    id,
    nome,
    secondiTotali: numero(d["secondi_totali"]),
    secondiRimasti: numero(d["secondi_rimasti"]),
  };
}

/** Elenco dei timer attivi dopo un evento (funzione pura: mai modifica quello vecchio). */
export function applicaEventoTimer(
  attivi: readonly TimerAttivo[],
  ev: EventoTimer,
  adesso: number,
): TimerAttivo[] {
  const altri = attivi.filter((t) => t.id !== ev.id);
  if (ev.tipo === "cancelled" || ev.tipo === "finished") return altri;
  const vecchio = attivi.find((t) => t.id === ev.id);
  const rimasti = ev.secondiRimasti ?? ev.secondiTotali;
  // "updated" senza secondi (es. solo il nome cambiato): si tiene la scadenza di prima
  const scadenza = rimasti !== null ? adesso + rimasti * 1000 : (vecchio?.scadenza ?? adesso);
  const nuovo: TimerAttivo = {
    id: ev.id,
    nome: ev.nome ?? vecchio?.nome ?? null,
    secondiTotali: ev.secondiTotali ?? vecchio?.secondiTotali ?? null,
    scadenza,
  };
  return [...altri, nuovo].sort((a, b) => a.scadenza - b.scadenza);
}

/** "9:59", "1:05:00": il conto alla rovescia di un timer. Mai negativo. */
export function formattaRimasto(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const ore = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return ore > 0 ? `${ore}:${String(min).padStart(2, "0")}:${sec}` : `${min}:${sec}`;
}

/** "Timer pasta finito" / "Timer finito" (senza nome). */
export function titoloFinito(nome: string | null): string {
  return nome ? `Timer ${nome} finito` : "Timer finito";
}

/** Suoneria: la implementa l'audio del browser, qui solo quello che serve. */
export interface Suona {
  avvia(): void;
  ferma(): void;
}

export class Timer {
  private elenco: TimerAttivo[] = [];
  private finiti: TimerFinito[] = [];
  private connIscritta: Connection | null = null;
  private timerSuoneria: ReturnType<typeof setTimeout> | undefined;
  private timerPulizia: ReturnType<typeof setInterval> | undefined;
  private readonly ascoltatori = new Set<() => void>();

  constructor(
    private readonly suoneria: Suona,
    private readonly adesso: () => number = Date.now,
  ) {}

  get attivi(): readonly TimerAttivo[] {
    return this.elenco;
  }
  /** Timer finiti che stanno suonando (in attesa di Stop). */
  get suonano(): readonly TimerFinito[] {
    return this.finiti;
  }
  /** Timer in corso o che suonano: la ricarica notturna aspetta. */
  get occupato(): boolean {
    return this.elenco.length > 0 || this.finiti.length > 0;
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  /** Da chiamare a ogni connessione nuova (la libreria rinnova da sola l'iscrizione dopo le riconnessioni). */
  async collega(conn: Connection): Promise<void> {
    if (this.connIscritta === conn) return;
    this.connIscritta = conn;
    try {
      await conn.subscribeEvents<{ data?: unknown }>((e) => this.suEvento(e.data), EVENTO);
    } catch (errore) {
      log.errore(`Impossibile ascoltare ${EVENTO}: ${descriviErrore(errore)}`);
    }
  }

  suEvento(dati: unknown): void {
    const ev = leggiEvento(dati);
    if (!ev) {
      log.avviso(`Timer: evento non riconosciuto (${JSON.stringify(dati)})`);
      return;
    }
    const nome = ev.nome ? `"${ev.nome}"` : ev.id;
    const quanto = ev.secondiRimasti !== null ? ` (${formattaRimasto(ev.secondiRimasti * 1000)})` : "";
    log.info(`Timer ${nome}: ${ev.tipo}${quanto}`);
    const vecchio = this.elenco.find((t) => t.id === ev.id);
    this.elenco = applicaEventoTimer(this.elenco, ev, this.adesso());
    if (ev.tipo === "finished" && !this.finiti.some((f) => f.id === ev.id))
      this.suona({ id: ev.id, nome: ev.nome ?? vecchio?.nome ?? null, alle: this.adesso() });
    this.pulisciPoi();
    this.notifica();
  }

  /** Tocco su Stop (e, con la v0.5.0, "stop"/"basta" a voce): ferma la suoneria per tutti i timer finiti. */
  ferma(motivo = "Stop toccato"): void {
    if (this.finiti.length === 0) return;
    log.info(`Timer: suoneria ferma (${motivo})`);
    this.finiti = [];
    clearTimeout(this.timerSuoneria);
    this.timerSuoneria = undefined;
    this.suoneria.ferma();
    this.notifica();
  }

  private suona(f: TimerFinito): void {
    this.finiti = [...this.finiti, f];
    this.suoneria.avvia();
    // ogni timer finito riporta i 2 minuti da capo
    clearTimeout(this.timerSuoneria);
    this.timerSuoneria = setTimeout(
      () => this.ferma(`nessuno l'ha fermata in ${SUONERIA_MASSIMA_MS / 60_000} minuti`),
      SUONERIA_MASSIMA_MS,
    );
  }

  /** Toglie i timer rimasti a zero troppo a lungo senza `finished`. */
  private pulisciPoi(): void {
    if (this.elenco.length === 0) {
      clearInterval(this.timerPulizia);
      this.timerPulizia = undefined;
      return;
    }
    this.timerPulizia ??= setInterval(() => {
      const ora = this.adesso();
      const scaduti = this.elenco.filter((t) => ora - t.scadenza > OLTRE_LO_ZERO_MS);
      if (scaduti.length === 0) return;
      for (const t of scaduti)
        log.avviso(
          `Timer ${t.nome ?? t.id}: arrivato a zero ma "finished" non è arrivato, lo tolgo senza suonare`,
        );
      this.elenco = this.elenco.filter((t) => !scaduti.includes(t));
      this.pulisciPoi();
      this.notifica();
    }, 5000);
  }

  private notifica(): void {
    for (const f of this.ascoltatori) {
      try {
        f();
      } catch (errore) {
        log.errore(`Timer: ascoltatore in errore: ${descriviErrore(errore)}`);
      }
    }
  }
}
