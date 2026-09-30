"""Logica pura di jarvis_musica: quale stanza, quale dispositivo, quale risultato.

Niente Home Assistant e niente rete qui dentro: si prova da sola. Lavora sui
modelli di spotifyaio solo tramite gli attributi (name, uri, artists, owner,
device_id, is_restricted), così resta leggibile anche senza la libreria.
"""

from __future__ import annotations

from dataclasses import dataclass
import re
import unicodedata
from typing import Any

TIPI = ("auto", "brano", "artista", "album", "playlist", "genere")

# Parole che Gemini (o una persona) mette davanti al nome della stanza
_ARTICOLI = re.compile(r"^(in|nel|nella|nello|nei|nelle|sul|sulla|sullo|al|alla|allo|la|il|lo|l)\s+")


def normalizza(testo: str) -> str:
    """Minuscole, senza accenti né punteggiatura, spazi singoli."""
    senza_accenti = "".join(
        c for c in unicodedata.normalize("NFKD", testo) if not unicodedata.combining(c)
    )
    pulito = re.sub(r"[^\w\s]", " ", senza_accenti.casefold())
    return re.sub(r"\s+", " ", pulito).strip()


def _senza_articoli(testo: str) -> str:
    precedente = None
    while precedente != testo:
        precedente = testo
        testo = _ARTICOLI.sub("", testo)
    return testo


class ErroreMusica(Exception):
    """Errore con un codice stabile e un messaggio breve in italiano per Gemini."""

    def __init__(self, codice: str, messaggio: str, **dati: Any) -> None:
        super().__init__(messaggio)
        self.codice = codice
        self.messaggio = messaggio
        self.dati = dati


def trova_stanza(dove: str, stanze: dict[str, list[str]]) -> str | None:
    """Stanza configurata che corrisponde a `dove`: prima esatta, poi parziale se unica.

    "camera" → "Camera da letto" se è l'unica stanza che la contiene; se sono due
    ("Camera da letto" e "Camera dei bambini") è ambigua e si chiede.
    """
    cercata = _senza_articoli(normalizza(dove))
    if not cercata:
        return None
    per_nome = {normalizza(nome): nome for nome in stanze}
    if cercata in per_nome:
        return per_nome[cercata]
    parziali = [
        nome
        for chiave, nome in per_nome.items()
        if re.search(rf"\b{re.escape(cercata)}\b", chiave) or re.search(rf"\b{re.escape(chiave)}\b", cercata)
    ]
    if len(parziali) == 1:
        return parziali[0]
    if len(parziali) > 1:
        raise ErroreMusica(
            "stanza_ambigua",
            f"«{dove}» può voler dire {', '.join(sorted(parziali))}: quale?",
            stanze=sorted(parziali),
        )
    return None


def _utilizzabile(dispositivo: Any) -> bool:
    return bool(dispositivo.device_id) and not dispositivo.is_restricted


