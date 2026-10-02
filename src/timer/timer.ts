import type { Connection } from "home-assistant-js-websocket";
import { descriviErrore, log } from "../diagnostica";

/**
 * Timer di Jarvis (v0.4.5, per pannello dalla v0.4.6). Li gestisce il server
 * (`jarvis_voce` 0.1.8, lato HA): "metti un timer di 10 minuti per la pasta"
 * crea il timer là, e HA manda l'evento `jarvis_timer` a ogni cambio:
 *   data: {tipo: started|updated|cancelled|finished|fermato, id, nome,
 *          secondi_totali, secondi_rimasti, pannello}
 * `pannello` è il device_id a cui appartiene il timer (vedi pannello.ts): il
 * pannello mostra e fa suonare SOLO i suoi. Senza `pannello` (server vecchio)
 * il timer vale per tutti, come nella v0.4.5.
 * Stop chiama `jarvis_voce.timer_ferma {id}`: il server manda `fermato` a tutti
 * e ogni pannello che suona per quell'id si ferma.
 * Alla (ri)connessione `jarvis_voce.timer_attivi` ridà i timer in corso: gli
 * eventi persi mentre il pannello era scollegato non contano più.
 *
 * Il conto alla rovescia si calcola qui (scadenza = arrivo + secondi_rimasti),
 * ma la fine la decide solo `finished`: un timer arrivato a zero senza
 * `finished` resta "in scadenza" e poi sparisce, senza suonare (può essere
 * stato annullato mentre il pannello era scollegato).
 */
export type TipoEventoTimer = "started" | "updated" | "cancelled" | "finished" | "fermato";

/** Un timer come lo descrive il server (evento o elenco di `timer_attivi`). */
export interface DatiTimer {
  id: string;
  nome: string | null;
  secondiTotali: number | null;
  secondiRimasti: number | null;
  /** device_id proprietario; null = server che non lo dice (vale per tutti). */
  pannello: string | null;
  /** jarvis_voce 0.2.3: timer fermo (pausa e ripresa arrivano come "updated"). null = non detto. */
  inPausa: boolean | null;
}

export interface EventoTimer extends DatiTimer {
  tipo: TipoEventoTimer;
}

export interface TimerAttivo {
  id: string;
  nome: string | null;
  secondiTotali: number | null;
  /** ms (orologio del pannello) in cui arriva a zero, se non è in pausa. */
  scadenza: number;
  /** In pausa: il conto alla rovescia è fermo a `fermoMs`. */
  inPausa: boolean;
  fermoMs: number;
}

