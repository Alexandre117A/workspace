"""Filtrage des informations selon les quatre niveaux.

1. Vérité moteur : `WorldState` complet (jamais envoyé à un client).
2. Public : ce que tous les participants peuvent voir.
3. Équipe : public + son propre dossier et ses informations privées.
4. Président : public + vision privilégiée (rapport de force réel, situation de
   tous les acteurs) — sans objectifs secrets, lignes rouges ni vérité des
   renseignements, et sans aucun résultat futur (les tirages n'existent qu'à la
   résolution).
"""
from __future__ import annotations

from typing import Any

from . import cards as cards_mod
from .actions import CATALOG
from .balance import camp_shares, ranking
from .intel import public_report
from .models import WorldState
from .scoring import VISIBLE_METRICS, progress
from .text import sim_time_label

BALANCE_PUBLIC_ROUND = 3


def _public_actor(world: WorldState, a) -> dict[str, Any]:
    return {"id": a.id, "name": a.name, "short": a.short, "kind": a.kind, "iso_n3": a.iso_n3, "leader": a.leader,
            "leader_status": a.leader_source.status, "description": a.description, "controlled_by": a.controlled_by,
            "camp": a.camp, "camp_label": world.setting.camps.get(a.camp, a.camp),
            "regions": [r.model_dump() for r in a.regions[:6]]}


def public_view(world: WorldState) -> dict[str, Any]:
    s = world.setting
    balance = None
    if world.round >= BALANCE_PUBLIC_ROUND:
        shares = camp_shares(world)
        balance = {"shares": {k: round(v * 100) for k, v in shares["shares"].items()}, "labels": s.camps, "ranking": ranking(world)}
    return {
        "level": "public",
        "setting": {"mode": s.mode, "title": s.title, "topic": s.topic, "start_label": s.start_label, "era": s.era,
                    "theatre": s.theatre.model_dump(), "camps": s.camps, "special_rules": s.special_rules, "knowledge_cutoff": s.knowledge_cutoff},
        "round": world.round,
        "rounds_planned": world.plan.rounds_planned,
        "sim_time": sim_time_label(world),
        "actors": [_public_actor(world, a) for a in world.actors.values()],
        "zones": [{"id": z.id, "name": z.name, "domain": z.domain, "region": z.region.model_dump(), "tension": round(z.tension)} for z in world.zones],
        "events": [{"id": e.id, "round": e.round, "kind": e.kind, "title": e.title, "text": e.text, "figures": {k: v for k, v in e.figures.items() if not k.startswith("_") and k not in ("attacker", "target")},
                    "location": e.location.model_dump() if e.location else None, "actors": e.actors}
                   for e in world.events if e.scope == "public"][-40:],
        "commitments": [{"from": c.from_actor, "to": c.to_actor, "kind": c.kind, "text": c.text, "status": c.status, "round": c.round}
                        for c in world.commitments if c.public],
        "communiques": [{"id": c.id, "round": c.round, "title": c.title, "dateline": c.dateline, "body": c.body, "general_impact": c.general_impact,
                         "figures": {k: v for k, v in c.figures.items() if not k.startswith("_")}, "origin": c.origin}
                        for c in world.communiques if c.delivered],
        "rounds": [{"round": r.round, "title": r.title, "narrative": r.narrative, "highlights": r.highlights, "sim_time": r.sim_time_label} for r in world.rounds],
        "balance": balance,
        "balance_unlock_round": BALANCE_PUBLIC_ROUND,
        "plan": world.plan.model_dump(),
        "catalog": {k: v["label"] for k, v in CATALOG.items()},
        "wars": [[r.a, r.b] for r in world.relations.values() if r.at_war],
    }


