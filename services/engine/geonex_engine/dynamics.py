"""Dynamique géopolitique : le mécanisme qui remplace l'IA par des règles explicites et vérifiables.

Composants (tous déterministes, bornés, auditables) :
1. Échelle d'escalade (10 paliers) par paire d'acteurs, calculée à partir de la tension, de l'état de guerre,
   des frappes récentes et des arsenaux ; chaque palier a des coûts réels pour les deux camps et, aux paliers
   élevés, pour le monde entier.
2. Défense collective : une frappe contre un allié crée une obligation pour ses alliés. L'obligation est suivie
   au round suivant : honorée (confiance renforcée) ou non tenue (« allié défaillant », crédibilité perdue).
3. Interdépendance économique : l'effet des sanctions dépend de la dépendance réelle entre les deux acteurs.
4. Usure de guerre (lassitude, opinion) et disponibilité opérationnelle (réserve de forces) qui pèsent sur
   les probabilités des actions militaires.
5. Doctrines des acteurs non joués (dissuasion, opportunisme, équilibrage, médiation, prudence).
"""
from __future__ import annotations

from typing import Any

from .models import Actor, Effect, Event, WorldState, relation_key

LADDER = [
    "Coopération", "Tensions diplomatiques", "Pressions économiques", "Démonstrations de force", "Incidents armés",
    "Opérations limitées", "Conflit ouvert", "Offensives majeures", "Frappes stratégiques", "Seuil nucléaire",
]
HOSTILE = {"military_strike", "covert_operation", "sanctions"}
ACTIVE_FOR_ALLY = {"military_strike", "covert_operation", "sanctions", "military_deployment", "economic_aid", "diplomatic_initiative", "alliance", "ceasefire_offer", "humanitarian"}


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def has_nuclear(actor: Actor) -> bool:
    return any(r.key == "nuclear_deterrent" for r in actor.resources)


def dependency(world: WorldState, a_id: str, b_id: str) -> float:
    """Dépendance économique de A envers B, de 0 à 1 (taille relative de B, liens d'alliance et de camp)."""
    a, b = world.actors[a_id], world.actors[b_id]
    size = b.capitals.economic / (a.capitals.economic + b.capitals.economic + 1e-6)
    tie = 0.25 if world.relation(a_id, b_id).alliance else 0.0
    bloc = 0.15 if a.camp == b.camp and a.camp != "neutral" else 0.0
    return round(min(1.0, 0.9 * size + tie + bloc), 3)


def doctrine(actor: Actor) -> str:
    if actor.kind == "organization":
        return "médiation"
    p = actor.personality
    if has_nuclear(actor) and p.caution >= 0.45:
        return "dissuasion"
    if p.aggression >= 0.6 and p.caution < 0.5:
        return "opportunisme"
    if p.cooperation >= 0.6:
        return "équilibrage"
    return "prudence"


def recent_strikes(world: WorldState, a: str, b: str, window: int = 2) -> int:
    n = 0
    for d in world.decisions_log:
        if d.get("category") != "military_strike" or d.get("ruling") == "refused" or d.get("round", 0) < world.round - window:
            continue
        t = d.get("targets") or []
        if (d.get("actor") == a and b in t) or (d.get("actor") == b and a in t):
            n += 1
    return n


