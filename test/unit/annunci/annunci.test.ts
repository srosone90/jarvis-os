import { describe, expect, it } from "vitest";
import {
  Annunci,
  leggiAnnuncio,
  leggiPreferenzeAnnunci,
  PREFERENZE_ANNUNCI_DI_SERIE,
  PROMEMORIA_DURATA_MS,
  PROMEMORIA_MASSIMI,
  SENSORE_SILENZIO,
} from "../../../src/annunci/annunci";

/** v0.5.4: Jarvis parla per primo (evento jarvis_annuncio). */

function finto() {
  const ascoltatori: (() => void)[] = [];
  const stato = {
    attiva: false,
    occupato: false,
    collegato: true,
    detti: [] as { testo: string; ascolta: boolean; volume: number; dove: string }[],
    turni: new Map<number, string>(),
    entita: {} as Record<string, string>,
    t: 1_000_000,
  };
  let id = 0;
  const voce = {
    get attiva() {
      return stato.attiva;
    },
    ascolta: (f: () => void) => (ascoltatori.push(f), () => undefined),
    annuncia: (turno: number, dove: string, o: { ascolta: boolean; volume: number }) => {
      if (stato.attiva) return false;
      stato.attiva = true;
      stato.detti.push({ testo: stato.turni.get(turno) ?? "?", dove, ...o });
      return true;
    },
  };
  const assistente = {
    get occupato() {
      return stato.occupato;
    },
    ascolta: (f: () => void) => (ascoltatori.push(f), () => undefined),
    annuncia: (testo: string) => {
      if (!stato.collegato) return null;
      stato.turni.set(++id, testo);
      return id;
    },
  };
  const memoria = new Map<string, string>();
  const a = new Annunci({
    mio: () => "jarvis_cucina",
    voce: voce as never,
    assistente: assistente as never,
    statoDi: (e) => stato.entita[e],
    adesso: () => stato.t,
    archivio: { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => void memoria.set(k, v) },
  });
  /** La voce ha finito di parlare. */
  const finisce = () => {
    stato.attiva = false;
    for (const f of ascoltatori) f();
  };
  return { a, stato, finisce, memoria };
}

const ev = (testo: string, ascolta = false, pannello = "jarvis_cucina") => ({ pannello, testo, ascolta });

