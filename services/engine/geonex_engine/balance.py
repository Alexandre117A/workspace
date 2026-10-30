"""Rapport de force caché : puissance des acteurs et parts des camps."""
from __future__ import annotations

from .models import Actor, WorldState


def actor_power(world: WorldState, actor: Actor) -> float:
    c = actor.capitals
    base = 0.40 * c.military + 0.35 * c.economic + 0.25 * c.political
    base *= 0.75 + 0.25 * (actor.stability / 100)
    zone_bonus = sum(z.control.get(actor.id, 0.0) * 14 for z in world.zones)
    return round(base * (0.45 + 0.55 * actor.engagement) + zone_bonus, 3)


def camp_shares(world: WorldState) -> dict:
    totals: dict[str, float] = {}
    for actor in world.actors.values():
        if actor.camp == "neutral":
            continue
        totals[actor.camp] = totals.get(actor.camp, 0.0) + actor_power(world, actor)
    grand = sum(totals.values()) or 1.0
    shares = {camp: round(v / grand, 4) for camp, v in totals.items()}
    leader = max(shares, key=shares.get) if shares else None
    return {"shares": shares, "leader": leader, "leader_share": shares.get(leader, 0.0) if leader else 0.0}


def snapshot(world: WorldState) -> dict:
    data = camp_shares(world)
    record = {
        "round": world.round,
        **data,
        "powers": {a.id: actor_power(world, a) for a in world.actors.values()},
    }
    world.balance_history = [r for r in world.balance_history if r["round"] != world.round] + [record]
    return record


def ranking(world: WorldState) -> list[dict]:
    powers = sorted(((actor_power(world, a), a) for a in world.actors.values()), key=lambda x: -x[0])
    top = powers[0][0] if powers else 1.0
    return [{"id": a.id, "name": a.name, "index": round(100 * p / top) if top else 0, "camp": a.camp} for p, a in powers]
