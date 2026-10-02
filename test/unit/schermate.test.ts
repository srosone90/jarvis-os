import type { HassEntities } from "home-assistant-js-websocket";
import { describe, expect, it, vi } from "vitest";
import { sensoriConsumo } from "../../src/clima/consumi";
import {
  leggiInterruzioni,
  MASSIMO_INTERRUZIONI,
  RegistroInterruzioni,
} from "../../src/connessione/interruzioni";
import {
  batterieBasse,
  durataTesto,
  eventiDaRegistro,
  quandoTesto,
  testoStato,
} from "../../src/eventi/eventi";
import {
  cambiaDove,
  leggiPreferenzeNavigazione,
  Navigatore,
  PREFERENZE_NAVIGAZIONE_DI_SERIE,
} from "../../src/navigazione/navigazione";
import { CONFERMA_SCENA_MS, ConfermaScena } from "../../src/scene/attiva";
import { nomeScena, sceneDa, servizioScena } from "../../src/scene/scene";
import {
  durateDa,
  ImpostazioniSchermate,
  leggiPreferenzeSchermate,
  PREFERENZE_SCHERMATE_DI_SERIE,
  sceneDa as elencoSceneDa,
} from "../../src/pagine/preferenze";
import { ListaSpesa, ordinaSpesa, vociDa } from "../../src/spesa/spesa";
import { linea, scalaComune } from "../../src/casa/storico";
import { durataParlata, etichettaDurata } from "../../src/timer/frasi";
import { esitoServizioTimer, Timer } from "../../src/timer/timer";

/** v0.5.7: Timer, Clima, Scene, Spesa, Avvisi e Altro. */

const stato = (s: string, a: Record<string, unknown> = {}, last_changed = "2026-10-01T08:00:00Z") => ({
  entity_id: "",
  state: s,
  attributes: a,
  last_changed,
  last_updated: last_changed,
  context: { id: "c", parent_id: null, user_id: null },
});

const archivio = () => {
  const m = new Map<string, string>();
  return {
    m,
    a: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) },
  };
};

describe("navigazione: dove sta ogni schermata", () => {
  it("di serie come il mockup N2: Casa, Musica, Meteo, Timer, Altro; il resto in Altro", () => {
    const n = new Navigatore({ archivio: null });
    expect(n.colonna.map((c) => c.id)).toEqual(["casa", "musica", "meteo", "timer", "altro"]);
    expect(n.altro.map((c) => c.id)).toEqual([
      "casa",
      "musica",
      "meteo",
      "timer",
      "clima",
      "scene",
      "spesa",
      "avvisi",
    ]);
  });
  it("le preferenze della v0.5.6 (visibile) diventano colonna / Altro; le schermate nuove al loro posto di serie", () => {
    const p = leggiPreferenzeNavigazione(
      JSON.stringify({
        voci: [
          { id: "meteo", visibile: true },
          { id: "casa", visibile: false },
          { id: "musica", visibile: false },
        ],
      }),
    );
    expect(p.voci).toEqual([
      { id: "meteo", dove: "colonna" },
      { id: "casa", dove: "colonna" },
      { id: "musica", dove: "altro" },
      { id: "timer", dove: "colonna" },
      { id: "clima", dove: "altro" },
      { id: "scene", dove: "altro" },
      { id: "spesa", dove: "altro" },
      { id: "avvisi", dove: "altro" },
      { id: "altro", dove: "colonna" },
    ]);
  });
  it("Casa e Altro non si spostano né si spengono; una schermata spenta non è iniziale", () => {
    let voci = cambiaDove(PREFERENZE_NAVIGAZIONE_DI_SERIE.voci, "casa", "spenta");
    voci = cambiaDove(voci, "altro", "altro");
    voci = cambiaDove(voci, "meteo", "spenta");
    expect(voci.find((v) => v.id === "casa")?.dove).toBe("colonna");
    expect(voci.find((v) => v.id === "altro")?.dove).toBe("colonna");
    const p = leggiPreferenzeNavigazione(JSON.stringify({ voci, iniziale: "meteo" }));
    expect(p.iniziale).toBe("casa");
    expect(
      leggiPreferenzeNavigazione(JSON.stringify({ voci: [{ id: "spesa", dove: "boh" }] })).voci[0],
    ).toEqual({
      id: "spesa",
      dove: "altro",
    });
  });
  it("spenta: niente colonna, niente Altro, e non si apre (nemmeno dall'indirizzo)", () => {
    const { a } = archivio();
    const n = new Navigatore({ archivio: a, posizione: () => "#spesa" });
    expect(n.pagina).toEqual({ tipo: "spesa" });
    n.cambiaPreferenze({ voci: cambiaDove(n.preferenze.voci, "spesa", "spenta") });
    // era aperta: si torna a Casa
    expect(n.pagina).toEqual({ tipo: "casa" });
    expect(n.altro.some((c) => c.id === "spesa")).toBe(false);
    expect(n.esiste("spesa")).toBe(false);
    n.vai({ tipo: "spesa" });
    expect(n.pagina).toEqual({ tipo: "casa" });
    n.suIndirizzo("#spesa");
    expect(n.pagina).toEqual({ tipo: "casa" });
    const dopo = new Navigatore({ archivio: a, posizione: () => "#spesa" });
    expect(dopo.pagina).toEqual({ tipo: "casa" });
    // nella colonna
    n.cambiaPreferenze({ voci: cambiaDove(n.preferenze.voci, "spesa", "colonna") });
    expect(n.colonna.map((c) => c.id)).toContain("spesa");
  });
});