def team_view(world: WorldState, actor_id: str) -> dict[str, Any]:
    view = public_view(world)
    view["level"] = "team"
    a = world.actors[actor_id]
    view["me"] = {
        **_public_actor(world, a),
        "capitals": a.capitals.model_dump(),
        "initial_capitals": a.initial_capitals.model_dump(),
        "stability": a.stability, "cohesion": a.cohesion, "approval": a.approval,
        "indicators_source": a.indicators_source.model_dump(),
        "resources": [{"key": r.key, "label": r.label, "quantity": r.quantity, "available": a.available(r.key), "unit": r.unit, "category": r.category,
                       "usable": r.usable, "abstraction": r.abstraction, "status": r.source.status} for r in a.resources],
        "locks": [l.model_dump() for l in a.locks],
        "objectives": [{"id": o.id, "kind": o.kind, "text": o.text,
                        "progress": round(progress(world, a, o.metric), 2) if o.metric.get("type") in VISIBLE_METRICS else None} for o in a.objectives],
        "red_lines": a.red_lines,
        "secrets": a.secrets,
        "facts": [f.model_dump() for f in a.facts],
        "relations": [{"with": other.id, "trust": round(world.relation(a.id, other.id).trust), "tension": round(world.relation(a.id, other.id).tension),
                       "alliance": world.relation(a.id, other.id).alliance, "at_war": world.relation(a.id, other.id).at_war}
                      for other in world.actors.values() if other.id != a.id],
        "history": a.history[-12:],
    }
    view["private_events"] = [{"id": e.id, "round": e.round, "kind": e.kind, "title": e.title, "text": e.text, "figures": e.figures,
                               "location": e.location.model_dump() if e.location else None}
                              for e in world.events if a.id in e.audience or (e.scope == "public" and a.id in e.actors and e.kind.startswith("domestic"))][-30:]
    view["intel"] = [public_report(r) for r in world.intel if r.owner == a.id]
    view["cards"] = cards_mod.availability(world, a.id)
    view["cards_used"] = [{"id": c.id, "card": c.card, "round": c.round, "official_request": c.official_request, "status": c.status, "result": c.result}
                          for c in world.cards_used if c.actor == a.id]
    view["my_commitments"] = [{"id": c.id, "from": c.from_actor, "to": c.to_actor, "kind": c.kind, "text": c.text, "status": c.status, "round": c.round}
                              for c in world.commitments if a.id in (c.from_actor, c.to_actor)]
    for comm in view["communiques"]:
        full = next(c for c in world.communiques if c.id == comm["id"])
        comm["for_me"] = full.per_actor.get(a.id, [])
    return view


def president_view(world: WorldState) -> dict[str, Any]:
    view = public_view(world)
    view["level"] = "president"
    shares = camp_shares(world)
    view["true_balance"] = {"shares": {k: round(v * 100, 1) for k, v in shares["shares"].items()}, "leader": shares["leader"],
                            "leader_share": round(shares["leader_share"] * 100, 1), "labels": world.setting.camps,
                            "history": [{"round": h["round"], "shares": h["shares"]} for h in world.balance_history]}
    view["ranking"] = ranking(world)
    view["actors_detail"] = [{"id": a.id, "name": a.name, "controlled_by": a.controlled_by, "camp": a.camp, "capitals": a.capitals.model_dump(),
                              "stability": a.stability, "approval": a.approval, "cohesion": a.cohesion, "engagement": a.engagement}
                             for a in world.actors.values()]
    view["dominant"] = [r for r in view["ranking"][:3]]
    view["troubled"] = [{"id": a.id, "name": a.name, "stability": a.stability} for a in world.actors.values() if a.stability < 35 or a.capitals.total() < 0.7 * a.initial_capitals.total()]
    view["all_events"] = [{"id": e.id, "round": e.round, "kind": e.kind, "title": e.title, "text": e.text, "scope": e.scope} for e in world.events][-60:]
    view["wars"] = [[r.a, r.b] for r in world.relations.values() if r.at_war]
    view["pending_operations"] = sum(1 for o in world.operations if o.status == "pending")
    view["communiques_all"] = [{"id": c.id, "round": c.round, "title": c.title, "per_actor": c.per_actor, "delivered": c.delivered, "origin": c.origin}
                               for c in world.communiques if c.delivered]
    view["rome_state"] = world.rome.model_dump()
    return view


def all_views(world: WorldState) -> dict[str, Any]:
    return {
        "public": public_view(world),
        "president": president_view(world),
        "teams": {a.id: team_view(world, a.id) for a in world.humans()},
    }


def rome_payload(world: WorldState, comm_id: str) -> dict[str, Any]:
    c = next(x for x in world.communiques if x.id == comm_id)
    general = {"id": c.id, "title": c.title, "dateline": c.dateline, "body": c.body, "general_impact": c.general_impact,
               "figures": {k: v for k, v in c.figures.items() if not k.startswith("_")}, "origin": c.origin, "kind": c.kind}
    return {"general": general, "per_team": {a.id: c.per_actor.get(a.id, []) for a in world.humans()}, "president": {**general, "per_actor": c.per_actor}}
