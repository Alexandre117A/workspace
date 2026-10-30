import time

from conftest import decision

from geonex_engine import npc, research, resolution, session


def _row(iso, role, person, start=None):
    row = {"iso": {"value": iso}, "roleLabel": {"value": role}, "personLabel": {"value": person}}
    if start:
        row["start"] = {"value": start}
    return row


def test_latest_leader_wins_when_several_open_mandates_coexist():
    rows = [
        _row("TWN", "Chef du gouvernement", "Ancien Premier ministre", "2022-01-01T00:00:00Z"),
        _row("TWN", "Chef du gouvernement", "Premier ministre actuel", "2024-05-20T00:00:00Z"),
        _row("TWN", "Chef de l'État", "Président actuel", "2024-05-20T00:00:00Z"),
        _row("CHN", "Chef de l'État", "Sans date de début"),
    ]
    leaders = research.latest_leaders(rows)
    assert dict(leaders["TWN"])["Chef du gouvernement"] == "Premier ministre actuel"
    assert dict(leaders["CHN"])["Chef de l'État"] == "Sans date de début"


def test_rate_limit_pauses_further_requests(monkeypatch):
    class Resp:
        status_code = 429
        headers = {"retry-after": "120"}

    class Boom(Exception):
        response = Resp()

    research._blocked_until.clear()
    research._remember_throttle(Boom(), "Wikidata")
    assert research._blocked("Wikidata") and "suspendue" in research._blocked("Wikidata")
    assert research.wikidata_leaders(["FRA"])[2].startswith("Recherche Wikidata suspendue")
    research._blocked_until.clear()
    assert research._blocked("Wikidata") is None
    assert "429" in research._explain(Boom(), "Wikidata")


def test_user_agent_carries_configured_contact(monkeypatch):
    monkeypatch.setenv("GEONEX_RESEARCH_CONTACT", "https://exemple.org/geonex")
    assert "https://exemple.org/geonex" in research.user_agent()


def test_npc_never_proposes_the_same_action_twice(world):
    session.begin_round(world)
    for actor in world.actors.values():
        if actor.controlled_by == "npc":
            ds = npc.decide(world, actor)
            keys = [(d.category, tuple(d.targets), d.zone) for d in ds]
            assert len(keys) == len(set(keys)), (actor.id, keys)


def test_round_narrative_has_no_double_punctuation(world):
    session.begin_round(world)
    report = resolution.resolve_round(world, [decision("d", "CHN", "sanctions", ["TWN"], economic=5)], [])
    assert ".." not in report["public"]["narrative"]
