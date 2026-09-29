/**
 * Preferenze del pannello: quali entità mostrare nella F1.
 *
 * Qui stanno solo le PREFERENZE (quale meteo, quali sensori di clima interno):
 * le stanze e i dispositivi da comandare, dalla F2, si ricavano dai registri di
 * Home Assistant. Un'entità che manca non rompe niente: il suo riquadro dice
 * "non trovato" e l'errore finisce nel log diagnostico.
 */
export interface ClimaStanza {
  nome: string;
  temperatura: string;
  umidita: string;
  percepita: string;
}

export interface Configurazione {
  meteo: string;
  climaInterno: ClimaStanza[];
}

export const CONFIGURAZIONE: Configurazione = {
  meteo: "weather.forecast_casa",
  climaInterno: [
    {
      nome: "Soggiorno",
      temperatura: "sensor.meter_salone_temperatura",
      umidita: "sensor.meter_salone_umidita",
      percepita: "sensor.jarvis_temperatura_percepita_soggiorno",
    },
    {
      nome: "Camera da letto",
      temperatura: "sensor.meter_letto_temperatura",
      umidita: "sensor.meter_letto_umidita",
      percepita: "sensor.jarvis_temperatura_percepita_camera",
    },
  ],
};
