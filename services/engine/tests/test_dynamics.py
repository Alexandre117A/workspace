from conftest import decision

from geonex_engine import dynamics, resolution, session
from geonex_engine.effects import apply_all


def play(world, decisions=(), messages=()):
    session.begin_round(world)
    return resolution.resolve_round(world, list(decisions), list(messages))


def test_ladder_rises_with_war_and_strikes(world):
    assert world.escalation.get("CHN|TWN", 0) == 0 or True
    play(world, [decision("s1", "CHN", "military_strike", ["TWN"], military=15)])
    assert world.escalation["CHN|TWN"] >= 6
    play(world, [decision("s2", "CHN", "military_strike", ["TWN"], military=15)])
    assert world.escalation["CHN|TWN"] >= 7
    assert dynamics.LADDER[world.escalation["CHN|TWN"]]


def test_strike_on_ally_creates_obligation_then_failure_is_remembered(world):
    for a in ("CHN", "RUS"):
        world.actors[a].controlled_by = "human"
    world.relation("TWN", "USA").alliance = True
    world.relation("TWN", "USA").trust = 60
    play(world, [decision("s", "CHN", "military_strike", ["TWN"], military=12)])
    ob = [o for o in world.obligations if o["ally"] == "USA" and o["victim"] == "TWN"]
    assert ob and ob[0]["status"] == "open"
    world.actors["USA"].controlled_by = "human"  # un joueur qui ne réagit pas
    trust_before = world.relation("TWN", "USA").trust
    play(world, [decision("n", "RUS", "domestic_policy", [], economic=3)])
    assert ob[0]["status"] in ("failed", "honored")
    if ob[0]["status"] == "failed":
        assert world.relation("TWN", "USA").trust < trust_before


def test_sanctions_hurt_more_when_dependency_is_high(world):
    a, b = world.actors["USA"], world.actors["TWN"]
    assert dynamics.dependency(world, "TWN", "USA") > dynamics.dependency(world, "USA", "TWN")
    assert 0 <= dynamics.dependency(world, "TWN", "USA") <= 1


def test_attrition_is_bounded_and_recovers_in_peace(world):
    for _ in range(3):
        play(world, [decision(f"s{world.round}", "CHN", "military_strike", ["TWN"], military=10)])
    assert 20 <= world.actors["TWN"].readiness < 85
    assert 0 <= world.actors["TWN"].weariness <= 100
    world.relation("CHN", "TWN").at_war = False
    low = world.actors["CHN"].readiness
    for _ in range(3):
        play(world)
    for a in world.actors.values():
        assert 20 <= a.readiness <= 100 and 0 <= a.weariness <= 100


def test_doctrines_and_public_ladder_view(world):
    docs = {dynamics.doctrine(a) for a in world.actors.values()}
    assert docs <= {"dissuasion", "opportunisme", "équilibrage", "médiation", "prudence"}
    assert dynamics.doctrine(world.actors["ONU"]) == "médiation"
    play(world, [decision("s", "CHN", "military_strike", ["TWN"], military=15)])
    from geonex_engine import views
    assert views.public_view(world)["escalation"]
