import {
  createConnection,
  createSocket,
  ERR_CANNOT_CONNECT,
  ERR_INVALID_AUTH,
  type Auth,
  type Connection,
  type ConnectionOptions,
  type HaWebSocket,
} from "home-assistant-js-websocket";
import { Annunci } from "../annunci/annunci";
import { Assistente } from "../assistente/assistente";
import { Musica } from "../musica/musica";
import { CollegaDispositivo } from "../musica/dispositivi";
import { Presenza } from "../fotocamera/presenza";
import { OcchioFotocamera } from "../fotocamera/occhio";
import { RegistroInterruzioni } from "./interruzioni";
import { PausaMusica } from "../voce/pausa-musica";
import { ascoltaStanzaPannello, stanzaPannello } from "../voce/stanza-pannello";
import { dispositivoPannello, proprietarioTimer } from "../timer/pannello";
import { Voce } from "../voce/voce";
import { MicrofonoCondiviso } from "../voce/microfono-condiviso";
import { AscoltoParola } from "../parola/ascolto";
import { Suoneria } from "../timer/suoneria";
import { Timer } from "../timer/timer";
import { Comandi } from "../comandi/comandi";
import { descriviErrore, log } from "../diagnostica/log";
import { Registri } from "../registri/registri";
import { applicaAggiornamento, type AggiornamentoEntita } from "../stato/entita";
import { Negozio } from "../stato/negozio";
import { caricaAuth, dimenticaLogin } from "./autenticazione";
import { calcolaAttesa } from "./backoff";

export type Stato =
  | "avvio" // l'app sta partendo
  | "login-richiesto" // nessun login valido: serve un tocco su "Accedi"
  | "connessione" // primo collegamento in corso
  | "connesso"
  | "riconnessione"; // era collegato, ha perso HA e sta riprovando

export interface InfoConnessione {
  stato: Stato;
  /** Da quando i dati NON arrivano più (null se connesso). */
  disconnessoDa: number | null;
  connessoDa: number | null;
  latenzaMs: number | null;
  riconnessioni: number;
  versioneHA: string | null;
  motivoLogin: string | null;
}

/** Dopo quanto tempo senza HA si mostra il banner e i valori diventano "non aggiornati". */
export const SOGLIA_OFFLINE_MS = 10_000;
const INTERVALLO_PING_MS = 30_000;
const TIMEOUT_PING_MS = 10_000;

/**
 * Tutto il rapporto con Home Assistant: login, WebSocket, entità, riconnessione.
 *
 * La libreria ufficiale si riconnette già da sola (e risottoscrive entità e
 * previsioni), ma con attese fisse e senza accorgersi dei socket "morti in
 * silenzio" (Wi-Fi caduto senza chiusura). Qui si aggiungono:
 *  - attese esponenziali con jitter, dentro `createSocket` (vedi backoff.ts);
 *  - un ping ogni 30 s: se HA non risponde entro 10 s si forza la riconnessione;
 *  - il ritorno della rete (evento `online`) interrompe l'attesa e riprova subito.
 */
export class Connessione {
  readonly negozio = new Negozio();
  readonly registri = new Registri();
  conn: Connection | null = null;
  readonly comandi = new Comandi(() => this.conn, this.negozio);
  private tentativo = 0;
  private info: InfoConnessione = {
    stato: "avvio",
    disconnessoDa: Date.now(),
    connessoDa: null,
    latenzaMs: null,
    riconnessioni: 0,
    versioneHA: null,
    motivoLogin: null,
  };
  private readonly ascoltatori = new Set<() => void>();
  private timerPing: ReturnType<typeof setInterval> | undefined;
  private svegliaAttesa: (() => void) | null = null;
  private chiusa = false;
  private prossimoCompleto = true;
  /** Dichiarato DOPO `ascoltatori`: si registra subito come ascoltatore della connessione. */
  readonly assistente = new Assistente({
    conn: () => this.conn,
    inviaBinario: (dati) => {
      const socket = this.conn?.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(dati);
      return true;
    },
    collegato: () => this.info.stato === "connesso" && this.conn?.connected === true,
    ascoltaConnessione: (f) => this.ascolta(f),
    // i timer chiesti a voce o in chat sono di questo pannello (v0.4.6)
    dispositivo: dispositivoPannello,
  });
  /** Un solo microfono per la parola e per la voce (v0.5.0). */
  readonly microfono = new MicrofonoCondiviso();
  /** Voce "tocca per parlare" (F5): dopo l'assistente, di cui è una faccia. */
  readonly voce = new Voce({
    assistente: this.assistente,
    collegato: () => this.info.stato === "connesso" && this.conn?.connected === true,
    microfono: this.microfono.perVoce(),
  });
  /** Jarvis parla per primo (v0.5.4): evento jarvis_annuncio per questo pannello. */
  readonly annunci = new Annunci({
    mio: proprietarioTimer,
    voce: this.voce,
    assistente: this.assistente,
    statoDi: (entita) => this.negozio.entitaDi(entita)?.state,
  });
  /** La musica della stanza si ferma mentre Jarvis ascolta e parla (v0.4.4). */
  readonly pausaMusica = new PausaMusica(
    this.voce,
    (servizio, dati) => this.chiamaServizio("jarvis_musica", servizio, dati),
    stanzaPannello,
  );

