"""Indice final sur 100 et classement.

- Objectifs : 40 (principal 20, secondaires 8, coalition 6, secret 6) ; une
  catégorie absente voit ses points redistribués proportionnellement aux
  catégories présentes (règle explicite, aucune pénalité automatique).
- Position stratégique finale : 20 ; gestion des capitaux : 15 ;
  cohérence et exécution : 15 ; résilience : 10.
"""
from __future__ import annotations

from typing import Any

from .balance import actor_power, camp_shares
from .models import Actor, WorldState

OBJECTIVE_POINTS = {"primary": 20.0, "secondary": 8.0, "coalition": 6.0, "secret": 6.0}


def _ratio(value: float, target: float) -> float:
    if target <= 0:
        return 1.0 if value >= target else 0.0
    return max(0.0, min(1.0, value / target))


def progress(world: WorldState, actor: Actor, metric: dict[str, Any]) -> float:
    t = metric.get("type")
    rel = lambda x: world.relation(actor.id, x) if x in world.actors else None
    if t == "camp_share_min":
        share = camp_shares(world)["shares"].get(actor.camp, 0.0)
        return _ratio(share, metric.get("value", 0.55))
    if t == "capital_min":
        return _ratio(actor.capitals.get(metric["capital"]), metric["value"])
    if t == "capital_gain":
        gain = actor.capitals.get(metric["capital"]) - actor.initial_capitals.get(metric["capital"])
        return max(0.0, min(1.0, gain / metric.get("delta", 8)))
    if t == "relation_min":
        r = rel(metric.get("target"))
        if r is None:
            return 0.0
        start = -40.0
        return max(0.0, min(1.0, (r.trust - start) / max(1.0, metric.get("value", 30) - start)))
    if t == "tension_max":
        r = rel(metric.get("target"))
        return 0.0 if r is None else (1.0 if r.tension <= metric["value"] else max(0.0, 1 - (r.tension - metric["value"]) / 40))
    if t == "tension_max_between":
        a, b = metric.get("a"), metric.get("b")
        if a not in world.actors or b not in world.actors:
            return 0.0
        tension = world.relation(a, b).tension
        return 1.0 if tension <= metric["value"] else max(0.0, 1 - (tension - metric["value"]) / 40)
    if t == "no_war_with":
        r = rel(metric.get("target"))
        return 0.0 if r is None or r.at_war else 1.0
    if t == "no_war_between":
        a, b = metric.get("a"), metric.get("b")
        return 0.0 if a not in world.actors or b not in world.actors or world.relation(a, b).at_war else 1.0
    if t == "stability_min":
        return _ratio(actor.stability, metric["value"])
    if t == "actor_weakened":
        tgt = world.actors.get(metric.get("target"))
        if tgt is None:
            return 0.0
        drop = tgt.initial_capitals.get(metric["capital"]) - tgt.capitals.get(metric["capital"])
        return max(0.0, min(1.0, drop / metric.get("delta", 10)))
    if t == "agreement_with":
        target = metric.get("target")
        ok = [c for c in world.commitments if {c.from_actor, c.to_actor} == {actor.id, target} and c.kind in ("agreement", "alliance", "ceasefire", "non_aggression", "support", "promise")]
        if any(c.status == "honored" for c in ok):
            return 1.0
        if any(c.status == "open" for c in ok):
            return 0.6
        return 0.0
    if t == "zone_control":
        zone = world.zone(metric.get("zone", ""))
        return 0.0 if zone is None else _ratio(zone.control.get(actor.id, 0.0), metric.get("value", 0.5))
    if t == "honor_commitments":
        mine = [c for c in world.commitments if c.from_actor == actor.id and c.status in ("honored", "broken", "expired") and c.kind != "threat"]
        if not mine:
            return 0.5
        honored = sum(1 for c in mine if c.status == "honored") / len(mine)
        return _ratio(honored, metric.get("ratio", 0.7))
    if t == "alliance_with":
        r = rel(metric.get("target"))
        return 1.0 if r is not None and r.alliance else (0.4 if r is not None and r.trust > 30 else 0.0)
    if t == "coalition_cohesion":
        mates = [a for a in world.actors.values() if a.camp == actor.camp and a.id != actor.id]
        if not mates:
            return 0.5
        avg = sum(world.relation(actor.id, m.id).trust for m in mates) / len(mates)
        return _ratio(avg + 40, metric.get("value", 25) + 40)
    if t == "survive":
        return min(1.0, 0.5 * _ratio(actor.stability, 25) + 0.5 * _ratio(actor.capitals.total(), 60))
    return 0.0


