/**
 * Preferenze del pannello (non l'elenco dei dispositivi: quello arriva dai
 * registri di Home Assistant e si aggiorna da solo).
 *
 * Qui si dice solo: quale meteo mostrare, in che ordine e in quale zona del
 * mockup vanno le stanze e da quali sensori leggono il clima, quali dispositivi
 * sono a infrarossi (stato non verificabile), quale interruttore ha il programma
 * dello scaldabagno, e cosa nascondere. Un'entità che manca non rompe niente:
 * la card o la stanza lo dicono e l'errore finisce nel log diagnostico.
 */
export interface ClimaStanza {
  temperatura: string;
  umidita: string;
  percepita: string;
}

export interface PreferenzaStanza {
  /** Nome o area_id dell'area in Home Assistant. */
  area: string;
  /** Zona della griglia di destra nel mockup approvato (docs/mockup.html). */
  zona: "soggiorno" | "veranda" | "camera";
  clima?: ClimaStanza;
}

/** Entità del pacchetto HA che descrivono il programma di un interruttore. */
export interface Programma {
  modalita: string;
  giorniNuvolosi: string;
  prossimoCambio: string;
}

export interface Preferenze {
  meteo: string;
  stanze: PreferenzaStanza[];
  /** Comandati a infrarossi: nessun ritorno di stato, si mostra "ultimo comando". */
  infrarossi: string[];
  programmi: Record<string, Programma>;
  /** entity_id o device_id da non mostrare. */
  nascoste: string[];
}

export const PREFERENZE: Preferenze = {
  meteo: "weather.forecast_casa",
  stanze: [
    {
      area: "Soggiorno",
      zona: "soggiorno",
      clima: {
        temperatura: "sensor.meter_salone_temperatura",
        umidita: "sensor.meter_salone_umidita",
        percepita: "sensor.jarvis_temperatura_percepita_soggiorno",
      },
    },
    { area: "Veranda", zona: "veranda" },
    {
      area: "Camera da letto",
      zona: "camera",
      clima: {
        temperatura: "sensor.meter_letto_temperatura",
        umidita: "sensor.meter_letto_umidita",
        percepita: "sensor.jarvis_temperatura_percepita_camera",
      },
    },
  ],
  infrarossi: ["climate.condizionatore", "switch.tv_camera_da_letto"],
  programmi: {
    "switch.scaldabagno": {
      modalita: "binary_sensor.jarvis_scaldabagno_modalita_inverno",
      giorniNuvolosi: "counter.jarvis_giorni_nuvolosi",
      prossimoCambio: "sensor.jarvis_scaldabagno_prossimo_cambio",
    },
  },
  nascoste: [],
};
