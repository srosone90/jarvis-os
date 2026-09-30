"""Prova funzionale di jarvis_musica su un Home Assistant vero (2026.9.3).

Avvia HA con il componente custom_components/jarvis_musica e il pacchetto
packages/jarvis_musica.yaml (stanze sostituite con quelle di prova), e mette al
posto dell'integrazione Spotify una config entry caricata il cui client finge
l'API di Spotify. Gli oggetti restituiti sono costruiti con i MODELLI VERI di
spotifyaio 2.0.2 (from_dict), quindi un nome di campo sbagliato nel componente
fa fallire la prova.

Il client finto si comporta come Spotify con spotifyaio: start_playback non
dice mai se è partito davvero; certi contenuti "accettati" non partono (come le
playlist editoriali bloccate per le app nuove), e il componente deve accorgersene
rileggendo lo stato.

Uso (serve Python 3.14 con homeassistant==2026.9.3 e spotifyaio==2.0.2):
    python home-assistant/prove/prova_musica.py
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
import shutil
import sys
import tempfile
from types import SimpleNamespace
from typing import Any

from spotifyaio import Device, PlaybackState, SpotifyConnectionError, SpotifyForbiddenError
from spotifyaio.models import SearchResult
from yarl import URL

from homeassistant import bootstrap, config as conf_util, loader
from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError, OAuth2TokenRequestReauthError
from homeassistant.helpers.service import _SERVICES_SCHEMA  # noqa: PLC2701 - lo stesso usato da HA
from homeassistant.util.yaml import load_yaml_dict

SCHEMA_CONTROLLO_CAMPI = ("azione", "dove", "livello")
from aiohttp import RequestInfo
from multidict import CIMultiDict, CIMultiDictProxy

RADICE = Path(__file__).resolve().parent.parent
COMPONENTE = RADICE / "custom_components" / "jarvis_musica"
PACCHETTO = RADICE / "packages" / "jarvis_musica.yaml"

esiti: list[tuple[bool, str]] = []
errori_ha: list[str] = []


def verifica(condizione: bool, descrizione: str, dettaglio: object = "") -> None:
    esiti.append((condizione, descrizione))
    segno = "OK " if condizione else "KO "
    extra = f"  → {dettaglio}" if (dettaglio != "" and not condizione) else ""
    print(f"  {segno} {descrizione}{extra}")


class RaccogliErrori(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        # Solo ciò che riguarda la musica: le integrazioni di base senza librerie
        # installate qui (frontend, ffmpeg…) non c'entrano con la prova.
        testo = f"{record.name}: {record.getMessage()}"
        if record.levelno >= logging.ERROR and any(
            parola in testo for parola in ("jarvis_musica", "script", "packages", "spotify")
        ):
            errori_ha.append(testo)


# --- Catalogo e dispositivi, nel formato JSON dell'API di Spotify ---------------

def _url(tipo: str, ident: str) -> dict[str, Any]:
    return {"external_urls": {"spotify": f"https://open.spotify.com/{tipo}/{ident}"},
            "href": f"https://api.spotify.com/v1/{tipo}s/{ident}"}


def artista(ident: str, nome: str) -> dict[str, Any]:
    return {"id": ident, "name": nome, "uri": f"spotify:artist:{ident}", **_url("artist", ident)}


def album(ident: str, nome: str, di: dict[str, Any]) -> dict[str, Any]:
    return {"album_type": "album", "total_tracks": 5, "id": ident, "images": [], "name": nome,
            "release_date": "1959-08-17", "release_date_precision": "day",
            "uri": f"spotify:album:{ident}", "artists": [di], **_url("album", ident)}


def brano(ident: str, nome: str, di: dict[str, Any], in_album: dict[str, Any]) -> dict[str, Any]:
    return {"id": ident, "artists": [di], "disc_number": 1, "duration_ms": 300_000, "explicit": False,
            "name": nome, "is_local": False, "track_number": 1, "uri": f"spotify:track:{ident}",
            "type": "track", "album": in_album, **_url("track", ident)}


def playlist(ident: str, nome: str, di_spotify: bool) -> dict[str, Any]:
    proprietario = "spotify" if di_spotify else "salvatore"
    return {"collaborative": False, "description": "", "id": ident, "images": [], "name": nome,
            "owner": {"display_name": proprietario, "id": proprietario, "type": "user",
                      "uri": f"spotify:user:{proprietario}", **_url("user", proprietario)},
            "public": True, "type": "playlist", "uri": f"spotify:playlist:{ident}", **_url("playlist", ident)}


def dispositivo(ident: str, nome: str, tipo: str = "Speaker", ristretto: bool = False) -> dict[str, Any]:
    return {"id": ident, "is_active": False, "is_private_session": False, "is_restricted": ristretto,
            "name": nome, "type": tipo, "volume_percent": 40}


MILES = artista("miles", "Miles Davis")
KIND = album("kindofblue", "Kind of Blue", MILES)
SO_WHAT = brano("sowhat", "So What", MILES, KIND)
QUEEN = artista("queen", "Queen")
FREDDIE = artista("4M1Fp", "Freddie Mercury")
OPERA = album("opera", "A Night at the Opera", QUEEN)
BOHEMIAN = brano("bohemian", "Bohemian Rhapsody", QUEEN, OPERA)
LOVE = brano("love", "Love of My Life", QUEEN, OPERA)
JAZZ_EDITORIALE = playlist("37i9dQZF1DXjazz", "Jazz Classics", di_spotify=True)
JAZZ_SERA = playlist("jazzsera", "Jazz per la sera", di_spotify=False)

CATALOGO = {
    "artist": [MILES, QUEEN, FREDDIE],
    "track": [SO_WHAT, BOHEMIAN, LOVE],
    "album": [KIND, OPERA],
    "playlist": [JAZZ_EDITORIALE, JAZZ_SERA],
}
# Come Spotify vero il 30/09 sull'Echo: cercando l'artista "Queen" il primo
# risultato era Freddie Mercury
ORDINE_SPOTIFY = {"queen": {"artist": [FREDDIE, QUEEN]}}
# Contenuti che Spotify "accetta" in silenzio senza farli partire
NON_PARTONO = {JAZZ_EDITORIALE["uri"]}

# Al posto di packages/jarvis_musica_stanze.yaml (quello vero sta in esempi/)
STANZE_PROVA = """jarvis_musica:
  predefinita: Camera da letto
  stanze:
    Camera da letto: Echo Pop Camera
    Camera dei bambini: Echo Kids
    Soggiorno: [Echo Pop Soggiorno, TV Samsung]