VISIBLE_METRICS = {"capital_min", "capital_gain", "relation_min", "tension_max", "no_war_with", "stability_min", "agreement_with",
                   "honor_commitments", "alliance_with", "coalition_cohesion", "survive"}


def objective_points(world: WorldState, actor: Actor) -> tuple[float, list[dict[str, Any]]]:
    by_kind: dict[str, list] = {}
    for o in actor.objectives:
        by_kind.setdefault(o.kind, []).append(o)
    present = {k: v for k, v in OBJECTIVE_POINTS.items() if k in by_kind}
    total_present = sum(present.values()) or 1.0
    scale = 40.0 / total_present  # redistribution proportionnelle des catégories absentes
    points = 0.0
    details = []
    for kind, objs in by_kind.items():
        if kind not in OBJECTIVE_POINTS:
            continue
        kind_pts = OBJECTIVE_POINTS[kind] * scale
        for o in objs:
            pr = progress(world, actor, o.metric)
            pts = kind_pts / len(objs) * pr
            points += pts
            details.append({"id": o.id, "kind": kind, "text": o.text, "progress": round(pr, 3), "points": round(pts, 2), "max_points": round(kind_pts / len(objs), 2)})
    return points, details


def final_index(world: WorldState, actor: Actor) -> dict[str, Any]:
    obj_pts, details = objective_points(world, actor)
    # Position stratégique (20) : puissance relative finale + évolution depuis le début.
    powers = {a.id: actor_power(world, a) for a in world.actors.values()}
    rank = sorted(powers, key=lambda k: -powers[k]).index(actor.id)
    first = world.balance_history[0]["powers"].get(actor.id, powers[actor.id]) if world.balance_history else powers[actor.id]
    evolution = (powers[actor.id] - first) / max(1.0, first)
    position = 10 * (1 - rank / max(1, len(powers) - 1)) + 10 * max(0.0, min(1.0, 0.5 + evolution * 2.5))
    # Gestion des capitaux (15) : valeur créée par point dépensé, santé finale.
    spent = actor.capital_spent.total()
    value = obj_pts / 40 + max(0.0, evolution)
    health = min(1.0, actor.capitals.total() / max(1.0, actor.initial_capitals.total()))
    efficiency = (value / (0.4 + spent / 120)) if spent > 0 else value * 0.6  # ne rien dépenser sans résultat n'est pas récompensé
    capital_mgmt = 15 * max(0.0, min(1.0, 0.55 * min(1.0, efficiency) + 0.45 * health))
    # Cohérence et exécution (15) : actions alignées, engagements tenus, réussite des opérations.
    mine = [d for d in world.decisions_log if d.get("actor") == actor.id]
    targets_of_objectives = {o.metric.get("target") for o in actor.objectives} | {o.metric.get("zone") for o in actor.objectives}
    aligned = sum(1 for d in mine if set(d.get("targets") or []) & targets_of_objectives or d.get("zone") in targets_of_objectives or d.get("category") in ("domestic_policy", "defensive_posture"))
    alignment = aligned / len(mine) if mine else 0.3
    commits = [c for c in world.commitments if c.from_actor == actor.id and c.status in ("honored", "broken", "expired") and c.kind != "threat"]
    honor = (sum(1 for c in commits if c.status == "honored") / len(commits)) if commits else 0.6
    audits = [a for a in world.audit if a.actor == actor.id]
    success = (sum(1 for a in audits if a.outcome in ("success", "major_success")) + 0.5 * sum(1 for a in audits if a.outcome == "partial")) / len(audits) if audits else 0.3
    coherence = 15 * (0.4 * alignment + 0.3 * honor + 0.3 * success)
    # Résilience (10) : remontée après le point bas, stabilité préservée.
    totals = [h["capitals"]["political"] + h["capitals"]["economic"] + h["capitals"]["military"] for h in actor.history] or [actor.capitals.total()]
    low = min(totals)
    recovery = (actor.capitals.total() - low) / max(1.0, actor.initial_capitals.total() - low) if actor.initial_capitals.total() > low else 1.0
    resilience = 10 * (0.6 * max(0.0, min(1.0, recovery)) + 0.4 * min(1.0, actor.stability / 60))
    components = {"objectives": round(obj_pts, 2), "position": round(position, 2), "capital_management": round(capital_mgmt, 2),
                  "coherence": round(coherence, 2), "resilience": round(resilience, 2)}
    total = round(min(100.0, sum(components.values())), 1)
    return {"actor": actor.id, "name": actor.name, "total": total, "components": components, "objectives": details,
            "spent": actor.capital_spent.model_dump(), "evolution": round(evolution, 3), "recovery": round(recovery, 3)}


