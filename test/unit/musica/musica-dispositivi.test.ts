import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CERCA_PER_MS,
  CollegaDispositivo,
  dispositiviDa,
  doveAprireSpotify,
  erroreDaRisposta,
  INIZIA_COMUNQUE_MS,
  PLAY_STORE_SPOTIFY,
  riconosci,
  RILEGGI_OGNI_MS,
  type DispositivoSpotify,
} from "../../../src/musica/dispositivi";

/** v0.5.9: la musica dal dispositivo del pannello, e «Collega questo dispositivo». */

const d = (nome: string, tipo = "Speaker", attivo = false, comandabile = true): DispositivoSpotify => ({
  nome,
  tipo,
  attivo,
  volume: 40,
  comandabile,
});
const ECHO = [
  d("Echo Pop cucina"),
  d("echo Pop camera da letto"),
  d("Tutta la casa", "Speaker"),
  d("Ovunque"),
];
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Redmi Note 13) AppleWebKit/537.36 Chrome/129 Mobile";

describe("dispositivi di Spotify", () => {
  it("risposta di jarvis_musica.dispositivi: elenco, scelta e se Spotify la vede", () => {
    const r = dispositiviDa({
      esito: "ok",
      dispositivi: [
        { nome: "Redmi Note 13", tipo: "Smartphone", attivo: true, volume: 70, comandabile: true },
        { nome: "", tipo: "Speaker" },
        "rotto",
      ],
      scelto: "redmi note 13",
    });
    expect(r.elenco).toEqual([d("Redmi Note 13", "Smartphone", true)].map((x) => ({ ...x, volume: 70 })));
    expect(r.scelto).toBe("redmi note 13");
    expect(r.sceltoVisibile).toBe(true);
    // controprova: scelto ma non visibile (Android ha chiuso Spotify) → «Ricollega»
    expect(dispositiviDa({ dispositivi: [], scelto: "Redmi Note 13" }).sceltoVisibile).toBe(false);
    expect(dispositiviDa({ dispositivi: [] }).scelto).toBeNull();
  });

  it("errori di jarvis_musica (con la risposta non sono eccezioni): in chiaro, col nome", () => {
    expect(
      erroreDaRisposta({
        esito: "errore",
        codice: "dispositivo_assente",
        messaggio: "Su Spotify non vedo «Redmi Note 13»: apri l'app Spotify su quel dispositivo e riprova.",
      }),
    ).toBe("Su Spotify non vedo «Redmi Note 13»: apri l'app Spotify su quel dispositivo e riprova.");
    expect(erroreDaRisposta({ esito: "errore", codice: "x" })).toContain("x");
    expect(erroreDaRisposta({ esito: "ok" })).toBeNull();
    expect(erroreDaRisposta({})).toBeNull();
  });

  it("riconosce: il nuovo; se nessuno è nuovo, il telefono/tablet/computer diventato attivo", () => {
    const redmi = d("Redmi Note 13", "Smartphone");
    expect(riconosci(ECHO, [...ECHO, redmi])).toEqual([redmi]);
    // Spotify era già aperto (il Redmi c'era, fermo): ora è attivo
    expect(riconosci([...ECHO, redmi], [...ECHO, { ...redmi, attivo: true }])).toEqual([
      { ...redmi, attivo: true },
    ]);
    // controprove: un Echo diventato attivo non è il pannello; niente di nuovo = niente
    expect(riconosci(ECHO, [{ ...d("Echo Pop cucina"), attivo: true }, ...ECHO.slice(1)])).toEqual([]);
    expect(riconosci(ECHO, ECHO)).toEqual([]);
    // un dispositivo nuovo ma non comandabile non serve
    expect(riconosci(ECHO, [...ECHO, d("Telefono ristretto", "Smartphone", false, false)])).toEqual([]);
    // due nuovi insieme: si fanno scegliere
    expect(riconosci(ECHO, [...ECHO, redmi, d("Tablet cucina", "Tablet")])).toHaveLength(2);
  });

  it("Ricollega: il dispositivo salvato riconosciuto di nuovo per nome", () => {
    const redmi = d("Redmi Note 13", "Smartphone");
    const altro = d("PC di Salvatore", "Computer");
    expect(riconosci(ECHO, [...ECHO, altro, redmi], "redmi note 13")).toEqual([redmi]);
    // controprova: il salvato non c'è ancora → i nuovi come sempre
    expect(riconosci(ECHO, [...ECHO, altro], "Redmi Note 13")).toEqual([altro]);
  });

  it("dove aprire: Android l'app (col Play Store di ripiego), altrove il sito in una nuova scheda", () => {
    const a = doveAprireSpotify(ANDROID);
    expect(a.nuovaScheda).toBe(false);
    expect(a.url).toBe(
      "intent://open#Intent;scheme=spotify;package=com.spotify.music;" +
        `S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_SPOTIFY)};end`,
    );
    expect(doveAprireSpotify("Mozilla/5.0 (X11; Linux x86_64) Chrome/129")).toEqual({
      url: "https://open.spotify.com",
      nuovaScheda: true,
    });
  });
});

