import { getAuth, type Auth, type AuthData } from "home-assistant-js-websocket";
import { descriviErrore, log } from "../diagnostica";

/**
 * Login con il flusso OAuth di Home Assistant. Nessun token nel codice: il
 * pannello fa il login una volta, i token (per origine) stanno nel localStorage
 * del tablet e si rinnovano da soli.
 *
 * L'origine è sempre quella da cui è servita l'app (LAN, Tailscale HTTP o
 * Tailscale HTTPS): ogni indirizzo ha il suo login, ed è giusto così.
 */
const CHIAVE_TOKEN = "jarvis-token";

export function origineHA(): string {
  return location.origin;
}

function salvaToken(dati: AuthData | null): void {
  try {
    if (dati) localStorage.setItem(CHIAVE_TOKEN, JSON.stringify(dati));
    else localStorage.removeItem(CHIAVE_TOKEN);
  } catch (errore) {
    log.errore(`Impossibile salvare il login: ${descriviErrore(errore)}`);
  }
}

function leggiToken(): AuthData | null {
  try {
    const grezzo = localStorage.getItem(CHIAVE_TOKEN);
    return grezzo ? (JSON.parse(grezzo) as AuthData) : null;
  } catch (errore) {
    log.errore(`Login salvato illeggibile: ${descriviErrore(errore)}`);
    return null;
  }
}

export function dimenticaLogin(): void {
  salvaToken(null);
}

function tornoDalLogin(): boolean {
  return new URLSearchParams(location.search).has("auth_callback");
}

/** Toglie ?auth_callback=1&code=…&state=… dall'indirizzo: un codice si usa una volta sola. */
function pulisciIndirizzo(): void {
  history.replaceState(null, "", location.pathname);
}

/**
 * Restituisce l'Auth se il pannello ha già fatto il login (o sta tornando dalla
 * pagina di login di HA), altrimenti null: tocca all'interfaccia chiedere di
 * accedere, senza redirect a sorpresa.
 */
export async function caricaAuth(): Promise<Auth | null> {
  const hassUrl = origineHA();
  if (tornoDalLogin()) {
    try {
      return await getAuth({ hassUrl, saveTokens: salvaToken, limitHassInstance: true });
    } finally {
      pulisciIndirizzo();
    }
  }
  const salvati = leggiToken();
  if (!salvati || salvati.hassUrl !== hassUrl) return null;
  return getAuth({ hassUrl, saveTokens: salvaToken, loadTokens: async () => salvati });
}

/** Porta alla pagina di login di HA (poi HA rimanda qui con ?auth_callback). */
export async function vaiAlLogin(): Promise<void> {
  await getAuth({ hassUrl: origineHA(), saveTokens: salvaToken, loadTokens: async () => null });
}
