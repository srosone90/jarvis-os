import { describe, expect, it } from "vitest";
import {
  direzione,
  leggiPreferenzeMeteo,
  pioggiaDi,
  PREFERENZE_METEO_DI_SERIE,
  prossimeOre,
  vento,
} from "../../src/meteo/dettagli";
import {
  cambiaDove,
  hashDi,
  leggiPreferenzeNavigazione,
  Navigatore,
  paginaDaHash,
  PREFERENZE_NAVIGAZIONE_DI_SERIE,
  spostaVoce,
} from "../../src/navigazione/navigazione";
import { leggiPreferenzeStorico, linea, puntiDa } from "../../src/casa/storico";

/** v0.5.5: navigazione N2, schermate Meteo e Stanza. */

describe("indirizzo delle schermate", () => {
  it("#meteo, #stanza/<area>, casa senza niente; il resto non cambia schermata", () => {
    expect(paginaDaHash("#meteo")).toEqual({ tipo: "meteo" });
    expect(paginaDaHash("#musica")).toEqual({ tipo: "musica" });
    expect(paginaDaHash("")).toEqual({ tipo: "casa" });
    expect(paginaDaHash("#stanza/camera_da_letto")).toEqual({ tipo: "stanza", area: "camera_da_letto" });
    expect(paginaDaHash("#qualcosa")).toBeNull();
    expect(hashDi({ tipo: "stanza", area: "camera da letto" })).toBe("#stanza/camera%20da%20letto");
    expect(paginaDaHash(hashDi({ tipo: "stanza", area: "camera da letto" }))).toEqual({
      tipo: "stanza",
      area: "camera da letto",
    });
  });
});

describe("preferenze della colonna", () => {
  it("di serie: iniziale Casa, ritorno dopo 90 s", () => {
    expect(leggiPreferenzeNavigazione(null)).toEqual(PREFERENZE_NAVIGAZIONE_DI_SERIE);
    expect(PREFERENZE_NAVIGAZIONE_DI_SERIE.ritornoSecondi).toBe(90);
  });
  it("ordine salvato rispettato; Casa sempre nella colonna; voci sconosciute ignorate, nuove al loro posto", () => {
    const p = leggiPreferenzeNavigazione(
      JSON.stringify({
        voci: [{ id: "meteo", visibile: false }, { id: "musica-vecchia" }, { id: "casa", visibile: false }],
      }),
    );
    // fino alla v0.5.6 "nascosta" voleva dire fuori dalla colonna: ora è "solo in Altro"
    expect(p.voci.slice(0, 3)).toEqual([
      { id: "meteo", dove: "altro" },
      { id: "casa", dove: "colonna" },
      { id: "musica", dove: "colonna" },
    ]);
    expect(p.voci.map((v) => v.id)).toEqual([
      "meteo",
      "casa",
      "musica",
      "timer",
      "clima",
      "scene",
      "spesa",
      "avvisi",
      "altro",
    ]);
    // chi ha salvato l'ordine con la v0.5.5 (senza Musica) la ritrova dopo le sue, nella colonna
    const vecchie = leggiPreferenzeNavigazione(
      JSON.stringify({
        voci: [
          { id: "casa", visibile: true },
          { id: "meteo", visibile: true },
        ],
      }),
    );
    expect(vecchie.voci.slice(0, 3)).toEqual([
      { id: "casa", dove: "colonna" },
      { id: "meteo", dove: "colonna" },
      { id: "musica", dove: "colonna" },
    ]);
  });
  it("sposta su e giù senza uscire dall'elenco", () => {
    const v = PREFERENZE_NAVIGAZIONE_DI_SERIE.voci;
    expect(v.map((x) => x.id)).toEqual([
      "casa",
      "musica",
      "meteo",
      "timer",
      "clima",
      "scene",
      "spesa",
      "avvisi",
      "altro",
    ]);
    expect(
      spostaVoce(v, "meteo", -1)
        .map((x) => x.id)
        .slice(0, 3),
    ).toEqual(["casa", "meteo", "musica"]);
    expect(spostaVoce(v, "casa", -1).map((x) => x.id)[0]).toBe("casa");
    expect(
      spostaVoce(v, "altro", 1)
        .map((x) => x.id)
        .at(-1),
    ).toBe("altro");
  });
});

function navigatore(t = { ora: 0 }, archivio = new Map<string, string>()) {
  const voci: string[] = [];
  return {
    n: new Navigatore({
      adesso: () => t.ora,
      archivio: { getItem: (k) => archivio.get(k) ?? null, setItem: (k, v) => void archivio.set(k, v) },
      cronologia: {
        pushState: (_s, _t, u) => void voci.push(`push ${String(u)}`),
        replaceState: (_s, _t, u) => void voci.push(`replace ${String(u)}`),
        back: () => undefined,
      },
      posizione: () => "",
    }),
    voci,
    t,
    archivio,
  };
}

