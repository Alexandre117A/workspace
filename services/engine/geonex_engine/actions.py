"""Catalogue des décisions, validation côté moteur, probabilités et effets.

Une décision mobilise des capitaux (points dépensés) et des ressources
(consommées ou immobilisées). Les probabilités sont calculées sur l'état du
début du round (résolution simultanée) puis tirées de façon reproductible.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Optional

from . import dynamics
from .models import Actor, AuditRecord, CAPITAL_KEYS, Effect, ResourceLock, WorldState
from .probability import OUTCOME_LABEL_FR, OUTCOME_MAGNITUDE, assess, draw, investment, rng_for

CATALOG: dict[str, dict[str, Any]] = {
    "diplomatic_initiative": {"label": "Initiative diplomatique", "capital": "political", "base": 0.5, "hostile": False, "needs_target": True},
    "alliance": {"label": "Proposition d'alliance", "capital": "political", "base": 0.0, "hostile": False, "needs_target": True},
    "ceasefire_offer": {"label": "Offre de cessez-le-feu / négociation", "capital": "political", "base": 0.2, "hostile": False, "needs_target": True},
    "sanctions": {"label": "Sanctions économiques", "capital": "economic", "base": 0.3, "hostile": True, "needs_target": True},
    "economic_aid": {"label": "Aide économique / accord commercial", "capital": "economic", "base": 0.7, "hostile": False, "needs_target": True},
    "military_deployment": {"label": "Déploiement militaire", "capital": "military", "base": 0.6, "hostile": False, "needs_target": False},
    "military_strike": {"label": "Frappe ou offensive militaire", "capital": "military", "base": -0.1, "hostile": True, "needs_target": True},
    "defensive_posture": {"label": "Posture défensive", "capital": "military", "base": 0.9, "hostile": False, "needs_target": False},
    "covert_operation": {"label": "Opération clandestine", "capital": "military", "base": -0.35, "hostile": True, "needs_target": True},
    "information_campaign": {"label": "Campagne de communication", "capital": "political", "base": 0.4, "hostile": False, "needs_target": False},
    "domestic_policy": {"label": "Mesures intérieures", "capital": "economic", "base": 0.6, "hostile": False, "needs_target": False},
    "humanitarian": {"label": "Action humanitaire", "capital": "economic", "base": 0.8, "hostile": False, "needs_target": False},
}
HOSTILE = {k for k, v in CATALOG.items() if v["hostile"]}
COOPERATIVE = {"diplomatic_initiative", "alliance", "ceasefire_offer", "economic_aid", "humanitarian"}
# Catégories que le Président doit arbitrer (actions incertaines ou à fort impact).
NEEDS_ARBITRATION = {"military_strike", "covert_operation"}
MAX_ALLOCATION_PER_DECISION = 30
MAX_DECISIONS_PER_ROUND = 3


@dataclass
class Decision:
    id: str
    actor: str
    category: str
    targets: list[str] = field(default_factory=list)
    zone: Optional[str] = None
    intent: str = ""
    allocation: dict[str, float] = field(default_factory=dict)
    resources: list[dict[str, Any]] = field(default_factory=list)
    secret: bool = False
    president_probability: Optional[float] = None
    ruling: str = "none"  # none | approved | refused | timeout
    origin: str = "human"

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Decision":
        return cls(
            id=str(d["id"]), actor=d["actor"], category=d["category"], targets=list(d.get("targets") or []),
            zone=d.get("zone"), intent=d.get("intent", "")[:1200],
            allocation={k: float(v) for k, v in (d.get("allocation") or {}).items() if k in CAPITAL_KEYS},
            resources=[{"key": r["key"], "quantity": float(r["quantity"])} for r in (d.get("resources") or []) if float(r.get("quantity", 0)) > 0],
            secret=bool(d.get("secret", False)), president_probability=d.get("president_probability"),
            ruling=d.get("ruling", "none"), origin=d.get("origin", "human"),
        )

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


def validate(world: WorldState, decisions: list[Decision]) -> dict[str, list[str]]:
    """Vérifie un lot de décisions d'un même acteur (capitaux, ressources, cibles)."""
    errors: dict[str, list[str]] = {}
    if not decisions:
        return errors
    actor = world.actors.get(decisions[0].actor)
    spent = {k: 0.0 for k in CAPITAL_KEYS}
    used: dict[str, float] = {}
    if len(decisions) > MAX_DECISIONS_PER_ROUND:
        errors["_batch"] = [f"Au plus {MAX_DECISIONS_PER_ROUND} décisions par round."]
    for d in decisions:
        errs: list[str] = []
        if actor is None or d.actor != actor.id:
            errs.append("Acteur inconnu ou lot incohérent.")
            errors[d.id] = errs
            continue
        spec = CATALOG.get(d.category)
        if spec is None:
            errs.append("Catégorie de décision inconnue.")
        else:
            if spec["needs_target"] and not d.targets:
                errs.append("Cette action nécessite une cible.")
        for t in d.targets:
            if t not in world.actors:
                errs.append(f"Cible inconnue : {t}")
            elif t == actor.id:
                errs.append("Un acteur ne peut pas se cibler lui-même.")
        if d.zone and world.zone(d.zone) is None:
            errs.append("Zone inconnue.")
        for k, v in d.allocation.items():
            if v < 0:
                errs.append("Allocation négative interdite.")
            if v > MAX_ALLOCATION_PER_DECISION:
                errs.append(f"Au plus {MAX_ALLOCATION_PER_DECISION} points de capital par décision.")
            spent[k] += v
        for r in d.resources:
            res = actor.resource(r["key"])
            if res is None:
                errs.append(f"Ressource inconnue : {r['key']}")
            elif not res.usable:
                errs.append(f"« {res.label} » ne peut pas être engagée dans une action.")
            else:
                used[r["key"]] = used.get(r["key"], 0.0) + r["quantity"]
        if errs:
            errors[d.id] = errs
    if actor is not None:
        for k, v in spent.items():
            if v > actor.capitals.get(k) + 1e-6:
                errors.setdefault("_batch", []).append(f"Capital {k} insuffisant ({v:.0f} demandés, {actor.capitals.get(k):.0f} disponibles).")
        for key, qty in used.items():
            if qty > actor.available(key) + 1e-6:
                res = actor.resource(key)
                errors.setdefault("_batch", []).append(f"« {res.label if res else key} » : {qty:g} demandés, {actor.available(key):g} disponibles.")
    return errors


