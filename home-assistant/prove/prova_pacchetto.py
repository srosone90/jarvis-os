"""Prova funzionale del pacchetto packages/jarvis.yaml su un Home Assistant vero.

Avvia HA in una cartella temporanea con il pacchetto, sostituisce i dispositivi
reali con entità finte che hanno GLI STESSI entity_id di casa di Salvatore,
registra servizi finti (switch, clima, TV, notifiche) che annotano ogni
chiamata, e fa vivere al pacchetto una settimana di ottobre spostando
l'orologio dei template.

Uso (serve un Python 3.13 con `homeassistant` installato):
    python home-assistant/prove/prova_pacchetto.py

Esce con codice 0 se tutte le verifiche passano, 1 altrimenti.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import logging
import math
import shutil
import sys
import tempfile
from pathlib import Path
from zoneinfo import ZoneInfo

import voluptuous as vol

from homeassistant import bootstrap, config as conf_util, loader
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.helpers import config_validation as cv
from homeassistant.util import dt as dt_util

PACCHETTO = Path(__file__).resolve().parent.parent / "packages" / "jarvis.yaml"
MACRO = Path(__file__).resolve().parent.parent / "custom_templates" / "jarvis.jinja"
ROMA = ZoneInfo("Europe/Rome")

# --- Orologio finto per i template (now()) --------------------------------------
# Si sposta solo l'ora vista dai template: timer e loop restano sul tempo reale.
_ORA: list[dt.datetime | None] = [None]
_now_reale = dt_util.now


def _now_finto(time_zone: dt.tzinfo | None = None) -> dt.datetime:
    if _ORA[0] is None:
        return _now_reale(time_zone)
    return _ORA[0].astimezone(time_zone or dt_util.get_default_time_zone())


dt_util.now = _now_finto

# --- Registro delle verifiche ---------------------------------------------------
esiti: list[tuple[bool, str]] = []


def verifica(condizione: bool, descrizione: str, dettaglio: object = "") -> None:
    esiti.append((condizione, descrizione))
    segno = "OK " if condizione else "KO "
    extra = f"  → {dettaglio}" if (dettaglio != "" and not condizione) else ""
    print(f"  {segno} {descrizione}{extra}")


def percepita(t: float, ur: float) -> float:
    """Stessa formula del pacchetto (Steadman senza vento), per confronto."""
    vap = ur / 100 * 6.105 * math.exp(17.27 * t / (237.7 + t))
    return round(t + 0.33 * vap - 4.0, 1)


class Banco:
    """Home Assistant avviato con il pacchetto e i dispositivi finti."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.chiamate: list[tuple[str, str, dict]] = []
        self.eventi_buonanotte = 0

    # ----- servizi finti ---------------------------------------------------------
    async def registra_servizi(self) -> None:
        hass = self.hass

        async def annota(call: ServiceCall) -> None:
            dati = dict(call.data)
            self.chiamate.append((call.domain, call.service, dati))
            ids = dati.get("entity_id", [])
            if isinstance(ids, str):
                ids = [ids]
            for eid in ids:
                vecchio = hass.states.get(eid)
                attr = dict(vecchio.attributes) if vecchio else {}
                if call.domain == "switch":
                    hass.states.async_set(eid, "on" if call.service == "turn_on" else "off", attr)
                elif call.domain == "media_player" and call.service == "turn_off":
                    hass.states.async_set(eid, "off", attr)
                elif call.domain == "climate" and call.service == "turn_off":
                    hass.states.async_set(eid, "off", attr)
                elif call.domain == "climate" and call.service == "set_hvac_mode":
                    hass.states.async_set(eid, dati["hvac_mode"], attr)
                elif call.domain == "climate" and call.service == "set_temperature":
                    attr["temperature"] = dati["temperature"]
                    hass.states.async_set(eid, vecchio.state if vecchio else "off", attr)

        for dominio, servizio in [
            ("switch", "turn_on"),
            ("switch", "turn_off"),
            ("media_player", "turn_off"),
            ("climate", "turn_off"),
            ("climate", "set_hvac_mode"),
            ("climate", "set_temperature"),
            ("notify", "mobile_app_xiaomi_salvo"),
            ("logbook", "log"),
        ]:
            hass.services.async_register(dominio, servizio, annota)

        # weather.get_forecasts risponde come HA: {entity_id: {"forecast": [...]}}
        self.richieste_previsioni: list[str] = []

        async def previsioni(call: ServiceCall) -> ServiceResponse:
            tipo = call.data["type"]
            self.richieste_previsioni.append(tipo)
            quante = 10 if tipo == "daily" else 24
            return {
                eid: {
                    "forecast": [
                        {"datetime": f"passo-{i}", "condition": "rainy", "temperature": 20 + i, "templow": 12}
                        for i in range(quante)
                    ]
                }
                for eid in call.data["entity_id"]
            }

        hass.services.async_register(
            "weather",
            "get_forecasts",
            previsioni,
            schema=vol.Schema({vol.Required("entity_id"): cv.entity_ids, vol.Required("type"): str}),
            supports_response=SupportsResponse.ONLY,
        )

        def conta_buonanotte(_evento) -> None:
            self.eventi_buonanotte += 1

        hass.bus.async_listen("jarvis_buonanotte", conta_buonanotte)

    # ----- stato iniziale: i valori veri dell'elenco del 26/09 -------------------
    def stati_iniziali(self) -> None:
        s = self.hass.states.async_set
        s("sensor.meter_salone_temperatura", "25.7")
        s("sensor.meter_salone_umidita", "44")
        s("sensor.meter_salone_batteria", "100")
        s("sensor.meter_letto_temperatura", "25.1")
        s("sensor.meter_letto_umidita", "43")
        s("sensor.meter_letto_batteria", "100")
        s("sensor.scaldabagno_batteria", "100")
        s("switch.scaldabagno", "off", {"friendly_name": "scaldabagno"})
        s("climate.condizionatore", "fan_only", {"friendly_name": "Condizionatore"})
        s("media_player.soggiorno_tv_salotto", "on", {"friendly_name": "TV Salotto"})
        s("switch.tv_camera_da_letto", "unknown")
        s("weather.forecast_casa", "cloudy", {"cloud_coverage": 95})
        s("sun.sun", "above_horizon")
        s("device_tracker.xiaomi_salvo", "home")

    # ----- utilità ---------------------------------------------------------------
    def stato(self, eid: str) -> str:
        st = self.hass.states.get(eid)
        return st.state if st else "ASSENTE"

    def azzera_chiamate(self) -> None:
        self.chiamate.clear()

    def chiamate_di(self, dominio: str, servizio: str | None = None) -> list[dict]:
        return [d for (dom, srv, d) in self.chiamate if dom == dominio and (servizio is None or srv == servizio)]

    def automazione(self, id_: str) -> str:
        for st in self.hass.states.async_all("automation"):
            if st.attributes.get("id") == id_:
                return st.entity_id
        raise KeyError(f"automazione {id_} non trovata")

    async def attendi(self) -> None:
        # I template si ridisegnano con un timer a ritardo zero, che
        # async_block_till_done non aspetta: si fa girare il loop un attimo.
        await self.hass.async_block_till_done()
        await asyncio.sleep(0.05)
        await self.hass.async_block_till_done()

    async def aggiorna_template(self) -> None:
        for eid in (
            "sensor.jarvis_copertura_nuvolosa",
            "sensor.jarvis_temperatura_percepita_camera",
            "sensor.jarvis_temperatura_percepita_soggiorno",
            "binary_sensor.jarvis_scaldabagno_modalita_inverno",
            "binary_sensor.jarvis_scaldabagno_programma",
            "sensor.jarvis_scaldabagno_prossimo_cambio",
        ):
            await self.hass.services.async_call(
                "homeassistant", "update_entity", {"entity_id": eid}, blocking=True
            )
            await self.attendi()

    async def ora(self, anno: int, mese: int, giorno: int, h: int, m: int) -> None:
        _ORA[0] = dt.datetime(anno, mese, giorno, h, m, tzinfo=ROMA)
        await self.aggiorna_template()

    async def scatena(self, id_: str) -> None:
        await self.hass.services.async_call(
            "automation", "trigger",
            {"entity_id": self.automazione(id_), "skip_condition": False},
            blocking=True,
        )
        await self.attendi()

    async def giornata(self, copertura: float, campioni: int) -> None:
        """Simula una giornata: N campioni con quella copertura, poi il tramonto."""
        self.hass.states.async_set("weather.forecast_casa", "cloudy", {"cloud_coverage": copertura})
        await self.attendi()
        await self.aggiorna_template()
        await self.scatena("jarvis_nuvole_azzera_alba")
        for _ in range(campioni):
            await self.scatena("jarvis_nuvole_campione")
        await self.scatena("jarvis_nuvole_bilancio")

    async def avanza_timer(self, secondi: float) -> None:
        """Esegue subito i timer programmati entro `secondi` (per i trigger con `for:`)."""
        loop = self.hass.loop
        limite = loop.time() + secondi
        for h in list(loop._scheduled):  # noqa: SLF001 — stesso trucco dei test di HA
            if not h.cancelled() and h.when() <= limite:
                h._run()  # noqa: SLF001
                h.cancel()
        await self.attendi()

    async def esegui_script(self, nome: str, dati: dict | None = None) -> None:
        await self.hass.services.async_call("script", nome, dati or {}, blocking=True)
        await self.attendi()


