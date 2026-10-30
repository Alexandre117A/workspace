"""Catalogue des scénarios présentables sur l'accueil.

Chaque fiche est construite en **générant réellement** le scénario avec le moteur (règles, sans réseau ni IA) :
période, région, acteurs, zones et résumé proviennent donc des métadonnées réelles, jamais d'un texte écrit à la main.
Seules figurent les situations que le moteur sait jouer aujourd'hui ; en ajouter une revient à ajouter une ligne
à `ENTRIES` (un prompt contemporain reconnu ou une base historique intégrée).
"""
from __future__ import annotations

import threading
from typing import Any

from . import atlas, research
from .models import Scenario
from .scenario_builder import build

# (identifiant, mode, requête qui produit le scénario : c'est aussi celle que « Commencer » préremplit)
ENTRIES: list[tuple[str, str, str]] = [
    ("cuba-1962", "historical", "Crise des missiles de Cuba, octobre 1962"),
    ("egypte-1799", "historical", "Campagne d'Égypte de Napoléon en 1799"),
    ("cent-ans-1415", "historical", "Guerre de Cent Ans, 1415"),
    ("taiwan", "contemporary", "Crise Chine–Taïwan"),
    ("ormuz", "contemporary", "Guerre entre l'Iran et les États-Unis"),
    ("cachemire", "contemporary", "Tensions Inde–Pakistan au Cachemire"),
]

_cache: list[dict[str, Any]] | None = None
_lock = threading.Lock()


def _card(entry_id: str, mode: str, prompt: str, sc: Scenario) -> dict[str, Any]:
    s = sc.setting
    th = atlas.theatre_view(s)
    return {
        "id": entry_id, "mode": mode, "prompt": prompt, "title": sc.title, "summary": sc.summary,
        "start_label": s.start_label, "era": s.era, "era_label": th["era_label"], "tempo": s.tempo,
        "region": s.theatre.name, "knowledge_cutoff": s.knowledge_cutoff,
        "theatre": {k: th[k] for k in ("name", "iso_n3", "center", "maritime", "basemap", "map_note", "atlas_style")},
        "camps": s.camps,
        "actors": [{"id": a.id, "name": a.name, "kind": a.kind, "camp": a.camp, "iso_n3": a.iso_n3, "leader": a.leader,
                    "leader_status": a.leader_source.status, "relevance": a.relevance,
                    "regions": [r.model_dump() for r in a.regions[:2]]} for a in sc.actors],
        "zones": [{"id": z.id, "name": z.name, "domain": z.domain, "region": z.region.model_dump()} for z in sc.zones],
        "counts": {"actors": len(sc.actors), "zones": len(sc.zones)},
        "provider": sc.generation.provider,
    }


def catalog() -> list[dict[str, Any]]:
    """Fiches construites une fois puis gardées en mémoire (une fiche qui ne se construit pas est écartée, jamais inventée)."""
    global _cache
    with _lock:
        if _cache is None:
            out: list[dict[str, Any]] = []
            with research.offline():
                for entry_id, mode, prompt in ENTRIES:
                    try:
                        out.append(_card(entry_id, mode, prompt, build(mode, prompt, 4, seed=7, use_ai=False)))
                    except Exception:  # noqa: BLE001 — une base manquante ne doit pas empêcher d'afficher les autres
                        continue
            _cache = out
        return _cache