def compute_rung(world: WorldState, a: str, b: str) -> int:
    rel = world.relation(a, b)
    rung = min(5, int(rel.tension // 15))
    strikes = recent_strikes(world, a, b)
    if rel.at_war:
        rung = max(rung, 6)
        if strikes >= 2:
            rung = 7
        if strikes >= 4:
            rung = 8
    elif strikes >= 1:
        rung = max(rung, 5)
    if rung >= 8 and rel.tension >= 90 and has_nuclear(world.actors[a]) and has_nuclear(world.actors[b]):
        rung = 9
    return rung


def _event(world: WorldState, kind: str, title: str, text: str, actors: list[str], scope: str = "public", audience: list[str] | None = None) -> None:
    world.events.append(Event(id=world.next_id("EVT"), round=world.round, kind=kind, scope=scope, audience=audience or [], title=title, text=text, actors=actors))  # type: ignore[arg-type]


def _step_escalation(world: WorldState, effects: list[Effect]) -> None:
    previous = dict(world.escalation)
    current: dict[str, int] = {}
    for key, rel in sorted(world.relations.items()):
        if rel.a not in world.actors or rel.b not in world.actors:
            continue
        rung = compute_rung(world, rel.a, rel.b)
        current[key] = rung
        before = previous.get(key, 0)
        a, b = world.actors[rel.a], world.actors[rel.b]
        if rung != before and (rung >= 4 or before >= 4):
            up = rung > before
            _event(world, "escalation", f"{'Escalade' if up else 'Désescalade'} {a.name}–{b.name} : palier {rung}/9",
                   f"{a.name} et {b.name} passent du palier « {LADDER[before]} » au palier « {LADDER[rung]} ».", [a.id, b.id])
        if rung >= 6:
            weight = rung - 5
            for x in (rel.a, rel.b):
                effects.append(Effect(actor=x, field="economic", delta=-round(0.8 * weight, 2), reason=f"Coût du conflit (palier {rung})"))
                effects.append(Effect(actor=x, field="stability", delta=-round(0.5 * weight, 2), reason=f"Tension du conflit (palier {rung})"))
        if rung >= 8:
            for x in (rel.a, rel.b):
                effects.append(Effect(actor=x, field="political", delta=-3, reason="Isolement international (frappes stratégiques)"))
            for other in world.actors.values():
                if other.id not in (rel.a, rel.b):
                    effects.append(Effect(actor=other.id, field="economic", delta=-1, reason="Choc économique mondial"))
                    for x in (rel.a, rel.b):
                        effects.append(Effect(actor=other.id, field=f"trust:{x}", delta=-3, reason="Inquiétude face à l'escalade"))
    world.escalation = current


def _step_obligations(world: WorldState, results: list[dict[str, Any]], effects: list[Effect]) -> None:
    mine_by_actor: dict[str, list[dict[str, Any]]] = {}
    for r in results:
        if r.get("outcome") != "refused":
            mine_by_actor.setdefault(r["actor"], []).append(r)
    # 1. Évaluation des obligations ouvertes des rounds précédents.
    for ob in world.obligations:
        if ob["status"] != "open" or ob["round"] >= world.round:
            continue
        ally, victim, aggressor = ob["ally"], ob["victim"], ob["aggressor"]
        if ally not in world.actors:
            ob["status"] = "void"
            continue
        acts = mine_by_actor.get(ally, [])
        honored = any(
            (r["category"] in HOSTILE | {"military_deployment"} and aggressor in (r.get("targets") or []))
            or (r["category"] in {"economic_aid", "diplomatic_initiative", "alliance", "humanitarian"} and victim in (r.get("targets") or []))
            for r in acts
        ) or world.relation(ally, aggressor).at_war
        names = (world.actors[ally].name, world.actors[victim].name)
        if honored:
            ob["status"] = "honored"
            effects.append(Effect(actor=victim, field=f"trust:{ally}", delta=6, reason=f"{names[0]} a soutenu {names[1]}"))
        else:
            ob["status"] = "failed"
            effects.append(Effect(actor=victim, field=f"trust:{ally}", delta=-10, reason=f"Allié défaillant : {names[0]}"))
            effects.append(Effect(actor=ally, field="political", delta=-2, reason="Engagement d'alliance non tenu"))
            _event(world, "ally_failed", f"{names[0]} n'a pas soutenu {names[1]}", f"Attaqué, {names[1]} constate l'absence de réaction de son allié {names[0]}.", [ally, victim])
    # 2. Nouvelles obligations créées par les frappes de ce round.
    for r in results:
        if r["category"] != "military_strike" or r.get("outcome") == "refused":
            continue
        aggressor = r["actor"]
        for victim in r.get("targets") or []:
            if victim not in world.actors:
                continue
            for c in world.actors.values():
                if c.id in (aggressor, victim):
                    continue
                rel = world.relation(c.id, victim)
                if not (rel.alliance and rel.trust > 20):
                    continue
                if any(o["ally"] == c.id and o["victim"] == victim and o["aggressor"] == aggressor and o["round"] == world.round for o in world.obligations):
                    continue
                world.obligations.append({"ally": c.id, "victim": victim, "aggressor": aggressor, "round": world.round, "status": "open"})
                effects.append(Effect(actor=c.id, field=f"tension:{aggressor}", delta=10, reason=f"Attaque contre l'allié {world.actors[victim].name}"))
                effects.append(Effect(actor=c.id, field=f"trust:{aggressor}", delta=-12, reason=f"Attaque contre l'allié {world.actors[victim].name}"))
                _event(world, "alliance_obligation", "Obligation d'alliance",
                       f"{world.actors[victim].name}, votre allié, a été frappé par {world.actors[aggressor].name}. Vos engagements vous sont rappelés : votre réaction sera observée.",
                       [c.id, victim, aggressor], scope="private", audience=[c.id])


def _step_attrition(world: WorldState, results: list[dict[str, Any]], effects: list[Effect]) -> None:
    for a in world.actors.values():
        at_war = any(r.at_war for r in world.relations.values() if a.id in (r.a, r.b))
        struck = sum(1 for r in results if r["category"] == "military_strike" and r.get("outcome") != "refused" and a.id in (r.get("targets") or []))
        acted = sum(1 for r in results if r["actor"] == a.id and r["category"] in ("military_strike", "military_deployment") and r.get("outcome") != "refused")
        a.readiness = round(clamp(a.readiness - 3 * at_war - 4 * struck - 2 * acted + (3 if not at_war and acted == 0 else 0), 20, 100), 2)
        a.weariness = round(clamp(a.weariness + (4 if at_war else -2) + 3 * struck, 0, 100), 2)
        if a.weariness > 30:
            effects.append(Effect(actor=a.id, field="approval", delta=-round((a.weariness - 30) / 20, 2), reason="Lassitude de guerre"))
            effects.append(Effect(actor=a.id, field="stability", delta=-round((a.weariness - 30) / 40, 2), reason="Lassitude de guerre"))
        if a.readiness < 45:
            effects.append(Effect(actor=a.id, field="military", delta=-1, reason="Forces à bout de souffle (disponibilité faible)"))


def step(world: WorldState, results: list[dict[str, Any]]) -> list[Effect]:
    """Applique toute la dynamique d'un round résolu. Retourne les effets à appliquer (via effects.apply_all)."""
    effects: list[Effect] = []
    _step_obligations(world, results, effects)
    _step_attrition(world, results, effects)
    _step_escalation(world, effects)
    return effects


def ladder_view(world: WorldState, min_rung: int = 3) -> list[dict[str, Any]]:
    out = []
    for key, rung in sorted(world.escalation.items(), key=lambda kv: -kv[1]):
        if rung < min_rung:
            continue
        a, b = key.split("|")
        if a in world.actors and b in world.actors:
            out.append({"a": a, "b": b, "rung": rung, "label": LADDER[rung]})
    return out


def adjust_npc_candidates(world: WorldState, actor: Actor, candidates: list[tuple], rng) -> list[tuple]:
    """Ajuste les scores des options d'un acteur non joué selon sa doctrine, l'escalade et ses obligations."""
    doc = doctrine(actor)
    out: list[tuple] = []
    for score, cat, targets, zone, why in candidates:
        tgt = world.actors.get(targets[0]) if targets else None
        rung = world.escalation.get(relation_key(actor.id, tgt.id), 0) if tgt else 0
        if doc == "médiation" and cat in HOSTILE | {"military_deployment"}:
            continue
        if cat == "military_strike":
            if doc == "dissuasion" and rung >= 6:
                score -= 0.12 * rung
            elif doc == "prudence":
                score -= 0.1 * max(rung, 3)
            elif doc == "opportunisme" and tgt is not None and tgt.readiness < 60:
                score += 0.4
                why += " (adversaire affaibli)"
            if actor.readiness < 45:
                score -= 0.35
        if cat in ("ceasefire_offer", "diplomatic_initiative") and doc == "équilibrage":
            score += 0.15
        if actor.weariness > 60 and cat == "ceasefire_offer":
            score += 0.35
        out.append((score, cat, targets, zone, why))
    for ob in world.obligations:
        if ob["ally"] == actor.id and ob["status"] == "open" and ob["round"] < world.round + 1 and ob["round"] >= world.round - 1:
            if ob["aggressor"] in world.actors and doc != "médiation":
                out.append((0.95 + rng.uniform(0, 0.2), "sanctions", [ob["aggressor"]], None, "obligation d'alliance"))
                out.append((0.85 + rng.uniform(0, 0.2), "diplomatic_initiative", [ob["victim"]], None, "soutien à un allié frappé"))
    return out