# Errori di HA (automazioni che falliscono, template rotti) = prova fallita
errori_ha: list[str] = []


class _Raccogli(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        # L'interfaccia web non è installata nel banco di prova: il suo
        # errore di avvio è atteso e non riguarda il pacchetto.
        if record.levelno >= logging.ERROR and "hass_frontend" not in record.getMessage():
            errori_ha.append(record.getMessage()[:300])


logging.basicConfig(level=logging.WARNING, format="    [HA] %(levelname)s %(name)s: %(message)s")
logging.getLogger("homeassistant").addHandler(_Raccogli())

# Valori di partenza che l'amministratore imposta una volta sola dopo
# l'installazione (vedi home-assistant/README.md, "Valori di partenza").
VALORI_PARTENZA = {
    "input_number.jarvis_soglia_nuvole": 90,
    "input_number.jarvis_clima_soglia_caldo": 26,
    "input_number.jarvis_clima_temp_raffresca": 24,
    "input_number.jarvis_clima_soglia_freddo": 18,
    "input_number.jarvis_clima_temp_riscalda": 21,
}


def prepara_cartella() -> Path:
    cartella = Path(tempfile.mkdtemp(prefix="jarvis-ha-"))
    (cartella / "packages").mkdir()
    shutil.copy(PACCHETTO, cartella / "packages" / "jarvis.yaml")
    (cartella / "custom_templates").mkdir()
    shutil.copy(MACRO, cartella / "custom_templates" / "jarvis.jinja")
    (cartella / "configuration.yaml").write_text(
        "homeassistant:\n"
        "  name: Prova Jarvis\n"
        "  latitude: 38.19\n"
        "  longitude: 13.24\n"
        "  elevation: 0\n"
        "  unit_system: metric\n"
        "  time_zone: Europe/Rome\n"
        "  packages: !include_dir_named packages\n"
    )
    return cartella


async def avvia(cartella: Path) -> Banco | None:
    """Avvio "nudo": solo il pacchetto e le integrazioni di base, senza
    interfaccia web (non installata qui e non serve alla prova). Sulla stessa
    cartella, un secondo avvio è un riavvio vero: ripristina lo stato salvato."""
    hass = HomeAssistant(str(cartella))
    loader.async_setup(hass)
    hass.config.skip_pip = True
    configurazione = await conf_util.async_hass_config_yaml(hass)
    if await bootstrap.async_from_config_dict(configurazione, hass) is None:
        print("Home Assistant non è partito")
        return None
    b = Banco(hass)
    await b.registra_servizi()
    b.stati_iniziali()
    await hass.async_start()
    await b.attendi()
    return b


async def imposta_numeri(b: Banco, valori: dict[str, float]) -> None:
    for eid, valore in valori.items():
        await b.hass.services.async_call(
            "input_number", "set_value", {"entity_id": eid, "value": valore}, blocking=True
        )
    await b.attendi()


async def prova_riavvio() -> None:
    """Le regolazioni fatte dal pannello devono sopravvivere a un riavvio di HA
    (blackout, guardiano): il server si riavvia spesso."""
    print("\n16. Riavvio di Home Assistant: le regolazioni restano")
    cartella = prepara_cartella()
    try:
        b = await avvia(cartella)
        assert b is not None
        regolati = {
            "input_number.jarvis_soglia_nuvole": 85,
            "input_number.jarvis_clima_soglia_caldo": 27.5,
            "input_number.jarvis_clima_temp_raffresca": 23,
            "input_number.jarvis_clima_soglia_freddo": 17,
            "input_number.jarvis_clima_temp_riscalda": 22,
        }
        await imposta_numeri(b, regolati)
        await b.hass.services.async_call(
            "counter", "set_value", {"entity_id": "counter.jarvis_giorni_nuvolosi", "value": 3}, blocking=True
        )
        await b.attendi()
        await b.hass.async_stop()

        b = await avvia(cartella)
        assert b is not None
        for eid, valore in regolati.items():
            verifica(b.stato(eid) == str(float(valore)), f"{eid} resta {valore} dopo il riavvio", b.stato(eid))
        verifica(b.stato("counter.jarvis_giorni_nuvolosi") == "3", "contatore giornate nuvolose resta 3",
                 b.stato("counter.jarvis_giorni_nuvolosi"))
        await b.hass.async_stop()
    finally:
        shutil.rmtree(cartella, ignore_errors=True)


async def prova() -> int:
    cartella = prepara_cartella()
    b = await avvia(cartella)
    if b is None:
        return 1
    hass = b.hass

    try:
        print("\n1. Entità create dal pacchetto")
        for eid in (
            "input_number.jarvis_soglia_nuvole",
            "counter.jarvis_giorni_nuvolosi",
            "sensor.jarvis_copertura_nuvolosa",
            "sensor.jarvis_temperatura_percepita_camera",
            "sensor.jarvis_temperatura_percepita_soggiorno",
            "binary_sensor.jarvis_scaldabagno_modalita_inverno",
            "binary_sensor.jarvis_scaldabagno_programma",
            "sensor.jarvis_scaldabagno_prossimo_cambio",
            "script.jarvis_notifica",
            "script.jarvis_buonanotte",
            "script.jarvis_esco",
            "script.jarvis_rientro",
        ):
            verifica(b.stato(eid) != "ASSENTE", f"esiste {eid}", b.stato(eid))
        n_auto = len(hass.states.async_all("automation"))
        verifica(n_auto == 8, "8 automazioni caricate", n_auto)
        spente = [s.entity_id for s in hass.states.async_all("automation") if s.state != "on"]
        verifica(not spente, "tutte le automazioni sono attive", spente)
        # Prima installazione: senza `initial:` HA parte dal minimo di ogni
        # aiutante. Lo verifichiamo perché è il motivo per cui l'amministratore
        # DEVE impostare i valori di partenza (README).
        verifica(b.stato("input_number.jarvis_soglia_nuvole") == "50.0",
                 "prima installazione: soglia nuvole al minimo (50%) finché non la imposti",
                 b.stato("input_number.jarvis_soglia_nuvole"))
        await imposta_numeri(b, VALORI_PARTENZA)
        for eid, valore in VALORI_PARTENZA.items():
            verifica(b.stato(eid) == str(float(valore)), f"valore di partenza {eid} = {valore}", b.stato(eid))

        print("\n2. Temperatura percepita (valori veri del 26/09)")
        await b.aggiorna_template()
        atteso = percepita(25.1, 43)
        verifica(b.stato("sensor.jarvis_temperatura_percepita_camera") == str(atteso),
                 f"camera 25,1° / 43% → {atteso}°", b.stato("sensor.jarvis_temperatura_percepita_camera"))
        atteso = percepita(25.7, 44)
        verifica(b.stato("sensor.jarvis_temperatura_percepita_soggiorno") == str(atteso),
                 f"soggiorno 25,7° / 44% → {atteso}°", b.stato("sensor.jarvis_temperatura_percepita_soggiorno"))
        verifica(b.stato("sensor.jarvis_copertura_nuvolosa") == "95", "copertura letta da Met.no (95%)",
                 b.stato("sensor.jarvis_copertura_nuvolosa"))

        print("\n3. Modalità inverno: servono 2 giornate ≥ 90%")
        await b.ora(2026, 10, 5, 18, 30)  # lunedì 5 ottobre, tramonto
        await b.giornata(copertura=95, campioni=60)
        verifica(b.stato("counter.jarvis_giorni_nuvolosi") == "1", "1ª giornata al 95% → contatore 1",
                 b.stato("counter.jarvis_giorni_nuvolosi"))
        verifica(b.stato("binary_sensor.jarvis_scaldabagno_modalita_inverno") == "off",
                 "con 1 giornata la modalità resta spenta")
        verifica(b.stato("input_number.jarvis_nuvole_campioni") == "0.0", "accumulatori azzerati dopo il bilancio",
                 b.stato("input_number.jarvis_nuvole_campioni"))

        b.azzera_chiamate()
        await b.ora(2026, 10, 6, 18, 30)  # martedì 6 ottobre 18:30, dentro la fascia 17-24
        await b.giornata(copertura=92, campioni=60)
        verifica(b.stato("counter.jarvis_giorni_nuvolosi") == "2", "2ª giornata al 92% → contatore 2")
        verifica(b.stato("binary_sensor.jarvis_scaldabagno_modalita_inverno") == "on", "modalità inverno ATTIVA")
        verifica(b.chiamate_di("switch", "turn_on") != [],
                 "attivata alle 18:30 dentro la fascia → scaldabagno acceso SUBITO", b.chiamate)
        verifica(b.stato("switch.scaldabagno") == "on", "scaldabagno acceso")

        print("\n4. Orari del programma (modalità attiva)")
        casi = [
            # (data, ora, stato atteso del programma, descrizione, testo atteso del prossimo cambio)
            ((2026, 10, 7, 0, 0), "off", "mer 00:00 → spento", "Si accende alle 04:30"),
            ((2026, 10, 7, 4, 29), "off", "mer 04:29 → ancora spento", "Si accende alle 04:30"),
            ((2026, 10, 7, 4, 30), "on", "mer 04:30 → acceso", "Si spegne alle 11:00"),
            ((2026, 10, 7, 10, 59), "on", "mer 10:59 → acceso", "Si spegne alle 11:00"),
            ((2026, 10, 7, 11, 0), "off", "mer 11:00 → spento (mar-sab)", "Si accende alle 17:00"),
            ((2026, 10, 7, 16, 59), "off", "mer 16:59 → spento", "Si accende alle 17:00"),
            ((2026, 10, 7, 17, 0), "on", "mer 17:00 → acceso", "Si spegne alle 00:00"),
            ((2026, 10, 7, 23, 59), "on", "mer 23:59 → acceso", "Si spegne alle 00:00"),
            ((2026, 10, 10, 11, 30), "off", "sab 11:30 → spento (sabato ha la pausa)", "Si accende alle 17:00"),
            ((2026, 10, 11, 11, 30), "on", "dom 11:30 → acceso (domenica niente pausa)", "Si spegne alle 00:00"),
            ((2026, 10, 12, 11, 30), "on", "lun 11:30 → acceso (lunedì niente pausa)", "Si spegne alle 00:00"),
            ((2026, 10, 12, 2, 0), "off", "lun 02:00 → spento", "Si accende alle 04:30"),
        ]
        for data, atteso_p, descr, prossimo in casi:
            await b.ora(*data)
            verifica(b.stato("binary_sensor.jarvis_scaldabagno_programma") == atteso_p, descr,
                     b.stato("binary_sensor.jarvis_scaldabagno_programma"))
            verifica(b.stato("switch.scaldabagno") == atteso_p, f"   …e lo scaldabagno segue ({atteso_p})",
                     b.stato("switch.scaldabagno"))
            verifica(b.stato("sensor.jarvis_scaldabagno_prossimo_cambio") == prossimo,
                     f"   …e il pannello legge «{prossimo}»", b.stato("sensor.jarvis_scaldabagno_prossimo_cambio"))

        print("\n5. Comando a mano rispettato fino al prossimo orario")
        await b.ora(2026, 10, 13, 2, 0)  # mar 02:00: programma spento
        hass.states.async_set("switch.scaldabagno", "on")  # acceso a mano
        await b.attendi()
        b.azzera_chiamate()
        await b.ora(2026, 10, 13, 3, 0)
        verifica(b.stato("switch.scaldabagno") == "on" and not b.chiamate_di("switch"),
                 "acceso a mano alle 02:00 → alle 03:00 è ancora acceso, nessun comando", b.chiamate)
        await b.ora(2026, 10, 13, 4, 30)
        verifica(not b.chiamate_di("switch"), "alle 04:30 è già acceso → nessun comando doppio al Bot", b.chiamate)

        print("\n6. Una giornata di sole spegne tutto subito")
        await b.ora(2026, 10, 14, 17, 30)  # mer 17:30, fascia accesa
        verifica(b.stato("switch.scaldabagno") == "on", "mer 17:30 acceso dal programma")
        b.azzera_chiamate()
        await b.giornata(copertura=60, campioni=60)
        verifica(b.stato("counter.jarvis_giorni_nuvolosi") == "0", "giornata al 60% → contatore azzerato")
        verifica(b.stato("binary_sensor.jarvis_scaldabagno_modalita_inverno") == "off", "modalità inverno spenta")
        await b.aggiorna_template()
        verifica(b.stato("sensor.jarvis_scaldabagno_prossimo_cambio") == "Modalità inverno spenta",
                 "…e il pannello legge «Modalità inverno spenta»", b.stato("sensor.jarvis_scaldabagno_prossimo_cambio"))
        verifica(b.chiamate_di("switch", "turn_off") != [] and b.stato("switch.scaldabagno") == "off",
                 "scaldabagno spento SUBITO", b.chiamate)
        b.azzera_chiamate()
        await b.ora(2026, 10, 15, 4, 30)
        verifica(not b.chiamate_di("switch"), "modalità spenta: alle 04:30 non si accende", b.chiamate)

        print("\n7. Giornata al limite (89%) e giornata senza dati")
        await b.giornata(copertura=89, campioni=60)
        verifica(b.stato("counter.jarvis_giorni_nuvolosi") == "0", "89% non conta come nuvolosa")
        await b.giornata(copertura=95, campioni=60)
        b.azzera_chiamate()
        await b.giornata(copertura=95, campioni=3)
        verifica(b.stato("counter.jarvis_giorni_nuvolosi") == "1",
                 "solo 3 campioni (HA spento) → giornata non contata, contatore fermo a 1",
                 b.stato("counter.jarvis_giorni_nuvolosi"))
        notifiche = b.chiamate_di("notify")
        verifica(len(notifiche) == 1 and "non sono riuscito" in notifiche[0]["message"],
                 "…e arriva la notifica che la giornata non è stata letta", notifiche)

        print("\n8. Fuori stagione (luglio): contatore a 2 ma modalità spenta")
        await b.ora(2026, 7, 15, 18, 0)
        await b.giornata(copertura=95, campioni=60)
        verifica(b.stato("counter.jarvis_giorni_nuvolosi") == "2", "contatore a 2")
        verifica(b.stato("binary_sensor.jarvis_scaldabagno_modalita_inverno") == "off",
                 "a luglio la modalità inverno resta spenta")
        await b.ora(2026, 6, 30, 18, 0)
        verifica(b.stato("binary_sensor.jarvis_scaldabagno_modalita_inverno") == "on", "il 30 giugno è ancora attiva")
        await b.ora(2026, 7, 1, 18, 0)
        verifica(b.stato("binary_sensor.jarvis_scaldabagno_modalita_inverno") == "off", "il 1° luglio si spegne")

        print("\n9. Rientro: clima in base alla temperatura percepita")

        async def rientro(t: str, ur: str, notifica: bool = False) -> None:
            hass.states.async_set("sensor.meter_letto_temperatura", t)
            hass.states.async_set("sensor.meter_letto_umidita", ur)
            await b.attendi()
            await b.aggiorna_template()
            b.azzera_chiamate()
            await b.esegui_script("jarvis_rientro", {"notifica": notifica})

        await rientro("28", "55")
        mode = b.chiamate_di("climate", "set_hvac_mode")
        temp = b.chiamate_di("climate", "set_temperature")
        verifica(mode and mode[0]["hvac_mode"] == "cool" and temp and temp[0]["temperature"] == 24.0,
                 f"28° / 55% (percepita {percepita(28, 55)}°) → raffresca a 24°", b.chiamate)
        verifica(not b.chiamate_di("notify"), "dal pulsante: nessuna notifica")
        await rientro("16", "40")
        mode = b.chiamate_di("climate", "set_hvac_mode")
        temp = b.chiamate_di("climate", "set_temperature")
        verifica(mode and mode[0]["hvac_mode"] == "heat" and temp and temp[0]["temperature"] == 21.0,
                 f"16° / 40% (percepita {percepita(16, 40)}°) → riscalda a 21°", b.chiamate)
        await rientro("23", "50", notifica=True)
        verifica(not b.chiamate_di("climate"), f"23° / 50% (percepita {percepita(23, 50)}°) → non tocca il clima",
                 b.chiamate)
        notifiche = b.chiamate_di("notify")
        verifica(notifiche and "temperatura giusta" in notifiche[0]["message"],
                 "…e con notifica dice che non serviva", notifiche)
        await rientro("unavailable", "50", notifica=True)
        verifica(not b.chiamate_di("climate"), "sensore camera non disponibile → clima non toccato")
        notifiche = b.chiamate_di("notify")
        verifica(notifiche and "Non leggo" in notifiche[0]["message"], "…e lo dice nella notifica", notifiche)

        print("\n10. Arrivo a casa → Rientro automatico con notifica")
        hass.states.async_set("sensor.meter_letto_temperatura", "29")
        hass.states.async_set("sensor.meter_letto_umidita", "60")
        await b.attendi()
        await b.aggiorna_template()
        hass.states.async_set("device_tracker.xiaomi_salvo", "not_home")
        await b.attendi()
        await b.avanza_timer(150)  # l'uscita notifica dopo 2 minuti: la scarichiamo qui
        b.azzera_chiamate()
        hass.states.async_set("device_tracker.xiaomi_salvo", "home")
        await b.attendi()
        verifica(b.chiamate_di("climate", "set_hvac_mode") != [], "telefono rientra → condizionatore in raffrescamento",
                 b.chiamate)
        notifiche = b.chiamate_di("notify")
        verifica(notifiche and notifiche[0]["title"] == "Bentornato", "notifica 'Bentornato'", notifiche)
        b.azzera_chiamate()
        hass.states.async_set("device_tracker.xiaomi_salvo", "unavailable")
        await b.attendi()
        hass.states.async_set("device_tracker.xiaomi_salvo", "home")
        await b.attendi()
        verifica(not b.chiamate, "da 'unavailable' a casa (es. riavvio di HA) → non parte", b.chiamate)

        print("\n11. Uscita: solo notifica, con pulsante")
        hass.states.async_set("media_player.soggiorno_tv_salotto", "on")
        hass.states.async_set("switch.scaldabagno", "on")
        hass.states.async_set("climate.condizionatore", "cool")
        await b.attendi()
        b.azzera_chiamate()
        hass.states.async_set("device_tracker.xiaomi_salvo", "not_home")
        await b.attendi()
        verifica(not b.chiamate_di("notify"), "appena uscito: ancora niente (aspetta 2 minuti)")
        await b.avanza_timer(150)
        notifiche = b.chiamate_di("notify")
        ok = bool(notifiche) and all(x in notifiche[0]["message"] for x in ("TV salotto", "condizionatore", "scaldabagno"))
        verifica(ok, "dopo 2 minuti: notifica con TV salotto, condizionatore, scaldabagno", notifiche)
        azioni = notifiche[0]["data"]["actions"] if notifiche else []
        verifica(azioni and azioni[0]["action"] == "JARVIS_ESCO", "…con il pulsante 'Spegni'", azioni)
        verifica(not b.chiamate_di("media_player") and not b.chiamate_di("climate") and not b.chiamate_di("switch"),
                 "…e non spegne niente da sola", b.chiamate)

        print("\n12. Pulsante 'Spegni' della notifica → scena Esco")
        b.azzera_chiamate()
        hass.bus.async_fire("mobile_app_notification_action", {"action": "JARVIS_ESCO"})
        await b.attendi()
        verifica(b.chiamate_di("media_player", "turn_off") != [], "TV salotto spenta", b.chiamate)
        verifica(b.chiamate_di("climate", "turn_off") != [], "condizionatore spento", b.chiamate)
        verifica(not b.chiamate_di("switch"), "scaldabagno e TV camera non toccati", b.chiamate)
        notifiche = b.chiamate_di("notify")
        verifica(notifiche and "scaldabagno" in notifiche[0]["message"], "notifica: resta acceso lo scaldabagno",
                 notifiche)

        print("\n13. Buonanotte")
        hass.states.async_set("media_player.soggiorno_tv_salotto", "on")
        await b.attendi()
        b.azzera_chiamate()
        await b.esegui_script("jarvis_buonanotte")
        verifica(b.chiamate_di("media_player", "turn_off") != [], "TV salotto spenta")
        verifica(b.eventi_buonanotte == 1, "evento jarvis_buonanotte mandato al pannello")
        verifica(not b.chiamate_di("switch"), "TV camera (infrarossi) non toccata")

        print("\n14. Batteria bassa")
        b.azzera_chiamate()
        hass.states.async_set("sensor.scaldabagno_batteria", "15", {"friendly_name": "scaldabagno Batteria"})
        await b.attendi()
        notifiche = b.chiamate_di("notify")
        verifica(notifiche and "15%" in notifiche[0]["message"] and "programma" in notifiche[0]["message"],
                 "Bot scaldabagno al 15% → notifica con avviso sul programma", notifiche)

        print("\n15. Previsioni per l'assistente (script esposto ad Assist)")

        async def chiedi_previsioni(dati: dict) -> dict:
            # Come la chiama Gemini (helpers/llm.py ActionTool): servizio script con return_response
            r = await hass.services.async_call(
                "script", "jarvis_previsioni", dati, blocking=True, return_response=True
            )
            await b.attendi()
            return r or {}

        giorni = await chiedi_previsioni({"tipo": "daily"})
        verifica(b.richieste_previsioni[-1:] == ["daily"], "chiede a HA le previsioni giornaliere",
                 b.richieste_previsioni)
        verifica(giorni.get("tipo") == "daily" and len(giorni.get("previsioni", [])) == 5,
                 "restituisce i prossimi 5 giorni (non 10)", giorni)
        primo = (giorni.get("previsioni") or [{}])[0]
        verifica(primo.get("condition") == "rainy" and primo.get("temperature") == 20 and primo.get("templow") == 12,
                 "ogni giorno ha condizione, massima e minima", primo)
        ore = await chiedi_previsioni({"tipo": "hourly"})
        verifica(ore.get("tipo") == "hourly" and len(ore.get("previsioni", [])) == 12,
                 "ora per ora: le prossime 12 ore (non 24)", ore)
        verifica(ore.get("unita_temperatura") == "°C", "dice l'unità della temperatura", ore)

    finally:
        await hass.async_stop(force=True)
        shutil.rmtree(cartella, ignore_errors=True)

    await prova_riavvio()

    print("\n17. Nessun errore di Home Assistant durante le prove")
    verifica(not errori_ha, "log senza errori", errori_ha)

    falliti = [d for ok, d in esiti if not ok]
    print(f"\n{len(esiti) - len(falliti)}/{len(esiti)} verifiche passate")
    return 1 if falliti else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(prova()))
