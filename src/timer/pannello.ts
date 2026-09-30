import { stanzaPannello } from "../voce/stanza-pannello";

/**
 * Chi è questo pannello per i timer (v0.4.6). Il server (`jarvis_voce` 0.1.8)
 * assegna ogni timer a un `device_id`: quello della richiesta, oppure quello
 * della stanza detta a voce ("metti un timer in camera da letto"). Il pannello
 * manda il suo `device_id` a ogni domanda e suona solo per i timer suoi.
 *
 * device_id = "jarvis_" + slug della stanza scelta in diagnostica. Due
 * pannelli nella stessa stanza hanno lo stesso: suonano entrambi, va bene
 * (sessione server, 30/09). Senza stanza non si manda niente e il server usa
 * `jarvis_pannello`.
 */
export const PREFISSO = "jarvis_";
export const DISPOSITIVO_SENZA_STANZA = "jarvis_pannello";

/**
 * Come lo script `jarvis_timer_stanza` del server (jarvis_voce, regola data
 * dalla sessione server il 30/09): NFKD, via i segni combinanti, minuscolo,
 * ogni carattere che non è lettera o cifra (Unicode, come str.isalnum di
 * Python) diventa "_", niente "_" doppi né ai bordi. Deve dare lo STESSO
 * risultato del server, anche dove differisce da homeassistant.util.slugify
 * (es. "Stanza ½" → stanza_1_2, "Straße" → straße). "unknown" se non resta niente.
 */
export function slugStanza(nome: string): string {
  const slug = nome
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return slug || "unknown";
}

/** device_id da mandare a HA per questa stanza; null senza stanza. */
export function dispositivoDi(stanza: string | null): string | null {
  return stanza ? `${PREFISSO}${slugStanza(stanza)}` : null;
}

/** device_id di questo pannello da mandare con le domande (null = non si manda). */
export function dispositivoPannello(): string | null {
  return dispositivoDi(stanzaPannello());
}

/** Con quale device_id il server segna i timer di questo pannello. */
export function proprietarioTimer(): string {
  return dispositivoPannello() ?? DISPOSITIVO_SENZA_STANZA;
}
