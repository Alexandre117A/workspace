import pytest

from geonex_engine import questions, scenario_builder, session
from geonex_engine.scenario_builder import ScenarioError


def test_contemporary_rules_identify_actors(scenario):
    ids = [a.id for a in scenario.actors]
    assert ids[:2] == ["CHN", "TWN"]
    assert "USA" in ids
    assert scenario.zones[0].name == "Détroit de Taïwan"
    assert scenario.generation.provider == "rules"
    chn = next(a for a in scenario.actors if a.id == "CHN")
    assert chn.resources[0].source.status == "estimate"
    # Sans recherche disponible, le dirigeant n'est pas inventé.
    assert chn.leader_source.status == "hypothesis"
    assert "confirmer" in chn.leader.lower()


def test_every_actor_has_measurable_objectives(scenario):
    for a in scenario.actors:
        kinds = {o.kind for o in a.objectives}
        assert "primary" in kinds and "secret" in kinds
        assert all("type" in o.metric for o in a.objectives)


def test_unknown_prompt_without_ai_is_refused_honestly():
    with pytest.raises(ScenarioError):
        scenario_builder.build("contemporary", "Une crise quelque part", 4, seed=1)


def test_historical_seed_has_knowledge_cutoff():
    sc = scenario_builder.build("historical", "Crise des missiles de Cuba, octobre 1962", 4, seed=1)
    assert sc.setting.knowledge_cutoff == "1962-10-20"
    assert sc.setting.theatre.border_warning
    texts = " ".join(o.text for a in sc.actors for o in a.objectives) + " ".join(s for a in sc.actors for s in a.secrets)
    # Aucune référence au dénouement réel (accord Kennedy–Khrouchtchev du 28 octobre).
    assert "28 octobre" not in texts and "retrait des Jupiter" not in texts


def test_historical_without_match_lists_available_bases():
    with pytest.raises(ScenarioError) as exc:
        scenario_builder.build("historical", "Bataille de Marathon", 4, seed=1)
    assert "Cuba" in str(exc.value)


def test_fictional_procedural_generation_uses_description_names():
    desc = ("Dans la galaxie d'Orsa, l'Hégémonie de Vexar, puissante flotte orbitale, affronte la Fédération de Talis, riche en minerais. "
            "La Ligue de Corvane hésite entre les deux.")
    sc = scenario_builder.build("fictional", desc, 3, seed=3, name="Orsa")
    names = [a.name for a in sc.actors]
    assert any("Vexar" in n for n in names) and any("Talis" in n for n in names)
    assert sc.setting.era == "space"
    assert sc.setting.theatre.map_kind == "fictional"
    assert any("schématique" in n for n in sc.generation.notes)
    assert sc.title == "Orsa"


def test_assignment_picks_most_relevant_and_keeps_others_simulated(world):
    humans = [a.id for a in world.humans()]
    assert humans[:2] == ["CHN", "TWN"]
    assert len(world.actors) > len(humans)
    assert all(a.controlled_by == "npc" for a in world.actors.values() if a.id not in humans)


def test_more_players_than_states_adds_non_state_actors():
    sc = scenario_builder.build("contemporary", "Crise Chine–Taïwan", 9, seed=2)
    kinds = {a.kind for a in sc.actors}
    assert {"company", "armed_group", "organization"} <= kinds
    w = session.prepare(sc, "s", 9, 120, seed=1)
    ids = session.select_playable(w, 9)
    assert len(ids) == 9


def test_sessions_from_same_scenario_differ(scenario):
    w1 = session.prepare(scenario, "a", 4, 90, seed=1)
    w2 = session.prepare(scenario, "b", 4, 90, seed=2)
    secrets1 = [next(o.text for o in a.objectives if o.kind == "secret") for a in w1.actors.values()]
    secrets2 = [next(o.text for o in a.objectives if o.kind == "secret") for a in w2.actors.values()]
    personalities1 = [a.personality.aggression for a in w1.actors.values()]
    personalities2 = [a.personality.aggression for a in w2.actors.values()]
    assert secrets1 != secrets2 or personalities1 != personalities2


def test_adaptive_questions_depend_on_previous_answers():
    desc = "Deux empires stellaires se disputent une planète."
    q1 = questions.next_question("Test", desc, [])
    assert not q1["done"] and q1["generated_by"] == "rules"
    answers = [{"question": q1["question"], "answer": "La Fédération de Talis attaque la station de Kor.", "theme": q1["theme"]}]
    q2 = questions.next_question("Test", desc, answers)
    assert q2["question"] != q1["question"]
    assert q2.get("theme") != q1["theme"]
    # Une description très complète réduit le nombre de questions (2 minimum).
    asked = []
    for _ in range(6):
        q = questions.next_question("Test", desc, asked)
        if q["done"]:
            break
        asked.append({"question": q["question"], "answer": "Les puissances militaires dominent ; la crise commence par une invasion.", "theme": q["theme"]})
    assert 2 <= len(asked) <= 5