def _rel_capital(actor: Actor, category: str) -> float:
    spec = CATALOG[category]
    return actor.capitals.get(spec["capital"])


def assess_decision(world: WorldState, d: Decision, round_decisions: list[Decision]) -> tuple[float, dict[str, float], Any]:
    actor = world.actors[d.actor]
    spec = CATALOG[d.category]
    target = world.actors.get(d.targets[0]) if d.targets else None
    alloc_total = sum(d.allocation.values())
    res_total = sum(r["quantity"] for r in d.resources)
    factors: dict[str, float] = {
        "investissement": investment(alloc_total),
        "ressources": 0.45 * math.log1p(res_total),
        "stabilité": (actor.stability - 50) / 70,
    }
    if d.category in ("military_strike", "military_deployment", "covert_operation"):
        factors["disponibilité opérationnelle"] = (actor.readiness - 70) / 60
    if target is not None:
        if spec["hostile"]:
            factors["capacités"] = (_rel_capital(actor, d.category) - _rel_capital(target, d.category)) / 32
            defenses = [x for x in round_decisions if x.actor == target.id and x.category in ("defensive_posture", "military_deployment")]
            if defenses and d.category in ("military_strike", "covert_operation"):
                factors["opposition"] = -0.35 - 0.25 * math.log1p(sum(sum(x.allocation.values()) for x in defenses) / 10)
            if d.category == "military_strike" and any(r.key == "nuclear_deterrent" for r in target.resources):
                factors["dissuasion"] = -0.6
        else:
            rel = world.relation(actor.id, target.id)
            factors["relation"] = rel.trust / 55
            if d.category == "alliance":
                if target.controlled_by == "human":
                    reciprocal = any(x.actor == target.id and x.category == "alliance" and actor.id in x.targets for x in round_decisions)
                    promised = any(c.from_actor == target.id and c.to_actor == actor.id and c.kind in ("alliance", "agreement") and c.status == "open" for c in world.commitments)
                    factors["réciprocité"] = 1.4 if reciprocal else (0.7 if promised else -1.1)
                else:
                    factors["intérêt de la cible"] = (target.personality.cooperation - 0.5) * 1.5 + (0.6 if target.camp == actor.camp else -0.4)
            if d.category == "ceasefire_offer" and target is not None:
                reciprocal = any(x.actor == target.id and x.category == "ceasefire_offer" and actor.id in x.targets for x in round_decisions)
                factors["réciprocité"] = 1.3 if reciprocal else -0.2
        intel = [r for r in world.intel if r.owner == actor.id and target.id in r.subjects and r.round >= world.round - 2]
        if intel:
            # Effet fondé sur la vérité : un renseignement trompeur dessert l'action.
            truth_quality = sum({"exact": 0.5, "partial": 0.25, "uncertain": 0.05, "misleading": -0.4}[r.accuracy] for r in intel)
            factors["renseignement"] = max(-0.6, min(0.6, truth_quality))
    return spec["base"], factors, target