  /** Timer di jarvis_voce: conto alla rovescia e suoneria, solo quelli di questo pannello (v0.4.6). */
  readonly timer = new Timer(
    new Suoneria(),
    (servizio, dati) => this.chiamaServizio("jarvis_voce", servizio, dati),
    proprietarioTimer,
  );
  /**
   * Fotocamera (v0.6.0): presenza, «Jarvis» più facile da vicino, guarda e parla. PRIMA
   * della parola, che la usa (i campi si creano in ordine).
   */
  readonly presenza = new Presenza({
    occhio: new OcchioFotocamera(),
    caricaMotore: () => import("../fotocamera/motore-volto").then((m) => m.creaMotoreVolto()),
    invia: (pannello) => this.inviaPresenza(pannello),
    pannello: dispositivoPannello,
  });
  /** «Jarvis» sempre in ascolto (v0.5.0): dopo voce, timer e fotocamera, che usa. */
  readonly parola = new AscoltoParola({
    micro: this.microfono,
    assistente: this.assistente,
    voce: this.voce,
    timer: this.timer,
    presenza: this.presenza,
  });

  constructor() {
    window.addEventListener("online", this.suRetePresente);
    // stanza cambiata = device_id cambiato: i timer "miei" sono altri
    ascoltaStanzaPannello(() => {
      if (this.info.stato === "connesso") void this.timer.rileggi("stanza cambiata");
    });
  }

  /** Musica (v0.5.6): stato vero di Spotify, comandi e playlist, condivisi da tutto il pannello. */
  readonly musica = new Musica({
    chiama: (servizio, dati) => this.chiamaServizio("jarvis_musica", servizio, dati),
    collegato: () => this.info.stato === "connesso" && this.conn?.connected === true,
    // v0.5.9: chi chiede la musica (jarvis_musica 0.5.0 la fa partire dal suo dispositivo)
    pannello: dispositivoPannello,
  });

  /** «Collega questo dispositivo» (v0.5.9): apre Spotify e riconosce questo pannello al ritorno. */
  readonly collegaSpotify = new CollegaDispositivo({
    chiama: (servizio, dati) => this.chiamaServizio("jarvis_musica", servizio, dati),
    pannello: dispositivoPannello,
    apri: (url, nuovaScheda) => {
      if (nuovaScheda) window.open(url, "_blank", "noopener");
      else location.href = url;
    },
    userAgent: () => navigator.userAgent,
    visibile: () => document.visibilityState === "visible",
    ascoltaVisibilita: (f) => {
      document.addEventListener("visibilitychange", f);
      return () => document.removeEventListener("visibilitychange", f);
    },
    collegato: () => void this.musica.leggiDispositivi(),
  });

  /** Le volte che HA non era raggiungibile da qui (v0.5.7, Avvisi → Connessione). */
  readonly interruzioni = new RegistroInterruzioni();

