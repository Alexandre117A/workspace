"""Atlas stratégique : politique de fond de carte, catalogue de scénarios et confidentialité des nouvelles vues."""
import threading

import pytest

from geonex_engine import atlas, catalog, research, scenario_builder, session, views
from geonex_engine.models import Setting, Theatre


def _setting(era: str, kind: str = "natural_earth", warning=None) -> Setting:
    return Setting(mode="historical", title="t", topic="t", start_label="t", era=era,
                   theatre=Theatre(name="x", map_kind=kind, border_warning=warning))


@pytest.mark.parametrize("era,expected", [
    ("ancient", "land"), ("medieval", "land"), ("early_modern", "land"), ("napoleonic", "land"), ("industrial", "land"),
    ("cold_war", "borders"), ("contemporary", "borders"), ("space", "schematic"), ("fantasy", "schematic"),
])
def test_basemap_never_draws_modern_borders_for_old_eras(era, expected):
    assert atlas.basemap(_setting(era)) == expected


def test_fictional_map_is_always_schematic_and_flagged():
    s = _setting("contemporary", kind="fictional")
    assert atlas.basemap(s) == "schematic"
    assert "schématique" in atlas.map_note(s)


def test_land_note_explains_missing_borders_and_borders_keep_their_warning():
    assert "frontières de l'époque ne sont pas représentées" in atlas.map_note(_setting("medieval"))
    assert atlas.map_note(_setting("cold_war", warning="URSS")) == "URSS"
    assert atlas.map_note(_setting("contemporary")) is None


def test_public_view_exposes_basemap_and_era(world):
    v = views.public_view(world)
    assert v["setting"]["theatre"]["basemap"] == "borders"
    assert v["setting"]["era_label"] == "Monde contemporain"
    assert v["setting"]["theatre"]["atlas_style"] == "modern"


def test_zone_control_is_president_only(world):
    assert "zones_control" in views.president_view(world)
    assert "zones_control" not in views.public_view(world)
    assert "zones_control" not in views.team_view(world, world.humans()[0].id)


def test_catalog_is_built_from_real_scenarios_and_hides_secrets():
    cards = catalog.catalog()
    ids = {c["id"] for c in cards}
    assert {"cuba-1962", "egypte-1799", "cent-ans-1415", "taiwan"} <= ids
    for c in cards:
        assert c["actors"] and c["zones"] and c["summary"] and c["theatre"]["name"]
        assert c["counts"] == {"actors": len(c["actors"]), "zones": len(c["zones"])}
        flat = repr(c)
        for hidden in ("secrets", "red_lines", "objectives", "truth_summary"):
            assert hidden not in flat
    cuba = next(c for c in cards if c["id"] == "cuba-1962")
    assert cuba["era"] == "cold_war" and cuba["theatre"]["basemap"] == "borders"
    hundred = next(c for c in cards if c["id"] == "cent-ans-1415")
    assert hundred["theatre"]["basemap"] == "land" and "frontières de l'époque" in hundred["theatre"]["map_note"]


def test_catalog_entries_match_what_the_historical_mode_can_play():
    for entry_id, mode, prompt in catalog.ENTRIES:
        if mode == "historical":
            assert scenario_builder.match_historical(prompt) is not None, entry_id


def test_research_offline_is_thread_local(monkeypatch):
    monkeypatch.setenv("GEONEX_RESEARCH", "on")
    seen = {}

    def other():
        seen["other"] = research.enabled()

    with research.offline():
        assert research.enabled() is False
        t = threading.Thread(target=other)
        t.start()
        t.join()
    assert seen["other"] is True
    assert research.enabled() is True
