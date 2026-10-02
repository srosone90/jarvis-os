import type { Turno } from "../assistente";
import { descriviErrore, log } from "../diagnostica";
import type { FaseVoce } from "./voce";

/**
 * Pausa della musica mentre Jarvis ascolta e parla (v0.4.4), su TUTTE le
 * facce della voce: tocca per parlare, "Jarvis", Hub. Nasce dalla prova del
 * 30/09: l'Echo usato come cassa Bluetooth del tablet mescolava Spotify e la
 * voce di Jarvis (incomprensibile), oppure passava al Bluetooth, fermava
 * Spotify e non ripartiva più.
 *
 * Regole (richieste della sessione server, 30/09):
 * 1. all'inizio dell'ascolto, SENZA farlo aspettare: se la musica suona nella
 *    stanza di questo pannello (o su "Tutta la casa") → pausa, e ci si ricorda
 *    il volume;
 * 2. alla fine (risposta finita, errore, annullamento, silenzio) → si riprende e
 *    si rimette quel volume (l'Echo lo cambia da solo);
 * 3. mai riprendere musica che non abbiamo fermato noi;
 * 4. se era un comando sulla musica (uno strumento `jarvis_musica…`), niente
 *    ripresa: "metti in pausa" deve restare in pausa;
 * 5. più domande di fila (anche il seguito come un Echo): si riprende solo
 *    dopo l'ultima (si aspetta ATTESA_RIPRESA_MS);
 * 6. errori della musica → solo nel log, mai bloccare la voce;
 * 7. senza stanza impostata per questo pannello non si tocca la musica.
 * Stato e comandi passano da jarvis_musica (stato vero di Spotify, non il
 * media_player di HA che si aggiorna ogni 30 s).
 */
export interface FonteVoce {
  readonly fase: FaseVoce;
  readonly turno: Turno | undefined;
  ascolta(f: () => void): () => void;
}

/** jarvis_musica.<servizio> con la risposta (return_response). */
type ChiamaMusica = (
  servizio: "stato" | "controllo",
  dati: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/** Dopo la fine della voce si aspetta tanto prima di riprendere: il seguito riapre il microfono prima. */
const ATTESA_RIPRESA_MS = 1500;
/** Stanze "ovunque" (es. il gruppo Alexa di tutti gli Echo): si fermano da qualunque pannello con una stanza. */
const STANZE_OVUNQUE = ["tutta la casa"];

function normalizzaStanza(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** La musica che suona in `stanzaMusica` riguarda il pannello della stanza `stanzaPannello`? */
export function riguardaIlPannello(stanzaMusica: string, stanzaPannello: string): boolean {
  const musica = normalizzaStanza(stanzaMusica);
  return musica === normalizzaStanza(stanzaPannello) || STANZE_OVUNQUE.includes(musica);
}

function eComandoMusica(t: Turno | undefined): boolean {
  return !!t?.strumenti.some((n) => n.includes("jarvis_musica"));
}

interface Gruppo {
  fermata: boolean;
  volume: number | null;
  comandoMusica: boolean;
  chiuso: boolean;
  lavoro: Promise<void>;
}

const aRiposo = (f: FaseVoce): boolean => f === "spenta" || f === "errore";

export class PausaMusica {
  private gruppo: Gruppo | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private precedente: FaseVoce;
  /** Per non ripetere lo stesso avviso a ogni domanda. */
  private avvisato = new Set<string>();

  constructor(
    private readonly voce: FonteVoce,
    private readonly chiama: ChiamaMusica,
    private readonly stanza: () => string | null,
    private readonly attesa = ATTESA_RIPRESA_MS,
  ) {
    this.precedente = voce.fase;
    voce.ascolta(() => this.suVoce());
  }

  private suVoce(): void {
    const fase = this.voce.fase;
    if (this.gruppo && eComandoMusica(this.voce.turno)) this.gruppo.comandoMusica = true;
    if (aRiposo(this.precedente) && !aRiposo(fase)) this.inizio();
    else if (!aRiposo(this.precedente) && aRiposo(fase)) this.programmaFine();
    this.precedente = fase;
  }

  private inizio(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    // domanda di fila o seguito: stesso gruppo, la musica resta ferma
    if (this.gruppo) return;
    const g: Gruppo = {
      fermata: false,
      volume: null,
      comandoMusica: false,
      chiuso: false,
      lavoro: Promise.resolve(),
    };
    this.gruppo = g;
    const stanza = this.stanza();
    if (!stanza) {
      if (!this.avvisato.has("senza-stanza"))
        log.info("Musica: stanza di questo pannello non impostata, la musica non si tocca");
      this.avvisato.add("senza-stanza");
      return;
    }
    // in parallelo all'ascolto: la voce non aspetta la musica
    g.lavoro = this.fermaSeSuona(g, stanza);
  }

  private async fermaSeSuona(g: Gruppo, stanza: string): Promise<void> {
    try {
      const s = await this.chiama("stato", {});
      // la voce è già finita prima che Spotify rispondesse: non si ferma niente
      if (g.chiuso || s["stato"] !== "in_riproduzione") return;
      if (!riguardaIlPannello(String(s["stanza"] ?? ""), stanza)) return;
      const r = await this.chiama("controllo", { azione: "pausa" });
      if (r["esito"] !== "ok") {
        log.avviso(`Musica: pausa non riuscita (${String(r["messaggio"] ?? r["codice"] ?? "?")})`);
        return;
      }
      g.fermata = true;
      g.volume = typeof s["volume"] === "number" ? s["volume"] : null;
      log.info(`Musica in pausa mentre Jarvis ascolta (${String(s["stanza"])}, volume ${g.volume ?? "?"})`);
    } catch (errore) {
      this.avvisaUnaVolta("pausa", `Musica: pausa non riuscita: ${descriviErrore(errore)}`);
    }
  }

  private programmaFine(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.fine(), this.attesa);
  }

  private async fine(): Promise<void> {
    const g = this.gruppo;
    if (!g) return;
    this.gruppo = null;
    g.chiuso = true;
    if (eComandoMusica(this.voce.turno)) g.comandoMusica = true;
    await g.lavoro;
    if (!g.fermata) return;
    if (g.comandoMusica) {
      log.info("Musica: era un comando sulla musica, niente ripresa automatica");
      return;
    }
    try {
      const r = await this.chiama("controllo", { azione: "riprendi" });
      if (r["esito"] !== "ok") {
        log.avviso(`Musica: ripresa non riuscita (${String(r["messaggio"] ?? r["codice"] ?? "?")})`);
        return;
      }
      if (g.volume !== null && typeof r["volume"] === "number" && r["volume"] !== g.volume)
        await this.chiama("controllo", { azione: "volume", livello: g.volume });
      log.info(`Musica ripresa dopo la voce (volume ${g.volume ?? "invariato"})`);
    } catch (errore) {
      log.avviso(`Musica: ripresa non riuscita: ${descriviErrore(errore)}`);
    }
  }

  private avvisaUnaVolta(chiave: string, testo: string): void {
    if (this.avvisato.has(chiave)) return;
    this.avvisato.add(chiave);
    log.avviso(testo);
  }
}
