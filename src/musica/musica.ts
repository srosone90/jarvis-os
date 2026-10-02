import { descriviErrore, log } from "../diagnostica/log";
import { chiamaControllato, dispositiviDa, messaggioDi, type ElencoDispositivi } from "./dispositivi";

/**
 * Musica (v0.5.6, mockup M1 approvato il 30/09): lo stato VERO di Spotify letto
 * da `jarvis_musica.stato` (0.4.0: copertina, posizione_ms, durata_ms), i
 * comandi di `jarvis_musica.controllo` e le playlist di `jarvis_musica.playlist`
 * (un tocco → `riproduci` con `cosa` = l'uri della playlist).
 *
 * Un solo posto per tutto il pannello (schermata Musica, mini-lettore, riposo):
 * si rilegge ogni `intervallo` secondi solo finché qualcuno guarda, e subito
 * dopo ogni comando. La barra di avanzamento scorre in locale tra una lettura
 * e l'altra (`posizioneAdesso`), mai oltre la durata del brano.
 *
 * v0.5.9 (jarvis_musica 0.5.0): ogni `riproduci` e `controllo` dice chi chiede
 * (`pannello`, il device_id di questo pannello) e su quale `dispositivo`
 * Spotify suona questo pannello: la musica parte da qui, non dall'Echo che
 * suonava già. Un errore di jarvis_musica (`{esito: "errore"}`, con la
 * risposta non è un'eccezione) si dice in chiaro.
 */
export type StatoMusica = "in_riproduzione" | "in_pausa" | "niente";

export interface Brano {
  stato: StatoMusica;
  titolo: string;
  artisti: string;
  dispositivo: string;
  stanza: string;
  /** 0-100, null se il dispositivo non lo dice. */
  volume: number | null;
  copertina: string | null;
  posizioneMs: number;
  durataMs: number;
  /** Quando è stato letto (ms): da qui scorre l'avanzamento. */
  letto: number;
}

export interface Playlist {
  nome: string;
  uri: string;
  copertina: string | null;
  proprietario: string | null;
}

export type AzioneMusica =
  "pausa" | "riprendi" | "successivo" | "precedente" | "volume" | "alza" | "abbassa" | "sposta";

const testo = (v: unknown): string => (typeof v === "string" ? v : "");
const numeroO = (v: unknown, altrimenti: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : altrimenti;

/** Risposta di jarvis_musica.stato (o di un controllo) → brano. */
export function branoDa(r: Record<string, unknown>, adesso: number): Brano {
  const s = r["stato"];
  const stato: StatoMusica = s === "in_riproduzione" || s === "in_pausa" ? s : "niente";
  const v = r["volume"];
  return {
    stato,
    titolo: testo(r["titolo"]),
    artisti: testo(r["artisti"]),
    dispositivo: testo(r["dispositivo"]),
    stanza: testo(r["stanza"]),
    volume: typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null,
    copertina: typeof r["copertina"] === "string" && r["copertina"] ? r["copertina"] : null,
    posizioneMs: Math.max(0, numeroO(r["posizione_ms"], 0)),
    durataMs: Math.max(0, numeroO(r["durata_ms"], 0)),
    letto: adesso,
  };
}

/** Dove è arrivato il brano adesso: scorre solo mentre suona, mai oltre la fine. */
export function posizioneAdesso(b: Brano, adesso: number): number {
  const p = b.stato === "in_riproduzione" ? b.posizioneMs + (adesso - b.letto) : b.posizioneMs;
  return b.durataMs > 0 ? Math.min(b.durataMs, p) : p;
}

/** "3:07" */
export function minuti(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function playlistDa(r: Record<string, unknown>): Playlist[] {
  const elenco = r["playlist"];
  if (!Array.isArray(elenco)) return [];
  return elenco
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x["uri"] === "string" && typeof x["nome"] === "string")
    .map((x) => ({
      nome: x["nome"] as string,
      uri: x["uri"] as string,
      copertina: typeof x["copertina"] === "string" ? x["copertina"] : null,
      proprietario: typeof x["proprietario"] === "string" ? x["proprietario"] : null,
    }));
}

/** Le preferite prima, nell'ordine in cui sono state segnate; poi le altre come le dà Spotify. */
export function ordinaPlaylist(elenco: readonly Playlist[], preferite: readonly string[]): Playlist[] {
  const prima = preferite.map((u) => elenco.find((p) => p.uri === u)).filter((p): p is Playlist => !!p);
  return [...prima, ...elenco.filter((p) => !preferite.includes(p.uri))];
}

// --- preferenze ------------------------------------------------------------------

export type PosizioneMini = "orologio" | "barra";

export interface PreferenzeMusica {
  /** Mini-lettore nella Casa quando suona qualcosa. */
  mini: boolean;
  posizioneMini: PosizioneMini;
  /** Ogni quanti secondi si rilegge lo stato (mentre qualcuno guarda). */
  intervalloSecondi: number;
  /** uri delle playlist preferite, in cima all'elenco. */
  preferite: string[];
  /** Stanze per spostare la musica; vuoto = le aree di Home Assistant. */
  stanze: string[];
}

export const PREFERENZE_MUSICA_DI_SERIE: PreferenzeMusica = {
  mini: true,
  posizioneMini: "orologio",
  intervalloSecondi: 20,
  preferite: [],
  stanze: [],
};
export const LIMITI_MUSICA = { intervalloSecondi: [5, 300] } as const;
const CHIAVE = "jarvis-musica";

export function leggiPreferenzeMusica(grezzo: string | null): PreferenzeMusica {
  const p: PreferenzeMusica = { ...PREFERENZE_MUSICA_DI_SERIE, preferite: [], stanze: [] };
  if (grezzo === null) return p;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(grezzo) as Record<string, unknown>;
    if (typeof d !== "object" || d === null) return p;
  } catch {
    return p;
  }
  if (typeof d["mini"] === "boolean") p.mini = d["mini"];
  if (d["posizioneMini"] === "orologio" || d["posizioneMini"] === "barra")
    p.posizioneMini = d["posizioneMini"];
  const i = d["intervalloSecondi"];
  if (typeof i === "number" && Number.isFinite(i))
    p.intervalloSecondi = Math.round(
      Math.min(LIMITI_MUSICA.intervalloSecondi[1], Math.max(LIMITI_MUSICA.intervalloSecondi[0], i)),
    );
  const elenco = (v: unknown): string[] =>
    Array.isArray(v)
      ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim() !== ""))]
      : [];
  p.preferite = elenco(d["preferite"]);
  p.stanze = elenco(d["stanze"]).map((s) => s.trim());
  return p;
}

