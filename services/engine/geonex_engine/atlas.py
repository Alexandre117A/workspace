"""Contexte cartographique d'un scénario : ce que l'atlas du client doit afficher, et avec quelle honnêteté.

Règle centrale : une frontière n'est dessinée que si elle existait (ou presque) à l'époque simulée. Les fonds
Natural Earth sont des frontières **actuelles** ; avant la guerre froide on ne montre donc que la masse terrestre
(côtes), jamais des frontières contemporaines présentées comme historiques. Les univers inventés n'ont pas de
géographie réelle : carte schématique, signalée comme telle.
"""
from __future__ import annotations

from typing import Any, Optional

from .models import Setting

ERA_LABELS = {
    "ancient": "Antiquité",
    "medieval": "Moyen Âge",
    "early_modern": "Époque moderne",
    "napoleonic": "Époque napoléonienne",
    "industrial": "Ère industrielle",
    "cold_war": "Guerre froide",
    "contemporary": "Monde contemporain",
    "space": "Univers spatial fictif",
    "fantasy": "Univers imaginaire",
}

# Style cartographique (le client y associe matières et couleurs) : un style par famille d'époques, pas sept applications.
ATLAS_STYLES = {
    "ancient": "manuscript", "medieval": "manuscript", "early_modern": "engraved", "napoleonic": "staff",
    "industrial": "staff", "cold_war": "briefing", "contemporary": "modern", "space": "fiction", "fantasy": "fiction",
}

BORDER_ERAS = {"contemporary", "cold_war"}
SCHEMATIC_ERAS = {"space", "fantasy"}

LAND_NOTE = "Fond géographique neutre : les frontières de l'époque ne sont pas représentées. Les repères sont indicatifs."
SCHEMATIC_NOTE = "Carte schématique générée : ce n'est pas une donnée géographique réelle."


def basemap(setting: Setting) -> str:
    """`borders` (frontières actuelles, contemporain et guerre froide) · `land` (côtes seules) · `schematic` (monde inventé)."""
    if setting.theatre.map_kind == "fictional" or setting.era in SCHEMATIC_ERAS:
        return "schematic"
    return "borders" if setting.era in BORDER_ERAS else "land"


def map_note(setting: Setting, kind: Optional[str] = None) -> Optional[str]:
    kind = kind or basemap(setting)
    if kind == "schematic":
        return SCHEMATIC_NOTE
    if kind == "land":
        return LAND_NOTE
    return setting.theatre.border_warning


def era_label(setting: Setting) -> str:
    return ERA_LABELS.get(setting.era, setting.era)


def theatre_view(setting: Setting) -> dict[str, Any]:
    kind = basemap(setting)
    t = setting.theatre.model_dump()
    t.update({"basemap": kind, "map_note": map_note(setting, kind), "atlas_style": ATLAS_STYLES.get(setting.era, "modern"), "era_label": era_label(setting)})
    return t
