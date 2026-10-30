"""Application unique et bornée des effets sur l'état du monde.

Toute modification de capitaux, indicateurs, relations, ressources ou zones
passe par ici : les ressources ne peuvent ni devenir négatives ni apparaître
sans justification, et chaque changement garde sa raison (explications de
fin de round).
"""
from __future__ import annotations

from collections import defaultdict

from .models import CAPITAL_KEYS, Effect, WorldState

INDICATORS = ("stability", "approval", "cohesion")


def apply_effect(world: WorldState, eff: Effect) -> Effect:
    actor = world.actors.get(eff.actor)
    if actor is None or abs(eff.delta) < 1e-9:
        return Effect(actor=eff.actor, field=eff.field, delta=0.0, reason=eff.reason)
    field = eff.field
    applied = 0.0
    if field in CAPITAL_KEYS:
        applied = actor.capitals.add(field, eff.delta)
    elif field in INDICATORS:
        before = getattr(actor, field)
        after = round(max(0.0, min(100.0, before + eff.delta)), 2)
        setattr(actor, field, after)
        applied = after - before
    elif field == "engagement":
        before = actor.engagement
        actor.engagement = round(max(0.1, min(1.0, before + eff.delta)), 3)
        applied = actor.engagement - before
    elif field.startswith("trust:") or field.startswith("tension:"):
        kind, other = field.split(":", 1)
        if other in world.actors and other != actor.id:
            rel = world.relation(actor.id, other)
            if kind == "trust":
                before = rel.trust
                rel.trust = round(max(-100.0, min(100.0, before + eff.delta)), 2)
                applied = rel.trust - before
            else:
                before = rel.tension
                rel.tension = round(max(0.0, min(100.0, before + eff.delta)), 2)
                applied = rel.tension - before
    elif field.startswith("resource:"):
        key = field.split(":", 1)[1]
        res = actor.resource(key)
        if res is not None:
            before = res.quantity
            after = max(0.0, before + eff.delta)
            if res.max_quantity is not None and eff.delta > 0:
                after = min(after, res.max_quantity)
            res.quantity = round(after, 3)
            applied = res.quantity - before
            # Un verrou ne peut pas dépasser la quantité restante.
            excess = actor.locked(key) - res.quantity
            for lock in [lk for lk in actor.locks if lk.key == key]:
                if excess <= 0:
                    break
                cut = min(lock.quantity, excess)
                lock.quantity -= cut
                excess -= cut
            actor.locks = [lk for lk in actor.locks if lk.quantity > 1e-9]
    elif field.startswith("control:"):
        zone = world.zone(field.split(":", 1)[1])
        if zone is not None:
            before = zone.control.get(actor.id, 0.0)
            after = max(0.0, min(1.0, before + eff.delta))
            zone.control[actor.id] = round(after, 4)
            total = sum(zone.control.values())
            if total > 1.0:
                others = [k for k in zone.control if k != actor.id]
                surplus = total - 1.0
                pool = sum(zone.control[k] for k in others)
                for k in others:
                    if pool > 0:
                        zone.control[k] = round(max(0.0, zone.control[k] - surplus * zone.control[k] / pool), 4)
            applied = zone.control[actor.id] - before
    elif field == "zone_tension":
        pass
    return Effect(actor=eff.actor, field=field, delta=round(applied, 3), reason=eff.reason)


def apply_all(world: WorldState, effects: list[Effect]) -> list[Effect]:
    ordered = sorted(effects, key=lambda e: (e.actor, e.field, e.reason, e.delta))
    return [apply_effect(world, e) for e in ordered]


def explain(applied: list[Effect]) -> dict[str, dict[str, list[dict]]]:
    """Regroupe les effets par acteur et par champ pour l'explication des évolutions."""
    out: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    for e in applied:
        if abs(e.delta) < 0.05:
            continue
        out[e.actor][e.field].append({"delta": round(e.delta, 2), "reason": e.reason})
    return {a: dict(f) for a, f in out.items()}