def effects_for(world: WorldState, d: Decision, outcome: str, round_decisions: list[Decision]) -> tuple[list[Effect], list[dict], dict]:
    """Effets d'une décision résolue. Retourne (effets, opérations différées, méta)."""
    actor = world.actors[d.actor]
    target = world.actors.get(d.targets[0]) if d.targets else None
    alloc_total = sum(d.allocation.values())
    m = OUTCOME_MAGNITUDE[outcome] * (0.6 + 0.4 * math.log1p(alloc_total / 10))
    label = CATALOG[d.category]["label"]
    reason = f"{label} — {OUTCOME_LABEL_FR[outcome]}"
    E: list[Effect] = []
    ops: list[dict] = []
    meta: dict[str, Any] = {}

    def add(who: str, field_: str, delta: float, why: str = reason) -> None:
        if abs(delta) > 1e-6:
            E.append(Effect(actor=who, field=field_, delta=round(delta, 3), reason=why))

    def both_trust(delta: float) -> None:
        if target:
            add(actor.id, f"trust:{target.id}", delta)

    def both_tension(delta: float) -> None:
        if target:
            add(actor.id, f"tension:{target.id}", delta)

    c = d.category
    if c == "diplomatic_initiative":
        both_trust(10 * m)
        both_tension(-8 * max(m, 0))
        add(actor.id, "political", 3 * m if m > 0 else -1)
    elif c == "alliance":
        if outcome in ("success", "major_success") and target:
            meta["alliance"] = (actor.id, target.id)
            both_trust(15)
            add(actor.id, "political", 2)
            add(target.id, "political", 2)
        elif outcome == "partial":
            both_trust(6)
        else:
            add(actor.id, "political", -2)
            both_trust(-6 if outcome == "backfire" else 0)
    elif c == "ceasefire_offer":
        reciprocal = target and any(x.actor == target.id and x.category == "ceasefire_offer" and actor.id in x.targets for x in round_decisions)
        if target and reciprocal and outcome != "backfire":
            meta["ceasefire"] = (actor.id, target.id)
            both_tension(-20)
        else:
            both_tension(-5 * max(m, 0))
        add(actor.id, "political", 2 if m > 0 else -1)
    elif c == "sanctions" and target:
        # Effet réel selon la dépendance économique : plus la cible dépend de l'émetteur, plus elle souffre.
        add(target.id, "economic", -6 * max(m, 0.15) * (0.7 + 0.9 * dynamics.dependency(world, target.id, actor.id)))
        add(actor.id, "economic", -1.5 * (0.7 + 0.9 * dynamics.dependency(world, actor.id, target.id)), "Coût des sanctions imposées")
        both_trust(-10)
        both_tension(8)
        if outcome == "backfire":
            add(actor.id, "economic", -3)
            add(actor.id, "political", -3)
    elif c == "economic_aid" and target:
        add(target.id, "economic", 4 * max(m, 0))
        both_trust(10 * max(m, 0.2))
        add(actor.id, "political", 2 * max(m, 0))
    elif c == "military_deployment":
        zone = world.zone(d.zone) if d.zone else (world.zones[0] if world.zones else None)
        if zone:
            add(actor.id, f"control:{zone.id}", 0.12 * max(m, 0))
            for other, share in zone.control.items():
                if other != actor.id and share > 0.05 and world.actors.get(other) and world.actors[other].camp != actor.camp:
                    add(actor.id, f"tension:{other}", 6)
        add(actor.id, "approval", 1.5 * max(m, 0))
        meta["lock_rounds"] = 2
    elif c == "military_strike" and target:
        add(target.id, "military", -8 * max(m, 0.1))
        mil_res = [r for r in target.resources if r.category == "military" and r.usable and r.quantity > 0]
        if mil_res and m > 0:
            add(target.id, f"resource:{mil_res[0].key}", -max(1.0, round(m)), f"Pertes subies ({actor.name})")
        zone = world.zone(d.zone) if d.zone else None
        if zone and m > 0:
            add(actor.id, f"control:{zone.id}", 0.18 * m)
        meta["war"] = (actor.id, target.id)
        both_tension(25)
        both_trust(-30)
        add(target.id, "approval", 3, "Ralliement national après l'attaque")
        add(actor.id, "political", -4, "Coût international d'une frappe")
        for other in world.actors.values():
            if other.id not in (actor.id, target.id) and not world.relation(other.id, actor.id).alliance:
                add(other.id, f"trust:{actor.id}", -5, f"Condamnation de la frappe de {actor.name}")
        if outcome in ("success", "major_success"):
            add(actor.id, "approval", 3, "Succès militaire")
        if outcome == "backfire":
            add(actor.id, "military", -5)
            add(actor.id, "political", -6)
        meta["consume_ratio"] = 0.2 if m >= 1 else (0.35 if m > 0 else 0.5)
        meta["lock_rounds"] = 1
    elif c == "defensive_posture":
        add(actor.id, "stability", 2)
        meta["lock_rounds"] = 1
    elif c == "covert_operation" and target:
        # Résolution différée au round suivant : conséquences retardées.
        ops.append({"category": "covert_operation", "targets": [target.id], "intent": d.intent, "outcome": outcome, "magnitude": m, "decision_id": d.id})
        meta["lock_rounds"] = 1
        meta["deferred"] = True
    elif c == "information_campaign":
        add(actor.id, "approval", 4 * m if m > 0 else -2)
        if target:
            add(target.id, "political", -3 * max(m, 0), f"Campagne de communication de {actor.name}")
        if outcome == "backfire":
            add(actor.id, "political", -3)
    elif c == "domestic_policy":
        add(actor.id, "stability", 6 * max(m, 0))
        add(actor.id, "approval", 5 * max(m, 0) if m > 0 else -2)
        add(actor.id, "cohesion", 3 * max(m, 0))
    elif c == "humanitarian":
        who = target or actor
        add(who.id, "stability", 4 * max(m, 0), f"Aide humanitaire de {actor.name}")
        add(actor.id, "political", 4 * max(m, 0))
        if target:
            both_trust(8 * max(m, 0.2))
    # Engagement dans le théâtre : agir implique davantage l'acteur.
    if c in HOSTILE or c in ("military_deployment", "alliance", "ceasefire_offer"):
        add(actor.id, "engagement", 0.1, "Implication accrue dans la crise")
    return E, ops, meta


