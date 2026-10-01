import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  branoDa,
  leggiPreferenzeMusica,
  minuti,
  Musica,
  ordinaPlaylist,
  playlistDa,
  posizioneAdesso,
  PREFERENZE_MUSICA_DI_SERIE,
} from "../../src/musica/musica";

const risposta = {
  esito: "ok",
  stato: "in_riproduzione",
  titolo: "Bohemian Rhapsody",
  artisti: "Queen",
  dispositivo: "Echo Cucina",
  stanza: "Cucina",
  volume: 30.4,
  copertina: "https://i.scdn.co/image/abc",
  posizione_ms: 60_000,
  durata_ms: 354_000,
};

describe("brano", () => {
  it("legge la risposta di jarvis_musica.stato 0.4.0", () => {
    const b = branoDa(risposta, 1000);
    expect(b).toEqual({
      stato: "in_riproduzione",
      titolo: "Bohemian Rhapsody",
      artisti: "Queen",
      dispositivo: "Echo Cucina",
      stanza: "Cucina",
      volume: 30,
      copertina: "https://i.scdn.co/image/abc",
      posizioneMs: 60_000,
      durataMs: 354_000,
      letto: 1000,
    });
  });
  it("campi mancanti o strani: niente inventato", () => {
    const b = branoDa({ stato: "boh", volume: "alto", copertina: "", posizione_ms: -5 }, 0);
    expect(b.stato).toBe("niente");
    expect(b.volume).toBeNull();
    expect(b.copertina).toBeNull();
    expect(b.posizioneMs).toBe(0);
    expect(b.durataMs).toBe(0);
    expect(b.titolo).toBe("");
  });
  it("l'avanzamento scorre solo mentre suona, mai oltre la fine", () => {
    const b = branoDa(risposta, 1000);
    expect(posizioneAdesso(b, 11_000)).toBe(70_000);
    expect(posizioneAdesso(b, 10_000_000)).toBe(354_000);
    expect(posizioneAdesso({ ...b, stato: "in_pausa" }, 11_000)).toBe(60_000);
    // senza durata (radio) scorre e basta
    expect(posizioneAdesso({ ...b, durataMs: 0 }, 11_000)).toBe(70_000);
  });
  it("minuti", () => {
    expect(minuti(0)).toBe("0:00");
    expect(minuti(187_900)).toBe("3:07");
    expect(minuti(-10)).toBe("0:00");
    expect(minuti(3_600_000)).toBe("60:00");
  });
});

describe("playlist", () => {
  const elenco = playlistDa({
    playlist: [
      { nome: "Rock", uri: "spotify:playlist:1", copertina: "x", proprietario: "Salvatore" },
      { nome: "Jazz", uri: "spotify:playlist:2" },
      { nome: "senza uri" },
      "spazzatura",
      { nome: "Lo-fi", uri: "spotify:playlist:3" },
    ],
  });
  it("solo quelle con nome e uri", () => {
    expect(elenco.map((p) => p.nome)).toEqual(["Rock", "Jazz", "Lo-fi"]);
    expect(elenco[1]).toEqual({
      nome: "Jazz",
      uri: "spotify:playlist:2",
      copertina: null,
      proprietario: null,
    });
    expect(playlistDa({})).toEqual([]);
  });
  it("le preferite in cima, nell'ordine in cui sono state segnate; quelle sparite ignorate", () => {
    expect(
      ordinaPlaylist(elenco, ["spotify:playlist:3", "spotify:playlist:sparita", "spotify:playlist:2"]).map(
        (p) => p.nome,
      ),
    ).toEqual(["Lo-fi", "Jazz", "Rock"]);
    expect(ordinaPlaylist(elenco, []).map((p) => p.nome)).toEqual(["Rock", "Jazz", "Lo-fi"]);
  });
});

