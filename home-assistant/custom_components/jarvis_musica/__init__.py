"""Jarvis · musica: far partire Spotify anche "dal silenzio".

Perché esiste (verificato nel codice di HA 2026.9.3,
components/spotify/media_player.py): finché sull'account non c'è una
riproduzione attiva, il media_player di Spotify dichiara solo SELECT_SOURCE,
quindi `media_player.play_media` viene rifiutato e `select_source` da solo non
avvia niente. Questo componente riusa il client spotifyaio GIÀ autenticato
dall'integrazione Spotify (nessuna credenziale nuova, niente scraping né
cookie) e chiama direttamente l'API di Spotify: ricerca, poi start_playback sul
dispositivo Spotify Connect della stanza.

spotifyaio 2.0.2 solleva errore solo per 403, timeout e alcuni 404: gli altri
rifiuti di Spotify tornano in silenzio. Per questo ogni avvio si CONTROLLA
rileggendo lo stato della riproduzione; se non parte si prova il candidato
successivo (al massimo 3), poi si dice chiaramente che non è partito.

Configurazione (packages/jarvis_musica.yaml):

    jarvis_musica:
      predefinita: Soggiorno          # se non si dice dove e non suona niente
      stanze:
        Camera da letto: Echo Pop Camera     # nome del dispositivo in Spotify
        Soggiorno: [TV Samsung, Echo Pop Soggiorno]   # il primo che Spotify vede
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import (
    ConfigEntryAuthFailed,
    HomeAssistantError,
    OAuth2TokenRequestReauthError,
)
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .scelta import TIPI, Candidato, ErroreMusica, candidati, e_partito, scegli_dispositivo, tipi_di_ricerca

# spotifyaio arriva con l'integrazione Spotify: se Spotify non è mai stato
# configurato può mancare, e il componente deve partire lo stesso (il servizio
# risponderà "Spotify non collegato").
try:
    from spotifyaio import (
        SpotifyConnectionError as _SpotifyConnection,
        SpotifyForbiddenError as _SpotifyForbidden,
        SpotifyNotFoundError as _SpotifyNotFound,
    )
except ImportError:  # pragma: no cover

    class _SpotifyConnection(Exception):  # type: ignore[no-redef]
        """Segnaposto: spotifyaio non installato."""

    class _SpotifyForbidden(Exception):  # type: ignore[no-redef]
        """Segnaposto: spotifyaio non installato."""

    class _SpotifyNotFound(Exception):  # type: ignore[no-redef]
        """Segnaposto: spotifyaio non installato."""

_LOGGER = logging.getLogger(__name__)

DOMAIN = "jarvis_musica"
SERVIZIO_RIPRODUCI = "riproduci"
# Quanto aspettare che un dispositivo parta davvero (un Echo può metterci qualche secondo)
ATTESA_AVVIO_S = 8.0
CONTROLLO_OGNI_S = 0.5
RISULTATI_PER_TIPO = 5

CONFIG_SCHEMA = vol.Schema(
    {
        DOMAIN: vol.Schema(
            {
                vol.Optional("stanze", default={}): {cv.string: vol.All(cv.ensure_list, [cv.string])},
                vol.Optional("predefinita"): cv.string,
                # titolo della config entry Spotify, se in casa ci sono più account
                vol.Optional("account"): cv.string,
            }
        )
    },
    extra=vol.ALLOW_EXTRA,
)

SCHEMA_RIPRODUCI = vol.Schema(
    {
        vol.Required("cosa"): vol.All(cv.string, vol.Length(min=1)),
        vol.Optional("dove"): cv.string,
        vol.Optional("tipo", default="auto"): vol.In(TIPI),
    }
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Registra il servizio jarvis_musica.riproduci."""
    impostazioni = config.get(DOMAIN, {"stanze": {}})
    stanze: dict[str, list[str]] = impostazioni.get("stanze", {})
    predefinita: str | None = impostazioni.get("predefinita")
    account: str | None = impostazioni.get("account")
    if predefinita and predefinita not in stanze:
        _LOGGER.error("jarvis_musica: la stanza predefinita «%s» non è tra le stanze configurate", predefinita)
        predefinita = None

    async def riproduci(chiamata: ServiceCall) -> ServiceResponse:
        try:
            esito = await _riproduci(
                hass,
                chiamata.data["cosa"].strip(),
                chiamata.data.get("dove"),
                chiamata.data["tipo"],
                stanze,
                predefinita,
                account,
            )
        except ErroreMusica as errore:
            _LOGGER.warning("jarvis_musica: %s (%s)", errore.messaggio, errore.codice)
            if not chiamata.return_response:
                raise HomeAssistantError(errore.messaggio) from errore
            return {"esito": "errore", "codice": errore.codice, "messaggio": errore.messaggio, **errore.dati}
        return esito if chiamata.return_response else None

    hass.services.async_register(
        DOMAIN,
        SERVIZIO_RIPRODUCI,
        riproduci,
        schema=SCHEMA_RIPRODUCI,
        supports_response=SupportsResponse.OPTIONAL,
    )
    return True


