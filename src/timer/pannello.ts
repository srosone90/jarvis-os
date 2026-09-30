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
 * Come `homeassistant.util.slugify` (HA 2026.9.3): minuscolo, niente accenti,
 * ogni carattere che non è lettera o cifra diventa "_", niente "_" doppi né ai
 * bordi, "unknown" se non resta niente. "Camera dell'ospite" → camera_dell_ospite.
 */
export function slugStanza(nome: string): string {
  const slug = nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