"""


def _parole(testo: str) -> set[str]:
    return set(testo.lower().replace(",", " ").split())


class SpotifyFinto:
    """Il minimo di SpotifyClient (spotifyaio 2.0.2) che jarvis_musica usa."""

    def __init__(self) -> None:
        self.dispositivi = [
            dispositivo("dev-camera", "Echo Pop Camera"),
            dispositivo("dev-tv", "TV Samsung", "TV"),
            dispositivo("dev-telefono", "Telefono ristretto", "Smartphone", ristretto=True),
        ]
        self.stato: dict[str, Any] | None = None
        self.avvii: list[dict[str, Any]] = []
        self.errore: dict[str, Exception] = {}  # metodo → eccezione da sollevare
        self.nessuno_parte = False
        self.comandi: list[tuple[Any, ...]] = []
        self.ignora_comandi = False  # comando accettato ma mai eseguito

    def _forse_errore(self, metodo: str) -> None:
        if metodo in self.errore:
            raise self.errore[metodo]

    async def get_devices(self) -> list[Device]:
        self._forse_errore("get_devices")
        return [Device.from_dict(d) for d in self.dispositivi]

    async def get_playback(self) -> PlaybackState | None:
        self._forse_errore("get_playback")
        return PlaybackState.from_dict(self.stato) if self.stato else None

    async def search(self, query: str, types: list[str], *, limit: int = 5) -> SearchResult:
        self._forse_errore("search")
        cercate = _parole(query)
        risposta: dict[str, Any] = {}
        for tipo in types:
            if (forzati := ORDINE_SPOTIFY.get(query.lower(), {}).get(str(tipo))) is not None:
                risposta[f"{tipo}s"] = {"items": forzati[:limit]}
                continue
            trovati = []
            for voce in CATALOGO[str(tipo)]:
                testo = voce["name"] + " " + " ".join(a["name"] for a in voce.get("artists", []))
                if cercate & _parole(testo):
                    trovati.append(voce)
            risposta[f"{tipo}s"] = {"items": trovati[:limit]}
        return SearchResult.from_dict(risposta)

    async def start_playback(self, *, device_id: str | None = None, context_uri: str | None = None,
                             uris: list[str] | None = None, **_: Any) -> None:
        self._forse_errore("start_playback")
        self.avvii.append({"device_id": device_id, "context_uri": context_uri, "uris": uris})
        if not context_uri and not uris:  # "riprendi", come il media_player di HA
            if self.stato and not self.nessuno_parte:
                self.stato["is_playing"] = True
            return
        uri = context_uri or (uris or [None])[0]
        if self.nessuno_parte or uri in NON_PARTONO:
            return  # come l'API: nessun errore, ma non suona niente
        disp = next(d for d in self.dispositivi if d["id"] == device_id)
        voce = next((b for b in CATALOGO["track"] if uris and b["uri"] == uris[0]), SO_WHAT)
        contesto = None
        if context_uri:
            tipo = context_uri.split(":")[1]
            contesto = {"type": tipo, "uri": context_uri, **_url(tipo, context_uri.split(":")[2])}
        self.stato = {"device": {**disp, "is_active": True}, "shuffle_state": False, "repeat_state": "off",
                      "context": contesto, "progress_ms": 0, "is_playing": True, "item": voce,
                      "currently_playing_type": "track"}


    # --- comandi sulla riproduzione in corso (come l'API: nessuna conferma) ---
    def _comando(self, nome: str, *argomenti: Any) -> bool:
        self._forse_errore(nome)
        self.comandi.append((nome, *argomenti))
        return self.stato is not None and not self.ignora_comandi

    async def pause_playback(self, device_id: str | None = None) -> None:
        if self._comando("pause_playback", device_id):
            self.stato["is_playing"] = False

    async def next_track(self, device_id: str | None = None) -> None:
        if self._comando("next_track", device_id):
            brani = CATALOGO["track"]
            attuale = next(i for i, b in enumerate(brani) if b["uri"] == self.stato["item"]["uri"])
            self.stato["item"] = brani[(attuale + 1) % len(brani)]

    async def previous_track(self, device_id: str | None = None) -> None:
        if self._comando("previous_track", device_id):
            brani = CATALOGO["track"]
            attuale = next(i for i, b in enumerate(brani) if b["uri"] == self.stato["item"]["uri"])
            self.stato["item"] = brani[(attuale - 1) % len(brani)]

    async def set_volume(self, volume: int, device_id: str | None = None) -> None:
        if self._comando("set_volume", volume, device_id):
            self.stato["device"]["volume_percent"] = volume

    async def transfer_playback(self, device_id: str) -> None:
        if self._comando("transfer_playback", device_id):
            disp = next(d for d in self.dispositivi if d["id"] == device_id)
            self.stato["device"] = {**disp, "is_active": True, "volume_percent": 40}


def richiesta_finta() -> RequestInfo:
    return RequestInfo(URL("https://accounts.spotify.com/api/token"), "POST",
                       CIMultiDictProxy(CIMultiDict()), URL("https://accounts.spotify.com/api/token"))


# --- Avvio di HA --------------------------------------------------------------

def prepara_cartella() -> Path:
    cartella = Path(tempfile.mkdtemp(prefix="jarvis-musica-"))
    (cartella / "custom_components").mkdir()
    shutil.copytree(COMPONENTE, cartella / "custom_components" / "jarvis_musica")
    (cartella / "packages").mkdir()
    # il pacchetto degli script così com'è, più il file delle stanze di questa "casa"
    shutil.copy(PACCHETTO, cartella / "packages" / "jarvis_musica.yaml")
    (cartella / "packages" / "jarvis_musica_stanze.yaml").write_text(STANZE_PROVA)
    (cartella / "configuration.yaml").write_text(
        "homeassistant:\n  name: Prova musica\n  time_zone: Europe/Rome\n"
        "  packages: !include_dir_named packages\n"
    )
    return cartella


async def avvia(cartella: Path) -> HomeAssistant | None:
    hass = HomeAssistant(str(cartella))
    loader.async_setup(hass)
    hass.config.skip_pip = True
    configurazione = await conf_util.async_hass_config_yaml(hass)
    if await bootstrap.async_from_config_dict(configurazione, hass) is None:
        return None
    await hass.async_start()
    await hass.async_block_till_done()
    return hass


def collega_spotify(hass: HomeAssistant, client: SpotifyFinto) -> tuple[ConfigEntry, list[int]]:
    """Una config entry Spotify "caricata" con il client finto (come fa l'integrazione)."""
    aggiornamenti: list[int] = []

    async def async_refresh() -> None:
        # come HA dopo un comando Spotify: aggiornamento immediato e atteso
        aggiornamenti.append(1)

    voce = ConfigEntry(
        data={}, discovery_keys={}, domain="spotify", minor_version=1, options=None, source="user",
        state=ConfigEntryState.LOADED, subentries_data=None, title="Salvatore", unique_id="salvatore",
        version=1,
    )
    voce.runtime_data = SimpleNamespace(
        coordinator=SimpleNamespace(client=client, async_refresh=async_refresh)
    )
    hass.config_entries._entries[voce.entry_id] = voce  # noqa: SLF001 (solo nella prova)
    return voce, aggiornamenti


async def prova() -> int:
    logging.basicConfig(level=logging.WARNING)
    logging.getLogger().addHandler(RaccogliErrori())
    cartella = prepara_cartella()
    hass = await avvia(cartella)
    if hass is None:
        print("Home Assistant non è partito")
        return 1
    try:
        import custom_components.jarvis_musica as componente  # noqa: PLC0415

        componente.ATTESA_AVVIO_S = 1.0  # un Echo vero ha 8 s; qui basta 1 s per accorgersi del silenzio

        client = SpotifyFinto()
        voce, aggiornamenti = collega_spotify(hass, client)

        async def riproduci(**dati: Any) -> dict[str, Any]:
            return await hass.services.async_call(
                "jarvis_musica", "riproduci", dati, blocking=True, return_response=True
            )

        async def controllo(**dati: Any) -> dict[str, Any]:
            return await hass.services.async_call(
                "jarvis_musica", "controllo", dati, blocking=True, return_response=True
            )

        async def stato() -> dict[str, Any]:
            return await hass.services.async_call("jarvis_musica", "stato", {}, blocking=True, return_response=True)

        print("\n1. Il componente parte e il servizio c'è")
        # HA legge services.yaml solo quando qualcuno chiede le descrizioni
        # (interfaccia, Assist): senza file scriveva un errore a ogni avvio.
        # Stesso schema e stesso lettore di HA 2026.9.3 (async_get_all_descriptions
        # qui non si può usare: passa da tutte le integrazioni, e qui alcune di
        # base non hanno le loro librerie)
        try:
            descrizioni = _SERVICES_SCHEMA(load_yaml_dict(str(COMPONENTE / "services.yaml")))
        except Exception as errore:  # noqa: BLE001 - la prova lo riporta
            descrizioni = {"errore": str(errore)}
        verifica(set(descrizioni) == {"riproduci", "controllo", "stato"}
                 and descrizioni["riproduci"].get("name") == "Riproduci"
                 and set(descrizioni["controllo"]["fields"]) == set(SCHEMA_CONTROLLO_CAMPI),
                 "services.yaml valido per HA: i tre servizi con nomi e campi", descrizioni)
        verifica(hass.services.has_service("jarvis_musica", "riproduci"), "servizio jarvis_musica.riproduci")
        verifica(hass.services.has_service("script", "jarvis_musica"), "script.jarvis_musica dal pacchetto")
        verifica(all(hass.services.has_service("jarvis_musica", n) for n in ("controllo", "stato"))
                 and hass.services.has_service("script", "jarvis_musica_controllo")
                 and hass.services.has_service("script", "jarvis_musica_stato"),
                 "servizi e script di controllo e stato")

        print("\n2. Artista in una stanza, dal silenzio")
        r = await riproduci(cosa="Miles Davis", tipo="artista", dove="nella camera da letto")
        verifica(r.get("esito") == "ok", "esito ok", r)
        verifica(client.avvii[-1] == {"device_id": "dev-camera", "context_uri": "spotify:artist:miles", "uris": None},
                 "start_playback sull'Echo della camera con l'artista come contesto", client.avvii)
        verifica(r.get("stanza") == "Camera da letto" and r.get("dispositivo") == "Echo Pop Camera",
                 "risposta con stanza e dispositivo", r)
        verifica(r.get("messaggio") == "In riproduzione Miles Davis su Echo Pop Camera.",
                 "messaggio breve per Gemini", r.get("messaggio"))
        verifica(aggiornamenti == [1], "aggiorna subito il media_player Spotify (async_refresh, come HA)",
                 aggiornamenti)
        tempi = r.get("tempi_ms", {})
        verifica(set(tempi) == {"ricerca", "avvio", "totale"} and tempi["totale"] >= tempi["avvio"],
                 "nella risposta i tempi misurati (ricerca, avvio, totale)", tempi)

        print("\n3. Brano in automatico; la stanza usa il primo dispositivo che Spotify vede")
        client.stato = None
        r = await riproduci(cosa="Bohemian Rhapsody Queen", dove="soggiorno")
        verifica(r.get("esito") == "ok" and r.get("tipo") == "brano", "riconosce il brano", r)
        verifica(client.avvii[-1]["uris"] == ["spotify:track:bohemian"], "brano come uris", client.avvii[-1])
        verifica(r.get("dispositivo") == "TV Samsung",
                 "Echo Pop Soggiorno spento → TV Samsung, il secondo della stanza", r)

        print("\n4. Genere: la prima playlist non parte (in silenzio) → si prova la successiva")
        client.stato = None
        prima = len(client.avvii)
        r = await riproduci(cosa="jazz", tipo="genere", dove="camera da letto")
        verifica(r.get("esito") == "ok" and r.get("uri") == "spotify:playlist:jazzsera",
                 "suona la seconda playlist", r)
        verifica(len(client.avvii) - prima == 2, "due tentativi, controllati rileggendo lo stato",
                 client.avvii[prima:])

        print("\n5. Senza stanza: dove sta già suonando, altrimenti la predefinita")
        r = await riproduci(cosa="So What", tipo="brano")
        verifica(r.get("dispositivo") == "Echo Pop Camera", "resta dove suonava (Echo della camera)", r)
        client.stato = None
        r = await riproduci(cosa="Queen", tipo="artista", dove="")
        verifica(r.get("stanza") == "Camera da letto", "niente in riproduzione → stanza predefinita", r)

        print("\n5b. Il nome esatto vince sull'ordine di Spotify (Queen, non Freddie Mercury)")
        r = await riproduci(cosa="Queen", tipo="artista", dove="camera da letto")
        verifica(r.get("uri") == "spotify:artist:queen", "tipo artista: Queen", r)
        r = await riproduci(cosa="queen", dove="camera da letto")
        verifica(r.get("uri") == "spotify:artist:queen", "tipo auto, minuscolo: Queen", r)

        print("\n5c. Comandi e «cosa suona» letti da Spotify, non dal media_player di HA")
        client.stato = None
        await riproduci(cosa="Bohemian Rhapsody", tipo="brano", dove="camera da letto")
        r = await stato()
        verifica(r.get("stato") == "in_riproduzione"
                 and r.get("messaggio") == "In riproduzione «Bohemian Rhapsody» di Queen su Echo Pop Camera "
                 "(Camera da letto), volume 40%.",
                 "stato subito dopo l'avvio: suona, con titolo, stanza e volume", r)
        prima_agg = len(aggiornamenti)
        r = await controllo(azione="pausa")
        verifica(r.get("esito") == "ok" and r.get("stato") == "in_pausa", "pausa confermata", r)
        verifica(set(r.get("tempi_ms", {})) == {"comando", "conferma", "totale"},
                 "anche i comandi riportano i tempi misurati", r.get("tempi_ms"))
        verifica(len(aggiornamenti) == prima_agg + 1, "dopo il comando aggiorna subito il media_player", aggiornamenti)
        r = await controllo(azione="pausa")
        verifica(r.get("messaggio") == "Era già in pausa.", "pausa due volte: lo dice", r)
        r = await controllo(azione="riprendi")
        verifica(r.get("stato") == "in_riproduzione" and client.avvii[-1]["uris"] is None,
                 "riprendi (come il media_player di HA: start_playback senza contenuto)", r)
        r = await controllo(azione="successivo")
        verifica(r.get("titolo") == "Love of My Life", "successivo", r)
        r = await controllo(azione="precedente")
        verifica(r.get("titolo") == "Bohemian Rhapsody", "precedente", r)
        r = await controllo(azione="volume", livello=25)
        verifica(r.get("volume") == 25, "volume a 25", r)
        r = await controllo(azione="alza")
        verifica(r.get("volume") == 35, "alza di 10", r)
        r = await controllo(azione="abbassa")
        verifica(r.get("volume") == 25, "abbassa di 10", r)
        r = await controllo(azione="volume")
        verifica(r.get("codice") == "livello_mancante", "volume senza livello: chiede quanto", r)
        r = await controllo(azione="sposta", dove="soggiorno")
        verifica(r.get("dispositivo") == "TV Samsung" and r.get("stanza") == "Soggiorno"
                 and client.comandi[-1] == ("transfer_playback", "dev-tv"),
                 "sposta in soggiorno (primo dispositivo visibile della stanza)", r)
        r = await controllo(azione="sposta", dove="garage")
        verifica(r.get("codice") == "stanza_sconosciuta", "sposta in una stanza sconosciuta", r)
        client.ignora_comandi = True
        r = await controllo(azione="pausa")
        verifica(r.get("codice") == "comando_non_confermato",
                 "comando accettato ma mai eseguito: lo dice, non finge", r)
        client.ignora_comandi = False
        client.stato = None
        r = await stato()
        verifica(r.get("stato") == "niente" and r.get("messaggio") == "Su Spotify non sta suonando niente.",
                 "stato senza musica", r)
        r = await controllo(azione="pausa")
        verifica(r.get("codice") == "niente_in_riproduzione", "pausa senza musica: errore chiaro", r)

        print("\n6. Errori chiari, con un codice stabile")
        r = await riproduci(cosa="jazz", dove="camera")
        verifica(r.get("codice") == "stanza_ambigua" and "Camera da letto" in r.get("messaggio", ""),
                 "«camera» è ambigua: chiede quale", r)
        r = await riproduci(cosa="jazz", dove="garage")
        verifica(r.get("codice") == "stanza_sconosciuta" and "Soggiorno" in r.get("messaggio", ""),
                 "stanza sconosciuta: dice quelle che conosce", r)
        r = await riproduci(cosa="jazz", dove="camera dei bambini")
        verifica(r.get("codice") == "dispositivo_non_disponibile"
                 and "TV Samsung" in r.get("dispositivi_disponibili", []),
                 "dispositivo della stanza spento: lo dice ed elenca quelli visibili", r)
        r = await riproduci(cosa="jazz", dove="Telefono ristretto")
        verifica(r.get("codice") == "dispositivo_non_comandabile", "dispositivo che Spotify non comanda", r)
        r = await riproduci(cosa="zzzqqq", dove="camera da letto")
        verifica(r.get("codice") == "nessun_risultato" and "zzzqqq" in r.get("messaggio", ""),
                 "nessun risultato", r)
        client.nessuno_parte = True
        r = await riproduci(cosa="jazz", tipo="genere", dove="camera da letto")
        verifica(r.get("codice") == "avvio_non_riuscito"
                 and r.get("provati") == ["la playlist «Jazz Classics»", "la playlist «Jazz per la sera»"],
                 "accettato ma mai partito: errore dopo aver provato tutti i candidati", r)
        client.nessuno_parte = False
        client.errore["start_playback"] = SpotifyForbiddenError("Player command failed: Premium required")
        r = await riproduci(cosa="Miles Davis", tipo="artista", dove="camera da letto")
        verifica(r.get("codice") == "non_consentito" and "Premium" in r.get("messaggio", ""), "403 → Premium", r)
        client.errore = {"search": SpotifyConnectionError("Timeout occurred while connecting to Spotify")}
        r = await riproduci(cosa="Miles Davis", dove="camera da letto")
        verifica(r.get("codice") == "spotify_irraggiungibile", "Spotify irraggiungibile", r)
        client.errore = {"get_devices": OAuth2TokenRequestReauthError(
            domain="spotify", request_info=richiesta_finta(), status=400)}
        r = await riproduci(cosa="Miles Davis", dove="camera da letto")
        verifica(r.get("codice") == "accesso_scaduto", "token non rinnovabile → accesso da rifare", r)
        client.errore = {}

        print("\n7. Chiamato senza risposta (dal pannello): l'errore è un'eccezione leggibile")
        try:
            await hass.services.async_call("jarvis_musica", "riproduci", {"cosa": "jazz", "dove": "garage"},
                                           blocking=True)
            verifica(False, "doveva sollevare HomeAssistantError")
        except HomeAssistantError as errore:
            verifica("garage" in str(errore), "HomeAssistantError con il messaggio italiano", str(errore))

        print("\n8. Lo script per Assist restituisce l'esito a Gemini")
        client.stato = None
        r = await hass.services.async_call(
            "script", "jarvis_musica", {"cosa": "Miles Davis", "tipo": "artista", "dove": "camera da letto"},
            blocking=True, return_response=True,
        )
        verifica(r.get("esito") == "ok" and r.get("dispositivo") == "Echo Pop Camera", "script: esito ok", r)
        r = await hass.services.async_call(
            "script", "jarvis_musica", {"cosa": "Bohemian Rhapsody Queen", "tipo": "canzone", "dove": "soggiorno"},
            blocking=True, return_response=True,
        )
        verifica(r.get("esito") == "ok" and r.get("tipo") == "brano", "script: tipo sconosciuto → auto", r)
        r = await hass.services.async_call(
            "script", "jarvis_musica", {"cosa": "jazz", "dove": "garage"}, blocking=True, return_response=True,
        )
        verifica(r.get("esito") == "errore" and r.get("codice") == "stanza_sconosciuta",
                 "script: l'errore arriva a Gemini come dato, non come eccezione", r)

        await riproduci(cosa="Miles Davis", tipo="artista", dove="camera da letto")
        r = await hass.services.async_call("script", "jarvis_musica_stato", {}, blocking=True, return_response=True)
        verifica(r.get("stato") == "in_riproduzione" and r.get("titolo") == "So What", "script dello stato", r)
        r = await hass.services.async_call("script", "jarvis_musica_controllo", {"azione": "volume", "livello": 60},
                                           blocking=True, return_response=True)
        verifica(r.get("volume") == 60, "script dei comandi con livello", r)
        r = await hass.services.async_call("script", "jarvis_musica_controllo", {"azione": "pausa"},
                                           blocking=True, return_response=True)
        verifica(r.get("stato") == "in_pausa", "script dei comandi senza dove né livello", r)
        r = await hass.services.async_call("script", "jarvis_musica_controllo",
                                           {"azione": "sposta", "dove": "soggiorno"},
                                           blocking=True, return_response=True)
        verifica(r.get("dispositivo") == "TV Samsung", "script dei comandi: sposta con dove", r)

        print("\n9. Spotify non collegato")
        del hass.config_entries._entries[voce.entry_id]  # noqa: SLF001
        r = await riproduci(cosa="jazz", dove="camera da letto")
        verifica(r.get("codice") == "spotify_non_configurato", "lo dice invece di cadere", r)
    finally:
        await hass.async_stop(force=True)
        shutil.rmtree(cartella, ignore_errors=True)

    print("\n10. Nessun errore di Home Assistant durante le prove")
    verifica(not errori_ha, "log senza errori", errori_ha)

    falliti = [d for ok, d in esiti if not ok]
    print(f"\n{len(esiti) - len(falliti)}/{len(esiti)} verifiche passate")
    return 1 if falliti else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(prova()))
