"""Renseignement imparfait : vérité moteur vs perception de l'équipe.

Le moteur construit d'abord la vérité (relations, engagements, opérations
réelles), puis la dégrade selon un tirage : exacte, partielle, incertaine ou
trompeuse. La fiabilité affichée (%) et l'appréciation qualitative sont
calculées séparément : l'une n'est jamais la conversion de l'autre.
"""
from __future__ import annotations

import math
import random
from typing import Any

from .models import IntelReport, WorldState
from .probability import assess, draw, investment, rng_for
from .reference_data import normalize

LABELS = ["Très incertaine", "Fragile", "Plausible", "Crédible", "Haute confiance"]
TOPIC_WORDS = {
    "diplomacy": ["accord", "discussion", "negoci", "alliance", "entente", "pacte", "traite", "echange", "appel", "promesse"],
    "intentions": ["intention", "plan", "prepar", "attaque", "offensive", "frappe", "mobilis", "deploi", "operation", "projet"],
    "economy": ["econom", "sanction", "ressource", "commerce", "petrole", "energie", "finance", "budget", "reserve"],
    "stability": ["stabilit", "regime", "gouvernement", "opinion", "interne", "interieur", "coalition", "contestation", "faibless", "pouvoir"],
}


def topics_of(question: str) -> list[str]:
    norm = normalize(question)
    topics = [t for t, words in TOPIC_WORDS.items() if any(w in norm for w in words)]
    return topics or ["diplomacy", "intentions"]


def truth_about(world: WorldState, subjects: list[str], topics: list[str]) -> tuple[list[str], dict[str, float]]:
    facts: list[str] = []
    signal: dict[str, float] = {}
    names = {a: world.actors[a].name for a in subjects if a in world.actors}
    if len(subjects) >= 2 and subjects[0] in world.actors and subjects[1] in world.actors:
        a, b = subjects[0], subjects[1]
        rel = world.relation(a, b)
        if "diplomacy" in topics:
            linked = [c for c in world.commitments if {c.from_actor, c.to_actor} == {a, b} and c.round >= world.round - 3]
            if linked:
                c = linked[-1]
                facts.append(f"{names[c.from_actor]} a pris un engagement de type « {c.kind} » envers {names.get(c.to_actor, 'son interlocuteur')} (round {c.round}).")
                signal["agreement"] = 1.0
            else:
                facts.append(f"Aucun engagement formel récent entre {names[a]} et {names[b]}.")
                signal["agreement"] = 0.0
            facts.append(f"Confiance mutuelle {rel.trust:+.0f}/100, tension {rel.tension:.0f}/100{', alliance en vigueur' if rel.alliance else ''}.")
            signal["trust"] = rel.trust
    for s in subjects:
        actor = world.actors.get(s)
        if actor is None:
            continue
        if "intentions" in topics:
            ops = [o for o in world.operations if o.actor == s and o.status == "pending"]
            recent = [d for d in world.decisions_log if d.get("actor") == s and d.get("round") == world.round - 1]
            hostile = [d for d in recent if d.get("category") in ("military_strike", "covert_operation", "military_deployment", "sanctions")]
            if ops:
                tgt = ", ".join(world.actors[t].name for t in ops[0].targets if t in world.actors) or "une cible non identifiée"
                facts.append(f"{actor.name} conduit une opération clandestine en cours contre {tgt}.")
                signal["hostile_intent"] = 1.0
            elif hostile:
                facts.append(f"{actor.name} a engagé au dernier round : {', '.join(sorted({d['category'] for d in hostile}))}.")
                signal["hostile_intent"] = 0.7
            else:
                facts.append(f"Pas de préparatif offensif identifié chez {actor.name}.")
                signal["hostile_intent"] = 0.0
        if "stability" in topics:
            facts.append(f"Stabilité intérieure de {actor.name} : {actor.stability:.0f}/100 ; approbation {actor.approval:.0f}/100 ; cohésion {actor.cohesion:.0f}/100.")
            signal["stability_weakness"] = max(-1.0, min(1.0, (55 - actor.stability) / 30))
        if "economy" in topics:
            facts.append(f"Capacités économiques de {actor.name} : {actor.capitals.economic:.0f}/100.")
            signal["economic_weakness"] = max(-1.0, min(1.0, (50 - actor.capitals.economic) / 30))
    return facts, signal


