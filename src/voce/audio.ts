import { descriviErrore, log } from "../diagnostica/log";

export type EsitoRiproduzione = "finito" | "interrotto" | "errore";

/** Oltre la durata dell'audio, quanto si aspetta prima di darlo per perso. */
const MARGINE_MS = 10_000;
/** Se la durata non arriva mai (audio in streaming, rete lenta), tempo massimo. */
const MASSIMO_MS = 90_000;

/**
 * Riproduce la risposta parlata. Esce dall'uscita audio del sistema: se c'è un
 * altoparlante Bluetooth collegato (Echo Pop), da lì.
 *
 * Non deve MAI bloccare il pannello: la promessa si risolve sempre, anche se
 * l'altoparlante si scollega a metà (Chrome mette in pausa l'audio quando
 * l'uscita sparisce: diventa "interrotto"), se l'audio non si carica, o se non
 * finisce mai (tempo massimo). Il testo della risposta resta comunque in chat.
 */
export class Riproduttore {
  private attuale: { audio: HTMLAudioElement; chiudi: (e: EsitoRiproduzione) => void } | null = null;

  get inCorso(): boolean {
    return this.attuale !== null;
  }

  riproduci(url: string): Promise<EsitoRiproduzione> {
    this.ferma();
    return new Promise((risolvi) => {
      const audio = new Audio();
      audio.preload = "auto";
      let fermatoDaNoi = false;
      let timer: ReturnType<typeof setTimeout> = setTimeout(() => chiudi("errore"), MASSIMO_MS);
      const chiudi = (esito: EsitoRiproduzione): void => {
        if (this.attuale?.audio !== audio) return;
        this.attuale = null;
        clearTimeout(timer);
        audio.onended = audio.onerror = audio.onpause = audio.onloadedmetadata = null;
        fermatoDaNoi = true;
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        if (esito !== "finito") log.avviso(`Voce: riproduzione ${esito}`);
        risolvi(esito);
      };
      this.attuale = { audio, chiudi };
      audio.onended = () => chiudi("finito");
      audio.onerror = () => chiudi("errore");
      // pausa non chiesta da noi: uscita audio sparita (Bluetooth scollegato) o sistema
      audio.onpause = () => {
        if (!fermatoDaNoi && !audio.ended) chiudi("interrotto");
      };
      audio.onloadedmetadata = () => {
        if (Number.isFinite(audio.duration)) {
          clearTimeout(timer);
          timer = setTimeout(() => chiudi("errore"), audio.duration * 1000 + MARGINE_MS);
        }
      };
      audio.src = url;
      audio.play().catch((errore: unknown) => {
        log.avviso(`Voce: l'audio non parte: ${descriviErrore(errore)}`);
        chiudi("errore");
      });
    });
  }

  /** Interrompe la risposta (tocco su "interrompi"). */
  ferma(): void {
    this.attuale?.chiudi("interrotto");
  }
}

/**
 * Bip leggero all'apertura e alla chiusura del microfono (deciso il 29/09): utile
 * quando non si guarda lo schermo. Esce dall'uscita audio in uso.
 */
export class Bip {
  private contesto: AudioContext | null = null;

  suona(tipo: "apri" | "chiudi"): void {
    try {
      this.contesto ??= new AudioContext();
      const c = this.contesto;
      void c.resume();
      const t = c.currentTime;
      const osc = c.createOscillator();
      const vol = c.createGain();
      osc.frequency.value = tipo === "apri" ? 880 : 620;
      vol.gain.setValueAtTime(0.0001, t);
      vol.gain.exponentialRampToValueAtTime(0.12, t + 0.015);
      vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(vol).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.13);
    } catch (errore) {
      // il bip è un aiuto, non una funzione: se manca, la voce va avanti
      log.avviso(`Voce: bip non riprodotto: ${descriviErrore(errore)}`);
    }
  }
}
