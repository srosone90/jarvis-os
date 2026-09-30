import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nuovoTurno, type Turno } from "../../src/assistente/eventi";
import { PausaMusica, riguardaIlPannello, type FonteVoce } from "../../src/voce/pausa-musica";
import type { FaseVoce } from "../../src/voce/voce";

/** Voce finta: si fanno passare le fasi a mano, come fa il motore vero. */
class VoceFinta implements FonteVoce {
  fase: FaseVoce = "spenta";
  turno: Turno | undefined = undefined;
  private readonly ascoltatori = new Set<() => void>();
  ascolta(f: () => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }
  vai(fase: FaseVoce): void {
    this.fase = fase;
    for (const f of this.ascoltatori) f();
  }
  /** Una domanda intera: apertura → ascolto → pensa → risponde → spenta. */
  domanda(strumenti: string[] = []): void {
    this.turno = { ...nuovoTurno(1, "?", true), strumenti };
    for (const f of ["apertura", "ascolto", "pensa", "risponde", "spenta"] as FaseVoce[]) this.vai(f);
  }
}

function musica(stato: { stato: string; stanza?: string; volume?: number }) {
  const chiamate: string[] = [];
  let attuale = { ...stato };
  const chiama = vi.fn(async (servizio: "stato" | "controllo", dati: Record<string, unknown>) => {
    chiamate.push(
      servizio === "stato"
        ? "stato"
        : `${String(dati["azione"])}${dati["livello"] !== undefined ? ` ${String(dati["livello"])}` : ""}`,
    );
    if (servizio === "stato") return { esito: "ok", ...attuale };
    if (dati["azione"] === "pausa") attuale = { ...attuale, stato: "in_pausa" };
    // l'Echo cambia il volume da solo (30 → 40, visto il 30/09)
    if (dati["azione"] === "riprendi") attuale = { ...attuale, stato: "in_riproduzione", volume: 40 };
    if (dati["azione"] === "volume") attuale = { ...attuale, volume: Number(dati["livello"]) };
    return { esito: "ok", ...attuale };
  });
  return { chiama, chiamate };
}

const fineAttesa = async () => {
  await vi.advanceTimersByTimeAsync(2000);
};

describe("pausa della musica durante la voce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("musica nella stanza del pannello: pausa subito, poi ripresa allo stesso volume", async () => {
    const voce = new VoceFinta();
    const m = musica({ stato: "in_riproduzione", stanza: "Cucina", volume: 30 });
    new PausaMusica(voce, m.chiama, () => "cucina");
    voce.vai("apertura");
    await vi.advanceTimersByTimeAsync(0);
    // la pausa parte subito, mentre si apre il microfono
    expect(m.chiamate).toEqual(["stato", "pausa"]);
    for (const f of ["ascolto", "pensa", "risponde", "spenta"] as FaseVoce[]) voce.vai(f);
    await fineAttesa();
    expect(m.chiamate).toEqual(["stato", "pausa", "riprendi", "volume 30"]);
  });

  it("senza stanza del pannello non si tocca niente", async () => {
    const voce = new VoceFinta();
    const m = musica({ stato: "in_riproduzione", stanza: "Cucina", volume: 30 });
    new PausaMusica(voce, m.chiama, () => null);
    voce.domanda();
    await fineAttesa();
    expect(m.chiamate).toEqual([]);
  });

  it("musica già in pausa, o in un'altra stanza: resta com'è; «Tutta la casa» si ferma", async () => {
    for (const [stato, stanza, atteso] of [
      ["in_pausa", "Cucina", ["stato"]],
      ["in_riproduzione", "Camera da letto", ["stato"]],
      ["in_riproduzione", "Tutta la casa", ["stato", "pausa", "riprendi", "volume 30"]],
    ] as const) {
      const voce = new VoceFinta();
      const m = musica({ stato, stanza, volume: 30 });
      new PausaMusica(voce, m.chiama, () => "Cucina");
      voce.domanda();
      await fineAttesa();
      expect(m.chiamate, `${stato} in ${stanza}`).toEqual(atteso);
    }
  });

  it("comando sulla musica («metti in pausa la musica»): niente ripresa", async () => {
    const voce = new VoceFinta();
    const m = musica({ stato: "in_riproduzione", stanza: "Cucina", volume: 30 });
    new PausaMusica(voce, m.chiama, () => "Cucina");
    voce.domanda(["script__jarvis_musica_controllo"]);
    await fineAttesa();
    expect(m.chiamate).toEqual(["stato", "pausa"]);
  });

  it("più domande di fila (seguito come un Echo): si riprende solo dopo l'ultima", async () => {
    const voce = new VoceFinta();
    const m = musica({ stato: "in_riproduzione", stanza: "Cucina", volume: 30 });
    new PausaMusica(voce, m.chiama, () => "Cucina");
    voce.domanda();
    await vi.advanceTimersByTimeAsync(300); // il seguito riapre il microfono subito
    voce.domanda();
    await vi.advanceTimersByTimeAsync(300);
    voce.domanda();
    await fineAttesa();
    expect(m.chiamate).toEqual(["stato", "pausa", "riprendi", "volume 30"]);
  });

  it("errore di Gemini o del microfono: la musica riparte comunque", async () => {
    const voce = new VoceFinta();
    const m = musica({ stato: "in_riproduzione", stanza: "Cucina", volume: 30 });
    new PausaMusica(voce, m.chiama, () => "Cucina");
    for (const f of ["apertura", "ascolto", "pensa", "errore"] as FaseVoce[]) voce.vai(f);
    await fineAttesa();
    expect(m.chiamate).toEqual(["stato", "pausa", "riprendi", "volume 30"]);
  });

  it("la voce finisce prima che Spotify risponda: non si ferma niente dopo", async () => {
    const voce = new VoceFinta();
    let rispondi: (v: Record<string, unknown>) => void = () => undefined;
    const chiamate: string[] = [];
    const chiama = vi.fn(async (servizio: "stato" | "controllo", dati: Record<string, unknown>) => {
      chiamate.push(servizio === "stato" ? "stato" : String(dati["azione"]));
      if (servizio === "stato") return new Promise<Record<string, unknown>>((ok) => (rispondi = ok));
      return { esito: "ok" };
    });
    new PausaMusica(voce, chiama, () => "Cucina");
    voce.domanda();
    await fineAttesa();
    rispondi({ esito: "ok", stato: "in_riproduzione", stanza: "Cucina", volume: 30 });
    await vi.advanceTimersByTimeAsync(10);
    expect(chiamate).toEqual(["stato"]);
  });

  it("musica che non risponde (componente assente, errore): la voce va avanti", async () => {
    const voce = new VoceFinta();
    const chiama = vi.fn(async () => {
      throw new Error("Service jarvis_musica.stato not found");
    });
    new PausaMusica(voce, chiama, () => "Cucina");
    voce.domanda();
    voce.domanda();
    await fineAttesa();
    expect(voce.fase).toBe("spenta");
    expect(chiama).toHaveBeenCalledTimes(1);
  });

  it("confronto delle stanze: maiuscole e accenti non contano", () => {
    expect(riguardaIlPannello("Camera da letto", "camera da  letto")).toBe(true);
    expect(riguardaIlPannello("Città", "citta")).toBe(true);
    expect(riguardaIlPannello("TUTTA LA CASA", "Cucina")).toBe(true);
    expect(riguardaIlPannello("Soggiorno", "Cucina")).toBe(false);
  });
});