describe("preferenze", () => {
  it("di serie: mini sotto l'orologio, rilettura ogni 20 s", () => {
    expect(leggiPreferenzeMusica(null)).toEqual(PREFERENZE_MUSICA_DI_SERIE);
    expect(PREFERENZE_MUSICA_DI_SERIE).toMatchObject({
      mini: true,
      posizioneMini: "orologio",
      intervalloSecondi: 20,
    });
    expect(leggiPreferenzeMusica("{rotto")).toEqual(PREFERENZE_MUSICA_DI_SERIE);
  });
  it("valori fuori misura riportati nei limiti, doppioni e vuoti tolti", () => {
    const p = leggiPreferenzeMusica(
      JSON.stringify({
        mini: false,
        posizioneMini: "soffitto",
        intervalloSecondi: 1,
        preferite: ["a", "a", "", 3, "b"],
        stanze: [" Cucina ", "Cucina", "  "],
      }),
    );
    expect(p).toEqual({
      mini: false,
      posizioneMini: "orologio",
      intervalloSecondi: 5,
      preferite: ["a", "b"],
      stanze: ["Cucina", "Cucina"],
    });
    expect(leggiPreferenzeMusica(JSON.stringify({ intervalloSecondi: 9999 })).intervalloSecondi).toBe(300);
  });
});