  /**
   * `jarvis_presenza {pannello}` (v0.6.0) con lo script del pacchetto: dal
   * websocket `fire_event` è solo per gli amministratori. Senza lo script si
   * prova `fire_event` (funziona solo con un utente amministratore).
   */
  private async inviaPresenza(pannello: string): Promise<void> {
    const conn = this.conn;
    if (!conn || !conn.connected) throw new Error("Home Assistant non collegato");
    try {
      await conn.sendMessagePromise({
        type: "call_service",
        domain: "script",
        service: "jarvis_presenza",
        service_data: { pannello },
      });
    } catch (errore) {
      const testo = descriviErrore(errore);
      if (!/not found|non trovat/i.test(testo)) throw errore;
      try {
        await conn.sendMessagePromise({
          type: "fire_event",
          event_type: "jarvis_presenza",
          event_data: { pannello },
        });
      } catch {
        throw new Error("manca script.jarvis_presenza (pacchetto jarvis.yaml da aggiornare)");
      }
    }
  }

  /** <dominio>.<servizio> con la risposta: jarvis_musica (stato vero di Spotify) e jarvis_voce (timer). */
  private async chiamaServizio(
    dominio: string,
    servizio: string,
    dati: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const conn = this.conn;
    if (!conn || !conn.connected) throw new Error("Home Assistant non collegato");
    const r = await conn.sendMessagePromise<{ response?: Record<string, unknown> }>({
      type: "call_service",
      domain: dominio,
      service: servizio,
      service_data: dati,
      return_response: true,
    });
    return r.response ?? {};
  }

