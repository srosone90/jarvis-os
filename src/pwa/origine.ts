import { ORIGINI, type Origini } from "../configurazione";
import { descriviErrore, log } from "../diagnostica/log";

/**
 * Origine veloce e origine di riserva (CLAUDE.md, "Due origini").
 *
 * Si apre sempre il link di riserva, l'unico da ricordare. All'avvio, SOLO se
 * la pagina arriva dalla riserva, si chiede un file piccolo all'origine veloce
 * (in parallelo all'avvio: niente attesa, niente pagina bianca) e, se risponde
 * entro 1,5 s, si passa lì con lo stesso percorso e gli stessi parametri.
 *
 * Niente rimbalzi: al massimo UN passaggio per sessione (sessionStorage della
 * riserva), e dalla veloce alla riserva si torna solo col tasto proposto dal
 * banner, quando HA manca da 30 s e la riserva risponde. Ogni origine ha il suo
 * service worker, la sua cache e il suo login.
 */
export const ATTESA_VELOCE_MS = 1500;
export const RITORNO_DOPO_MS = 30_000;
const ATTESA_RISERVA_MS = 5000;
const RICONTROLLO_RISERVA_MS = 15_000;
const CONTROLLO_OGNI_MS = 5000;
/** Nel sessionStorage della riserva: il passaggio di questa sessione c'è già stato. */
const CHIAVE_PASSAGGIO = "jarvis-passaggio-origine";
/** Nel sessionStorage della veloce: ci si è arrivati dalla riserva (solo per la diagnostica). */
const CHIAVE_ARRIVO = "jarvis-arrivo-da-riserva";
/** ?origine=riserva: si arriva dalla veloce col tasto del banner, non si riparte. */
const PARAMETRO = "origine";
/** File che c'è sempre nello zip, accanto alla pagina. */
const FILE_DI_PROVA = "sw.js";

export type UsoOrigine = "veloce" | "riserva" | "altra";

export type Decisione = { prova: true } | { prova: false; motivo: string };

/** Le origini in uso. Le prove automatiche le sostituiscono con due indirizzi locali. */
export function origini(): Origini {
  return (globalThis as { __JARVIS_ORIGINI__?: Origini }).__JARVIS_ORIGINI__ ?? ORIGINI;
}

export function usoDi(origin: string, o: Origini): UsoOrigine {
  if (origin === o.veloce) return "veloce";
  if (origin === o.riserva) return "riserva";
  return "altra";
}

/** Stessa pagina (percorso, parametri, frammento) su un'altra origine. */
export function indirizzoSu(origine: string, indirizzo: URL): string {
  return `${origine}${indirizzo.pathname}${indirizzo.search}${indirizzo.hash}`;
}

/** All'avvio: si prova la veloce? Solo dalla riserva, e solo una volta per sessione. */
export function decidiAllAvvio(indirizzo: URL, giaPassato: boolean, o: Origini): Decisione {
  const uso = usoDi(indirizzo.origin, o);
  if (uso === "veloce") return { prova: false, motivo: "questa è già l'origine veloce" };
  if (uso === "altra") return { prova: false, motivo: "indirizzo diverso dalle due origini configurate" };
  if (indirizzo.searchParams.get(PARAMETRO) === "riserva")
    return { prova: false, motivo: "tornato qui dall'origine veloce" };
  // Il codice di un login appena fatto vale solo qui: prima si completa il login.
  if (indirizzo.searchParams.has("auth_callback"))
    return { prova: false, motivo: "login appena fatto qui, la veloce si riprova alla prossima apertura" };
  if (giaPassato) return { prova: false, motivo: "passaggio già fatto in questa sessione" };
  return { prova: true };
}

// --- stato letto dalla diagnostica e dal banner --------------------------------

let uso: UsoOrigine = "altra";
let motivo = "";
let riservaDisponibile = false;
const ascoltatori = new Set<() => void>();

function notifica(): void {
  for (const a of ascoltatori) a();
}

export function statoOrigine(): { uso: UsoOrigine; motivo: string; riservaDisponibile: boolean } {
  return { uso, motivo, riservaDisponibile };
}

export function ascoltaOrigine(a: () => void): () => void {
  ascoltatori.add(a);
  return () => ascoltatori.delete(a);
}

function leggiPassaggio(): boolean {
  try {
    return sessionStorage.getItem(CHIAVE_PASSAGGIO) !== null;
  } catch (errore) {
    log.avviso(`sessionStorage illeggibile: ${descriviErrore(errore)}`);
    return false;
  }
}

function segnaPassaggio(): void {
  try {
    sessionStorage.setItem(CHIAVE_PASSAGGIO, String(Date.now()));
  } catch (errore) {
    // Nessun rischio di giro infinito: la veloce non rimanda mai alla riserva da sola.
    log.avviso(`sessionStorage non scrivibile: ${descriviErrore(errore)}`);
  }
}