// --- stato condiviso -----------------------------------------------------------

export interface DipendenzeMusica {
  /** jarvis_musica.<servizio> con la risposta. */
  chiama: (servizio: string, dati: Record<string, unknown>) => Promise<Record<string, unknown>>;
  collegato: () => boolean;
  /** device_id di questo pannello ("jarvis_cucina"); null senza stanza (v0.5.9). */
  pannello?: () => string | null;
  adesso?: () => number;
  archivio?: Pick<Storage, "getItem" | "setItem"> | null;
}

export class Musica {
  private attuale: Brano | null = null;
  private elencoPlaylist: Playlist[] | null = null;
  private errore: string | null = null;
  private pref: PreferenzeMusica;
  private osservatori = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lettura: Promise<void> | null = null;
  private avvisato = false;
  private playlistChieste = false;
  private inCorso: AzioneMusica | "playlist" | null = null;
  private elencoDispositivi: ElencoDispositivi | null = null;
  private erroreDispositivi: string | null = null;
  private dispositiviChiesti = false;
  private readonly adesso: () => number;
  private readonly ascoltatori = new Set<() => void>();

  constructor(private readonly dip: DipendenzeMusica) {
    this.adesso = dip.adesso ?? Date.now;
    let letto: string | null = null;
    try {
      letto =
        dip.archivio === undefined
          ? typeof localStorage === "undefined"
            ? null
            : localStorage.getItem(CHIAVE)
          : (dip.archivio?.getItem(CHIAVE) ?? null);
    } catch (errore) {
      log.avviso(`Musica: preferenze non lette (${descriviErrore(errore)})`);
    }
    this.pref = leggiPreferenzeMusica(letto);
  }