describe("«Collega questo dispositivo»", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function prepara(opzioni: { pannello?: string | null; ua?: string } = {}) {
    let elenco: DispositivoSpotify[] = [...ECHO];
    let visibile = true;
    const visibilita = new Set<() => void>();
    const chiamate: [string, Record<string, unknown>][] = [];
    let errore: Error | null = null;
    const chiama = vi.fn((servizio: string, dati: Record<string, unknown>) => {
      chiamate.push([servizio, dati]);
      if (errore) return Promise.reject(errore);
      return Promise.resolve(
        servizio === "dispositivi" ? { esito: "ok", dispositivi: elenco } : { esito: "ok" },
      );
    });
    const apri = vi.fn();
    const collegato = vi.fn();
    const c = new CollegaDispositivo({
      chiama,
      pannello: () => (opzioni.pannello === undefined ? "jarvis_redmi" : opzioni.pannello),
      apri,
      userAgent: () => opzioni.ua ?? ANDROID,
      visibile: () => visibile,
      ascoltaVisibilita: (f) => {
        visibilita.add(f);
        return () => visibilita.delete(f);
      },
      collegato,
    });
    return {
      c,
      apri,
      collegato,
      chiamate,
      imposta: () => chiamate.filter(([s]) => s === "imposta_pannello").map(([, x]) => x),
      elenco: (e: DispositivoSpotify[]) => (elenco = e),
      errore: (e: Error | null) => (errore = e),
      /** Il pannello va in secondo piano (si apre Spotify) e poi torna. */
      esci: () => {
        visibile = false;
        for (const f of visibilita) f();
      },
      torna: () => {
        visibile = true;
        for (const f of visibilita) f();
      },
      visibilita,
    };
  }

  it("compare dopo 7 s: legge l'elenco PRIMA di aprire, cerca al ritorno ogni 2 s, salva e dice «Collegato»", async () => {
    const p = prepara();
    await p.c.avvia();
    expect(p.chiamate[0]?.[0]).toBe("dispositivi");
    expect(p.apri).toHaveBeenCalledWith(
      expect.stringMatching(/^intent:\/\/open#Intent;scheme=spotify;/),
      false,
    );
    expect(p.c.stato.fase).toBe("apro");
    p.esci();
    await vi.advanceTimersByTimeAsync(INIZIA_COMUNQUE_MS * 2);
    // fuori dal pannello non si cerca
    expect(p.chiamate).toHaveLength(1);
    p.torna();
    expect(p.c.stato.fase).toBe("cerco");
    await vi.advanceTimersByTimeAsync(RILEGGI_OGNI_MS * 3);
    expect(p.c.stato.fase).toBe("cerco");
    p.elenco([...ECHO, d("Redmi Note 13", "Smartphone")]);
    await vi.advanceTimersByTimeAsync(RILEGGI_OGNI_MS);
    expect(p.c.stato).toEqual({ fase: "collegato", nome: "Redmi Note 13" });
    expect(p.imposta()).toEqual([{ pannello: "jarvis_redmi", dispositivo: "Redmi Note 13" }]);
    expect(p.collegato).toHaveBeenCalledWith("Redmi Note 13");
    // finito: niente più letture né ascolto della visibilità
    const n = p.chiamate.length;
    await vi.advanceTimersByTimeAsync(RILEGGI_OGNI_MS * 5);
    expect(p.chiamate).toHaveLength(n);
    expect(p.visibilita.size).toBe(0);
  });

  it("non compare in 60 s: «non vedo ancora», nessun salvataggio", async () => {
    const p = prepara();
    await p.c.avvia();
    p.esci();
    p.torna();
    await vi.advanceTimersByTimeAsync(CERCA_PER_MS - RILEGGI_OGNI_MS * 2);
    expect(p.c.stato.fase).toBe("cerco");
    await vi.advanceTimersByTimeAsync(RILEGGI_OGNI_MS * 3);
    expect(p.c.stato.fase).toBe("nonVisto");
    expect(p.imposta()).toEqual([]);
    const letture = p.chiamate.filter(([s]) => s === "dispositivi").length;
    // una lettura subito e poi ogni 2 s, per 60 s
    expect(letture).toBeGreaterThanOrEqual(30);
    expect(letture).toBeLessThanOrEqual(32);
  });

  it("due nuovi insieme: li fa scegliere; salva quello toccato", async () => {
    const p = prepara();
    await p.c.avvia();
    p.elenco([...ECHO, d("Redmi Note 13", "Smartphone"), d("Tablet cucina", "Tablet")]);
    p.esci();
    p.torna();
    await vi.advanceTimersByTimeAsync(0);
    const s = p.c.stato;
    expect(s.fase).toBe("scegli");
    expect(s.fase === "scegli" ? s.nuovi.map((x) => x.nome) : []).toEqual(["Redmi Note 13", "Tablet cucina"]);
    expect(p.imposta()).toEqual([]);
    await p.c.scegli("Tablet cucina");
    expect(p.c.stato).toEqual({ fase: "collegato", nome: "Tablet cucina" });
    expect(p.imposta()).toEqual([{ pannello: "jarvis_redmi", dispositivo: "Tablet cucina" }]);
  });

  it("computer: il sito in una nuova scheda; se il pannello non va in secondo piano cerca lo stesso dopo 5 s", async () => {
    const p = prepara({ ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/129" });
    await p.c.avvia();
    expect(p.apri).toHaveBeenCalledWith("https://open.spotify.com", true);
    await vi.advanceTimersByTimeAsync(INIZIA_COMUNQUE_MS);
    expect(p.c.stato.fase).toBe("cerco");
    p.elenco([...ECHO, d("Web Player (Chrome)", "Computer")]);
    await vi.advanceTimersByTimeAsync(RILEGGI_OGNI_MS);
    expect(p.c.stato).toEqual({ fase: "collegato", nome: "Web Player (Chrome)" });
  });

  it("Ricollega: il Redmi salvato sparito (Android ha chiuso Spotify) ricompare → lo riconosce per nome", async () => {
    const p = prepara();
    p.elenco([...ECHO, d("PC di Salvatore", "Computer")]);
    await p.c.avvia("Redmi Note 13");
    p.elenco([...ECHO, d("PC di Salvatore", "Computer", true), d("Redmi Note 13", "Smartphone")]);
    p.esci();
    p.torna();
    await vi.advanceTimersByTimeAsync(0);
    expect(p.c.stato).toEqual({ fase: "collegato", nome: "Redmi Note 13" });
  });

  it("controprove: errore prima di aprire (Spotify non apre); una lettura persa non ferma la ricerca; annulla", async () => {
    const p = prepara();
    p.errore(new Error("Home Assistant non collegato"));
    await p.c.avvia();
    expect(p.c.stato).toEqual({ fase: "errore", messaggio: "Home Assistant non collegato" });
    expect(p.apri).not.toHaveBeenCalled();

    p.errore(null);
    await p.c.avvia();
    p.errore(new Error("socket chiuso"));
    p.esci();
    p.torna();
    await vi.advanceTimersByTimeAsync(RILEGGI_OGNI_MS * 2);
    expect(p.c.stato.fase).toBe("cerco");
    p.errore(null);
    p.elenco([...ECHO, d("Redmi Note 13", "Smartphone")]);
    await vi.advanceTimersByTimeAsync(RILEGGI_OGNI_MS);
    expect(p.c.stato.fase).toBe("collegato");

    await p.c.avvia();
    p.esci();
    p.torna();
    p.c.ferma();
    expect(p.c.stato.fase).toBe("fermo");
    const n = p.chiamate.length;
    p.elenco([...ECHO, d("Altro", "Smartphone")]);
    await vi.advanceTimersByTimeAsync(RILEGGI_OGNI_MS * 5);
    expect(p.chiamate).toHaveLength(n);
  });

  it("jarvis_musica risponde con un errore (esito: errore): lo dice, non lo prende per un elenco vuoto", async () => {
    const p = prepara();
    p.c = new CollegaDispositivo({
      chiama: () =>
        Promise.resolve({ esito: "errore", messaggio: "Spotify non è collegato a Home Assistant." }),
      pannello: () => "jarvis_redmi",
      apri: p.apri,
      userAgent: () => ANDROID,
      visibile: () => true,
      ascoltaVisibilita: () => () => undefined,
    });
    await p.c.avvia();
    expect(p.c.stato).toEqual({ fase: "errore", messaggio: "Spotify non è collegato a Home Assistant." });
  });
});
