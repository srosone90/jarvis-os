import { descriviErrore, log } from "../diagnostica";

/**
 * Su quale dispositivo Spotify suona questo pannello (v0.5.9, jarvis_musica
 * 0.5.0). Regola di Salvatore (02/10): la musica parte dal dispositivo da cui
 * la chiedi; gli altoparlanti di altre stanze solo se nominati. Dal Redmi una
 * playlist era partita dall'Echo della cucina, perché il pannello non diceva
 * da dove chiedeva.
 *
 * - `dispositivi {pannello}`: i dispositivi Spotify Connect visibili adesso e
 *   quello scelto per il pannello (salvato sul server, `imposta_pannello`);
 * - «Collega questo dispositivo»: si apre l'app Spotify (o il sito, su un
 *   computer), si torna al pannello e il dispositivo NUOVO nell'elenco di
 *   Spotify è questo pannello. Il login lo fa la persona nell'app o sul sito:
 *   il pannello non vede né password né token.
 */

export interface DispositivoSpotify {
  nome: string;
  /** "Smartphone", "Tablet", "Computer", "Speaker"… (DeviceType di Spotify) */
  tipo: string;
  attivo: boolean;
  volume: number | null;
  /** false = Spotify non lo comanda da remoto (is_restricted). */
  comandabile: boolean;
}

export interface ElencoDispositivi {
  elenco: DispositivoSpotify[];
  /** Il dispositivo salvato per questo pannello; null = chiede ogni volta. */
  scelto: string | null;
  /** Spotify vede adesso il dispositivo scelto (se no: «Ricollega»). */
  sceltoVisibile: boolean;
}

const testo = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * jarvis_musica chiamato con la risposta NON solleva errori: risponde
 * `{esito: "errore", codice, messaggio}` (es. `dispositivo_assente`). Prima
 * della v0.5.9 il pannello lo prendeva per buono e l'errore spariva.
 */
export function erroreDaRisposta(r: Record<string, unknown>): string | null {
  if (r["esito"] !== "errore") return null;
  return testo(r["messaggio"]) ?? `errore di jarvis_musica (${testo(r["codice"]) ?? "senza codice"})`;
}

/** Il messaggio per le persone (senza "Error:" davanti). */
export function messaggioDi(errore: unknown): string {
  return errore instanceof Error && errore.message ? errore.message : descriviErrore(errore);
}

/** Chiama e, se jarvis_musica risponde con un errore, lo solleva col suo messaggio. */
export async function chiamaControllato(
  chiama: (servizio: string, dati: Record<string, unknown>) => Promise<Record<string, unknown>>,
  servizio: string,
  dati: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const r = await chiama(servizio, dati);
  const errore = erroreDaRisposta(r);
  if (errore) throw new Error(errore);
  return r;
}

/** Risposta di jarvis_musica.dispositivi → elenco (voci senza nome scartate). */
export function dispositiviDa(r: Record<string, unknown>): ElencoDispositivi {
  const grezzi = Array.isArray(r["dispositivi"]) ? (r["dispositivi"] as unknown[]) : [];
  const elenco: DispositivoSpotify[] = [];
  for (const g of grezzi) {
    if (typeof g !== "object" || g === null) continue;
    const d = g as Record<string, unknown>;
    const nome = testo(d["nome"]);
    if (!nome) continue;
    elenco.push({
      nome,
      tipo: testo(d["tipo"]) ?? "",
      attivo: d["attivo"] === true,
      volume: typeof d["volume"] === "number" ? d["volume"] : null,
      comandabile: d["comandabile"] !== false,
    });
  }
  const scelto = testo(r["scelto"]);
  return {
    elenco,
    scelto,
    sceltoVisibile: scelto !== null && elenco.some((d) => uguali(d.nome, scelto)),
  };
}

/** Stesso nome per Spotify: minuscole, senza accenti, spazi singoli (come `normalizza` del server). */
export function uguali(a: string, b: string): boolean {
  const n = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  return n(a) === n(b);
}

/** I tipi che possono essere QUESTO pannello (non un altoparlante o una TV). */
const TIPI_PANNELLO = new Set(["smartphone", "tablet", "computer"]);

