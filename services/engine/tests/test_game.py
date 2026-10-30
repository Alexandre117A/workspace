import json
import random

from conftest import decision

from geonex_engine import archive, cards, intel, resolution, rome, scoring, session, views
from geonex_engine.models import WorldState


def play_round(world, decisions=(), messages=()):
    session.begin_round(world)
    return resolution.resolve_round(world, list(decisions), list(messages))


# ----------------------------------------------------------------------------- confidentialité


def test_team_view_never_contains_other_teams_secrets(world):
    session.begin_round(world)
    all_views = views.all_views(world)
    for actor in world.humans():
        for other in world.humans():
            if other.id == actor.id:
                continue
            blob = json.dumps(all_views["teams"][actor.id], ensure_ascii=False)
            own = {o.text for o in actor.objectives} | set(actor.red_lines) | set(actor.secrets)
            for o in other.objectives:
                assert o.id not in blob
                if o.text not in own:
                    assert o.text not in blob
            for text in other.secrets + other.red_lines:
                if text not in own:
                    assert text not in blob


def test_president_sees_true_balance_but_not_secret_objectives(world):
    session.begin_round(world)
    pv = views.president_view(world)
    assert "true_balance" in pv
    blob = json.dumps(pv, ensure_ascii=False)
    for a in world.humans():
        secret = next(o for o in a.objectives if o.kind == "secret")
        assert secret.text not in blob


def test_public_balance_locked_until_round_three(world):
    for _ in range(2):
        play_round(world)
        assert views.public_view(world)["balance"] is None or world.round >= 3
    session.begin_round(world)
    assert world.round == 3 and views.public_view(world)["balance"] is not None


def test_intel_truth_is_never_sent_to_team(world):
    world.round = 2
    report = intel.gather(world, "CHN", ["TWN", "USA"], "Quelles discussions entre eux ?", "targeted_intel", 10, 1, "k")
    tv = views.team_view(world, "CHN")
    blob = json.dumps(tv, ensure_ascii=False)
    assert "accuracy" not in json.dumps(tv["intel"])
    assert report.truth_summary not in blob or report.accuracy == "exact"


# ----------------------------------------------------------------------------- résolution


def test_spending_and_bounds(world):
    before = world.actors["CHN"].capitals.political
    play_round(world, [decision("d1", "CHN", "diplomatic_initiative", ["USA"], political=10)])
    a = world.actors["CHN"]
    assert a.capital_spent.political == 10
    assert a.capitals.political < before + 10
    for actor in world.actors.values():
        for k in ("political", "economic", "military"):
            assert 0 <= actor.capitals.get(k) <= 100
        assert all(r.quantity >= 0 for r in actor.resources)


def test_overspending_is_rejected(world):
    rep = play_round(world, [decision("d1", "TWN", "sanctions", ["CHN"], economic=30), decision("d2", "TWN", "economic_aid", ["USA"], economic=30),
                             decision("d3", "TWN", "humanitarian", [], economic=30)])
    assert world.actors["TWN"].capital_spent.economic <= 30


def test_resource_immobilisation_then_release(world):
    session.begin_round(world)
    res = next(r for r in world.actors["CHN"].resources if r.key == "strike_groups")
    qty = res.quantity
    resolution.resolve_round(world, [decision("d1", "CHN", "military_deployment", [], zone=world.zones[0].id, military=5,
                                              resources=[{"key": "strike_groups", "quantity": 2}])], [])
    assert world.actors["CHN"].available("strike_groups") <= qty - 2 + 0.26  # verrou + reconstitution éventuelle
    play_round(world)
    play_round(world)
    play_round(world)
    assert world.actors["CHN"].locked("strike_groups") == 0


def test_simultaneous_resolution_is_order_independent(scenario):
    def run(order_seed):
        w = session.prepare(scenario, "s", 4, 90, seed=11)
        session.assign(w, session.select_playable(w, 4))
        ds = [decision("a", "CHN", "military_strike", ["TWN"], military=12), decision("b", "TWN", "defensive_posture", [], military=8),
              decision("c", "USA", "sanctions", ["CHN"], economic=10), decision("d", "RUS", "diplomatic_initiative", ["CHN"], political=6)]
        random.Random(order_seed).shuffle(ds)
        play_round(w, ds)
        return w.model_dump_json()
    assert run(1) == run(2)