def _degrade(facts: list[str], accuracy: str, rng: random.Random) -> str:
    import re

    if accuracy == "exact":
        return " ".join(facts)
    if accuracy == "partial":
        kept = facts[: max(1, len(facts) // 2 + (1 if len(facts) % 2 else 0))]
        blurred = [re.sub(r"(\d+)(/100)", lambda m: f"entre {max(0, int(m.group(1)) - 12)} et {min(100, int(m.group(1)) + 12)}{m.group(2)}", f) for f in kept]
        return "Recoupement partiel : " + " ".join(blurred)
    if accuracy == "uncertain":
        return "Des indices épars suggèrent, sans confirmation, que : " + re.sub(r"\d+", "?", facts[0]).lower() if facts else "Aucun élément exploitable."
    # Trompeur : la conclusion est inversée tout en gardant une forme crédible.
    flipped = []
    for f in facts:
        g = f.replace("Aucun engagement formel", "Un engagement discret a été conclu").replace("Pas de préparatif offensif identifié", "Des préparatifs offensifs ont été repérés")
        g = re.sub(r"(\d+)(/100)", lambda m: f"{min(100, max(0, 100 - int(m.group(1)) + rng.randint(-5, 5)))}{m.group(2)}", g)
        flipped.append(g)
    return " ".join(flipped)


def _perceived_signal(signal: dict[str, float], accuracy: str) -> dict[str, float]:
    if accuracy == "exact":
        return dict(signal)
    if accuracy == "partial":
        return {k: v * 0.7 for k, v in signal.items()}
    if accuracy == "uncertain":
        return {k: v * 0.25 for k, v in signal.items()}
    return {k: (-v if k != "trust" else -v) for k, v in signal.items()}


def gather(world: WorldState, owner: str, subjects: list[str], question: str, kind: str, invest_points: float,
           resource_qty: float, seed_key: str) -> IntelReport:
    rng = rng_for(world.seed, seed_key)
    actor = world.actors[owner]
    topics = topics_of(question)
    facts, signal = truth_about(world, subjects, topics)
    counter = [world.actors[s] for s in subjects if s in world.actors]
    counter_intel = sum((t.stability + t.capitals.military) / 2 for t in counter) / max(1, len(counter))
    deception = any(o.category == "disinformation" and o.actor in subjects and owner in o.targets and o.status == "pending" for o in world.operations)
    factors = {
        "investissement": investment(invest_points, scale=10),
        "moyens engagés": 0.4 * math.log1p(resource_qty),
        "services": ((actor.capitals.military + actor.capitals.economic) / 2 - counter_intel) / 40,
    }
    if deception:
        factors["désinformation adverse"] = -0.9
    a = assess(0.2, factors)
    roll, outcome = draw(rng, a.probability)
    accuracy = {"major_success": "exact", "success": "exact", "partial": "partial", "failure": "uncertain", "backfire": "misleading"}[outcome]
    if deception and accuracy in ("exact", "partial") and rng.random() < 0.35:
        accuracy = "misleading"
    # Fiabilité perçue (%), indépendante de l'appréciation qualitative.
    base_pct = {"exact": 76, "partial": 61, "uncertain": 38, "misleading": rng.randint(55, 82)}[accuracy]
    pct = int(max(8, min(95, round(base_pct + rng.gauss(0, 9)))))
    source_quality = round(max(0.05, min(0.95, 0.25 + 0.45 * min(1.0, invest_points / 25) + rng.uniform(-0.15, 0.15))), 3)
    corroboration = sum(1 for r in world.intel if r.owner == owner and set(r.subjects) & set(subjects) and set(r.topics) & set(topics))
    score = 0.55 * source_quality + 0.25 * min(corroboration, 3) / 3 + 0.2 * pct / 100
    if corroboration == 0:
        score -= 0.12  # source unique : prudence des analystes
    label_idx = 0 if score < 0.25 else 1 if score < 0.38 else 2 if score < 0.52 else 3 if score < 0.68 else 4
    finding = _degrade(facts, accuracy, rng)
    report = IntelReport(
        id=world.next_id("INT"), round=world.round, owner=owner, kind=kind, subjects=subjects, question=question[:500],
        finding=finding, accuracy=accuracy, reliability_pct=pct, confidence_label=LABELS[label_idx], source_quality=source_quality,
        corroboration=corroboration, truth_summary=" ".join(facts), deceptive=accuracy == "misleading", topics=topics,
        signal=_perceived_signal(signal, accuracy),
    )
    world.intel.append(report)
    return report


def public_report(r: IntelReport) -> dict[str, Any]:
    """Ce que l'équipe voit : jamais l'exactitude réelle ni la vérité moteur."""
    return {
        "id": r.id, "round": r.round, "kind": r.kind, "subjects": r.subjects, "question": r.question, "finding": r.finding,
        "reliability_pct": r.reliability_pct, "confidence_label": r.confidence_label, "corroboration": r.corroboration,
    }
