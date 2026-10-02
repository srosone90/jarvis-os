import { describe, expect, it } from "vitest";
import {
  CHIAVI_COPIABILI,
  CHIAVI_MAI,
  cosaCambia,
  descriviScartate,
  DIMENSIONE_MASSIMA,
  esporta,
  importa,
  leggiFile,
  nomeFile,
} from "../../src/impostazioni/copia";

/** v0.5.10: esporta e importa le impostazioni del pannello. */

function archivio(iniziale: Record<string, string> = {}) {
  const m = new Map(Object.entries(iniziale));
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

const PANNELLO = {
  "jarvis-token": '{"access_token":"segreto","refresh_token":"segreto"}',
  "jarvis-log": "[]",
  "jarvis-interruzioni": "[]",
  "jarvis-stanza-pannello": "Cucina",
  "jarvis-guida": "fatta",
  "jarvis-voce": '{"riascoltoSecondi":5,"riascoltoAzioneSecondi":0,"sensibilitaParlato":"bassa"}',
  "jarvis-schermate": '{"sceneConferma":true}',
  "jarvis-audio-sveglio": "0",
};

describe("esporta / importa le impostazioni", () => {
  it("esporta solo le preferenze: mai token, registro, interruzioni, stanza, guida", () => {
    const f = esporta(archivio(PANNELLO), "0.5.10", new Date("2026-10-02T08:00:00Z"));
    expect(f).toEqual({
      formato: "jarvis-impostazioni",
      versione: "0.5.10",
      data: "2026-10-02T08:00:00.000Z",
      impostazioni: {
        "jarvis-voce": PANNELLO["jarvis-voce"],
        "jarvis-schermate": PANNELLO["jarvis-schermate"],
        "jarvis-audio-sveglio": "0",
      },
    });
    const testo = JSON.stringify(f);
    expect(testo).not.toContain("segreto");
    for (const k of CHIAVI_MAI) expect(Object.keys(f.impostazioni)).not.toContain(k);
    // controprova: l'elenco delle copiabili non contiene nessuna delle chiavi vietate
    for (const [k] of CHIAVI_COPIABILI) expect(CHIAVI_MAI as readonly string[]).not.toContain(k);
  });

  it("importa su un altro pannello: scrive le preferenze del file, il resto resta com'è", () => {
    const f = esporta(archivio(PANNELLO), "0.5.10");
    const altro = archivio({ "jarvis-stanza-pannello": "Camera da letto", "jarvis-meteo": '{"ore":12}' });
    const r = leggiFile(JSON.stringify(f));
    if (!r.ok) throw new Error(r.errore);
    expect(cosaCambia(r.file, altro).map((x) => x.chiave)).toEqual([
      "jarvis-schermate",
      "jarvis-voce",
      "jarvis-audio-sveglio",
    ]);
    expect(importa(r.file, altro)).toBe(3);
    expect(altro.m.get("jarvis-voce")).toBe(PANNELLO["jarvis-voce"]);
    // la stanza dell'altro pannello e le sue preferenze non nel file restano
    expect(altro.m.get("jarvis-stanza-pannello")).toBe("Camera da letto");
    expect(altro.m.get("jarvis-meteo")).toBe('{"ore":12}');
    // già uguali: niente da cambiare
    expect(cosaCambia(r.file, altro)).toEqual([]);
  });

  it("controprove: un file con dentro il token, la stanza o chiavi sconosciute le scarta", () => {
    const cattivo = JSON.stringify({
      formato: "jarvis-impostazioni",
      versione: "9.9.9",
      impostazioni: {
        "jarvis-token": '{"access_token":"rubato"}',
        "jarvis-stanza-pannello": "Garage",
        "altro-sito": "x",
        "jarvis-voce": { non: "una stringa" },
        "jarvis-riposo": '{"attesaMin":3}',
      },
    });
    const r = leggiFile(cattivo);
    if (!r.ok) throw new Error(r.errore);
    expect(Object.keys(r.file.impostazioni)).toEqual(["jarvis-riposo"]);
    expect(r.scartate).toEqual(["jarvis-token", "jarvis-stanza-pannello", "altro-sito", "jarvis-voce"]);
    const a = archivio({ "jarvis-token": "mio" });
    importa(r.file, a);
    expect(a.m.get("jarvis-token")).toBe("mio");
    expect(a.m.has("jarvis-stanza-pannello")).toBe(false);
    // anche passando un file costruito a mano a importa(): le chiavi vietate non si scrivono
    expect(importa({ ...r.file, impostazioni: { "jarvis-token": "x", "jarvis-log": "y" } }, a)).toBe(0);
    expect(a.m.get("jarvis-token")).toBe("mio");
  });

  it("file sbagliati: errori in parole", () => {
    expect(leggiFile("non json")).toMatchObject({
      ok: false,
      errore: expect.stringContaining("non si legge"),
    });
    expect(leggiFile('{"formato":"altro"}')).toMatchObject({
      ok: false,
      errore: expect.stringContaining("Non è"),
    });
    expect(leggiFile('{"formato":"jarvis-impostazioni"}')).toMatchObject({ ok: false });
    expect(leggiFile('{"formato":"jarvis-impostazioni","impostazioni":{}}')).toMatchObject({
      ok: false,
      errore: expect.stringContaining("vuoto"),
    });
    expect(leggiFile("x".repeat(DIMENSIONE_MASSIMA + 1))).toMatchObject({
      ok: false,
      errore: expect.stringContaining("troppo grande"),
    });
  });

  it("le scartate si dicono a parole", () => {
    expect(descriviScartate(["jarvis-token", "x", "y"])).toBe(
      "il collegamento a Home Assistant, 2 voci che non sono impostazioni da copiare",
    );
    expect(descriviScartate(["jarvis-stanza-pannello", "jarvis-log"])).toBe(
      "la stanza del pannello, il registro",
    );
  });

  it("nome del file con la stanza e il giorno", () => {
    const d = new Date("2026-10-02T08:00:00Z");
    expect(nomeFile("Camera da letto", d)).toBe("jarvis-impostazioni-camera-da-letto-2026-10-02.json");
    expect(nomeFile(null, d)).toBe("jarvis-impostazioni-pannello-2026-10-02.json");
    expect(nomeFile("Più bella", d)).toBe("jarvis-impostazioni-piu-bella-2026-10-02.json");
  });
});