def scegli_dispositivo(
    dove: str | None,
    dispositivi: list[Any],
    stanze: dict[str, list[str]],
    predefinita: str | None,
    attivo: Any | None,
) -> tuple[Any, str | None]:
    """(dispositivo Spotify Connect, stanza) su cui suonare.

    - `dove` detto: stanza configurata → il primo dei suoi dispositivi che Spotify
      vede adesso; altrimenti `dove` può essere direttamente il nome di un
      dispositivo Spotify ("Echo Pop di Salvatore").
    - `dove` non detto: il dispositivo che sta già suonando, poi la stanza
      predefinita.
    """
    per_nome = {normalizza(d.name): d for d in dispositivi}
    disponibili = sorted(d.name for d in dispositivi)

    def da_stanza(stanza: str) -> tuple[Any, str]:
        for nome in stanze[stanza]:
            dispositivo = per_nome.get(normalizza(nome))
            if dispositivo is not None:
                if not _utilizzabile(dispositivo):
                    raise ErroreMusica(
                        "dispositivo_non_comandabile",
                        f"{dispositivo.name} non accetta comandi da remoto da Spotify.",
                        dispositivo=dispositivo.name,
                    )
                return dispositivo, stanza
        raise ErroreMusica(
            "dispositivo_non_disponibile",
            f"In {stanza} Spotify non vede {' né '.join(stanze[stanza])} in questo momento"
            " (spento, scollegato o addormentato).",
            stanza=stanza,
            dispositivi_disponibili=disponibili,
        )

    if dove and dove.strip():
        stanza = trova_stanza(dove, stanze)
        if stanza is not None:
            return da_stanza(stanza)
        dispositivo = per_nome.get(_senza_articoli(normalizza(dove)))
        if dispositivo is not None:
            if not _utilizzabile(dispositivo):
                raise ErroreMusica(
                    "dispositivo_non_comandabile",
                    f"{dispositivo.name} non accetta comandi da remoto da Spotify.",
                    dispositivo=dispositivo.name,
                )
            return dispositivo, None
        raise ErroreMusica(
            "stanza_sconosciuta",
            f"Non so dove sia «{dove}». Stanze con la musica: {', '.join(sorted(stanze)) or 'nessuna configurata'}.",
            stanze=sorted(stanze),
            dispositivi_disponibili=disponibili,
        )
    if attivo is not None and _utilizzabile(attivo):
        stanza = next(
            (s for s, nomi in stanze.items() if normalizza(attivo.name) in {normalizza(n) for n in nomi}),
            None,
        )
        return attivo, stanza
    if predefinita:
        return da_stanza(predefinita)
    raise ErroreMusica(
        "stanza_mancante",
        "In quale stanza?",
        stanze=sorted(stanze),
    )


@dataclass(frozen=True)
class Candidato:
    """Cosa far partire: un contesto (artista, album, playlist) o dei brani."""

    tipo: str  # brano | artista | album | playlist | brani
    descrizione: str
    context_uri: str | None = None
    uris: tuple[str, ...] = ()

    @property
    def uri_atteso(self) -> str:
        return self.context_uri or self.uris[0]


def _artisti(elemento: Any) -> str:
    return ", ".join(a.name for a in getattr(elemento, "artists", [])[:2])


def _brano(t: Any) -> Candidato:
    return Candidato("brano", f"«{t.name}» di {_artisti(t)}", uris=(t.uri,))


def _artista(a: Any) -> Candidato:
    return Candidato("artista", a.name, context_uri=a.uri)


def _album(a: Any) -> Candidato:
    return Candidato("album", f"l'album «{a.name}» di {_artisti(a)}", context_uri=a.uri)


def _playlist(p: Any) -> Candidato:
    return Candidato("playlist", f"la playlist «{p.name}»", context_uri=p.uri)


def tipi_di_ricerca(tipo: str) -> list[str]:
    """Tipi da chiedere a Spotify (valori di spotifyaio.SearchType)."""
    return {
        "brano": ["track"],
        "artista": ["artist"],
        "album": ["album"],
        "playlist": ["playlist"],
        "genere": ["playlist", "track"],
    }.get(tipo, ["artist", "track", "album", "playlist"])