describe("preferenze delle schermate", () => {
  it("di serie: 6 durate, 24 ore, consumi, le 3 scene del pacchetto, todo.shopping_list, batterie al 20%", () => {
    expect(leggiPreferenzeSchermate(null)).toEqual(PREFERENZE_SCHERMATE_DI_SERIE);
    expect(PREFERENZE_SCHERMATE_DI_SERIE.scene).toEqual([
      "script.jarvis_buonanotte",
      "script.jarvis_esco",
      "script.jarvis_rientro",
    ]);
    expect(leggiPreferenzeSchermate("{rotto")).toEqual(PREFERENZE_SCHERMATE_DI_SERIE);
  });
  it("durate scritte a mano: numeri nei limiti, senza doppioni, in ordine, al massimo 8", () => {
    // la virgola separa (i minuti sono interi): "0" sale a 1, "2000" scende a 720, "x" si scarta
    expect(durateDa("10, 5,5 ; 0 x 2000")).toEqual([1, 5, 10, 720]);
    expect(durateDa("")).toEqual([]);
    expect(durateDa([1, 2, 3, 4, 5, 6, 7, 8, 9])).toHaveLength(8);
  });
  it("scene: solo script.* e scene.*, minuscole, senza doppioni, nell'ordine dato", () => {
    expect(elencoSceneDa("script.esco, Scene.Cena light.cucina script.esco")).toEqual([
      "script.esco",
      "scene.cena",
    ]);
  });
  it("valori fuori misura nei limiti; una lista che non è todo.* resta quella di serie", () => {
    const p = leggiPreferenzeSchermate(
      JSON.stringify({ climaOre: 1000, avvisiOre: 0, avvisiSogliaBatteria: 99, spesaLista: "light.cucina" }),
    );
    expect(p.climaOre).toBe(72);
    expect(p.avvisiOre).toBe(1);
    expect(p.avvisiSogliaBatteria).toBe(50);
    expect(p.spesaLista).toBe("todo.shopping_list");
  });
  it("si salvano, si ripristinano (null) e avvisano chi guarda", () => {
    const { m, a } = archivio();
    const s = new ImpostazioniSchermate(a);
    const f = vi.fn();
    s.ascolta(f);
    s.cambia({ timerDurate: [2, 4], spesaPresi: false });
    expect(f).toHaveBeenCalledTimes(1);
    expect(new ImpostazioniSchermate(a).valori).toMatchObject({ timerDurate: [2, 4], spesaPresi: false });
    s.cambia({ timerDurate: null });
    expect(s.valori.timerDurate).toEqual([1, 3, 5, 10, 15, 30]);
    expect(JSON.parse(m.get("jarvis-schermate") ?? "{}")).toMatchObject({ spesaPresi: false });
  });
});

