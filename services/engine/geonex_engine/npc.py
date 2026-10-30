"""Agents des acteurs non joués.

Chaque acteur non joué décide à partir de SA connaissance (événements publics,
événements qui le concernent, ses propres relations et renseignements), jamais
à partir des intentions secrètes des autres. Ses choix servent ses objectifs,
même lorsque cela complique la partie des joueurs humains.
"""
from __future__ import annotations

import math
from typing import Any

from .actions import Decision
from .models import Actor, WorldState
from .probability import rng_for


def knowledge(world: WorldState, actor: Actor) -> dict[str, Any]:
    """Ce que l'acteur sait : public + ce qui le concerne directement."""
    events = [e for e in world.events if e.scope == "public" or actor.id in e.audience]
    struck_by = {e.figures.get("attacker") for e in events if e.kind == "military_strike" and actor.id in e.actors and e.figures.get("target") == actor.id and e.round >= world.round - 1}
    intel = [r for r in world.intel if r.owner == actor.id]
    return {"events": events, "struck_by": {s for s in struck_by if s}, "intel": intel}


def _alloc(actor: Actor, capital: str, rng, share: float = 0.18) -> dict[str, float]:
    avail = actor.capitals.get(capital)
    pts = max(0.0, min(22.0, round(avail * share + rng.uniform(-2, 3), 1), avail - 8))
    return {capital: pts} if pts >= 2 else {}


def _resource(actor: Actor, category: str, qty: float = 1.0) -> list[dict]:
    for r in actor.resources:
        if r.category == category and r.usable and actor.available(r.key) >= qty:
            return [{"key": r.key, "quantity": qty}]
    return []