  get stato(): InfoConnessione {
    return this.info;
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  async avvia(): Promise<void> {
    let auth: Auth | null;
    try {
      auth = await caricaAuth();
    } catch (errore) {
      log.errore(`Login non riuscito: ${descriviErrore(errore)}`);
      this.imposta({ stato: "login-richiesto", motivoLogin: "Il login non è andato a buon fine: riprova." });
      return;
    }
    if (!auth) {
      this.imposta({ stato: "login-richiesto", motivoLogin: null });
      return;
    }
    this.imposta({ stato: "connessione" });
    await this.collega(auth);
  }

  private async collega(auth: Auth): Promise<void> {
    while (!this.chiusa) {
      try {
        const conn = await createConnection({ auth, createSocket: this.creaSocket });
        this.conn = conn;
        conn.addEventListener("ready", this.suRiconnessa);
        conn.addEventListener("disconnected", this.suDisconnessa);
        conn.addEventListener("reconnect-error", this.suErroreRiconnessione);
        // Il segnale "foto completa in arrivo" si arma PRIMA di mandare l'iscrizione,
        // mai dopo l'await: HA raggruppa risultato e foto completa nello stesso
        // pacchetto, e la foto arriva prima che il codice dopo l'await riparta.
        this.prossimoCompleto = true;
        await conn.subscribeMessage<AggiornamentoEntita>(this.suEntita, { type: "subscribe_entities" });
        this.segnaConnesso();
        void this.registri.collega(conn);
        void this.timer.collega(conn);
        void this.annunci.collega(conn);
        this.avviaPing();
        return;
      } catch (errore) {
        if (errore === ERR_INVALID_AUTH) {
          this.loginScaduto();
          return;
        }
        if (errore !== ERR_CANNOT_CONNECT) log.errore(`Collegamento fallito: ${descriviErrore(errore)}`);
        // creaSocket ha già atteso il suo backoff: si riprova col tentativo successivo.
      }
    }
  }

  /**
   * Usata dalla libreria sia per il primo collegamento sia per ogni riconnessione.
   * La libreria aggiunge già una sua attesa fissa (0-5 s): questa è in più.
   */
  private readonly creaSocket = async (opzioni: ConnectionOptions): Promise<HaWebSocket> => {
    const attesa = calcolaAttesa(this.tentativo);
    this.tentativo += 1;
    if (attesa > 0) await this.attendi(attesa);
    return createSocket({ ...opzioni, setupRetry: 0 });
  };

  /** Attesa interrompibile: il ritorno della rete la accorcia a zero. */
  private attendi(ms: number): Promise<void> {
    return new Promise<void>((risolvi) => {
      const timer = setTimeout(risolvi, ms);
      this.svegliaAttesa = (): void => {
        clearTimeout(timer);
        risolvi();
      };
    }).finally(() => {
      this.svegliaAttesa = null;
    });
  }

  private readonly suRetePresente = (): void => {
    log.info("Rete tornata: riprovo subito");
    this.tentativo = 0;
    this.svegliaAttesa?.();
  };

  /** Il primo messaggio dopo ogni (ri)sottoscrizione è lo stato completo. */
  private readonly suEntita = (agg: AggiornamentoEntita): void => {
    const completo = this.prossimoCompleto;
    this.prossimoCompleto = false;
    this.negozio.aggiorna(applicaAggiornamento(this.negozio.tutte, agg, completo));
  };

  /**
   * Evento "ready" della libreria dopo una riconnessione: nello stesso istante
   * (sincrono, in `_setSocket`) la libreria ha appena rimandato
   * subscribe_entities, e nessuna risposta può essere già arrivata. È quindi il
   * momento giusto per armare "il prossimo messaggio sostituisce tutto".
   */
  private readonly suRiconnessa = (): void => {
    this.prossimoCompleto = true;
    this.segnaConnesso();
    // mentre il pannello era offline aree e dispositivi possono essere cambiati
    if (this.conn) void this.registri.carica(this.conn);
    // gli eventi dei timer persi mentre si era scollegati: si rilegge l'elenco
    void this.timer.rileggi("riconnessione");
  };

  /** Solo stato dell'interfaccia: NON tocca il segnale della foto completa. */
  private segnaConnesso(): void {
    this.tentativo = 0;
    this.imposta({
      stato: "connesso",
      disconnessoDa: null,
      connessoDa: Date.now(),
      versioneHA: this.conn?.haVersion ?? null,
    });
    if (this.info.riconnessioni > 0) log.info("Riconnesso a Home Assistant");
    // chiude l'interruzione aperta (anche una rimasta aperta da prima di una ricarica)
    this.interruzioni.fine(Date.now());
    void this.misuraLatenza();
    // chi guardava la musica mentre HA non c'era la ritrova subito, non al giro dopo
    this.musica.alCollegamento();
  }

  private readonly suDisconnessa = (): void => {
    log.avviso("Connessione a Home Assistant persa");
    this.interruzioni.inizio(Date.now());
    this.imposta({
      stato: "riconnessione",
      disconnessoDa: Date.now(),
      connessoDa: null,
      riconnessioni: this.info.riconnessioni + 1,
    });
  };

  private readonly suErroreRiconnessione = (_conn: Connection, errore: unknown): void => {
    if (errore === ERR_INVALID_AUTH) this.loginScaduto();
    else log.errore(`Riconnessione fallita: ${descriviErrore(errore)}`);
  };

  private loginScaduto(): void {
    log.errore("Home Assistant ha rifiutato il login salvato: serve accedere di nuovo");
    dimenticaLogin();
    this.fermaPing();
    this.conn?.close();
    this.conn = null;
    this.imposta({
      stato: "login-richiesto",
      motivoLogin: "Home Assistant non riconosce più questo pannello: accedi di nuovo.",
    });
  }

  private avviaPing(): void {
    this.fermaPing();
    this.timerPing = setInterval(() => void this.misuraLatenza(), INTERVALLO_PING_MS);
  }

  private fermaPing(): void {
    if (this.timerPing !== undefined) clearInterval(this.timerPing);
    this.timerPing = undefined;
  }

  /** Ping con timeout: misura la latenza e scopre i socket morti in silenzio. */
  async misuraLatenza(): Promise<void> {
    const conn = this.conn;
    if (!conn?.connected) return;
    const inizio = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scaduto = new Promise<"scaduto">((risolvi) => {
      timer = setTimeout(() => risolvi("scaduto"), TIMEOUT_PING_MS);
    });
    try {
      const esito = await Promise.race([conn.ping(), scaduto]);
      if (esito === "scaduto") {
        log.avviso(`HA non risponde al ping da ${TIMEOUT_PING_MS / 1000} s: forzo la riconnessione`);
        conn.reconnect(true);
        return;
      }
      this.imposta({ latenzaMs: Math.round(performance.now() - inizio) });
    } catch (errore) {
      log.avviso(`Ping fallito: ${descriviErrore(errore)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private imposta(parziale: Partial<InfoConnessione>): void {
    this.info = { ...this.info, ...parziale };
    for (const f of this.ascoltatori) f();
  }

  chiudi(): void {
    this.chiusa = true;
    this.fermaPing();
    window.removeEventListener("online", this.suRetePresente);
    this.conn?.close();
  }
}

export const connessione = new Connessione();