describe("lista della spesa", () => {
  const items = {
    items: [
      { uid: "1", summary: "latte", status: "needs_action" },
      { uid: "2", summary: "caffè", status: "completed" },
      { uid: "", summary: "senza uid", status: "needs_action" },
      { uid: "3", summary: "pane", status: "needs_action", due: null },
      "spazzatura",
    ],
  };
  it("dall'evento di todo/item/subscribe: da prendere prima, prese in fondo; senza uid scartate", () => {
    const v = vociDa(items);
    expect(v.map((x) => x.testo)).toEqual(["latte", "caffè", "pane"]);
    expect(ordinaSpesa(v).map((x) => `${x.testo}${x.preso ? "✓" : ""}`)).toEqual(["latte", "pane", "caffè✓"]);
    expect(vociDa(null)).toEqual([]);
  });

  const lista = (opz: { rifiuta?: boolean; manca?: boolean } = {}) => {
    const chiamate: [string, Record<string, unknown>, string][] = [];
    let spingi: (d: unknown) => void = () => undefined;
    const smesse: string[] = [];
    const l = new ListaSpesa({
      iscrivi: (entita, f) => {
        if (opz.manca) return Promise.reject(new Error(`To-do list entity not found: ${entita}`));
        spingi = f;
        f(items);
        return Promise.resolve(() => {
          smesse.push(entita);
          return Promise.resolve();
        });
      },
      servizio: (s, d, e) => {
        chiamate.push([s, d, e]);
        return opz.rifiuta ? Promise.reject(new Error("Unable to find To-do item")) : Promise.resolve();
      },
    });
    return { l, chiamate, spingi: (d: unknown) => spingi(d), smesse };
  };

  it("i comandi passano da Home Assistant con l'uid; la lista cambia solo quando HA lo dice", async () => {
    const { l, chiamate, spingi } = lista();
    await l.apri("todo.shopping_list");
    expect(l.voci?.length).toBe(3);
    expect(await l.aggiungi("  uova ")).toBeNull();
    expect(await l.segna("1", true)).toBeNull();
    expect(await l.segna("2", false)).toBeNull();
    expect(await l.togli("3")).toBeNull();
    expect(await l.togliPresi()).toBeNull();
    expect(chiamate).toEqual([
      ["add_item", { item: "uova" }, "todo.shopping_list"],
      ["update_item", { item: "1", status: "completed" }, "todo.shopping_list"],
      ["update_item", { item: "2", status: "needs_action" }, "todo.shopping_list"],
      ["remove_item", { item: ["3"] }, "todo.shopping_list"],
      ["remove_completed_items", {}, "todo.shopping_list"],
    ]);
    // la lista sullo schermo è sempre quella di HA
    expect(l.voci?.length).toBe(3);
    spingi({ items: [{ uid: "9", summary: "uova", status: "needs_action" }] });
    expect(l.voci?.map((v) => v.testo)).toEqual(["uova"]);
  });
  it("testo vuoto: niente chiamata; errore di HA: in parole, e la lista resta", async () => {
    const { l, chiamate } = lista({ rifiuta: true });
    await l.apri("todo.shopping_list");
    expect(await l.aggiungi("   ")).toBe("Scrivi cosa aggiungere.");
    expect(chiamate).toEqual([]);
    expect(await l.togli("1")).toContain("Unable to find");
    expect(l.occupata).toBe(false);
    expect(l.voci?.length).toBe(3);
  });
  it("lista che non c'è: errore in parole, nessun comando parte", async () => {
    const { l, chiamate } = lista({ manca: true });
    await l.apri("todo.altra");
    expect(l.errore).toContain("not found");
    expect(l.voci).toBeNull();
    expect(chiamate).toEqual([]);
  });
  it("cambiando lista si lascia l'iscrizione di prima", async () => {
    const { l, smesse } = lista();
    await l.apri("todo.shopping_list");
    await l.apri("todo.altra");
    expect(smesse).toEqual(["todo.shopping_list"]);
    await l.chiudi();
    expect(smesse).toEqual(["todo.shopping_list", "todo.altra"]);
  });
});