  get brano(): Brano | null {
    return this.attuale;
  }
  get playlist(): readonly Playlist[] | null {
    return this.elencoPlaylist === null ? null : ordinaPlaylist(this.elencoPlaylist, this.pref.preferite);
  }
  /** Perché la musica non si legge (componente non installato, Spotify giù), in parole. */
  get problema(): string | null {
    return this.errore;
  }
  get preferenze(): PreferenzeMusica {
    return { ...this.pref, preferite: [...this.pref.preferite], stanze: [...this.pref.stanze] };
  }
  /** Comando in corso (i pulsanti si spengono finché Spotify non conferma). */
  get occupata(): AzioneMusica | "playlist" | null {
    return this.inCorso;
  }
  /** I dispositivi di Spotify e quello di questo pannello (null = non ancora letti). */
  get dispositivi(): ElencoDispositivi | null {
    return this.elencoDispositivi;
  }
  /** Perché l'elenco dei dispositivi non si legge, in parole. */
  get problemaDispositivi(): string | null {
    return this.erroreDispositivi;
  }
  /** Il dispositivo Spotify di questo pannello; null = chiede ogni volta (o non ancora letto). */
  get dispositivoScelto(): string | null {
    return this.elencoDispositivi?.scelto ?? null;
  }
  get pannello(): string | null {
    return this.dip.pannello?.() ?? null;
  }

