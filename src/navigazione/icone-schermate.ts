import {
  mdiBellOutline,
  mdiCartOutline,
  mdiHome,
  mdiMusic,
  mdiPaletteOutline,
  mdiThermometer,
  mdiTimerOutline,
  mdiViewGridOutline,
  mdiWeatherPartlyCloudy,
} from "@mdi/js";
import type { Principale } from "./navigazione";

/** Un'icona per schermata: colonna, Altro e impostazioni usano le stesse. */
export const ICONE_SCHERMATE: Record<Principale, string> = {
  casa: mdiHome,
  musica: mdiMusic,
  meteo: mdiWeatherPartlyCloudy,
  timer: mdiTimerOutline,
  clima: mdiThermometer,
  scene: mdiPaletteOutline,
  spesa: mdiCartOutline,
  avvisi: mdiBellOutline,
  altro: mdiViewGridOutline,
};
