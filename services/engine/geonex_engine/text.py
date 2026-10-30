"""Temps simulé et vocabulaire adapté à l'époque."""
from __future__ import annotations

from datetime import datetime, timedelta

from .models import WorldState

MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]

PRE_INDUSTRIAL = {"ancient", "medieval", "early_modern", "napoleonic", "fantasy"}


def sim_datetime(world: WorldState) -> datetime | None:
    if not world.setting.start_date:
        return None
    try:
        start = datetime.strptime(world.setting.start_date[:10], "%Y-%m-%d").replace(hour=8)
    except ValueError:
        return None
    return start + timedelta(hours=world.sim_elapsed_hours)


def sim_time_label(world: WorldState, extra_hours: float = 0.0) -> str:
    dt = sim_datetime(world)
    if dt is None:
        hours = world.sim_elapsed_hours + extra_hours
        day = int(hours // 24) + 1
        return f"Jour {day}, {int(8 + hours % 24) % 24:02d} h 00"
    dt = dt + timedelta(hours=extra_hours)
    return f"{dt.day} {MONTHS[dt.month - 1]} {dt.year}, {dt.hour:02d} h {dt.minute:02d}"


def vocab(world: WorldState) -> dict[str, str]:
    era = world.setting.era
    if era in PRE_INDUSTRIAL:
        return {"ship": "navire", "ships": "navires", "unrest": "émeute", "strike": "révolte", "media": "crieurs et pamphlets",
                "attack": "coup de main", "economy": "disette", "message": "dépêche portée par courrier", "unit": "régiment"}
    if era == "space":
        return {"ship": "croiseur orbital", "ships": "vaisseaux", "unrest": "soulèvement", "strike": "grève des docks orbitaux",
                "media": "réseaux d'information", "attack": "sabotage", "economy": "effondrement des cours de l'hélium-3",
                "message": "transmission chiffrée", "unit": "escadron"}
    if era in {"industrial", "cold_war"}:
        return {"ship": "bâtiment", "ships": "bâtiments", "unrest": "manifestation", "strike": "grève générale", "media": "presse et radio",
                "attack": "sabotage", "economy": "crise financière", "message": "télégramme chiffré", "unit": "division"}
    return {"ship": "navire", "ships": "navires", "unrest": "manifestation", "strike": "grève", "media": "médias et réseaux sociaux",
            "attack": "sabotage", "economy": "choc sur les marchés", "message": "communication chiffrée", "unit": "brigade"}