def test_strike_creates_war_and_lasting_losses(world):
    mil_before = world.actors["TWN"].capitals.military
    play_round(world, [decision("s", "CHN", "military_strike", ["TWN"], military=20)])
    assert world.relation("CHN", "TWN").at_war
    play_round(world)
    # Une perte grave n'est pas réparée automatiquement au round suivant.
    assert world.actors["TWN"].capitals.military < mil_before + 0.5


def test_commitment_memory_across_rounds(world):
    msg = {"channel": "call:x", "from_actor": "CHN", "to_actor": "USA", "text": "Nous nous engageons à ne pas attaquer vos forces : non-agression.", "analyze": True}
    play_round(world, messages=[msg])
    c = next(c for c in world.commitments if c.from_actor == "CHN" and c.to_actor == "USA")
    assert c.kind == "non_aggression" and c.status == "open"
    trust_before = world.relation("CHN", "USA").trust
    play_round(world, [decision("x", "CHN", "military_strike", ["USA"], military=8)])
    assert c.status == "broken"
    assert world.relation("CHN", "USA").trust < trust_before - 15


def test_unconsented_messages_are_not_analyzed(world):
    msg = {"channel": "call:x", "from_actor": "CHN", "to_actor": "USA", "text": "Nous promettons une alliance.", "analyze": False}
    play_round(world, messages=[msg])
    assert not world.commitments


def test_covert_operation_has_delayed_consequences(world):
    play_round(world, [decision("c", "USA", "covert_operation", ["CHN"], military=12, intent="sabotage énergétique")])
    op = next(o for o in world.operations if o.category == "covert_operation")
    assert op.status == "pending" and op.resolve_round == world.round + 1
    play_round(world)
    assert op.status == "resolved"


def test_npcs_act_with_their_own_interests(world):
    rep = play_round(world)
    assert rep["npc_decisions"] >= 1
    assert any(d["origin"] == "npc" for d in world.decisions_log)


# ----------------------------------------------------------------------------- cartes et renseignement


def test_cards_unavailable_round_one_and_single_use(world):
    session.begin_round(world)
    assert cards.validate(world, "CHN", "targeted_intel", {"subjects": ["TWN", "USA"], "question": "?"})
    resolution.resolve_round(world, [], [])
    session.begin_round(world)
    payload = {"subjects": ["TWN", "USA"], "question": "Existe-t-il un accord entre eux ?", "invest": {"political": 5}}
    assert cards.validate(world, "CHN", "targeted_intel", payload) == []
    cards.submit(world, "CHN", "targeted_intel", payload)
    assert cards.validate(world, "CHN", "targeted_intel", payload)
    rep = resolution.resolve_round(world, [], [])
    assert rep["private"]["CHN"]["cards"][0]["result"]["report"]["confidence_label"] in intel.LABELS