  /** Suona qualcosa adesso. */
  get suona(): boolean {
    return this.attuale?.stato === "in_riproduzione";
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  /**
   * Qualcuno guarda la musica (schermata, mini-lettore, riposo): si rilegge
   * ogni `intervallo`. Ritorna la funzione per smettere; senza osservatori la
   * lettura periodica si ferma.
   */
  osserva(): () => void {
    this.osservatori += 1;
    if (this.osservatori === 1) this.riarma();
    void this.leggi();
    let fatto = false;
    return () => {
      if (fatto) return;
      fatto = true;
      this.osservatori -= 1;
      if (this.osservatori === 0) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    };
  }

  /**
   * Home Assistant (ri)collegato: se qualcuno guarda si rilegge subito (le
   * letture tentate da scollegati non sono partite), e le playlist se erano
   * state chieste.
   */
  alCollegamento(): void {
    if (this.osservatori > 0) void this.leggi();
    if (this.playlistChieste && !this.elencoPlaylist?.length) void this.leggiPlaylist();
    // v0.5.9: anche i dispositivi, se qualcuno li ha chiesti da scollegato (pannello aperto sulla Musica)
    if (this.dispositiviChiesti) void this.leggiDispositivi();
  }

  private riarma(): void {
    clearInterval(this.timer);
    this.timer = setInterval(() => void this.leggi(), this.pref.intervalloSecondi * 1000);
  }

  /** Rilegge lo stato vero (una lettura alla volta). */
  leggi(): Promise<void> {
    if (!this.dip.collegato()) return Promise.resolve();
    this.lettura ??= this.dip
      .chiama("stato", {})
      .then(
        (r) => {
          this.attuale = branoDa(r, this.adesso());
          this.errore = null;
          this.avvisato = false;
        },
        (errore: unknown) => {
          this.attuale = null;
          this.errore = descriviErrore(errore);
          if (!this.avvisato) log.avviso(`Musica: stato non leggibile (${this.errore})`);
          this.avvisato = true;
        },
      )
      .finally(() => {
        this.lettura = null;
        this.notifica();
      });
    return this.lettura;
  }

  /** jarvis_musica.dispositivi con il pannello: l'elenco di Spotify e la scelta salvata (v0.5.9). */
  async leggiDispositivi(): Promise<ElencoDispositivi | null> {
    this.dispositiviChiesti = true;
    if (!this.dip.collegato()) return this.elencoDispositivi;
    const pannello = this.pannello;
    try {
      this.elencoDispositivi = dispositiviDa(
        await chiamaControllato(this.dip.chiama, "dispositivi", pannello ? { pannello } : {}),
      );
      this.erroreDispositivi = null;
    } catch (errore) {
      this.erroreDispositivi = messaggioDi(errore);
      log.avviso(`Musica: dispositivi non letti (${this.erroreDispositivi})`);
    }
    this.notifica();
    return this.elencoDispositivi;
  }

  /** Su quale dispositivo suona questo pannello (null = chiede ogni volta). Errore in parole, o null. */
  async impostaDispositivo(nome: string | null): Promise<string | null> {
    const pannello = this.pannello;
    if (!pannello) return "Scegli prima la stanza di questo pannello (Impostazioni → Stanza e nome).";
    try {
      await chiamaControllato(this.dip.chiama, "imposta_pannello", { pannello, dispositivo: nome ?? "" });
      log.info(`Musica: questo pannello (${pannello}) suona su ${nome ?? "(chiede ogni volta)"}`);
    } catch (errore) {
      const m = messaggioDi(errore);
      log.avviso(`Musica: dispositivo del pannello non salvato (${m})`);
      return m;
    }
    await this.leggiDispositivi();
    return null;
  }

  async leggiPlaylist(): Promise<void> {
    this.playlistChieste = true;
    if (!this.dip.collegato()) return;
    try {
      this.elencoPlaylist = playlistDa(await this.dip.chiama("playlist", {}));
    } catch (errore) {
      this.elencoPlaylist = [];
      log.avviso(`Musica: playlist non lette (${descriviErrore(errore)})`);
    }
    this.notifica();
  }

  /** Chi chiede e su quale dispositivo (v0.5.9): `dispositivo` passato > quello scelto per il pannello. */
  private daDove(dispositivo?: string): Record<string, string> {
    const pannello = this.pannello;
    const nome = dispositivo ?? this.dispositivoScelto;
    return { ...(pannello ? { pannello } : {}), ...(nome ? { dispositivo: nome } : {}) };
  }

  /** Un comando: Spotify lo conferma (jarvis_musica aspetta), poi si rilegge lo stato. */
  async comanda(
    azione: AzioneMusica,
    dati: { dove?: string; livello?: number } = {},
  ): Promise<string | null> {
    return this.esegui(azione, "controllo", { azione, ...dati, ...this.daDove() });
  }

  /**
   * Una playlist con un tocco (riproduci con l'uri) sul dispositivo di questo
   * pannello (v0.5.9: prima "dove suona già", ed era partita dall'Echo della
   * cucina), o su `dispositivo` scelto in «Dove la suono?».
   */
  async riproduci(uri: string, dispositivo?: string): Promise<string | null> {
    return this.esegui("playlist", "riproduci", { cosa: uri, ...this.daDove(dispositivo) });
  }

  private async esegui(
    nome: AzioneMusica | "playlist",
    servizio: string,
    dati: Record<string, unknown>,
  ): Promise<string | null> {
    if (this.inCorso) return "Un comando è già in corso.";
    this.inCorso = nome;
    this.notifica();
    let errore: string | null = null;
    try {
      // {esito: "errore"} (es. dispositivo_assente) diventa un errore vero, col messaggio del server
      const r = await chiamaControllato(this.dip.chiama, servizio, dati);
      log.info(
        `Musica: ${servizio} ${JSON.stringify(dati)} → ${typeof r["esito"] === "string" ? r["esito"] : "ok"}`,
      );
    } catch (e) {
      errore = messaggioDi(e);
      log.avviso(`Musica: ${servizio} ${JSON.stringify(dati)} non riuscito (${errore})`);
    } finally {
      this.inCorso = null;
    }
    // una lettura partita prima del comando porterebbe lo stato di prima: si aspetta e si rilegge
    if (this.lettura) await this.lettura;
    await this.leggi();
    return errore;
  }

  /** `null` = valore di serie. */
  cambiaPreferenze(cambi: { [K in keyof PreferenzeMusica]?: PreferenzeMusica[K] | null }): void {
    const unito: Record<string, unknown> = { ...this.pref };
    for (const [k, v] of Object.entries(cambi))
      unito[k] = v === null ? PREFERENZE_MUSICA_DI_SERIE[k as keyof PreferenzeMusica] : v;
    const prima = this.pref.intervalloSecondi;
    this.pref = leggiPreferenzeMusica(JSON.stringify(unito));
    try {
      (this.dip.archivio === undefined ? localStorage : this.dip.archivio)?.setItem(
        CHIAVE,
        JSON.stringify(this.pref),
      );
    } catch (errore) {
      log.avviso(`Musica: preferenze non salvate (${descriviErrore(errore)})`);
    }
    if (prima !== this.pref.intervalloSecondi && this.osservatori > 0) this.riarma();
    log.info(
      `Musica: mini-lettore ${this.pref.mini ? this.pref.posizioneMini : "spento"}, rilettura ogni ` +
        `${this.pref.intervalloSecondi} s, ${this.pref.preferite.length} preferite, ` +
        `stanze ${this.pref.stanze.length ? this.pref.stanze.join(", ") : "di Home Assistant"}`,
    );
    this.notifica();
  }

  /** Segna o toglie una playlist dalle preferite. */
  preferita(uri: string): void {
    const p = this.pref.preferite;
    this.cambiaPreferenze({ preferite: p.includes(uri) ? p.filter((u) => u !== uri) : [...p, uri] });
  }

  private notifica(): void {
    for (const f of this.ascoltatori) {
      try {
        f();
      } catch (errore) {
        log.errore(`Musica: ascoltatore in errore: ${descriviErrore(errore)}`);
      }
    }
  }
}