describe("avvisi ed eventi", () => {
  it("stati in parole, senza genere; sconosciuto e passaggi intermedi non si mostrano", () => {
    expect(testoStato("media_player", "on")).toBe("accensione");
    expect(testoStato("media_player", "standby")).toBe("spegnimento");
    expect(testoStato("climate", "fan_only")).toBe("ventola");
    expect(testoStato("switch", "off")).toBe("spegnimento");
    expect(testoStato("switch", "unavailable")).toBe("non raggiungibile");
    expect(testoStato("switch", "unknown")).toBeNull();
    expect(testoStato("media_player", "buffering")).toBeNull();
    expect(testoStato("cover", "opening")).toBeNull();
  });
  it("dal registro di HA: dal più recente, chi l'ha chiesto, when in secondi", () => {
    const nomi: Record<string, string> = {
      "media_player.tv": "TV Salotto",
      "climate.condizionatore": "Condizionatore",
      "script.jarvis_rientro": "Jarvis · Rientro",
    };
    const e = eventiDaRegistro(
      [
        {
          entity_id: "climate.condizionatore",
          state: "fan_only",
          when: 1000,
          context_entity_id: "script.jarvis_rientro",
        },
        { entity_id: "media_player.tv", state: "on", when: 2000, context_user_id: "abc" },
        { entity_id: "switch.ir", state: "unknown", when: 3000 },
        { entity_id: "media_player.tv", state: "off", when: 500 },
        { message: "senza entità", when: 4000 },
      ],
      (x) => nomi[x] ?? x,
    );
    expect(e.map((x) => [x.titolo, x.stato, x.da, x.quando])).toEqual([
      ["TV Salotto", "accensione", "da un utente", 2_000_000],
      ["Condizionatore", "ventola", "da Jarvis · Rientro", 1_000_000],
      ["TV Salotto", "spegnimento", null, 500_000],
    ]);
    expect(eventiDaRegistro({ non: "un elenco" }, (x) => x)).toEqual([]);
  });
  it("batterie sotto la soglia, dalla più scarica; i binary_sensor dicono solo bassa", () => {
    const stati = {
      "sensor.a": stato("12", { device_class: "battery", friendly_name: "Meter letto batteria" }),
      "sensor.b": stato("19.6", { device_class: "battery" }),
      "sensor.c": stato("100", { device_class: "battery" }),
      "sensor.d": stato("unavailable", { device_class: "battery" }),
      "binary_sensor.e": stato("on", { device_class: "battery", friendly_name: "Sensore porta" }),
      "sensor.temperatura": stato("5", { device_class: "temperature" }),
    } as unknown as HassEntities;
    expect(batterieBasse(stati, 20)).toEqual([
      { entita: "binary_sensor.e", nome: "Sensore porta", livello: null },
      { entita: "sensor.a", nome: "Meter letto batteria", livello: 12 },
      { entita: "sensor.b", nome: "sensor.b", livello: 20 },
    ]);
    expect(batterieBasse(stati, 10).map((b) => b.entita)).toEqual(["binary_sensor.e"]);
  });
  it("quando: oggi, ieri, poi il giorno; durata delle interruzioni", () => {
    const adesso = new Date(2026, 9, 1, 15, 0).getTime();
    expect(quandoTesto(new Date(2026, 9, 1, 13, 2).getTime(), adesso)).toBe("oggi 13:02");
    expect(quandoTesto(new Date(2026, 8, 30, 2, 19).getTime(), adesso)).toBe("ieri 02:19");
    expect(quandoTesto(new Date(2026, 8, 28, 9, 15).getTime(), adesso)).toMatch(/^lun 28, 09:15$/);
    expect(durataTesto(20_000)).toBe("meno di 1 min");
    expect(durataTesto(5 * 60_000)).toBe("5 min");
    expect(durataTesto(80 * 60_000)).toBe("1 h 20 min");
    expect(durataTesto(120 * 60_000)).toBe("2 h");
  });
  it("interruzioni: una aperta alla volta, si chiude al ritorno, al massimo 30, salvate", () => {
    const { a } = archivio();
    const r = new RegistroInterruzioni(a);
    r.inizio(1000);
    r.inizio(2000);
    expect(r.voci).toEqual([{ da: 1000, a: null }]);
    r.fine(5000);
    r.fine(9000);
    expect(r.voci).toEqual([{ da: 1000, a: 5000 }]);
    for (let i = 0; i < 40; i++) {
      r.inizio(10_000 + i * 10);
      r.fine(10_005 + i * 10);
    }
    expect(r.voci).toHaveLength(MASSIMO_INTERRUZIONI);
    expect(new RegistroInterruzioni(a).voci[0]).toEqual({ da: 10_390, a: 10_395 });
    expect(leggiInterruzioni("{rotto")).toEqual([]);
    expect(leggiInterruzioni(JSON.stringify([{ da: 5, a: 2 }, { a: 1 }]))).toEqual([{ da: 5, a: null }]);
  });
});