describe("navigatore", () => {
  it("le principali si sostituiscono nella cronologia, la Stanza aggiunge un livello", () => {
    const { n, voci } = navigatore();
    n.vai({ tipo: "meteo" });
    n.vai({ tipo: "stanza", area: "veranda" });
    n.vai({ tipo: "meteo" });
    expect(voci).toEqual(["replace #meteo", "push #stanza/veranda", "replace #meteo"]);
    expect(n.principale).toBe("meteo");
  });
  it("Indietro (indirizzo cambiato da fuori) torna alla pagina giusta", () => {
    const { n } = navigatore();
    n.vai({ tipo: "stanza", area: "veranda" });
    expect(n.principale).toBe("casa");
    n.suIndirizzo("");
    expect(n.pagina).toEqual({ tipo: "casa" });
  });
  it("senza tocchi per 90 s si torna alla schermata iniziale; un tocco rimanda il ritorno; 0 = mai", () => {
    const { n, t } = navigatore();
    n.vai({ tipo: "meteo" });
    t.ora = 89_000;
    n.controlla();
    expect(n.pagina.tipo).toBe("meteo");
    n.attivita();
    t.ora = 170_000;
    n.controlla();
    expect(n.pagina.tipo).toBe("meteo");
    t.ora = 180_000;
    n.controlla();
    expect(n.pagina.tipo).toBe("casa");
    n.cambiaPreferenze({ ritornoSecondi: 0 });
    n.vai({ tipo: "meteo" });
    t.ora = 10_000_000;
    n.controlla();
    expect(n.pagina.tipo).toBe("meteo");
  });
  it("schermata iniziale Meteo: si apre lì e ci si torna; Ripristina riporta a Casa", () => {
    const archivio = new Map<string, string>();
    navigatore(undefined, archivio).n.cambiaPreferenze({ iniziale: "meteo" });
    const { n } = navigatore(undefined, archivio);
    expect(n.pagina.tipo).toBe("meteo");
    n.cambiaPreferenze({ iniziale: null });
    expect(n.preferenze.iniziale).toBe("casa");
  });
  it("una voce tolta dalla colonna sparisce dalla colonna e resta in Altro", () => {
    const { n } = navigatore();
    n.cambiaPreferenze({
      voci: cambiaDove(cambiaDove(n.preferenze.voci, "musica", "altro"), "meteo", "altro"),
    });
    expect(n.colonna.map((c) => c.id)).toEqual(["casa", "timer", "altro"]);
    expect(n.altro.map((c) => c.id)).toContain("meteo");
  });
});

describe("meteo", () => {
  const adesso = new Date("2026-10-01T13:40:00");
  const ora = (h: number) => new Date(`2026-10-01T${String(h).padStart(2, "0")}:00:00`).toISOString();
  it("prossime ore: da quella in corso, le passate scartate, solo quante chieste", () => {
    const p = [11, 12, 13, 14, 15, 16].map((h) => ({
      datetime: ora(h),
      condition: "sunny",
      temperature: 20 + h / 10,
    }));
    expect(prossimeOre(p, adesso, 3).map((o) => o.ora)).toEqual(["13", "14", "15"]);
  });
  it("pioggia: la probabilità se c'è, altrimenti i millimetri; niente se non piove", () => {
    expect(pioggiaDi({ precipitation_probability: 40, precipitation: 2 })).toBe("40%");
    expect(pioggiaDi({ precipitation: 1.2 })).toBe("1,2 mm");
    expect(pioggiaDi({})).toBeNull();
    expect(pioggiaDi({ precipitation: 0 })).toBeNull();
    expect(pioggiaDi({ precipitation_probability: 0 })).toBeNull();
  });
  it("vento: come lo manda HA, o convertito tra km/h e m/s; direzione da dove soffia", () => {
    expect(vento(14.4, "km/h", "ha")).toBe("14 km/h");
    expect(vento(14.4, "km/h", "ms")).toBe("4 m/s");
    expect(vento(5, "m/s", "kmh")).toBe("18 km/h");
    expect(vento("x", "km/h", "ha")).toBeNull();
    expect(direzione(225)).toBe("SO");
    expect(direzione(359)).toBe("N");
  });
  it("preferenze: di serie, limiti, campi rotti", () => {
    expect(leggiPreferenzeMeteo(null)).toEqual(PREFERENZE_METEO_DI_SERIE);
    expect(leggiPreferenzeMeteo('{"ore":99,"giorni":-1,"unitaVento":"nodi","pressione":true}')).toMatchObject(
      {
        ore: 24,
        giorni: 0,
        unitaVento: "ha",
        pressione: true,
      },
    );
  });
});

describe("storico della stanza", () => {
  it("formato compresso di HA: s e lu (secondi); uno stato non numerico è un buco", () => {
    const r = {
      "sensor.t": [
        { s: "25.1", lu: 100 },
        { s: "unavailable", lu: 200 },
        { s: "24.9", lu: 300 },
      ],
    };
    expect(puntiDa(r, "sensor.t")).toEqual([
      { t: 100_000, v: 25.1 },
      { t: 200_000, v: null },
      { t: 300_000, v: 24.9 },
    ]);
    expect(puntiDa({}, "sensor.t")).toEqual([]);
  });
  it("la linea si spezza dove manca il valore e arriva fino ad adesso", () => {
    const punti = [
      { t: 0, v: 20 },
      { t: 10, v: 21 },
      { t: 20, v: null },
      { t: 30, v: 22 },
      { t: 40, v: 23 },
    ];
    const l = linea(punti, 0, 50, 100, 10);
    expect(l?.tratti).toHaveLength(2);
    expect(l?.tratti[1]?.endsWith("100.0,0.0")).toBe(true);
    expect(linea([{ t: 0, v: 20 }], 0, 50, 100, 10)).toBeNull();
  });
  it("preferenze: 24 ore di serie, tra 6 e 72", () => {
    expect(leggiPreferenzeStorico(null)).toEqual({ ore: 24, umidita: false });
    expect(leggiPreferenzeStorico('{"ore":200}').ore).toBe(72);
  });
});