/**
 * Quali dispositivi sono questo pannello, confrontando l'elenco di prima
 * dell'apertura di Spotify con quello di adesso:
 * - `cercato` (Ricollega): se è ricomparso, è lui e basta;
 * - i dispositivi NUOVI (nome che prima non c'era);
 * - se non ce n'è nessuno, quelli diventati attivi di tipo
 *   telefono / tablet / computer (Spotify era già aperto prima).
 * Solo quelli comandabili: un dispositivo che Spotify non comanda non serve.
 */
export function riconosci(
  prima: readonly DispositivoSpotify[],
  adesso: readonly DispositivoSpotify[],
  cercato: string | null = null,
): DispositivoSpotify[] {
  const usabili = adesso.filter((d) => d.comandabile);
  if (cercato) {
    const ritrovato = usabili.find((d) => uguali(d.nome, cercato));
    if (ritrovato) return [ritrovato];
  }
  const cerano = (d: DispositivoSpotify) => prima.some((p) => uguali(p.nome, d.nome));
  const nuovi = usabili.filter((d) => !cerano(d));
  if (nuovi.length) return nuovi;
  return usabili.filter(
    (d) =>
      d.attivo &&
      TIPI_PANNELLO.has(d.tipo.toLowerCase()) &&
      !prima.some((p) => uguali(p.nome, d.nome) && p.attivo),
  );
}

export const PLAY_STORE_SPOTIFY = "https://play.google.com/store/apps/details?id=com.spotify.music";
const SPOTIFY_WEB = "https://open.spotify.com";

/**
 * Cosa aprire per collegare questo dispositivo. Android: l'intent apre l'app
 * Spotify se c'è, altrimenti Chrome va da solo al Play Store
 * (`S.browser_fallback_url`). Altrove: il web player di Spotify in una nuova
 * scheda (sul computer funziona come dispositivo Spotify Connect).
 */
export function doveAprireSpotify(userAgent: string): { url: string; nuovaScheda: boolean } {
  if (/android/i.test(userAgent))
    return {
      url:
        "intent://open#Intent;scheme=spotify;package=com.spotify.music;" +
        `S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_SPOTIFY)};end`,
      nuovaScheda: false,
    };
  return { url: SPOTIFY_WEB, nuovaScheda: true };
}

// --- «Collega questo dispositivo» ----------------------------------------------

export const RILEGGI_OGNI_MS = 2000;
export const CERCA_PER_MS = 60_000;
/** Se il pannello non va mai in secondo piano (popup bloccato…), si comincia a cercare lo stesso. */
export const INIZIA_COMUNQUE_MS = 5000;

type StatoCollega =
  | { fase: "fermo" }
  | { fase: "apro" }
  | { fase: "cerco" }
  | { fase: "scegli"; nuovi: DispositivoSpotify[] }
  | { fase: "collegato"; nome: string }
  | { fase: "nonVisto" }
  | { fase: "errore"; messaggio: string };

interface DipendenzeCollega {
  /** jarvis_musica.<servizio> con la risposta. */
  chiama: (servizio: string, dati: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** device_id di questo pannello ("jarvis_cucina"); null senza stanza. */
  pannello: () => string | null;
  apri: (url: string, nuovaScheda: boolean) => void;
  userAgent: () => string;
  visibile: () => boolean;
  ascoltaVisibilita: (f: () => void) => () => void;
  /** Dopo il salvataggio (la Musica rilegge la scelta). */
  collegato?: (nome: string) => void;
}

export class CollegaDispositivo {
  private s: StatoCollega = { fase: "fermo" };
  private prima: DispositivoSpotify[] = [];
  private cercato: string | null = null;
  private giro = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inizio: ReturnType<typeof setTimeout> | undefined;
  private finoA = 0;
  private smettiVisibilita: (() => void) | null = null;
  private readonly ascoltatori = new Set<() => void>();

  constructor(private readonly dip: DipendenzeCollega) {}