describe("Musica", () => {
  let archivio: Map<string, string>;
  let chiamate: { servizio: string; dati: Record<string, unknown> }[];
  let stato: Record<string, unknown>;
  const crea = (collegato = true): Musica =>
    new Musica({
      chiama: (servizio, dati) => {
        chiamate.push({ servizio, dati });
        if (servizio === "controllo" && dati["azione"] === "pausa") stato = { ...stato, stato: "in_pausa" };
        if (servizio === "controllo" && dati["azione"] === "rompi")
          return Promise.reject(new Error("Spotify giù"));
        if (servizio === "playlist") return Promise.resolve({ playlist: [{ nome: "Rock", uri: "u1" }] });
        return Promise.resolve(stato);
      },
      collegato: () => collegato,
      archivio: { getItem: (k) => archivio.get(k) ?? null, setItem: (k, v) => void archivio.set(k, v) },
    });

  beforeEach(() => {
    vi.useFakeTimers();
    archivio = new Map();
    chiamate = [];
    stato = { ...risposta };
  });
  afterEach(() => vi.useRealTimers());

  it("rilegge ogni 20 s solo finché qualcuno guarda", async () => {
    const m = crea();
    const smetti = m.osserva();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.brano?.titolo).toBe("Bohemian Rhapsody");
    expect(chiamate.length).toBe(1);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(chiamate.length).toBe(3);
    // due osservatori: un solo giro di letture
    const smetti2 = m.osserva();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(chiamate.length).toBe(5);
    smetti();
    smetti();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(chiamate.length).toBe(6);
    smetti2();
    await vi.advanceTimersByTimeAsync(100_000);
    expect(chiamate.length).toBe(6);
  });
  it("l'intervallo cambiato vale subito, e si salva", async () => {
    const m = crea();
    m.osserva();
    await vi.advanceTimersByTimeAsync(0);
    m.cambiaPreferenze({ intervalloSecondi: 5 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(chiamate.length).toBe(3);
    expect(JSON.parse(archivio.get("jarvis-musica") ?? "{}")).toMatchObject({ intervalloSecondi: 5 });
    m.cambiaPreferenze({ intervalloSecondi: null });
    expect(m.preferenze.intervalloSecondi).toBe(20);
    expect(crea().preferenze.intervalloSecondi).toBe(20);
  });
  it("dopo un comando rilegge lo stato vero", async () => {
    const m = crea();
    expect(await m.comanda("pausa")).toBeNull();
    expect(chiamate.map((c) => c.servizio)).toEqual(["controllo", "stato"]);
    expect(m.brano?.stato).toBe("in_pausa");
    expect(m.occupata).toBeNull();
  });
  it("una lettura partita prima del comando non vince sullo stato dopo il comando", async () => {
    let sblocca = (): void => undefined;
    const m = new Musica({
      chiama: (servizio, dati) => {
        chiamate.push({ servizio, dati });
        if (servizio === "stato" && chiamate.length === 1) {
          const prima = { ...stato };
          return new Promise((ok) => (sblocca = () => ok(prima)));
        }
        if (servizio === "controllo") stato = { ...stato, stato: "in_pausa" };
        return Promise.resolve(stato);
      },
      collegato: () => true,
      archivio: null,
    });
    void m.leggi();
    const comando = m.comanda("pausa");
    await vi.advanceTimersByTimeAsync(0);
    sblocca();
    await comando;
    expect(m.brano?.stato).toBe("in_pausa");
    expect(chiamate.map((c) => c.servizio)).toEqual(["stato", "controllo", "stato"]);
  });
  it("un comando alla volta; l'errore torna in parole e lo stato si rilegge lo stesso", async () => {
    const m = crea();
    const primo = m.comanda("pausa");
    expect(m.occupata).toBe("pausa");
    expect(await m.comanda("riprendi")).toBe("Un comando è già in corso.");
    await primo;
    expect(await m.comanda("rompi" as never)).toContain("Spotify giù");
    expect(chiamate.filter((c) => c.servizio === "stato").length).toBe(2);
  });
  it("sposta e volume passano dove e livello; la playlist parte con l'uri", async () => {
    const m = crea();
    await m.comanda("sposta", { dove: "Camera da letto" });
    await m.comanda("volume", { livello: 40 });
    await m.riproduci("spotify:playlist:1", "Cucina");
    await m.riproduci("spotify:playlist:2");
    expect(chiamate.filter((c) => c.servizio !== "stato").map((c) => c.dati)).toEqual([
      { azione: "sposta", dove: "Camera da letto" },
      { azione: "volume", livello: 40 },
      { cosa: "spotify:playlist:1", dove: "Cucina" },
      { cosa: "spotify:playlist:2" },
    ]);
  });
  it("componente assente: niente brano, il problema in parole", async () => {
    const m = new Musica({
      chiama: () => Promise.reject(new Error("Service jarvis_musica.stato not found.")),
      collegato: () => true,
      archivio: null,
    });
    await m.leggi();
    expect(m.brano).toBeNull();
    expect(m.problema).toContain("not found");
    await m.leggiPlaylist();
    expect(m.playlist).toEqual([]);
  });
  it("collegato dopo: chi guardava rilegge subito stato e playlist, chi non guardava no", async () => {
    let collegato = false;
    const m = new Musica({
      chiama: (servizio, dati) => {
        chiamate.push({ servizio, dati });
        return Promise.resolve(servizio === "playlist" ? { playlist: [{ nome: "Rock", uri: "u1" }] } : stato);
      },
      collegato: () => collegato,
      archivio: null,
    });
    m.alCollegamento();
    expect(chiamate).toEqual([]);
    const smetti = m.osserva();
    await m.leggiPlaylist();
    expect(chiamate).toEqual([]);
    collegato = true;
    m.alCollegamento();
    await vi.advanceTimersByTimeAsync(0);
    expect(chiamate.map((c) => c.servizio).sort()).toEqual(["playlist", "stato"]);
    expect(m.brano?.titolo).toBe("Bohemian Rhapsody");
    smetti();
    m.alCollegamento();
    await vi.advanceTimersByTimeAsync(0);
    expect(chiamate.length).toBe(2);
  });
  it("scollegato da HA: non chiama niente", async () => {
    const m = crea(false);
    await m.leggi();
    await m.leggiPlaylist();
    expect(chiamate).toEqual([]);
  });
  it("preferite: segnate, in cima, tolte", async () => {
    const m = crea();
    await m.leggiPlaylist();
    expect(m.playlist?.map((p) => p.uri)).toEqual(["u1"]);
    m.preferita("u1");
    expect(m.preferenze.preferite).toEqual(["u1"]);
    m.preferita("u1");
    expect(m.preferenze.preferite).toEqual([]);
  });
});