/** null = risponde; altrimenti il motivo, in italiano, per la diagnostica. */
async function risponde(url: string, modo: RequestMode, attesaMs: number): Promise<string | null> {
  const controllo = new AbortController();
  const timer = setTimeout(() => controllo.abort(), attesaMs);
  try {
    const r = await fetch(url, {
      cache: "no-store",
      mode: modo,
      credentials: "omit",
      signal: controllo.signal,
    });
    // no-cors: la risposta è opaca, ma se è arrivata il server c'è
    if (modo === "no-cors" || r.ok) return null;
    return `ha risposto ${r.status}`;
  } catch (errore) {
    if (controllo.signal.aborted)
      return `non ha risposto entro ${(attesaMs / 1000).toLocaleString("it-IT")} s`;
    return `non raggiungibile (${descriviErrore(errore)})`;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Da chiamare per prima cosa all'avvio del pannello. Non
 * blocca: la prova parte in parallelo e la pagina intanto si avvia normalmente.
 */
export function passaAllOrigineVeloce(): void {
  const o = origini();
  const qui = new URL(location.href);
  uso = usoDi(qui.origin, o);
  if (qui.searchParams.get(PARAMETRO) === "riserva") {
    segnaPassaggio();
    qui.searchParams.delete(PARAMETRO);
    history.replaceState(history.state, "", `${qui.pathname}${qui.search}${qui.hash}`);
    log.info("Tornato all'origine di riserva dall'origine veloce");
    motivo = "tornato qui dall'origine veloce";
    return;
  }
  if (uso === "veloce") {
    // Solo per la diagnostica: dopo il login o una ricarica il referrer non c'è più.
    try {
      if (document.referrer.startsWith(o.riserva)) sessionStorage.setItem(CHIAVE_ARRIVO, "1");
      if (sessionStorage.getItem(CHIAVE_ARRIVO)) motivo = "passato dal link di riserva";
    } catch (errore) {
      log.avviso(`sessionStorage non disponibile: ${descriviErrore(errore)}`);
    }
    return;
  }
  const decisione = decidiAllAvvio(qui, leggiPassaggio(), o);
  if (!decisione.prova) {
    motivo = decisione.motivo;
    return;
  }
  motivo = "provo l'origine veloce…";
  void (async () => {
    const esito = await risponde(
      new URL(FILE_DI_PROVA, indirizzoSu(o.veloce, qui)).href,
      "cors",
      ATTESA_VELOCE_MS,
    );
    if (esito === null) {
      segnaPassaggio();
      log.info(`Origine veloce raggiungibile: passo a ${o.veloce}`);
      await attivaVersioneInAttesa();
      location.replace(indirizzoSu(o.veloce, new URL(location.href)));
      return;
    }
    motivo = `origine veloce ${esito}`;
    log.avviso(`Resto sull'origine di riserva: ${motivo}`);
    notifica();
  })();
}

/**
 * Prima di lasciare la riserva: se lì c'è una versione nuova in attesa la si
 * attiva, tanto la pagina se ne va. Altrimenti, restando sempre sulla veloce,
 * la riserva teneva per giorni la versione vecchia e il pannello ci ricadeva
 * (30/09).
 */
async function attivaVersioneInAttesa(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg?.waiting) return;
    reg.waiting.postMessage({ tipo: "attiva-subito" });
    log.info("Versione nuova in attesa sulla riserva: attivata prima del passaggio");
  } catch (errore) {
    log.avviso(`Versione in attesa sulla riserva non attivata: ${descriviErrore(errore)}`);
  }
}

/**
 * Solo sull'origine veloce: se HA manca da 30 s (non per un login da fare) e
 * l'origine di riserva risponde, il banner propone di tornarci.
 */
export function sorvegliaRitorno(leggi: () => { stato: string; disconnessoDa: number | null }): void {
  if (uso !== "veloce") return;
  let ultimo = 0;
  let inCorso = false;
  setInterval(() => {
    const info = leggi();
    const giu =
      info.stato !== "connesso" &&
      info.stato !== "login-richiesto" &&
      info.disconnessoDa !== null &&
      Date.now() - info.disconnessoDa >= RITORNO_DOPO_MS;
    if (!giu) {
      ultimo = 0;
      if (riservaDisponibile) {
        riservaDisponibile = false;
        notifica();
      }
      return;
    }
    if (inCorso || Date.now() - ultimo < RICONTROLLO_RISERVA_MS) return;
    inCorso = true;
    ultimo = Date.now();
    const o = origini();
    // La riserva non manda intestazioni CORS: basta sapere che risponde.
    void risponde(
      new URL(FILE_DI_PROVA, indirizzoSu(o.riserva, new URL(location.href))).href,
      "no-cors",
      ATTESA_RISERVA_MS,
    )
      .then((esito) => {
        const ora = esito === null;
        if (ora !== riservaDisponibile) {
          riservaDisponibile = ora;
          if (ora)
            log.avviso(
              "Origine veloce senza Home Assistant da 30 s, la riserva risponde: propongo di tornarci",
            );
          notifica();
        }
      })
      .finally(() => {
        inCorso = false;
      });
  }, CONTROLLO_OGNI_MS);
}

/** Tasto del banner: stessa pagina sull'origine di riserva, che non ripasserà alla veloce. */
export function tornaAllaRiserva(): void {
  const qui = new URL(location.href);
  qui.searchParams.set(PARAMETRO, "riserva");
  log.info("Torno all'origine di riserva");
  location.replace(indirizzoSu(origini().riserva, qui));
}
