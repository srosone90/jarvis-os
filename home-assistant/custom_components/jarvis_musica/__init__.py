"""Jarvis · musica: far partire Spotify anche "dal silenzio", e comandarlo.

Perché esiste (verificato nel codice di HA 2026.9.3,
components/spotify/media_player.py): finché sull'account non c'è una
riproduzione attiva, il media_player di Spotify dichiara solo SELECT_SOURCE,
quindi `media_player.play_media` viene rifiutato e `select_source` da solo non
avvia niente. Questo componente riusa il client spotifyaio GIÀ autenticato
dall'integrazione Spotify (nessuna credenziale nuova, niente scraping né
cookie) e chiama direttamente l'API di Spotify.

Tre servizi:
- `riproduci(cosa, dove, tipo)`: ricerca e avvio sul dispositivo Spotify
  Connect della stanza;
- `controllo(azione, dove, livello)`: pausa, riprendi, successivo, precedente,
  volume, alza, abbassa, sposta;
- `stato()`: cosa suona adesso.
Controllo e stato leggono lo stato VERO da Spotify: il media_player di HA si
aggiorna ogni 30 s, e subito dopo un avvio Gemini lo vedeva ancora fermo
("non sta suonando nulla", provato sull'Echo il 30/09).

spotifyaio 2.0.2 solleva errore solo per 403, timeout e alcuni 404: gli altri
rifiuti di Spotify tornano in silenzio. Per questo ogni comando si CONTROLLA
rileggendo lo stato; un avvio che non parte passa al candidato successivo (al
massimo 3), poi lo si dice chiaramente. Dopo ogni comando riuscito il
media_player di HA si aggiorna subito, in background: aspettarlo costava ~10 s
di risposta (misurato sull'Echo il 30/09).

Configurazione (packages/jarvis_musica.yaml):

    jarvis_musica:
      predefinita: Soggiorno          # se non si dice dove e non suona niente
      stanze:
        Camera da letto: Echo Pop Camera     # nome del dispositivo in Spotify
        Soggiorno: [TV Samsung, Echo Pop Soggiorno]   # il primo che Spotify vede
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
import logging
import time
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
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

from .scelta import (
    AZIONI,
    TIPI,
    Candidato,
    ErroreMusica,
    candidati,
    candidato_da_uri,
    considerati,
    copertina,
    descrivi,
    e_partito,
    ha_identico,
    normalizza,
    query_filtrata,
    scegli_dispositivo,
    tipi_di_ricerca,
    volume_nuovo,
)

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
# Quanto aspettare che un dispositivo parta davvero (un Echo ci ha messo diversi secondi)
ATTESA_AVVIO_S = 8.0
# Quanto aspettare che pausa, volume, spostamento… risultino fatti
ATTESA_CONTROLLO_S = 5.0
CONTROLLO_OGNI_S = 0.5
# 10: con 5, cercando l'artista "Queen" Spotify non metteva Queen tra i primi (30/09)
RISULTATI_PER_TIPO = 10

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
SCHEMA_CONTROLLO = vol.Schema(
    {
        vol.Required("azione"): vol.In(AZIONI),
        vol.Optional("dove"): cv.string,
        vol.Optional("livello"): vol.All(vol.Coerce(int), vol.Range(min=0, max=100)),
    }
)


class _Impostazioni:
    # Ultima cosa suonata (dispositivo, contenuto, punto, volume): Spotify dopo
    # ~10 min di pausa torna "a riposo" e non sa più cosa riprendere (30/09).
    # Salvata su disco, così vale anche dopo un riavvio di HA.
    ultimo: dict[str, Any] | None = None
    archivio: Store[dict[str, Any]] | None = None

    def __init__(self, config: ConfigType) -> None:
        dati = config.get(DOMAIN, {"stanze": {}})
        self.stanze: dict[str, list[str]] = dati.get("stanze", {})
        self.predefinita: str | None = dati.get("predefinita")
        self.account: str | None = dati.get("account")
        if self.predefinita and self.predefinita not in self.stanze:
            _LOGGER.error(
                "jarvis_musica: la stanza predefinita «%s» non è tra le stanze configurate", self.predefinita
            )
            self.predefinita = None


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Registra i servizi riproduci, controllo, stato e playlist."""
    imp = _Impostazioni(config)
    imp.archivio = Store(hass, 1, f"{DOMAIN}.ultimo")
    imp.ultimo = await imp.archivio.async_load()

    def servizio(
        lavoro: Callable[[HomeAssistant, _Impostazioni, dict[str, Any]], Awaitable[dict[str, Any]]],
    ) -> Callable[[ServiceCall], Awaitable[ServiceResponse]]:
        """Errori → risposta {esito: errore} per Gemini, o eccezione leggibile se non si vuole risposta."""

        async def gestisci(chiamata: ServiceCall) -> ServiceResponse:
            try:
                esito = await _con_spotify(lavoro(hass, imp, dict(chiamata.data)))
            except ErroreMusica as errore:
                _LOGGER.warning("jarvis_musica: %s (%s)", errore.messaggio, errore.codice)
                if not chiamata.return_response:
                    raise HomeAssistantError(errore.messaggio) from errore
                return {"esito": "errore", "codice": errore.codice, "messaggio": errore.messaggio, **errore.dati}
            return esito if chiamata.return_response else None

        return gestisci

    for nome, lavoro, schema in (
        ("riproduci", _riproduci, SCHEMA_RIPRODUCI),
        ("controllo", _controllo, SCHEMA_CONTROLLO),
        ("stato", _stato, vol.Schema({})),
        ("playlist", _playlist, vol.Schema({})),
    ):
        hass.services.async_register(
            DOMAIN, nome, servizio(lavoro), schema=schema, supports_response=SupportsResponse.OPTIONAL
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


async def _con_spotify(lavoro: Awaitable[dict[str, Any]]) -> dict[str, Any]:
    """Traduce gli errori di spotifyaio e del rinnovo del token in ErroreMusica."""
    try:
        return await lavoro
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


async def _aspetta(client: Any, condizione: Callable[[Any], bool], secondi: float) -> Any | None:
    """Rilegge lo stato ogni 0,5 s finché la condizione è vera; None se non succede in tempo."""
    for _ in range(max(1, int(secondi / CONTROLLO_OGNI_S))):
        await asyncio.sleep(CONTROLLO_OGNI_S)
        stato = await client.get_playback()
        if condizione(stato):
            return stato
    return None


def _ms(da: float) -> int:
    return round((time.monotonic() - da) * 1000)


def _aggiorna_media_player(hass: HomeAssistant, voce: Any) -> None:
    """Il media_player di HA si aggiorna in background: aspettarlo costava ~10 s di risposta
    (il coordinator ha un suo lucchetto e rilegge anche la playlist; misurato il 30/09)."""
    hass.async_create_task(voce.runtime_data.coordinator.async_refresh(), f"{DOMAIN}: aggiorna Spotify")


def _ricorda(imp: _Impostazioni, stato: Any) -> None:
    """Si ricorda cosa suona (o era in pausa) per poterlo riprendere anche da "a riposo"."""
    if stato is None or stato.item is None or not stato.device.device_id:
        return
    imp.ultimo = {
        "dispositivo": stato.device.name,
        "contesto": stato.context.uri if stato.context is not None else None,
        "tipo_contesto": str(stato.context.context_type) if stato.context is not None else None,
        "elemento": stato.item.uri,
        "titolo": stato.item.name,
        "posizione_ms": stato.progress_ms or 0,
        "volume": stato.device.volume_percent,
    }
    if imp.archivio is not None:
        ultimo = dict(imp.ultimo)
        imp.archivio.async_delay_save(lambda: ultimo, 2)


async def _riproduci(hass: HomeAssistant, imp: _Impostazioni, dati: dict[str, Any]) -> dict[str, Any]:
    cosa: str = dati["cosa"].strip()
    tipo: str = dati["tipo"]
    voce = _spotify(hass, imp.account)
    client = voce.runtime_data.coordinator.client
    inizio = time.monotonic()
    # Tre richieste indipendenti: in parallelo, non in fila (sull'Echo vero l'avvio
    # intero è stato 6-12 s; qui se ne risparmiano due giri verso Spotify)
    # (return_exceptions: se una fallisce, gli errori delle altre non restano
    # "mai letti" nel log di HA; si rilancia il primo)
    diretto = candidato_da_uri(cosa)
    esiti = await asyncio.gather(
        client.get_devices(),
        client.get_playback(),
        _nessuna_ricerca() if diretto else client.search(cosa, tipi_di_ricerca(tipo), limit=RISULTATI_PER_TIPO),
        return_exceptions=True,
    )
    for esito in esiti:
        if isinstance(esito, BaseException):
            raise esito
    dispositivi, stato, risultati = esiti
    # nome esatto assente tra i risultati: seconda ricerca col filtro di campo
    if not diretto and not ha_identico(cosa, tipo, risultati) and (filtrata := query_filtrata(cosa, tipo)):
        altri = await client.search(filtrata, tipi_di_ricerca(tipo), limit=RISULTATI_PER_TIPO)
        if ha_identico(cosa, tipo, altri):
            risultati = altri
    dispositivo, stanza = scegli_dispositivo(
        dati.get("dove"),
        dispositivi,
        imp.stanze,
        imp.predefinita,
        stato.device if stato and stato.is_playing else None,
    )
    elenco = [diretto] if diretto else candidati(cosa, tipo, risultati)
    if not elenco:
        raise ErroreMusica("nessun_risultato", f"Su Spotify non trovo niente per «{cosa}».", cosa=cosa)
    ms_ricerca = _ms(inizio)
    provati: list[str] = []
    for candidato in elenco:
        provati.append(candidato.descrizione)
        avvio = time.monotonic()
        if (partito := await _avvia(client, dispositivo.device_id, candidato)) is not None:
            ms_avvio = _ms(avvio)
            _ricorda(imp, partito)
            _aggiorna_media_player(hass, voce)
            tempi = {"ricerca": ms_ricerca, "avvio": ms_avvio, "totale": _ms(inizio)}
            _LOGGER.info("jarvis_musica: %s su %s, tempi %s ms", candidato.descrizione, dispositivo.name, tempi)
            return {
                "esito": "ok",
                "messaggio": f"In riproduzione {candidato.descrizione} su {dispositivo.name}.",
                "titolo": candidato.descrizione,
                "tipo": candidato.tipo,
                "uri": candidato.uri_atteso,
                "dispositivo": dispositivo.name,
                "stanza": stanza or dispositivo.name,
                "considerati": [] if diretto else considerati(tipo, risultati),
                "tempi_ms": tempi,
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


async def _nessuna_ricerca() -> None:
    """Al posto della ricerca quando cosa è già un uri Spotify."""
    return None


async def _avvia(client: Any, device_id: str, candidato: Candidato) -> Any | None:
    """Avvia e controlla che parta davvero (vedi il commento in testa al file): lo stato, o None."""
    if candidato.context_uri:
        await client.start_playback(device_id=device_id, context_uri=candidato.context_uri)
    else:
        await client.start_playback(device_id=device_id, uris=list(candidato.uris))
    return await _aspetta(client, lambda s: e_partito(s, device_id, candidato), ATTESA_AVVIO_S)


async def _riprendi_da_riposo(hass: HomeAssistant, imp: _Impostazioni, client: Any, voce: Any) -> dict[str, Any]:
    """Spotify "a riposo" (nessuna riproduzione, nemmeno in pausa): si riparte dall'ultima cosa ricordata."""
    u = imp.ultimo
    if not u:
        raise ErroreMusica("niente_in_riproduzione", "Su Spotify non sta suonando niente, e non ricordo cosa riprendere.")
    inizio = time.monotonic()
    dispositivi = await client.get_devices()
    dispositivo = next((d for d in dispositivi if normalizza(d.name) == normalizza(u["dispositivo"])), None)
    if dispositivo is None or not dispositivo.device_id:
        raise ErroreMusica(
            "dispositivo_non_disponibile",
            f"Spotify non vede {u['dispositivo']} in questo momento (spento, scollegato o addormentato).",
            dispositivi_disponibili=sorted(d.name for d in dispositivi),
        )
    contesto, elemento = u.get("contesto"), u["elemento"]
    if contesto and u.get("tipo_contesto") in ("playlist", "album"):
        # scaletta: si riparte dallo stesso brano, allo stesso punto
        await client.start_playback(
            device_id=dispositivo.device_id, context_uri=contesto, uri_offset=elemento, position=u["posizione_ms"]
        )
        atteso = Candidato("contesto", u["titolo"], context_uri=contesto)
    elif contesto:
        # artista: Spotify non accetta un brano di partenza, riparte la sua scaletta
        await client.start_playback(device_id=dispositivo.device_id, context_uri=contesto)
        atteso = Candidato("contesto", u["titolo"], context_uri=contesto)
    else:
        await client.start_playback(device_id=dispositivo.device_id, uris=[elemento], position=u["posizione_ms"])
        atteso = Candidato("brano", u["titolo"], uris=(elemento,))
    ms_comando = _ms(inizio)
    dopo = await _aspetta(client, lambda s: e_partito(s, dispositivo.device_id, atteso), ATTESA_AVVIO_S)
    if dopo is None:
        raise ErroreMusica(
            "comando_non_confermato",
            f"Ho chiesto a Spotify di riprendere «{u['titolo']}» ma su {dispositivo.name} non è ripartito.",
            azione="riprendi",
        )
    _ricorda(imp, dopo)
    _aggiorna_media_player(hass, voce)
    tempi = {"comando": ms_comando, "conferma": _ms(inizio) - ms_comando, "totale": _ms(inizio)}
    return {
        "esito": "ok",
        "azione": "riprendi",
        **descrivi(dopo, imp.stanze),
        "messaggio": f"Riprendo «{u['titolo']}» su {dispositivo.name}.",
        "tempi_ms": tempi,
    }


async def _controllo(hass: HomeAssistant, imp: _Impostazioni, dati: dict[str, Any]) -> dict[str, Any]:
    azione: str = dati["azione"]
    voce = _spotify(hass, imp.account)
    client = voce.runtime_data.coordinator.client
    inizio = time.monotonic()
    stato = await client.get_playback()
    if stato is None or stato.item is None:
        if azione == "riprendi":
            return await _riprendi_da_riposo(hass, imp, client, voce)
        raise ErroreMusica("niente_in_riproduzione", "Su Spotify non sta suonando niente.")
    _ricorda(imp, stato)
    dispositivo = stato.device
    device_id = dispositivo.device_id

    fatto: Callable[[Any], bool]
    if azione == "pausa":
        if not stato.is_playing:
            return {"esito": "ok", **descrivi(stato, imp.stanze), "messaggio": "Era già in pausa."}
        await client.pause_playback(device_id)
        fatto = lambda s: s is not None and not s.is_playing  # noqa: E731
    elif azione == "riprendi":
        if stato.is_playing:
            return {"esito": "ok", **descrivi(stato, imp.stanze), "messaggio": "Sta già suonando."}
        # come il media_player di HA (async_media_play), sul dispositivo di adesso
        await client.start_playback(device_id=device_id)
        fatto = lambda s: s is not None and s.is_playing  # noqa: E731
    elif azione in ("successivo", "precedente"):
        prima = stato.item.uri
        if azione == "successivo":
            await client.next_track(device_id)
            fatto = lambda s: s is not None and s.item is not None and s.item.uri != prima  # noqa: E731
        else:
            await client.previous_track(device_id)
            # all'inizio della scaletta "precedente" riparte dallo stesso brano: va bene
            fatto = lambda s: (  # noqa: E731
                s is not None and s.item is not None and (s.item.uri != prima or (s.progress_ms or 0) < 5000)
            )
    elif azione in ("volume", "alza", "abbassa"):
        if not dispositivo.supports_volume:
            raise ErroreMusica(
                "volume_non_regolabile",
                f"Il volume di {dispositivo.name} non si regola da Spotify.",
                dispositivo=dispositivo.name,
            )
        obiettivo = volume_nuovo(dispositivo.volume_percent, azione, dati.get("livello"))
        await client.set_volume(obiettivo, device_id)
        fatto = lambda s: s is not None and abs(s.device.volume_percent - obiettivo) <= 1  # noqa: E731
    else:  # sposta
        dispositivi = await client.get_devices()
        destinazione, _stanza = scegli_dispositivo(dati.get("dove"), dispositivi, imp.stanze, None, None)
        if destinazione.device_id == device_id:
            return {"esito": "ok", **descrivi(stato, imp.stanze), "messaggio": f"Suona già su {destinazione.name}."}
        await client.transfer_playback(destinazione.device_id)
        fatto = lambda s: s is not None and s.device.device_id == destinazione.device_id  # noqa: E731

    ms_comando = _ms(inizio)
    dopo = await _aspetta(client, fatto, ATTESA_CONTROLLO_S)
    if dopo is None:
        raise ErroreMusica(
            "comando_non_confermato",
            f"Ho mandato «{azione}» a Spotify ma non risulta eseguito su {dispositivo.name}.",
            azione=azione,
        )
    ms_conferma = _ms(inizio) - ms_comando
    _ricorda(imp, dopo)
    _aggiorna_media_player(hass, voce)
    tempi = {"comando": ms_comando, "conferma": ms_conferma, "totale": _ms(inizio)}
    _LOGGER.info("jarvis_musica: %s su %s, tempi %s ms", azione, dispositivo.name, tempi)
    return {"esito": "ok", "azione": azione, **descrivi(dopo, imp.stanze), "tempi_ms": tempi}


async def _stato(hass: HomeAssistant, imp: _Impostazioni, _dati: dict[str, Any]) -> dict[str, Any]:
    voce = _spotify(hass, imp.account)
    stato = await voce.runtime_data.coordinator.client.get_playback()
    _ricorda(imp, stato)
    return {"esito": "ok", **descrivi(stato, imp.stanze)}



async def _playlist(hass: HomeAssistant, imp: _Impostazioni, _dati: dict[str, Any]) -> dict[str, Any]:
    """Le playlist dell'account (sue e seguite), per sceglierle con un tocco dal pannello.

    Per farne partire una: riproduci con cosa = il suo uri (spotify:playlist:...).
    """
    voce = _spotify(hass, imp.account)
    elenco = await voce.runtime_data.coordinator.client.get_playlists_for_current_user()
    return {
        "esito": "ok",
        "playlist": [
            {
                "nome": p.name,
                "uri": p.uri,
                "copertina": copertina(list(p.images or [])),
                "proprietario": getattr(p.owner, "display_name", None),
            }
            for p in elenco
        ],
    }
