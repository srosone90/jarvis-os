/**
 * Preferenze del pannello.
 *
 * Qui stanno solo le PREFERENZE: quale meteo mostrare e, per ogni stanza del
 * mockup approvato, dove sta nella schermata e quali sensori danno il clima.
 * Dalla F2 i dispositivi da comandare si ricavano dai registri di Home
 * Assistant. Un'entità che manca non rompe niente: la stanza dice "non trovato"
 * e l'errore finisce nel log diagnostico.
 */
export interface ClimaStanza {
  temperatura: string;
  umidita: string;
  percepita: string;
}

export interface Stanza {
  nome: string;
  /** Zona della griglia di destra nel mockup approvato (docs/mockup.html). */
  zona: "soggiorno" | "veranda" | "camera";
  /** Assente se nella stanza non c'è un sensore di temperatura (es. Veranda). */
  clima?: ClimaStanza;
}

export interface Configurazione {
  meteo: string;
  stanze: Stanza[];
}

export const CONFIGURAZIONE: Configurazione = {
  meteo: "weather.forecast_casa",
  stanze: [
    {
      nome: "Soggiorno",
      zona: "soggiorno",
      clima: {
        temperatura: "sensor.meter_salone_temperatura",
        umidita: "sensor.meter_salone_umidita",
        percepita: "sensor.jarvis_temperatura_percepita_soggiorno",
      },
    },
    { nome: "Veranda", zona: "veranda" },
    {
      nome: "Camera da letto",
      zona: "camera",
      clima: {
        temperatura: "sensor.meter_letto_temperatura",
        umidita: "sensor.meter_letto_umidita",
        percepita: "sensor.jarvis_temperatura_percepita_camera",
      },
    },
  ],
};