def ranking(world: WorldState) -> list[dict[str, Any]]:
    scores = [final_index(world, a) for a in world.humans()]
    scores.sort(key=lambda s: -s["total"])
    for i, s in enumerate(scores):
        s["rank"] = i + 1
        s["qualification"] = None
    for i, s in enumerate(scores[:3]):
        margin = s["total"] - (scores[i + 1]["total"] if i + 1 < len(scores) else 0)
        actor = world.actors[s["actor"]]
        spent = actor.capital_spent.total()
        lost = actor.initial_capitals.total() - actor.capitals.total()
        if i == 0:
            if s["total"] >= 72 and margin >= 8:
                q = "Victoire décisive"
            elif spent > 70 and lost > 25:
                q = "Victoire coûteuse"
            elif margin < 3:
                q = "Victoire fragile"
            elif s["components"]["objectives"] >= 26:
                q = "Victoire stratégique"
            else:
                q = "Victoire tactique"
        elif i == 1:
            q = "Deuxième place — succès stratégique" if s["components"]["objectives"] >= 22 else "Deuxième place — succès tactique"
        else:
            q = "Troisième place — succès fragile" if margin < 3 else "Troisième place — succès tactique"
        s["qualification"] = q
    return scores


def mentions(world: WorldState, scores: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    humans = {a.id for a in world.humans()}
    honored = {a: sum(1 for c in world.commitments if c.from_actor == a and c.status == "honored" and c.kind != "threat") for a in humans}
    if honored:
        best = max(honored, key=honored.get)
        broken = sum(1 for c in world.commitments if c.from_actor == best and c.status == "broken")
        if honored[best] >= 2 and broken == 0:
            out.append({"actor": best, "mention": "Mention diplomatie", "reason": f"{honored[best]} engagements tenus, aucun rompu."})
    intel_scores = {a: sum({"exact": 1, "partial": 0.5}.get(r.accuracy, 0) for r in world.intel if r.owner == a) for a in humans}
    if intel_scores:
        best = max(intel_scores, key=intel_scores.get)
        if intel_scores[best] >= 1.5:
            out.append({"actor": best, "mention": "Mention renseignement", "reason": "Renseignements exacts ou recoupés obtenus à plusieurs reprises."})
    for s in scores:
        if s["recovery"] >= 0.8 and world.actors[s["actor"]].history:
            totals = [h["capitals"]["political"] + h["capitals"]["economic"] + h["capitals"]["military"] for h in world.actors[s["actor"]].history]
            if world.actors[s["actor"]].initial_capitals.total() - min(totals) >= 20:
                out.append({"actor": s["actor"], "mention": "Mention résilience", "reason": "Redressement complet après un point bas sévère."})
                break
    big_cards = [c for c in world.cards_used if c.actor in humans and c.result.get("outcome") in ("major_success",)]
    if big_cards:
        out.append({"actor": big_cards[0].actor, "mention": "Mention manœuvre stratégique", "reason": "Une carte stratégique a produit un succès majeur."})
    if len(world.balance_history) > 2 and scores:
        mid = world.balance_history[len(world.balance_history) // 2]["powers"]
        mid_rank = sorted((a for a in humans if a in mid), key=lambda a: -mid[a])
        for s in scores[:1]:
            if s["actor"] in mid_rank and mid_rank.index(s["actor"]) >= 2:
                out.append({"actor": s["actor"], "mention": "Mention retournement", "reason": "Vainqueur après avoir été distancé en milieu de partie."})
    return out