describe("scene", () => {
  const stati = {
    "script.jarvis_esco": stato("on", { friendly_name: "Jarvis · Esco" }),
    "script.jarvis_rientro": stato("off", { friendly_name: "Jarvis · Rientro" }),
    "input_number.jarvis_clima_soglia_caldo": stato("26"),
    "input_number.jarvis_clima_soglia_freddo": stato("18.5"),
    "scene.cena": stato("2026-10-01T19:00:00", { friendly_name: "Cena" }),
  } as unknown as HassEntities;
  it("le tre del pacchetto: nome, colore del mockup, cosa fanno davvero; in corso se lo script gira", () => {
    const s = sceneDa(["script.jarvis_buonanotte", "script.jarvis_esco", "script.jarvis_rientro"], stati);
    expect(s.map((x) => [x.nome, x.colore, x.esiste, x.inCorso])).toEqual([
      ["Buonanotte", "#8b7cf6", false, false],
      ["Esco", "#3ec9a7", true, true],
      ["Rientro", "#e0a33a", true, false],
    ]);
    expect(s[2]?.descrizione).toBe(
      "Condizionatore della camera secondo la temperatura percepita: raffresca sopra 26°, riscalda sotto 18,5°.",
    );
    // la modalità notte del pannello non c'è ancora (F6): non si promette
    expect(s[0]?.descrizione).not.toMatch(/notte/i);
  });
  it("scene scelte a mano: nome da HA o dall'entità, colori diversi, scene.* con scene.turn_on", () => {
    const s = sceneDa(["scene.cena", "script.cena_fuori"], stati);
    expect(s.map((x) => x.nome)).toEqual(["Cena", "Cena fuori"]);
    expect(s[0]?.colore).not.toBe(s[1]?.colore);
    expect(s[0]?.inCorso).toBe(false);
    expect(servizioScena("scene.cena")).toEqual({ dominio: "scene", servizio: "turn_on" });
    expect(servizioScena("script.jarvis_esco")).toEqual({ dominio: "script", servizio: "turn_on" });
    expect(nomeScena("script.x", "Jarvis - Rientro")).toBe("Rientro");
  });
});

