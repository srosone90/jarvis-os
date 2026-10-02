import { describe, expect, it } from "vitest";
import { ORIGINI } from "../../../src/comune/configurazione";
import { decidiAllAvvio, indirizzoSu, usoDi } from "../../../src/pwa/origine";

describe("origine veloce e di riserva", () => {
  const o = ORIGINI;
  const riserva = (resto: string) => new URL(`${o.riserva}${resto}`);

  it("riconosce le due origini; tutto il resto (LAN, http di Tailscale) è 'altra'", () => {
    expect(usoDi("https://casa.tail8392c1.ts.net", o)).toBe("riserva");
    expect(usoDi("https://jarvis-rosone.duckdns.org:8443", o)).toBe("veloce");
    expect(usoDi("http://192.168.1.250:8123", o)).toBe("altra");
    // la porta conta: stesso nome senza :8443 non è l'origine veloce
    expect(usoDi("https://jarvis-rosone.duckdns.org", o)).toBe("altra");
  });

  it("stessa pagina sull'altra origine: percorso, parametri e frammento intatti", () => {
    expect(indirizzoSu(o.veloce, riserva("/local/jarvis/index.html?a=1&b=due#x"))).toBe(
      "https://jarvis-rosone.duckdns.org:8443/local/jarvis/index.html?a=1&b=due#x",
    );
    expect(indirizzoSu(o.veloce, riserva("/local/jarvis/prova-ehi-jarvis.html"))).toBe(
      "https://jarvis-rosone.duckdns.org:8443/local/jarvis/prova-ehi-jarvis.html",
    );
  });

  it("si prova la veloce solo dalla riserva, una volta per sessione, mai durante un login", () => {
    expect(decidiAllAvvio(riserva("/local/jarvis/index.html"), false, o)).toEqual({ prova: true });
    expect(decidiAllAvvio(riserva("/local/jarvis/index.html"), true, o)).toMatchObject({
      prova: false,
      motivo: "passaggio già fatto in questa sessione",
    });
    expect(decidiAllAvvio(riserva("/local/jarvis/index.html?origine=riserva"), false, o)).toMatchObject({
      prova: false,
      motivo: "tornato qui dall'origine veloce",
    });
    expect(
      decidiAllAvvio(riserva("/local/jarvis/index.html?auth_callback=1&code=c&state=s"), false, o),
    ).toMatchObject({
      prova: false,
      motivo: "login appena fatto qui, la veloce si riprova alla prossima apertura",
    });
    // dalla veloce non si parte mai da soli, né da un indirizzo diverso
    expect(decidiAllAvvio(new URL(`${o.veloce}/local/jarvis/index.html`), false, o).prova).toBe(false);
    expect(decidiAllAvvio(new URL("http://192.168.1.250:8123/local/jarvis/"), false, o).prova).toBe(false);
  });
});