def _spotify(hass: HomeAssistant, account: str | None) -> Any:
    """Config entry di Spotify caricata (runtime_data = SpotifyData dell'integrazione)."""
    caricate = [e for e in hass.config_entries.async_entries("spotify") if e.state is ConfigEntryState.LOADED]
    if account:
        caricate = [e for e in caricate if e.title == account]
    if not caricate:
        raise ErroreMusica(
            "spotify_non_configurato",
            "Spotify non è collegato a Home Assistant"
            + (f" (account «{account}»)" if account else "")
            + ", oppure non è partito.",
        )
    return caricate[0]


async def _riproduci(
    hass: HomeAssistant,
    cosa: str,
    dove: str | None,
    tipo: str,
    stanze: dict[str, list[str]],
    predefinita: str | None,
    account: str | None,
) -> dict[str, Any]:
    voce = _spotify(hass, account)
    client = voce.runtime_data.coordinator.client
    try:
        dispositivi = await client.get_devices()
        stato = await client.get_playback()
        dispositivo, stanza = scegli_dispositivo(
            dove, dispositivi, stanze, predefinita, stato.device if stato and stato.is_playing else None
        )
        risultati = await client.search(cosa, tipi_di_ricerca(tipo), limit=RISULTATI_PER_TIPO)
        elenco = candidati(cosa, tipo, risultati)
        if not elenco:
            raise ErroreMusica("nessun_risultato", f"Su Spotify non trovo niente per «{cosa}».", cosa=cosa)
        provati: list[str] = []
        for candidato in elenco:
            provati.append(candidato.descrizione)
            if await _avvia(client, dispositivo.device_id, candidato):
                # il media_player di Spotify si aggiorna subito, non tra 30 s
                hass.async_create_task(voce.runtime_data.coordinator.async_request_refresh())
                dove_suona = stanza or dispositivo.name
                return {
                    "esito": "ok",
                    "messaggio": f"In riproduzione {candidato.descrizione} su {dispositivo.name}.",
                    "titolo": candidato.descrizione,
                    "tipo": candidato.tipo,
                    "uri": candidato.uri_atteso,
                    "dispositivo": dispositivo.name,
                    "stanza": dove_suona,
                }
            _LOGGER.warning(
                "jarvis_musica: niente in riproduzione dopo l'avvio di %s su %s", candidato.descrizione, dispositivo.name
            )
        raise ErroreMusica(
            "avvio_non_riuscito",
            f"Spotify ha accettato il comando ma su {dispositivo.name} non è partito niente.",
            dispositivo=dispositivo.name,
            provati=provati,
        )
    except ErroreMusica:
        raise
    except _SpotifyForbidden as errore:
        raise ErroreMusica(
            "non_consentito",
            "Spotify ha rifiutato il comando: serve Spotify Premium, oppure quel dispositivo non si comanda da remoto.",
        ) from errore
    except _SpotifyNotFound as errore:
        raise ErroreMusica(
            "dispositivo_non_disponibile",
            "Spotify non trova più il dispositivo: prova a riaccenderlo o a svegliarlo.",
        ) from errore
    except (_SpotifyConnection, TimeoutError) as errore:
        raise ErroreMusica("spotify_irraggiungibile", "Spotify non risponde, riprova tra poco.") from errore
    except (OAuth2TokenRequestReauthError, ConfigEntryAuthFailed) as errore:
        # rinnovo del token rifiutato: HA ha già aperto la richiesta di nuovo accesso
        raise ErroreMusica(
            "accesso_scaduto",
            "Il collegamento a Spotify è scaduto: va rifatto l'accesso nell'integrazione Spotify.",
        ) from errore
    except aiohttp.ClientError as errore:
        # rete, o server dei token momentaneamente giù (OAuth2TokenRequestTransientError)
        raise ErroreMusica("spotify_irraggiungibile", "Spotify non risponde, riprova tra poco.") from errore


async def _avvia(client: Any, device_id: str, candidato: Candidato) -> bool:
    """Avvia e controlla che parta davvero (vedi il commento in testa al file)."""
    if candidato.context_uri:
        await client.start_playback(device_id=device_id, context_uri=candidato.context_uri)
    else:
        await client.start_playback(device_id=device_id, uris=list(candidato.uris))
    tentativi = int(ATTESA_AVVIO_S / CONTROLLO_OGNI_S)
    for _ in range(tentativi):
        await asyncio.sleep(CONTROLLO_OGNI_S)
        if e_partito(await client.get_playback(), device_id, candidato):
            return True
    return False

