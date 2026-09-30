import { describe, expect, it } from "vitest";
import {
  ControlloVista,
  eNotte,
  HUB_A_RIPOSO_MS,
  IMPOSTAZIONI_PREDEFINITE,
  leggiImpostazioni,
  momentoDi,
  prossimaVista,
} from "../../src/vista/vista";

const imp = IMPOSTAZIONI_PREDEFINITE;

describe("vista: riposo, Hub e completo (fase G)", () => {
  it("impostazioni: di serie 2 minuti e notte 23-7; valori strani ignorati; 'mai' resta mai", () => {
    expect(leggiImpostazioni(null)).toEqual({ attesaMin: 2, notteDa: 23, notteA: 7 });
    expect(leggiImpostazioni("non json")).toEqual(imp);
    expect(leggiImpostazioni(JSON.stringify({ attesaMin: -3, notteDa: 30, notteA: "x" }))).toEqual(imp);
    expect(leggiImpostazioni(JSON.stringify({ attesaMin: null, notteDa: 22, notteA: 6 }))).toEqual({
      attesaMin: null,
      notteDa: 22,
      notteA: 6,
    });
  });

  it("la notte può scavalcare la mezzanotte; da = a vuol dire mai notte", () => {
    expect(eNotte(23, 23, 7)).toBe(true);
    expect(eNotte(3, 23, 7)).toBe(true);
    expect(eNotte(7, 23, 7)).toBe(false);
    expect(eNotte(22, 23, 7)).toBe(false);
    expect(eNotte(14, 13, 15)).toBe(true);
    expect(eNotte(12, 12, 12)).toBe(false);
  });

  it("momento del giorno per i colori; la notte scelta vince", () => {
    const alle = (h: number) => new Date(2026, 9, 1, h, 30);
    expect(momentoDi(alle(7), imp)).toBe("mattina");
    expect(momentoDi(alle(13), imp)).toBe("giorno");
    expect(momentoDi(alle(20), imp)).toBe("sera");
    expect(momentoDi(alle(2), imp)).toBe("notte");
    expect(momentoDi(alle(6), imp)).toBe("notte");
    expect(momentoDi(alle(13), { ...imp, notteDa: 13, notteA: 14 })).toBe("notte");
  });

  it("completo → riposo solo dopo l'attesa e se niente è in corso; mai con 'mai'", () => {
    const due = 2 * 60_000;
    expect(prossimaVista("completo", due - 1, 0, imp, true)).toBeNull();
    expect(prossimaVista("completo", due, 0, imp, true)).toBe("riposo");
    expect(prossimaVista("completo", due * 10, 0, imp, false)).toBeNull();
    expect(prossimaVista("completo", due * 100, 0, { ...imp, attesaMin: null }, true)).toBeNull();
    expect(prossimaVista("riposo", due * 100, 0, imp, true)).toBeNull();
  });

  it("Hub → riposo dopo 30 s senza attività (voce compresa)", () => {
    expect(prossimaVista("hub", HUB_A_RIPOSO_MS - 1, 0, imp, true)).toBeNull();
    expect(prossimaVista("hub", HUB_A_RIPOSO_MS, 0, imp, true)).toBe("riposo");
    expect(prossimaVista("hub", HUB_A_RIPOSO_MS * 5, 0, imp, false)).toBeNull();
  });

  it("controllo: attività, passaggi e impostazioni salvate", () => {
    let ora = 0;
    let libero = true;
    const salvato = new Map<string, string>();
    const archivio = {
      getItem: (k: string) => salvato.get(k) ?? null,
      setItem: (k: string, v: string) => void salvato.set(k, v),
    };
    const v = new ControlloVista(
      () => libero,
      () => ora,
      archivio,
    );
    const cambi: string[] = [];
    v.ascolta(() => cambi.push(v.vista));
    ora = 60_000;
    v.attivita();
    ora = 60_000 + 2 * 60_000 - 1;
    v.controlla();
    expect(v.vista).toBe("completo");
    ora += 1;
    libero = false;
    v.controlla();
    expect(v.vista).toBe("completo");
    libero = true;
    v.controlla();
    expect(v.vista).toBe("riposo");
    v.vai("hub");
    ora += HUB_A_RIPOSO_MS - 1;
    v.controlla();
    expect(v.vista).toBe("hub");
    ora += 1;
    v.controlla();
    expect(cambi).toEqual(["riposo", "hub", "riposo"]);
    v.imposta({ attesaMin: null, notteDa: 22 });
    expect(JSON.parse(salvato.get("jarvis-riposo") ?? "{}")).toEqual({
      attesaMin: null,
      notteDa: 22,
      notteA: 7,
    });
    // riletto da un pannello nuovo
    expect(
      new ControlloVista(
        () => true,
        () => 0,
        archivio,
      ).impostazioni.attesaMin,
    ).toBeNull();
  });
});