/** Quanto manca adesso: fermo se in pausa, altrimenti scorre verso la scadenza. */
export function rimastoMs(t: TimerAttivo, adesso: number): number {
  return t.inPausa ? t.fermoMs : t.scadenza - adesso;
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

const TIPI: readonly TipoEventoTimer[] = ["started", "updated", "cancelled", "finished", "fermato"];

const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const testoPieno = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Un timer dai dati del server; null se manca l'id. */
export function leggiTimer(dati: unknown): DatiTimer | null {
  if (typeof dati !== "object" || dati === null) return null;
  const d = dati as Record<string, unknown>;
  const id = typeof d["id"] === "string" || typeof d["id"] === "number" ? String(d["id"]) : null;
  if (!id) return null;
  return {
    id,
    nome: testoPieno(d["nome"]),
    secondiTotali: numero(d["secondi_totali"]),
    secondiRimasti: numero(d["secondi_rimasti"]),
    pannello: testoPieno(d["pannello"]),
    inPausa: typeof d["in_pausa"] === "boolean" ? d["in_pausa"] : null,
  };
}

/** Legge i dati dell'evento; null se non è un evento di timer valido (lo si annota e basta). */
export function leggiEvento(dati: unknown): EventoTimer | null {
  const timer = leggiTimer(dati);
  const tipo = TIPI.find((t) => t === (dati as Record<string, unknown> | null)?.["tipo"]);
  return timer && tipo ? { ...timer, tipo } : null;
}

/**
 * Elenco dalla risposta di `jarvis_voce.timer_attivi`. La chiave esatta non è
 * ancora scritta nel contratto: si accetta `timer`, `timers` o `attivi`, o la
 * risposta che è già un elenco. null = forma sconosciuta (va nel log).
 */
export function leggiElencoAttivi(risposta: unknown): DatiTimer[] | null {
  const r = risposta as Record<string, unknown> | null;
  const elenco = Array.isArray(risposta)
    ? risposta
    : [r?.["timer"], r?.["timers"], r?.["attivi"]].find((v) => Array.isArray(v));
  if (!Array.isArray(elenco)) return null;
  return elenco.flatMap((t) => leggiTimer(t) ?? []);
}

/** Il timer appartiene a questo pannello? Senza `pannello` (server vecchio) sì. */
export function eMio(t: DatiTimer, mio: string): boolean {
  return t.pannello === null || t.pannello === mio;
}

/** Elenco dei timer attivi dopo un evento (funzione pura: mai modifica quello vecchio). */
export function applicaEventoTimer(
  attivi: readonly TimerAttivo[],
  ev: EventoTimer,
  adesso: number,
): TimerAttivo[] {
  const altri = attivi.filter((t) => t.id !== ev.id);
  if (ev.tipo === "cancelled" || ev.tipo === "finished" || ev.tipo === "fermato") return altri;
  const vecchio = attivi.find((t) => t.id === ev.id);
  const inPausa = ev.inPausa ?? vecchio?.inPausa ?? false;
  // "updated" senza secondi (es. solo il nome cambiato): si tiene quanto mancava prima
  const rimasto =
    ev.secondiRimasti !== null
      ? ev.secondiRimasti * 1000
      : vecchio
        ? rimastoMs(vecchio, adesso)
        : (ev.secondiTotali ?? 0) * 1000;
  const nuovo: TimerAttivo = {
    id: ev.id,
    nome: ev.nome ?? vecchio?.nome ?? null,
    secondiTotali: ev.secondiTotali ?? vecchio?.secondiTotali ?? null,
    scadenza: adesso + rimasto,
    inPausa,
    fermoMs: rimasto,
  };
  return ordina([...altri, nuovo], adesso);
}

/** In ordine di quanto manca (i timer in pausa contano per quanto manca adesso). */
function ordina(elenco: TimerAttivo[], adesso: number): TimerAttivo[] {
  return elenco.sort((a, b) => rimastoMs(a, adesso) - rimastoMs(b, adesso));
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

/** jarvis_voce.<servizio> con la risposta (return_response). */
export type ServiziTimer = (
  servizio: "timer_attivi" | "timer_ferma" | "timer_stanza" | "timer_comando",
  dati: Record<string, unknown>,
) => Promise<unknown>;

/** Comandi su un timer in corso (jarvis_voce 0.3.0, `timer_comando`). */
export type AzioneTimer = "annulla" | "pausa" | "riprendi";

/**
 * Esito di `timer_stanza` / `timer_comando` (jarvis_voce 0.3.0): `{esito:
 * "ok", …}` o `{esito: "errore", messaggio}` (es. "Timer non trovato (forse
 * è già finito)."). null = andato bene, altrimenti il motivo in parole.
 */
export function esitoServizioTimer(risposta: unknown): string | null {
  const r = (risposta ?? {}) as Record<string, unknown>;
  if (r["esito"] === "ok") return null;
  if (r["esito"] === "errore")
    return typeof r["messaggio"] === "string" && r["messaggio"].trim()
      ? r["messaggio"].trim()
      : "il server ha detto di no";
  return `risposta non riconosciuta (${JSON.stringify(risposta)})`;
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
  private readonly avvisato = new Set<string>();

  /**
   * `mio`: device_id con cui il server segna i timer di questo pannello
   * (`jarvis_<stanza>`, o `jarvis_pannello` senza stanza).
   */
  constructor(
    private readonly suoneria: Suona,
    private readonly servizi: ServiziTimer,
    private readonly mio: () => string,
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
    // prima l'iscrizione, poi l'elenco: niente buchi tra i due
    await this.rileggi("connessione");
  }

  /**
   * Rilegge dal server i timer in corso di questo pannello: alla connessione,
   * a ogni riconnessione e quando cambia la stanza (cambia il device_id).
   * I timer che stanno suonando restano: li ferma Stop o `fermato`.
   */
  async rileggi(motivo: string): Promise<void> {
    let risposta: unknown;
    try {
      risposta = await this.servizi("timer_attivi", {});
    } catch (errore) {
      this.avvisaUnaVolta(
        "rileggi",
        `Timer: jarvis_voce.timer_attivi non riuscito (${descriviErrore(errore)}): restano quelli arrivati per evento`,
      );
      return;
    }
    const elenco = leggiElencoAttivi(risposta);
    if (!elenco) {
      this.avvisaUnaVolta(
        "forma",
        `Timer: risposta di timer_attivi non riconosciuta (${JSON.stringify(risposta)})`,
      );
      return;
    }
    const mio = this.mio();
    const ora = this.adesso();
    this.elenco = ordina(
      elenco
        .filter((t) => eMio(t, mio))
        .map((t) => {
          const rimasto = (t.secondiRimasti ?? t.secondiTotali ?? 0) * 1000;
          return {
            id: t.id,
            nome: t.nome,
            secondiTotali: t.secondiTotali,
            scadenza: ora + rimasto,
            inPausa: t.inPausa ?? false,
            fermoMs: rimasto,
          };
        }),
      ora,
    );
    log.info(`Timer riletti (${motivo}): ${this.elenco.length} di ${mio} su ${elenco.length} in casa`);
    this.pulisciPoi();
    this.notifica();
  }

  suEvento(dati: unknown): void {
    const ev = leggiEvento(dati);
    if (!ev) {
      log.avviso(`Timer: evento non riconosciuto (${JSON.stringify(dati)})`);
      return;
    }
    const nome = ev.nome ? `"${ev.nome}"` : ev.id;
    const quanto =
      (ev.secondiRimasti !== null ? ` (${formattaRimasto(ev.secondiRimasti * 1000)})` : "") +
      (ev.inPausa ? ", in pausa" : "");
    if (ev.tipo === "fermato") {
      this.suFermato(ev.id);
      return;
    }
    const mio = this.mio();
    if (!eMio(ev, mio)) {
      log.info(`Timer ${nome}: ${ev.tipo} per ${ev.pannello ?? "?"}, non per questo pannello (${mio})`);
      return;
    }
    log.info(`Timer ${nome}: ${ev.tipo}${quanto}`);
    const vecchio = this.elenco.find((t) => t.id === ev.id);
    this.elenco = applicaEventoTimer(this.elenco, ev, this.adesso());
    if (ev.tipo === "finished" && !this.finiti.some((f) => f.id === ev.id))
      this.suona({ id: ev.id, nome: ev.nome ?? vecchio?.nome ?? null, alle: this.adesso() });
    this.pulisciPoi();
    this.notifica();
  }

  /**
   * Timer nuovo dalla schermata Timer (jarvis_voce 0.3.0, `timer_stanza`):
   * suona nella stanza di questo pannello (lo slug della stanza scelta, come
   * nel device_id). Il timer arriva poi con l'evento `started`, come a voce.
   * Ritorna null se il server l'ha creato, altrimenti il motivo in parole.
   */
  async avvia(stanza: string, durata: { minuti: number }, nome?: string): Promise<string | null> {
    const dati: Record<string, unknown> = { stanza, minuti: durata.minuti, ...(nome ? { nome } : {}) };
    return this.chiedi("timer_stanza", dati, `nuovo timer di ${durata.minuti} min in ${stanza}`);
  }

  /** Annulla, mette in pausa o riprende un timer in corso (jarvis_voce 0.3.0, `timer_comando`). */
  async comando(id: string, azione: AzioneTimer): Promise<string | null> {
    return this.chiedi("timer_comando", { id, azione }, `${azione} del timer ${id}`);
  }

  private async chiedi(
    servizio: "timer_stanza" | "timer_comando",
    dati: Record<string, unknown>,
    cosa: string,
  ): Promise<string | null> {
    let errore: string | null;
    try {
      errore = esitoServizioTimer(await this.servizi(servizio, dati));
    } catch (e) {
      const d = descriviErrore(e);
      // server senza la 0.3.0: lo si dice chiaro, non "Service not found"
      errore =
        /not found|non trovat/i.test(d) && /jarvis_voce/.test(d) ? "serve jarvis_voce 0.3.0 sul server" : d;
    }
    if (errore) log.avviso(`Timer: ${cosa} non riuscito (${errore})`);
    else log.info(`Timer: ${cosa}`);
    return errore;
  }

  /**
   * Tocco su Stop (e, con la v0.5.0, "stop"/"basta" a voce): ferma subito la
   * suoneria qui e chiede al server `timer_ferma` per ogni timer, così si
   * fermano anche gli altri pannelli che suonano per lo stesso.
   */
  ferma(motivo = "Stop toccato", avvisaGliAltri = true): void {
    if (this.finiti.length === 0) return;
    const ids = this.finiti.map((f) => f.id);
    log.info(`Timer: suoneria ferma (${motivo})`);
    this.finiti = [];
    clearTimeout(this.timerSuoneria);
    this.timerSuoneria = undefined;
    this.suoneria.ferma();
    this.notifica();
    if (!avvisaGliAltri) return;
    for (const id of ids)
      this.servizi("timer_ferma", { id }).catch((errore: unknown) => {
        log.avviso(`Timer: jarvis_voce.timer_ferma ${id} non riuscito: ${descriviErrore(errore)}`);
      });
  }

  /**
   * «Jarvis» sentito mentre suona (v0.5.0): la suoneria tace subito, perché
   * Jarvis deve sentire la domanda. Il riquadro "Timer finito" resta, e
   * restano i 2 minuti: lo chiudono Stop, «stop» a voce o il tempo. Un altro
   * timer che finisce fa suonare di nuovo.
   */
  silenzia(motivo: string): void {
    if (this.finiti.length === 0) return;
    log.info(`Timer: suoneria zittita (${motivo})`);
    this.suoneria.ferma();
  }

  /** `fermato`: Stop toccato su un pannello qualsiasi. Si ferma anche qui, se suona per quell'id. */
  private suFermato(id: string): void {
    const suonava = this.finiti.some((f) => f.id === id);
    const attivo = this.elenco.some((t) => t.id === id);
    if (!suonava && !attivo) return;
    this.elenco = this.elenco.filter((t) => t.id !== id);
    if (suonava) {
      this.finiti = this.finiti.filter((f) => f.id !== id);
      log.info(`Timer ${id}: fermato da un pannello`);
      if (this.finiti.length === 0) {
        clearTimeout(this.timerSuoneria);
        this.timerSuoneria = undefined;
        this.suoneria.ferma();
      }
    }
    this.pulisciPoi();
    this.notifica();
  }

  private avvisaUnaVolta(chiave: string, testo: string): void {
    if (this.avvisato.has(chiave)) return;
    this.avvisato.add(chiave);
    log.avviso(testo);
  }

  private suona(f: TimerFinito): void {
    this.finiti = [...this.finiti, f];
    this.suoneria.avvia();
    // ogni timer finito riporta i 2 minuti da capo
    clearTimeout(this.timerSuoneria);
    this.timerSuoneria = setTimeout(
      // solo qui: gli altri pannelli hanno i loro 2 minuti
      () => this.ferma(`nessuno l'ha fermata in ${SUONERIA_MASSIMA_MS / 60_000} minuti`, false),
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
      // un timer in pausa non scade: resta fermo finché il server non lo fa ripartire
      const scaduti = this.elenco.filter((t) => !t.inPausa && ora - t.scadenza > OLTRE_LO_ZERO_MS);
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
