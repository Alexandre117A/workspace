"""Préparation d'une session : état du monde propre à la session, attribution
des équipes, dossiers confidentiels, début de round (briefings, ordre de parole)."""
from __future__ import annotations

from typing import Any

from .balance import actor_power, snapshot
from .models import Actor, Scenario, WorldState, relation_key
from .planning import build_plan
from .probability import rng_for
from .scenario_common import make_objectives
from .text import sim_time_label


def prepare(scenario: Scenario, session_id: str, team_count: int, duration_minutes: int, seed: int) -> WorldState:
    """Crée l'état initial d'une session. Une même base produit des sessions
    différentes : objectifs secrets retirés, personnalités ajustées par graine."""
    plan = build_plan(duration_minutes, team_count, scenario.setting.tempo)
    rng = rng_for(seed, "prepare")
    actors: dict[str, Actor] = {}
    for a in scenario.actors:
        actor = a.model_copy(deep=True)
        actor.personality.aggression = round(min(0.95, max(0.05, actor.personality.aggression + rng.uniform(-0.1, 0.1))), 2)
        actor.personality.cooperation = round(min(0.95, max(0.05, actor.personality.cooperation + rng.uniform(-0.1, 0.1))), 2)
        actor.controlled_by = "npc"
        actors[actor.id] = actor
    world = WorldState(
        session_id=session_id, scenario_id=scenario.id, seed=seed, setting=scenario.setting.model_copy(deep=True), plan=plan,
        actors=actors, relations={relation_key(r.a, r.b): r.model_copy() for r in scenario.relations},
        zones=[z.model_copy(deep=True) for z in scenario.zones], generation=scenario.generation.model_copy(deep=True),
    )
    # Rejouabilité : l'objectif secret est retiré à chaque session (sauf bases historiques écrites à la main).
    if scenario.mode != "historical":
        camps = world.setting.camps
        for actor in world.actors.values():
            prev = {o.kind: o for o in actor.objectives}
            make_objectives(actor, list(world.actors.values()), world.zones, camps, rng_for(seed, "objectives", actor.id))
            if "primary" in prev and scenario.generation.provider != "rules":
                actor.objectives = [prev["primary"]] + [o for o in actor.objectives if o.kind != "primary"]
    snapshot(world)
    return world


def select_playable(world: WorldState, team_count: int) -> list[str]:
    """Les acteurs les plus pertinents deviennent humains ; les autres restent simulés.
    Les puissances inégales sont conservées (réalisme)."""
    states = sorted((a for a in world.actors.values() if a.kind in ("state", "polity")), key=lambda a: (-a.relevance, -actor_power(world, a)))
    relevant_states = [a for a in states if a.relevance >= 0.55]
    others = sorted((a for a in world.actors.values() if a.kind not in ("state", "polity")), key=lambda a: -a.relevance)
    ordered = relevant_states + others + [a for a in states if a not in relevant_states]
    chosen = [a.id for a in ordered[:team_count]]
    if len(chosen) < team_count:
        raise ValueError(f"Le scénario ne compte que {len(chosen)} acteurs jouables pour {team_count} équipes.")
    return chosen


def assign(world: WorldState, actor_ids: list[str]) -> None:
    for a in world.actors.values():
        a.controlled_by = "human" if a.id in actor_ids else "npc"
    from .planning import build_plan

    world.plan = build_plan(world.plan.duration_minutes, len(actor_ids), world.setting.tempo)


def dossier(world: WorldState, actor_id: str) -> dict[str, Any]:
    """Dossier confidentiel de départ : court, informatif, sans conseil stratégique."""
    a = world.actors[actor_id]
    resources = [
        {"label": r.label, "quantity": r.quantity, "unit": r.unit, "status": r.source.status, "abstraction": r.abstraction}
        for r in a.resources
    ]
    return {
        "actor": {"id": a.id, "name": a.name, "kind": a.kind, "leader": a.leader, "leader_status": a.leader_source.status, "description": a.description,
                  "iso_n3": a.iso_n3},
        "classification": {"contemporary": "CONFIDENTIEL — DIFFUSION RESTREINTE", "historical": "PLI SECRET", "fictional": "ACCÈS RÉSERVÉ"}[world.setting.mode],
        "era": world.setting.era,
        "objectives": [{"kind": o.kind, "text": o.text} for o in a.objectives],
        "red_lines": a.red_lines,
        "capitals": a.capitals.model_dump(),
        "indicators": {"stability": a.stability, "cohesion": a.cohesion, "approval": a.approval, "source": a.indicators_source.model_dump()},
        "resources": resources,
        "confidential": a.secrets,
        "facts": [f.model_dump() for f in a.facts[:3]],
        "camp": world.setting.camps.get(a.camp, a.camp),
    }


def speaking_order(world: WorldState) -> list[str]:
    """Ordre de l'Assemblée : les acteurs les plus exposés et les plus puissants
    ouvrent ; l'ordre varie selon la situation (tension, événements récents)."""
    rng = rng_for(world.seed, world.round, "speaking")
    humans = world.humans()

    def urgency(a: Actor) -> float:
        tension = max((r.tension for r in world.relations.values() if a.id in (r.a, r.b)), default=0)
        hit = sum(1 for e in world.events if e.round == world.round - 1 and a.id in e.actors)
        return actor_power(world, a) / 100 + tension / 120 + 0.15 * hit + rng.uniform(0, 0.25)

    return [a.id for a in sorted(humans, key=urgency, reverse=True)]


def begin_round(world: WorldState) -> dict[str, Any]:
    world.round += 1
    for a in world.actors.values():
        a.locks = [lk for lk in a.locks if lk.release_round > world.round - 1]
    snapshot(world)
    public_events = [e for e in world.events if e.round == world.round - 1 and e.scope == "public"]
    briefings: dict[str, Any] = {}
    for a in world.humans():
        private = [e for e in world.events if e.round == world.round - 1 and e.scope == "private" and a.id in e.audience]
        briefings[a.id] = {
            "private_events": [{"title": e.title, "text": e.text} for e in private],
            "capitals": a.capitals.model_dump(),
        }
    return {
        "round": world.round,
        "sim_time": sim_time_label(world),
        "public": {"events": [{"title": e.title, "text": e.text} for e in public_events][-8:]},
        "briefings": briefings,
        "speaking_order": speaking_order(world),
        "last_round_hint": world.round >= world.plan.rounds_planned,
    }