def candidati(cosa: str, tipo: str, risultati: Any, massimo: int = 3) -> list[Candidato]:
    """Candidati in ordine di preferenza, senza doppioni.

    - tipo esplicito: prima i nomi IDENTICI (normalizzati), poi il resto
      nell'ordine di rilevanza di Spotify. Serve: cercando l'artista "Queen"
      Spotify ha messo davanti Freddie Mercury (provato sull'Echo il 30/09). La
      popolarità non c'è: nella ricerca spotifyaio restituisce gli artisti
      senza quel campo;
    - genere: le playlist, poi i brani del genere tutti insieme;
    - auto: un nome identico vince (artista, poi brano, poi album, poi
      playlist), altrimenti il primo brano, poi la prima playlist.
    """
    cercato = normalizza(cosa)

    def identici_prima(elementi: list[Any], nomi: Any) -> list[Any]:
        uguali = [e for e in elementi if cercato in nomi(e)]
        return uguali + [e for e in elementi if e not in uguali]

    def nome_brano(t: Any) -> set[str]:
        return {normalizza(t.name), normalizza(f"{t.name} {_artisti(t)}")}

    def nome_semplice(e: Any) -> set[str]:
        return {normalizza(e.name)}
    brani = list(risultati.tracks or [])
    artisti = list(risultati.artists or [])
    album = list(risultati.albums or [])
    playlist = list(risultati.playlists or [])
    elenco: list[Candidato] = []
    if tipo == "brano":
        elenco = [_brano(t) for t in identici_prima(brani, nome_brano)]
    elif tipo == "artista":
        elenco = [_artista(a) for a in identici_prima(artisti, nome_semplice)]
    elif tipo == "album":
        elenco = [_album(a) for a in identici_prima(album, nome_semplice)]
    elif tipo == "playlist":
        elenco = [_playlist(p) for p in identici_prima(playlist, nome_semplice)]
    elif tipo == "genere":
        elenco = [_playlist(p) for p in identici_prima(playlist, nome_semplice)]
        if brani:
            elenco.append(Candidato("brani", f"brani {cosa}", uris=tuple(t.uri for t in brani)))
    else:
        identici = (
            [_artista(a) for a in artisti if normalizza(a.name) == cercato]
            + [_brano(t) for t in brani if cercato in nome_brano(t)]
            + [_album(a) for a in album if normalizza(a.name) == cercato]
            + [_playlist(p) for p in playlist if normalizza(p.name) == cercato]
        )
        elenco = identici + [_brano(t) for t in brani[:1]] + [_playlist(p) for p in playlist[:1]]
    unici: list[Candidato] = []
    for c in elenco:
        if c.uri_atteso not in {u.uri_atteso for u in unici}:
            unici.append(c)
    return unici[:massimo]


def e_partito(stato: Any, device_id: str, candidato: Candidato) -> bool:
    """Lo stato di Spotify conferma che suona QUEL contenuto su QUEL dispositivo?"""
    if stato is None or not stato.is_playing or stato.device.device_id != device_id:
        return False
    if candidato.context_uri:
        return stato.context is not None and stato.context.uri == candidato.context_uri
    return stato.item is not None and stato.item.uri in candidato.uris


# --- Controllo e stato (letti sempre freschi da Spotify) -----------------------

AZIONI = ("pausa", "riprendi", "successivo", "precedente", "volume", "alza", "abbassa", "sposta")
PASSO_VOLUME = 10


def volume_nuovo(attuale: int, azione: str, livello: int | None) -> int:
    """Volume da impostare (0-100). "alza"/"abbassa" di 10 punti."""
    if azione == "alza":
        return min(100, attuale + PASSO_VOLUME)
    if azione == "abbassa":
        return max(0, attuale - PASSO_VOLUME)
    if livello is None:
        raise ErroreMusica("livello_mancante", "A che volume? Dimmi un numero da 0 a 100.")
    return max(0, min(100, int(livello)))


def stanza_di(nome_dispositivo: str, stanze: dict[str, list[str]]) -> str | None:
    cercato = normalizza(nome_dispositivo)
    return next((s for s, nomi in stanze.items() if cercato in {normalizza(n) for n in nomi}), None)


def descrivi(stato: Any, stanze: dict[str, list[str]]) -> dict[str, Any]:
    """Cosa suona adesso, per Gemini: dati e una frase breve."""
    if stato is None or stato.item is None:
        return {"stato": "niente", "messaggio": "Su Spotify non sta suonando niente."}
    elemento = stato.item
    artisti = _artisti(elemento)
    titolo = f"«{elemento.name}»" + (f" di {artisti}" if artisti else "")
    dispositivo = stato.device.name
    stanza = stanza_di(dispositivo, stanze)
    dove = f"{dispositivo}" + (f" ({stanza})" if stanza else "")
    volume = stato.device.volume_percent
    if stato.is_playing:
        messaggio = f"In riproduzione {titolo} su {dove}, volume {volume}%."
    else:
        messaggio = f"In pausa: {titolo} su {dove}."
    return {
        "stato": "in_riproduzione" if stato.is_playing else "in_pausa",
        "messaggio": messaggio,
        "titolo": elemento.name,
        "artisti": artisti,
        "dispositivo": dispositivo,
        "stanza": stanza,
        "volume": volume,
    }