describe("annunci", () => {
  it("solo quelli di questo pannello; detti nell'Hub col loro ascolta", () => {
    const f = finto();
    f.a.ricevi(ev("Fa caldo in camera", true, "jarvis_soggiorno"));
    expect(f.stato.detti).toHaveLength(0);
    f.a.ricevi(ev("Fa caldo in camera", true));
    expect(f.stato.detti).toEqual([{ testo: "Fa caldo in camera", ascolta: true, volume: 1, dove: "hub" }]);
  });

  it("più annunci insieme: in coda, uno dopo l'altro", () => {
    const f = finto();
    f.a.ricevi(ev("Primo"));
    f.a.ricevi(ev("Secondo"));
    f.a.ricevi(ev("Terzo"));
    expect(f.stato.detti.map((d) => d.testo)).toEqual(["Primo"]);
    expect(f.a.inCoda).toBe(2);
    f.finisce();
    f.finisce();
    expect(f.stato.detti.map((d) => d.testo)).toEqual(["Primo", "Secondo", "Terzo"]);
  });

  it("mai sopra una domanda in corso: aspetta che finisca", () => {
    const f = finto();
    f.stato.attiva = true;
    f.a.ricevi(ev("Buongiorno"));
    expect(f.stato.detti).toHaveLength(0);
    f.finisce();
    expect(f.stato.detti).toHaveLength(1);
  });

  it("ora del silenzio di HA, notte o solo testo: niente voce, resta scritto", () => {
    const f = finto();
    f.stato.entita[SENSORE_SILENZIO] = "on";
    f.a.ricevi(ev("Fa caldo"));
    expect(f.stato.detti).toHaveLength(0);
    expect(f.a.promemoria.map((p) => [p.testo, p.motivo])).toEqual([["Fa caldo", "ora del silenzio"]]);
    f.stato.entita[SENSORE_SILENZIO] = "off";
    f.a.notte = () => true;
    f.a.ricevi(ev("Di notte"));
    expect(f.a.promemoria[0]?.motivo).toBe("notte");
    f.a.notte = () => false;
    f.a.cambiaPreferenze({ soloTesto: true });
    f.a.ricevi(ev("Solo scritto"));
    expect(f.a.promemoria[0]?.motivo).toBe("solo testo");
    expect(f.stato.detti).toHaveLength(0);
  });

  it("Home Assistant non collegato: scritto, non perso", () => {
    const f = finto();
    f.stato.collegato = false;
    f.a.ricevi(ev("Ciao"));
    expect(f.a.promemoria[0]?.motivo).toBe("Home Assistant non collegato");
  });

  it("gli scritti: un tocco li toglie, al massimo 5, e dopo 12 ore spariscono", () => {
    const f = finto();
    f.a.cambiaPreferenze({ soloTesto: true });
    for (let k = 0; k < 7; k++) f.a.ricevi(ev(`n${k}`));
    expect(f.a.promemoria.map((p) => p.testo)).toEqual(["n6", "n5", "n4", "n3", "n2"]);
    expect(PROMEMORIA_MASSIMI).toBe(5);
    const primo = f.a.promemoria[0];
    if (primo) f.a.togli(primo.id);
    expect(f.a.promemoria).toHaveLength(4);
    f.stato.t += PROMEMORIA_DURATA_MS + 1;
    expect(f.a.promemoria).toHaveLength(0);
  });

  it("v0.5.10: quanti scritti e per quante ore si cambiano (nei limiti); abbassati, i più vecchi spariscono", () => {
    const f = finto();
    f.a.cambiaPreferenze({ soloTesto: true, promemoria: 2, promemoriaOre: 1 });
    for (let k = 0; k < 4; k++) f.a.ricevi(ev(`n${k}`));
    expect(f.a.promemoria.map((p) => p.testo)).toEqual(["n3", "n2"]);
    // controprova: tolto il primo non ricompare uno vecchio già scartato
    const primo = f.a.promemoria[0];
    if (primo) f.a.togli(primo.id);
    expect(f.a.promemoria.map((p) => p.testo)).toEqual(["n2"]);
    f.stato.t += 3_600_001;
    expect(f.a.promemoria).toHaveLength(0);
    f.a.cambiaPreferenze({ promemoria: 999, promemoriaOre: 0 });
    expect(f.a.preferenze).toMatchObject({ promemoria: 20, promemoriaOre: 1 });
    f.a.cambiaPreferenze({ promemoria: null, promemoriaOre: null });
    expect(f.a.preferenze).toMatchObject({ promemoria: 5, promemoriaOre: 12 });
  });

  it("volume e solo testo: preferenze del pannello, salvate, col ripristino", () => {
    const f = finto();
    f.a.cambiaPreferenze({ volume: 40 });
    f.a.ricevi(ev("Piano"));
    expect(f.stato.detti[0]?.volume).toBe(0.4);
    expect(JSON.parse(f.memoria.get("jarvis-annunci") ?? "{}")).toMatchObject({
      soloTesto: false,
      volume: 40,
    });
    f.a.cambiaPreferenze({ volume: null });
    expect(f.a.preferenze).toEqual(PREFERENZE_ANNUNCI_DI_SERIE);
  });

  it("eventi malformati si ignorano; preferenze illeggibili tornano di serie", () => {
    expect(leggiAnnuncio({ pannello: "x" })).toBeNull();
    expect(leggiAnnuncio({ testo: "x" })).toBeNull();
    expect(leggiAnnuncio({ pannello: "p", testo: "  ciao ", ascolta: "sì" })).toEqual({
      pannello: "p",
      testo: "ciao",
      ascolta: false,
    });
    expect(leggiPreferenzeAnnunci("rotto")).toEqual(PREFERENZE_ANNUNCI_DI_SERIE);
    expect(leggiPreferenzeAnnunci('{"volume":250}').volume).toBe(100);
  });
});