def test_reliability_label_is_not_a_conversion_of_percentage(world):
    world.round = 3
    pairs = set()
    for i in range(80):
        r = intel.gather(world, "CHN", ["TWN", "USA"], "intentions et accords", "targeted_intel", (i % 6) * 5, i % 2, f"k{i}")
        pairs.add((r.reliability_pct // 10, r.confidence_label))
    by_bucket = {}
    for bucket, label in pairs:
        by_bucket.setdefault(bucket, set()).add(label)
    assert any(len(labels) > 1 for labels in by_bucket.values())


def test_political_shock_estimate_starts_at_30_and_moves_with_intel_quality(world):
    world.round = 2
    assert cards.political_shock_estimate(world, "CHN", "TWN")["estimate"] == 0.3
    world.actors["TWN"].stability = 25
    estimates = set()
    for i in range(6):
        intel.gather(world, "CHN", ["TWN"], "stabilité du gouvernement", "targeted_intel", 5 + i * 4, 1, f"s{i}")
        estimates.add(cards.political_shock_estimate(world, "CHN", "TWN")["estimate"])
    deltas = sorted(estimates)
    assert deltas[0] != 0.3 or deltas[-1] != 0.3
    steps = {round(b - a, 3) for a, b in zip(deltas, deltas[1:])}
    assert len(steps) != 1 or len(deltas) <= 2  # pas d'incrément fixe


def test_interception_reads_real_private_traffic(world):
    play_round(world, messages=[{"channel": "call:1", "from_actor": "TWN", "to_actor": "USA", "text": "Nous livrerons les radars avant jeudi.", "analyze": True}])
    session.begin_round(world)
    cards.submit(world, "CHN", "interception", {"target": "TWN", "channel": "diplomatic", "intent": "Que se disent Taipei et Washington ?", "invest": {"military": 10}})
    rep = resolution.resolve_round(world, [], [])
    report = next(r for r in world.intel if r.kind == "interception")
    assert "radars" in report.truth_summary
    assert rep["private"]["CHN"]["cards"][0]["result"]["report"]["finding"]


def test_new_front_creates_zone_and_pins_target(world):
    play_round(world)
    session.begin_round(world)
    zones = len(world.zones)
    cards.submit(world, "USA", "new_front", {"target": "CHN", "domain": "maritime", "zone": {"name": "Mer de Chine méridionale", "lat": 12.0, "lon": 114.0},
                                             "intent": "Fixer la flotte adverse au sud", "invest": {"military": 15}})
    resolution.resolve_round(world, [], [])
    assert len(world.zones) == zones + 1


# ----------------------------------------------------------------------------- Rome


def _force_domination(world):
    for a in world.actors.values():
        if a.camp == "camp_b":
            a.capitals.military = a.capitals.economic = a.capitals.political = 8
            a.engagement = 0.1


def test_no_automatic_communique_before_round_two(world):
    _force_domination(world)
    session.begin_round(world)
    assert not rome.check(world, "assembly")["prepare"]


def test_communique_in_domination_window_and_not_every_round(world):
    _force_domination(world)
    prepared = []
    for _ in range(6):
        session.begin_round(world)
        chk = rome.check(world, "assembly")
        if chk["prepare"]:
            prepared.append(world.round)
            payload = views.rome_payload(world, chk["communique_id"])
            assert payload["general"]["body"]
            rome.apply(world, chk["communique_id"])
        resolution.resolve_round(world, [], [])
        _force_domination(world)
    assert prepared, "un communiqué doit être préparé en zone de domination"
    assert all(b - a >= rome.MIN_GAP_ROUNDS for a, b in zip(prepared, prepared[1:]))
    assert len(prepared) <= world.plan.rome_max


def test_leak_is_built_from_a_real_secret(world):
    play_round(world, messages=[{"channel": "call:1", "from_actor": "RUS", "to_actor": "CHN", "text": "Nous soutiendrons votre position, accord conclu.", "analyze": True}])
    session.begin_round(world)
    from geonex_engine.probability import rng_for

    comm = rome.build(world, "camp_a", rng_for(1, "t"), forced_kind="leak")
    assert comm and comm.cause_refs
    assert comm.cause_refs[0] in {c.id for c in world.commitments}


def test_president_proposal_is_checked_for_coherence(world):
    session.begin_round(world)
    bad = rome.propose(world, "court", "k1")
    assert not bad["coherent"]
    ok = rome.propose(world, "Un pétrolier est arraisonné dans le détroit, provoquant une crise maritime.", "k2")
    assert ok["coherent"]
    payload = views.rome_payload(world, ok["communique_id"])
    assert payload["general"]["kind"] == "incident_maritime"


# ----------------------------------------------------------------------------- fin de partie


def test_scoring_bounds_and_podium(world):
    for r in range(4):
        play_round(world, [decision(f"d{r}", "CHN", "military_deployment", [], zone=world.zones[0].id, military=8),
                           decision(f"e{r}", "TWN", "diplomatic_initiative", ["USA"], political=8)])
    result = archive.finalize(world, {})
    totals = [s["total"] for s in result["ranking"]]
    assert totals == sorted(totals, reverse=True)
    assert all(0 <= t <= 100 for t in totals)
    for s in result["ranking"]:
        c = s["components"]
        assert c["objectives"] <= 40.01 and c["position"] <= 20.01 and c["capital_management"] <= 15.01 and c["coherence"] <= 15.01 and c["resilience"] <= 10.01
    assert sum(1 for s in result["ranking"] if s["qualification"]) == min(3, len(totals))
    assert result["timeline"] and result["teams"] and result["cinematic"]
    assert any(i["type"] == "objectif secret" for i in result["ignored"])


def test_missing_objective_categories_are_redistributed(world):
    a = world.actors["CHN"]
    a.objectives = [o for o in a.objectives if o.kind == "primary"]
    pts, details = scoring.objective_points(world, a)
    assert abs(details[0]["max_points"] - 40.0) < 0.01


def test_world_state_roundtrip(world):
    play_round(world, [decision("d", "CHN", "sanctions", ["TWN"], economic=5)])
    again = WorldState.model_validate_json(world.model_dump_json())
    assert again.model_dump() == world.model_dump()