  get stato(): StatoCollega {
    return this.s;
  }

  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  /**
   * Il tasto. `cercato` = il dispositivo salvato che Spotify non vede più
   * (Ricollega): lo si riconosce di nuovo per nome.
   */
  async avvia(cercato: string | null = null): Promise<void> {
    this.ferma();
    const giro = ++this.giro;
    this.cercato = cercato;
    this.imposta({ fase: "apro" });
    try {
      // prima di aprire: com'era l'elenco, per riconoscere quello nuovo
      this.prima = dispositiviDa(await chiamaControllato(this.dip.chiama, "dispositivi", {})).elenco;
    } catch (errore) {
      if (giro === this.giro) this.imposta({ fase: "errore", messaggio: messaggioDi(errore) });
      return;
    }
    if (giro !== this.giro) return;
    const { url, nuovaScheda } = doveAprireSpotify(this.dip.userAgent());
    log.info(`Musica: collego questo dispositivo, apro ${nuovaScheda ? url : "l'app Spotify"}`);
    // si comincia a cercare quando il pannello torna in primo piano
    this.smettiVisibilita = this.dip.ascoltaVisibilita(() => {
      if (giro === this.giro && this.dip.visibile() && this.s.fase === "apro") this.cerca(giro);
    });
    this.inizio = setTimeout(() => {
      if (giro === this.giro && this.dip.visibile() && this.s.fase === "apro") this.cerca(giro);
    }, INIZIA_COMUNQUE_MS);
    this.dip.apri(url, nuovaScheda);
  }

  /** Più dispositivi nuovi: quello toccato. */
  async scegli(nome: string): Promise<void> {
    if (this.s.fase !== "scegli") return;
    await this.salva(nome, this.giro);
  }

  /** Annulla la ricerca (si chiude il riquadro). */
  ferma(): void {
    this.giro += 1;
    clearTimeout(this.timer);
    clearTimeout(this.inizio);
    this.smettiVisibilita?.();
    this.smettiVisibilita = null;
    if (this.s.fase !== "fermo") this.imposta({ fase: "fermo" });
  }

  private cerca(giro: number): void {
    clearTimeout(this.inizio);
    this.finoA = Date.now() + CERCA_PER_MS;
    this.imposta({ fase: "cerco" });
    void this.giroDiLettura(giro);
  }

  private async giroDiLettura(giro: number): Promise<void> {
    if (giro !== this.giro) return;
    let adesso: DispositivoSpotify[] | null = null;
    try {
      adesso = dispositiviDa(await chiamaControllato(this.dip.chiama, "dispositivi", {})).elenco;
    } catch (errore) {
      // una lettura persa non ferma la ricerca: si riprova al giro dopo
      log.avviso(`Musica: dispositivi non letti (${descriviErrore(errore)})`);
    }
    if (giro !== this.giro) return;
    const trovati = adesso ? riconosci(this.prima, adesso, this.cercato) : [];
    if (trovati.length === 1 && trovati[0]) return this.salva(trovati[0].nome, giro);
    if (trovati.length > 1) return this.imposta({ fase: "scegli", nuovi: trovati });
    if (Date.now() + RILEGGI_OGNI_MS > this.finoA) {
      log.avviso("Musica: in 60 s Spotify non ha mostrato questo dispositivo");
      this.smettiVisibilita?.();
      this.smettiVisibilita = null;
      return this.imposta({ fase: "nonVisto" });
    }
    this.timer = setTimeout(() => void this.giroDiLettura(giro), RILEGGI_OGNI_MS);
  }

  private async salva(nome: string, giro: number): Promise<void> {
    const pannello = this.dip.pannello();
    try {
      if (pannello)
        await chiamaControllato(this.dip.chiama, "imposta_pannello", { pannello, dispositivo: nome });
    } catch (errore) {
      if (giro === this.giro) this.imposta({ fase: "errore", messaggio: messaggioDi(errore) });
      return;
    }
    if (giro !== this.giro) return;
    log.info(`Musica: questo pannello (${pannello ?? "senza stanza"}) suona su ${nome}`);
    this.smettiVisibilita?.();
    this.smettiVisibilita = null;
    this.imposta({ fase: "collegato", nome });
    this.dip.collegato?.(nome);
  }

  private imposta(s: StatoCollega): void {
    this.s = s;
    for (const f of this.ascoltatori) {
      try {
        f();
      } catch (errore) {
        log.errore(`Musica: ascoltatore del collegamento in errore: ${descriviErrore(errore)}`);
      }
    }
  }
}