describe("conferma prima delle scene (v0.5.8)", () => {
  it("spenta di serie; si legge solo se è un sì/no", () => {
    expect(PREFERENZE_SCHERMATE_DI_SERIE.sceneConferma).toBe(false);
    expect(leggiPreferenzeSchermate(JSON.stringify({ sceneConferma: true })).sceneConferma).toBe(true);
    expect(leggiPreferenzeSchermate(JSON.stringify({ sceneConferma: "si" })).sceneConferma).toBe(false);
  });
  it("senza conferma il primo tocco avvia; con la conferma serve il secondo entro 4 s", () => {
    vi.useFakeTimers();
    try {
      const ridisegna = vi.fn();
      const c = new ConfermaScena(ridisegna);
      expect(c.tocca("script.jarvis_esco", false)).toBe(true);
      expect(c.tocca("script.jarvis_esco", true)).toBe(false);
      expect(c.inAttesa("script.jarvis_esco")).toBe(true);
      expect(c.tocca("script.jarvis_esco", true)).toBe(true);
      expect(c.inAttesa("script.jarvis_esco")).toBe(false);
      // controprova: oltre i 4 s il secondo tocco è di nuovo un primo tocco
      expect(c.tocca("script.jarvis_esco", true)).toBe(false);
      vi.advanceTimersByTime(CONFERMA_SCENA_MS + 1);
      expect(c.inAttesa("script.jarvis_esco")).toBe(false);
      expect(c.tocca("script.jarvis_esco", true)).toBe(false);
      // controprova: un tocco su un'altra scena non avvia la prima, sposta la richiesta
      expect(c.tocca("script.jarvis_rientro", true)).toBe(false);
      expect(c.inAttesa("script.jarvis_esco")).toBe(false);
      expect(c.tocca("script.jarvis_rientro", true)).toBe(true);
      expect(ridisegna).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("timer dalla schermata (v0.5.8: servizi di jarvis_voce 0.3.0)", () => {
  it("durate in parole e sui pulsanti", () => {
    expect(durataParlata(45)).toBe("45 secondi");
    expect(durataParlata(5400)).toBe("1 ora e 30 minuti");
    expect(durataParlata(7200)).toBe("2 ore");
    expect(etichettaDurata(5)).toBe("5 min");
    expect(etichettaDurata(60)).toBe("1 h");
    expect(etichettaDurata(90)).toBe("1 h 30");
  });
  it("esito del servizio: ok = null, errore col messaggio del server, il resto non riconosciuto", () => {
    expect(esitoServizioTimer({ esito: "ok", id: "t1", pannello: "jarvis_cucina" })).toBeNull();
    expect(
      esitoServizioTimer({ esito: "errore", messaggio: "Timer non trovato (forse è già finito)." }),
    ).toBe("Timer non trovato (forse è già finito).");
    expect(esitoServizioTimer({ esito: "errore" })).toBe("il server ha detto di no");
    // controprova: senza esito non si dice mai "fatto"
    expect(esitoServizioTimer({})).toContain("non riconosciuta");
    expect(esitoServizioTimer(null)).toContain("non riconosciuta");
  });

  const suoneria = { avvia: () => undefined, ferma: () => undefined };
  it("avvia: timer_stanza con la stanza e i minuti; comando: timer_comando con id e azione", async () => {
    const servizi = vi.fn((_s: string, _d: Record<string, unknown>) =>
      Promise.resolve({ esito: "ok", id: "t9", pannello: "jarvis_cucina" }),
    );
    const t = new Timer(suoneria, servizi, () => "jarvis_cucina");
    expect(await t.avvia("cucina", { minuti: 5 })).toBeNull();
    expect(servizi).toHaveBeenLastCalledWith("timer_stanza", { stanza: "cucina", minuti: 5 });
    expect(await t.avvia("cucina", { minuti: 10 }, "pasta")).toBeNull();
    expect(servizi).toHaveBeenLastCalledWith("timer_stanza", { stanza: "cucina", minuti: 10, nome: "pasta" });
    for (const azione of ["annulla", "pausa", "riprendi"] as const) {
      expect(await t.comando("t9", azione)).toBeNull();
      expect(servizi).toHaveBeenLastCalledWith("timer_comando", { id: "t9", azione });
    }
  });
  it("controprove: timer già finito, server senza la 0.3.0, connessione caduta", async () => {
    const finito = new Timer(
      suoneria,
      () => Promise.resolve({ esito: "errore", messaggio: "Timer non trovato (forse è già finito)." }),
      () => "x",
    );
    expect(await finito.comando("t1", "annulla")).toBe("Timer non trovato (forse è già finito).");
    const vecchio = new Timer(
      suoneria,
      () => Promise.reject(new Error("Service jarvis_voce.timer_stanza not found")),
      () => "x",
    );
    expect(await vecchio.avvia("cucina", { minuti: 1 })).toBe("serve jarvis_voce 0.3.0 sul server");
    const caduta = new Timer(
      suoneria,
      () => Promise.reject(new Error("socket chiuso")),
      () => "x",
    );
    expect(await caduta.comando("t1", "pausa")).toContain("socket chiuso");
  });
});

describe("clima", () => {
  it("consumi solo dai sensori di potenza o energia veri, prima la potenza", () => {
    const stati = {
      "sensor.casa_energia": stato("12.5", {
        device_class: "energy",
        unit_of_measurement: "kWh",
        friendly_name: "Casa oggi",
      }),
      "sensor.casa_potenza": stato("420", {
        device_class: "power",
        unit_of_measurement: "W",
        friendly_name: "Casa",
      }),
      "sensor.guasto": stato("unavailable", { device_class: "power" }),
      "sensor.temperatura": stato("21", { device_class: "temperature" }),
    } as unknown as HassEntities;
    expect(sensoriConsumo(stati).map((s) => `${s.nome} ${s.valore} ${s.unita}`)).toEqual([
      "Casa 420 W",
      "Casa oggi 12.5 kWh",
    ]);
    expect(sensoriConsumo({} as HassEntities)).toEqual([]);
  });
  it("una scala sola per tutte le stanze: le linee si confrontano", () => {
    const a = [
      { t: 0, v: 20 },
      { t: 10, v: 22 },
    ];
    const b = [
      { t: 0, v: 25 },
      { t: 10, v: null },
      { t: 20, v: 26 },
    ];
    const scala = scalaComune([a, b]);
    expect(scala).toEqual({ min: 20, max: 26 });
    if (!scala) throw new Error("scala mancante");
    const la = linea(a, 0, 20, 100, 60, scala);
    const lb = linea(b, 0, 20, 100, 60, scala);
    // 20° in fondo, 26° in cima, con la stessa scala
    expect(la?.tratti[0]?.startsWith("0.0,60.0")).toBe(true);
    expect(lb?.tratti.at(-1)?.endsWith("100.0,0.0")).toBe(true);
    expect(scalaComune([[{ t: 0, v: 21 }]])).toBeNull();
  });
});