def decide(world: WorldState, actor: Actor) -> list[Decision]:
    rng = rng_for(world.seed, world.round, "npc", actor.id)
    know = knowledge(world, actor)
    p = actor.personality
    others = [a for a in world.actors.values() if a.id != actor.id]
    if not others:
        return []
    candidates: list[tuple[float, str, list[str], str | None, str]] = []

    def cand(score: float, cat: str, targets: list[str], zone: str | None, why: str) -> None:
        candidates.append((score + rng.uniform(-0.15, 0.15), cat, targets, zone, why))

    # Réaction à une agression subie (ligne rouge franchie).
    for attacker in know["struck_by"]:
        if attacker in world.actors:
            cand(1.2 * p.aggression + 0.4, "military_strike", [attacker], None, "riposte à une frappe subie")
            cand(0.9 * p.caution + 0.3, "defensive_posture", [], None, "protection après une frappe")
            cand(0.8 * p.cooperation, "ceasefire_offer", [attacker], None, "désescalade après une frappe")
    for obj in actor.objectives:
        m = obj.metric
        t = m.get("type")
        if t == "zone_control":
            zone = world.zone(m.get("zone", ""))
            if zone and zone.control.get(actor.id, 0) < m.get("value", 0.5):
                cand(0.75 + 0.3 * p.aggression, "military_deployment", [], zone.id, f"renforcer sa position dans {zone.name}")
        elif t in ("relation_min", "alliance_with", "agreement_with") and m.get("target") in world.actors:
            rel = world.relation(actor.id, m["target"])
            if rel.trust < m.get("value", 30):
                cand(0.65 + 0.4 * p.cooperation, "diplomatic_initiative", [m["target"]], None, "objectif de rapprochement")
            elif t == "alliance_with" and not rel.alliance:
                cand(0.7 + 0.3 * p.cooperation, "alliance", [m["target"]], None, "consolider une alliance")
        elif t in ("no_war_between", "tension_max_between"):
            a, b = m.get("a"), m.get("b")
            if a in world.actors and b in world.actors:
                rel = world.relation(a, b)
                if rel.at_war or rel.tension > m.get("value", 60):
                    cand(0.9 + 0.3 * p.cooperation, "diplomatic_initiative", [a], None, "médiation")
                    cand(0.8 + 0.3 * p.cooperation, "diplomatic_initiative", [b], None, "médiation")
        elif t == "actor_weakened" and m.get("target") in world.actors:
            tgt = world.actors[m["target"]]
            if actor.capitals.economic > 45:
                cand(0.5 + 0.4 * p.aggression, "sanctions", [tgt.id], None, "affaiblir un rival")
            if actor.capitals.military > tgt.capitals.military and p.aggression > 0.55:
                cand(0.35 + 0.5 * p.aggression - 0.3 * p.caution, "military_strike", [tgt.id], None, "affaiblir militairement un rival")
            cand(0.35 + 0.3 * p.aggression, "covert_operation", [tgt.id], None, "action discrète contre un rival")
    if actor.stability < 45:
        cand(1.0 - actor.stability / 100 + 0.3, "domestic_policy", [], None, "stabiliser la situation intérieure")
    if actor.approval < 40:
        cand(0.55, "information_campaign", [], None, "regagner l'opinion")
    rivals = sorted(others, key=lambda o: world.relation(actor.id, o.id).trust)
    if rivals:
        rival = rivals[0]
        rel = world.relation(actor.id, rival.id)
        if rel.tension > 60 and actor.capitals.economic > 40:
            cand(0.4 + 0.4 * p.aggression, "sanctions", [rival.id], None, "pression sur un rival")
        if rel.at_war:
            cand(0.5 + 0.5 * p.aggression, "military_strike", [rival.id], None, "poursuite des hostilités")
            cand(0.45 + 0.5 * p.cooperation - 0.2 * p.aggression, "ceasefire_offer", [rival.id], None, "chercher un cessez-le-feu")
    friends = sorted(others, key=lambda o: -world.relation(actor.id, o.id).trust)
    if friends and world.relation(actor.id, friends[0].id).trust > 20:
        f = friends[0]
        if f.capitals.economic < 40 and actor.capitals.economic > 50:
            cand(0.5 + 0.3 * p.cooperation, "economic_aid", [f.id], None, "soutien à un partenaire en difficulté")
        cand(0.3 + 0.3 * p.cooperation, "diplomatic_initiative", [f.id], None, "entretenir un partenariat")
    if actor.kind == "organization":
        cand(0.45, "humanitarian", [], None, "mission humanitaire")
    if not candidates:
        cand(0.3, "domestic_policy", [], None, "consolidation intérieure")

    # Tirage pondéré (softmax) : diversité des comportements entre sessions.
    best: dict[tuple, tuple] = {}
    for c in candidates:  # une même action (catégorie, cibles, zone) n'est proposée qu'une fois
        key = (c[1], tuple(c[2]), c[3])
        if key not in best or c[0] > best[key][0]:
            best[key] = c
    candidates = sorted(best.values(), key=lambda c: -c[0])
    top = candidates[:5]
    weights = [math.exp(3.0 * c[0]) for c in top]
    picks: list[tuple] = []
    n = 2 if actor.capitals.total() > 160 and len(top) > 1 else 1
    pool = list(zip(top, weights))
    for _ in range(n):
        total = sum(w for _, w in pool)
        r = rng.uniform(0, total)
        acc = 0.0
        for i, (c, w) in enumerate(pool):
            acc += w
            if r <= acc:
                picks.append(c)
                pool.pop(i)
                break
    decisions: list[Decision] = []
    used_caps: dict[str, float] = {}
    for i, (_, cat, targets, zone, why) in enumerate(picks):
        from .actions import CATALOG

        capital = CATALOG[cat]["capital"]
        alloc = _alloc(actor, capital, rng)
        if alloc and used_caps.get(capital, 0) + alloc[capital] > actor.capitals.get(capital) - 5:
            alloc = {}
        for k, v in alloc.items():
            used_caps[k] = used_caps.get(k, 0) + v
        res_cat = {"military": "military", "economic": "economic", "political": "political"}[capital]
        resources = _resource(actor, "other" if cat == "covert_operation" else res_cat)
        decisions.append(Decision(
            id=f"npc-{world.round}-{actor.id}-{i}", actor=actor.id, category=cat, targets=targets, zone=zone,
            intent=f"Acteur non joué — {why}.", allocation=alloc, resources=resources, secret=cat == "covert_operation", origin="npc",
        ))
    return decisions
