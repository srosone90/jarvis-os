import type { HassEntities } from "home-assistant-js-websocket";
import { dominio } from "../registri/modello";

/**
 * Consumi (v0.5.7, schermata Clima): SOLO se in Home Assistant c'è un sensore
 * di potenza o di energia (`device_class` power / energy). Oggi in casa non
 * ce n'è nessuno, quindi la parte non si vede; compare da sola il giorno che
 * se ne aggiunge uno. Niente stime: un consumo inventato è peggio di nessuno.
 */
export interface SensoreConsumo {
  entita: string;
  nome: string;
  tipo: "potenza" | "energia";
  valore: number;
  unita: string;
}

export function sensoriConsumo(stati: HassEntities): SensoreConsumo[] {
  const sensori: SensoreConsumo[] = [];
  for (const [entita, s] of Object.entries(stati)) {
    if (dominio(entita) !== "sensor") continue;
    const classe = s.attributes["device_class"];
    if (classe !== "power" && classe !== "energy") continue;
    const valore = Number(s.state);
    if (s.state.trim() === "" || !Number.isFinite(valore)) continue;
    sensori.push({
      entita,
      nome: typeof s.attributes["friendly_name"] === "string" ? s.attributes["friendly_name"] : entita,
      tipo: classe === "power" ? "potenza" : "energia",
      valore,
      unita:
        typeof s.attributes["unit_of_measurement"] === "string"
          ? s.attributes["unit_of_measurement"]
          : classe === "power"
            ? "W"
            : "kWh",
    });
  }
  // prima la potenza di adesso, poi l'energia; per nome
  return sensori.sort((a, b) =>
    a.tipo === b.tipo ? a.nome.localeCompare(b.nome, "it") : a.tipo === "potenza" ? -1 : 1,
  );
}