def resolve_decisions(world: WorldState, decisions: list[Decision]) -> dict[str, Any]:
    """Résout toutes les décisions du round dans un environnement commun."""
    ordered = sorted(decisions, key=lambda x: (x.actor, x.id))
    effects: list[Effect] = []
    results: list[dict[str, Any]] = []
    deferred: list[dict] = []
    for d in ordered:
        actor = world.actors[d.actor]
        if d.ruling == "refused":
            results.append({"decision_id": d.id, "actor": d.actor, "category": d.category, "outcome": "refused",
                            "summary": f"{CATALOG[d.category]['label']} refusée par le Président de séance.", "secret": d.secret})
            continue
        base, factors, target = assess_decision(world, d, ordered)
        a = assess(base, factors, d.president_probability)
        seed_key = f"{world.round}:decision:{d.id}"
        rng = rng_for(world.seed, seed_key)
        roll, outcome = draw(rng, a.probability)
        world.audit.append(AuditRecord(
            id=world.next_id("AUD"), round=world.round, ref=d.id, actor=d.actor, category=d.category, factors=a.contributions,
            base_logit=base, probability_engine=a.probability_engine, president_probability=d.president_probability,
            probability=a.probability, roll=roll, outcome=outcome, seed_key=seed_key,
        ))
        eff, ops, meta = effects_for(world, d, outcome, ordered)
        effects.extend(eff)
        for op in ops:
            deferred.append({**op, "actor": d.actor})
        # Dépense des capitaux engagés (consommés quel que soit le résultat).
        for k, v in d.allocation.items():
            if v > 0:
                effects.append(Effect(actor=d.actor, field=k, delta=-v, reason=f"Capital engagé : {CATALOG[d.category]['label']}"))
                actor.capital_spent.set(k, actor.capital_spent.get(k) + v)
        # Ressources : consommation partielle et immobilisation.
        for r in d.resources:
            res = actor.resource(r["key"])
            if res is None:
                continue
            consumed = round(r["quantity"] * meta.get("consume_ratio", 0.0), 2)
            if res.category in ("economic", "political") and d.category not in ("military_deployment", "defensive_posture"):
                consumed = r["quantity"]  # budgets et canaux engagés sont dépensés
            if consumed > 0:
                effects.append(Effect(actor=d.actor, field=f"resource:{res.key}", delta=-consumed, reason=f"Consommé : {CATALOG[d.category]['label']}"))
            remaining = r["quantity"] - consumed
            if remaining > 0 and meta.get("lock_rounds"):
                actor.locks.append(ResourceLock(key=res.key, quantity=remaining, release_round=world.round + meta["lock_rounds"], reason=CATALOG[d.category]["label"]))
        if meta.get("war"):
            x, y = meta["war"]
            world.relation(x, y).at_war = True
        if meta.get("alliance"):
            x, y = meta["alliance"]
            world.relation(x, y).alliance = True
        if meta.get("ceasefire"):
            x, y = meta["ceasefire"]
            world.relation(x, y).at_war = False
        results.append({
            "decision_id": d.id, "actor": d.actor, "category": d.category, "targets": d.targets, "outcome": outcome,
            "outcome_label": OUTCOME_LABEL_FR[outcome] if not meta.get("deferred") else "en cours (résultat au prochain round)",
            "summary": summarize(world, d, outcome, target, meta), "secret": d.secret or d.category == "covert_operation",
            "intent": d.intent, "origin": d.origin,
        })
    return {"effects": effects, "results": results, "deferred": deferred}


def summarize(world: WorldState, d: Decision, outcome: str, target: Optional[Actor], meta: dict) -> str:
    actor = world.actors[d.actor]
    label = CATALOG[d.category]["label"].lower()
    tgt = f" visant {target.name}" if target else ""
    if meta.get("deferred"):
        return f"{actor.name} lance une opération clandestine{tgt}. Ses effets se manifesteront plus tard."
    return f"{actor.name} : {label}{tgt} — {OUTCOME_LABEL_FR[outcome]}."
