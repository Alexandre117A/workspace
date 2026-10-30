"""Les cinq cartes stratégiques (une utilisation par équipe et par simulation,
disponibles à partir du round 2). Mécaniques internes à la simulation : elles
n'agissent jamais hors de GEONEX."""
from __future__ import annotations

import math
import re
from typing import Any, Optional

from . import intel as intel_mod
from .models import CardUse, Effect, Event, Operation, Region, WorldState, Zone
from .probability import OUTCOME_LABEL_FR, OUTCOME_MAGNITUDE, assess, draw, investment, logit, rng_for, sigmoid
from .reference_data import normalize

CARDS = {
    "targeted_intel": "Renseignement ciblé",
    "interception": "Interception",
    "information_warfare": "Guerre de l'information",
    "new_front": "Ouvrir un nouveau front",
    "political_shock": "Choc politique",
}
FIRST_ROUND = 2
POLITICAL_SHOCK_BASE = 0.30


def availability(world: WorldState, actor_id: str) -> dict[str, dict[str, Any]]:
    used = {c.card for c in world.cards_used if c.actor == actor_id and c.status != "rejected"}
    return {
        key: {"label": label, "used": key in used, "available": world.round >= FIRST_ROUND and key not in used,
              "reason": None if world.round >= FIRST_ROUND else f"Disponible à partir du round {FIRST_ROUND}"}
        for key, label in CARDS.items()
    }


def _invest(payload: dict) -> float:
    inv = payload.get("invest") or {}
    return float(sum(max(0.0, float(v)) for k, v in inv.items() if k in ("political", "economic", "military")))


def validate(world: WorldState, actor_id: str, card: str, payload: dict) -> list[str]:
    errs: list[str] = []
    actor = world.actors.get(actor_id)
    if actor is None:
        return ["Acteur inconnu."]
    if card not in CARDS:
        return ["Carte inconnue."]
    av = availability(world, actor_id)[card]
    if not av["available"]:
        errs.append(av["reason"] or "Carte déjà utilisée pour cette simulation.")
    for k, v in (payload.get("invest") or {}).items():
        if not isinstance(v, (int, float)):
            errs.append("Investissement invalide.")
            continue
        if k in ("political", "economic", "military") and float(v) > actor.capitals.get(k):
            errs.append(f"Capital {k} insuffisant.")
        if float(v) < 0 or float(v) > 30:
            errs.append("Investissement par capital compris entre 0 et 30.")
    others = set(world.actors) - {actor_id}
    if card == "targeted_intel":
        subjects = payload.get("subjects") or []
        if len(subjects) != 2 or len(set(subjects)) != 2 or not set(subjects) <= others:
            errs.append("Sélectionnez deux autres acteurs distincts.")
        if not (payload.get("question") or "").strip():
            errs.append("Précisez ce que vous souhaitez savoir.")
    elif card in ("interception", "information_warfare", "political_shock"):
        if payload.get("target") not in others:
            errs.append("Sélectionnez une cible valide.")
        if card == "interception" and payload.get("channel") not in ("diplomatic", "military", "communications"):
            errs.append("Précisez le flux visé (diplomatique, militaire ou communications).")
        if card == "information_warfare":
            if payload.get("audience") not in ("domestic", "international", "coalition"):
                errs.append("Précisez le public visé.")
            if payload.get("effect") not in ("credibility", "opinion", "coalition_split"):
                errs.append("Précisez l'effet recherché.")
    elif card == "new_front":
        zone = payload.get("zone") or {}
        if not zone.get("zone_id") and not (zone.get("name") and ((zone.get("lat") is not None and zone.get("lon") is not None) or (zone.get("x") is not None and zone.get("y") is not None))):
            errs.append("Sélectionnez une zone sur la carte du théâtre.")
        if payload.get("target") not in others:
            errs.append("Sélectionnez l'acteur visé par ce front.")
    if card != "targeted_intel" and not (payload.get("intent") or payload.get("question") or "").strip():
        errs.append("Décrivez précisément votre objectif, votre cible et les moyens engagés.")
    return errs


def official_request(world: WorldState, actor_id: str, card: str, payload: dict) -> str:
    """Reformulation officielle (règles) — fidèle au texte du joueur, sans ajout."""
    a = world.actors[actor_id].name
    name = lambda x: world.actors[x].name if x in world.actors else x
    inv = payload.get("invest") or {}
    inv_txt = ", ".join(f"{v:g} pt(s) {k[:4]}." for k, v in inv.items() if float(v) > 0) or "aucun capital"
    text = (payload.get("intent") or payload.get("question") or "").strip()
    if card == "targeted_intel":
        subj = " et ".join(name(s) for s in payload.get("subjects", []))
        return f"[{CARDS[card]}] {a} demande un renseignement sur {subj}. Objet : « {text} ». Moyens : {inv_txt}."
    if card == "new_front":
        z = payload.get("zone") or {}
        return f"[{CARDS[card]}] {a} ouvre un front ({payload.get('domain', 'militaire')}) dans la zone « {z.get('name') or z.get('zone_id')} » visant {name(payload.get('target'))}. Objectif : « {text} ». Moyens : {inv_txt}."
    return f"[{CARDS[card]}] {a} → {name(payload.get('target'))}. Intention : « {text} ». Moyens : {inv_txt}."


def submit(world: WorldState, actor_id: str, card: str, payload: dict) -> CardUse:
    use = CardUse(id=world.next_id("CRD"), card=card, actor=actor_id, round=world.round, payload=payload,
                  official_request=official_request(world, actor_id, card, payload))
    world.cards_used.append(use)
    return use


# --------------------------------------------------------------------------- choc politique


def political_shock_estimate(world: WorldState, actor_id: str, target_id: str) -> dict[str, Any]:
    """Estimation affichée à l'équipe : 30 % sans renseignement pertinent, puis
    mise à jour bayésienne selon la pertinence, la crédibilité, la précision et
    la qualité des informations détenues (perception, pas vérité)."""
    reports = [r for r in world.intel if r.owner == actor_id and target_id in r.subjects]
    contributions = []
    delta = 0.0
    for r in reports:
        relevance = 1.0 if "stability" in r.topics else (0.45 if "intentions" in r.topics or "economy" in r.topics else 0.2)
        credibility = r.reliability_pct / 100
        precision = (intel_mod.LABELS.index(r.confidence_label) + 1) / 5
        quality = r.source_quality
        direction = r.signal.get("stability_weakness", r.signal.get("economic_weakness", 0.0) * 0.5)
        c = 1.6 * relevance * credibility * precision * quality * direction
        contributions.append({"report_id": r.id, "contribution": round(c, 3)})
        delta += c
    delta = max(-1.4, min(1.4, delta))
    estimate = sigmoid(logit(POLITICAL_SHOCK_BASE) + delta)
    return {"estimate": round(estimate, 3), "base": POLITICAL_SHOCK_BASE, "reports_considered": len(reports), "contributions": contributions,
            "note": "Estimation fondée sur vos informations ; ce n'est pas une garantie."}


# --------------------------------------------------------------------------- résolution


def _event(world: WorldState, kind: str, title: str, text: str, scope: str, audience: list[str], actors: list[str], figures: dict | None = None,
           location: Optional[Region] = None, causes: list[str] | None = None) -> Event:
    ev = Event(id=world.next_id("EVT"), round=world.round, kind=kind, scope=scope, audience=audience, title=title, text=text,
               figures=figures or {}, location=location, actors=actors, cause_refs=causes or [])
    world.events.append(ev)
    return ev


def resolve(world: WorldState, use: CardUse) -> list[Effect]:
    rng = rng_for(world.seed, f"{world.round}:card:{use.id}")
    actor = world.actors[use.actor]
    p = use.payload
    inv = _invest(p)
    effects: list[Effect] = []
    for k, v in (p.get("invest") or {}).items():
        if k in ("political", "economic", "military") and float(v) > 0:
            effects.append(Effect(actor=actor.id, field=k, delta=-float(v), reason=f"Carte « {CARDS[use.card]} » : moyens engagés"))
            actor.capital_spent.set(k, actor.capital_spent.get(k) + float(v))
    res_qty = 0.0
    intel_res = next((r for r in actor.resources if r.category == "other" and r.usable), None)
    if intel_res and actor.available(intel_res.key) >= 1 and use.card in ("targeted_intel", "interception", "information_warfare"):
        res_qty = 1.0
        effects.append(Effect(actor=actor.id, field=f"resource:{intel_res.key}", delta=-1, reason=f"Carte « {CARDS[use.card]} »"))

    if use.card == "targeted_intel":
        report = intel_mod.gather(world, actor.id, p["subjects"], p.get("question", ""), "targeted_intel", inv, res_qty, f"{world.round}:intel:{use.id}")
        use.result = {"report": intel_mod.public_report(report)}
    elif use.card == "interception":
        use.result = _interception(world, use, inv, res_qty)
    elif use.card == "information_warfare":
        effects += _info_war(world, use, inv, rng)
    elif use.card == "new_front":
        effects += _new_front(world, use, inv, rng)
    elif use.card == "political_shock":
        effects += _political_shock(world, use, inv, rng)
    use.status = "resolved"
    return effects


def _interception(world: WorldState, use: CardUse, inv: float, res_qty: float) -> dict:
    p = use.payload
    target = p["target"]
    channel = p["channel"]
    rng = rng_for(world.seed, f"{world.round}:intercept:{use.id}")
    pool: list[dict] = []
    if channel == "diplomatic":
        pool = [m for m in world.comms if m.get("channel", "").startswith("call") and target in (m.get("from_actor"), m.get("to_actor")) and m.get("round", 0) >= world.round - 1]
    elif channel == "communications":
        pool = [m for m in world.comms if target in (m.get("from_actor"), m.get("to_actor")) and m.get("round", 0) >= world.round - 1]
    else:
        pool = [{"text": d.get("intent", ""), "from_actor": target, "to_actor": None, "channel": "military", "round": d["round"]}
                for d in world.decisions_log if d.get("actor") == target and d.get("category") in ("military_deployment", "military_strike", "defensive_posture", "covert_operation") and d["round"] >= world.round - 1]
    actor = world.actors[use.actor]
    tgt = world.actors[target]
    factors = {"investissement": investment(inv, 10), "moyens": 0.4 * math.log1p(res_qty), "services": (actor.capitals.military - (tgt.capitals.military + tgt.stability) / 2) / 40,
               "volume de trafic": 0.3 if len(pool) >= 2 else (-0.4 if not pool else 0.0)}
    a = assess(0.0, factors)
    roll, outcome = draw(rng, a.probability)
    accuracy = {"major_success": "exact", "success": "exact", "partial": "partial", "failure": "uncertain", "backfire": "misleading"}[outcome]
    if not pool:
        excerpt = "Aucune transmission pertinente n'a pu être captée sur ce flux."
        truth = "Aucune communication de la cible sur ce flux pendant la période."
        accuracy = "uncertain" if accuracy != "misleading" else "misleading"
        if accuracy == "misleading":
            excerpt = f"Une transmission attribuée à {tgt.name} évoquerait un accord secret imminent."
    else:
        msg = pool[-1]
        raw = msg.get("text", "")
        truth = f"{world.actors.get(msg.get('from_actor'), tgt).name} → {world.actors[msg['to_actor']].name if msg.get('to_actor') in world.actors else 'diffusion'} : « {raw[:300]} »"
        if accuracy == "exact":
            excerpt = f"Transmission captée ({world.actors.get(msg.get('from_actor'), tgt).name}) : « {raw[:300]} »"
        elif accuracy == "partial":
            words = raw.split()
            excerpt = "Fragments captés : « " + " … ".join(" ".join(words[i:i + 4]) for i in range(0, min(len(words), 40), 9)) + " »"
        elif accuracy == "uncertain":
            kws = [w for w in re.findall(r"[\wéèàêâîôûç]{6,}", raw)][:5]
            excerpt = "Mots-clés isolés, contexte inconnu : " + (", ".join(kws) if kws else "inexploitable")
        else:
            flipped = re.sub(r"\b(pas|jamais|aucun)\b", "", raw, flags=re.I)
            flipped = flipped.replace("refus", "accord").replace("non", "oui")
            excerpt = f"Transmission captée : « {flipped[:300].strip()} »"
    pct = int(max(8, min(95, round({"exact": 74, "partial": 58, "uncertain": 35, "misleading": rng.randint(55, 80)}[accuracy] + rng.gauss(0, 8)))))
    sq = round(max(0.05, min(0.95, 0.3 + 0.4 * min(1.0, inv / 25) + rng.uniform(-0.15, 0.15))), 3)
    corroboration = sum(1 for r in world.intel if r.owner == use.actor and target in r.subjects)
    score = 0.55 * sq + 0.25 * min(corroboration, 3) / 3 + 0.2 * pct / 100 - (0.12 if corroboration == 0 else 0)
    label = intel_mod.LABELS[0 if score < 0.25 else 1 if score < 0.38 else 2 if score < 0.52 else 3 if score < 0.68 else 4]
    from .models import IntelReport

    report = IntelReport(id=world.next_id("INT"), round=world.round, owner=use.actor, kind="interception", subjects=[target],
                         question=f"Flux {channel} : {p.get('intent') or p.get('question', '')}"[:500], finding=excerpt, accuracy=accuracy,
                         reliability_pct=pct, confidence_label=label, source_quality=sq, corroboration=corroboration, truth_summary=truth,
                         deceptive=accuracy == "misleading", topics=["diplomacy" if channel != "military" else "intentions"])
    world.intel.append(report)
    return {"report": intel_mod.public_report(report)}


def _info_war(world: WorldState, use: CardUse, inv: float, rng) -> list[Effect]:
    p = use.payload
    actor = world.actors[use.actor]
    tgt = world.actors[p["target"]]
    factors = {"investissement": investment(inv, 10), "influence": (actor.capitals.political - tgt.capitals.political) / 35,
               "résilience de la cible": (50 - tgt.cohesion) / 60}
    a = assess(0.1, factors, p.get("president_probability"))
    roll, outcome = draw(rng, a.probability)
    m = OUTCOME_MAGNITUDE[outcome] * (0.7 + 0.3 * math.log1p(inv / 10))
    E: list[Effect] = []
    why = f"Guerre de l'information ({OUTCOME_LABEL_FR[outcome]})"
    eff = p["effect"]
    if m > 0:
        if eff == "credibility":
            E.append(Effect(actor=tgt.id, field="political", delta=-6 * m, reason="Crédibilité entamée par une campagne hostile"))
        elif eff == "opinion":
            E.append(Effect(actor=tgt.id, field="approval", delta=-8 * m, reason="Opinion publique travaillée par une campagne hostile"))
            E.append(Effect(actor=tgt.id, field="stability", delta=-3 * m, reason="Polarisation de l'opinion"))
        else:
            allies = sorted((o for o in world.actors.values() if o.id not in (tgt.id, actor.id) and o.camp == tgt.camp), key=lambda o: -world.relation(o.id, tgt.id).trust)
            if allies:
                E.append(Effect(actor=tgt.id, field=f"trust:{allies[0].id}", delta=-15 * m, reason="Divisions semées au sein de la coalition"))
                E.append(Effect(actor=tgt.id, field="cohesion", delta=-4 * m, reason="Doutes au sein de la coalition"))
    # Désinformation durable : les renseignements de la cible sur l'émetteur seront plus souvent trompeurs.
    world.operations.append(Operation(id=world.next_id("OPS"), actor=actor.id, category="disinformation", targets=[tgt.id], started_round=world.round,
                                      resolve_round=world.round + 2, secret=True, params={"card": use.id}))
    exposed = outcome in ("backfire", "failure") and rng.random() < (0.8 if outcome == "backfire" else 0.35)
    if exposed:
        E.append(Effect(actor=actor.id, field="political", delta=-5, reason="Campagne d'influence exposée publiquement"))
        E.append(Effect(actor=tgt.id, field=f"trust:{actor.id}", delta=-15, reason="Campagne d'influence attribuée"))
        _event(world, "influence_exposed", f"Campagne d'influence attribuée à {actor.name}",
               f"Des analystes attribuent à {actor.name} une campagne visant {tgt.name}.", "public", [], [actor.id, tgt.id], causes=[use.id])
    elif m > 0:
        _event(world, "perception_shift", f"Revers d'image pour {tgt.name}", f"Le climat d'opinion se dégrade autour de {tgt.name}.", "public", [], [tgt.id], causes=[use.id])
    use.result = {"outcome": outcome, "outcome_label": OUTCOME_LABEL_FR[outcome], "exposed": exposed,
                  "summary": f"Effet {'obtenu' if m > 0 else 'non obtenu'}{' — opération exposée' if exposed else ''}."}
    return E


def _new_front(world: WorldState, use: CardUse, inv: float, rng) -> list[Effect]:
    p = use.payload
    actor = world.actors[use.actor]
    tgt = world.actors[p["target"]]
    z = p.get("zone") or {}
    domain = p.get("domain", "military")
    zone = world.zone(z["zone_id"]) if z.get("zone_id") else None
    if zone is None:
        zone = Zone(id=f"Z{len(world.zones) + 1}", name=z.get("name", "Nouveau front")[:80], domain=domain,
                    region=Region(name=z.get("name", "Nouveau front")[:80], lat=z.get("lat"), lon=z.get("lon"), x=z.get("x"), y=z.get("y")),
                    control={tgt.id: 0.35}, tension=50, created_round=world.round, origin=use.id)
        world.zones.append(zone)
    cap = {"military": "military", "maritime": "military", "spatial": "military", "economic": "economic", "diplomatic": "political", "cyber": "military"}.get(domain, "military")
    factors = {"investissement": investment(inv, 10), "rapport de capacités": (actor.capitals.get(cap) - tgt.capitals.get(cap)) / 30}
    a = assess(0.0, factors, p.get("president_probability"))
    roll, outcome = draw(rng, a.probability)
    m = OUTCOME_MAGNITUDE[outcome] * (0.7 + 0.3 * math.log1p(inv / 10))
    E = [Effect(actor=actor.id, field=f"tension:{tgt.id}", delta=12, reason="Ouverture d'un nouveau front")]
    if m > 0:
        E.append(Effect(actor=actor.id, field=f"control:{zone.id}", delta=0.3 * m, reason=f"Nouveau front : {zone.name}"))
        E.append(Effect(actor=tgt.id, field=cap, delta=-3 * m if cap != "economic" else -5 * m, reason=f"Front ouvert par {actor.name} ({zone.name})"))
        E.append(Effect(actor=tgt.id, field="engagement", delta=0.1, reason="Contraint de répondre sur un nouveau front"))
        mil = next((r for r in tgt.resources if r.category == "military" and r.usable and tgt.available(r.key) >= 1), None)
        if mil:
            from .models import ResourceLock

            tgt.locks.append(ResourceLock(key=mil.key, quantity=1, release_round=world.round + 2, reason=f"Fixé sur le front « {zone.name} »"))
    elif outcome == "backfire":
        E.append(Effect(actor=actor.id, field=cap, delta=-4, reason="Front mal engagé"))
    if domain in ("military", "maritime", "spatial"):
        world.relation(actor.id, tgt.id).at_war = world.relation(actor.id, tgt.id).at_war or m > 0
    _event(world, "new_front", f"Nouveau front : {zone.name}", f"Un front {domain} s'ouvre dans la zone « {zone.name} », impliquant {tgt.name}.",
           "public", [], [actor.id, tgt.id], location=zone.region, causes=[use.id], figures={"zone": zone.id, "domain": domain})
    use.result = {"outcome": outcome, "outcome_label": OUTCOME_LABEL_FR[outcome], "zone_id": zone.id, "summary": f"Front « {zone.name} » : {OUTCOME_LABEL_FR[outcome]}."}
    return E


def _political_shock(world: WorldState, use: CardUse, inv: float, rng) -> list[Effect]:
    p = use.payload
    actor = world.actors[use.actor]
    tgt = world.actors[p["target"]]
    est = political_shock_estimate(world, actor.id, tgt.id)
    truth_intel = [r for r in world.intel if r.owner == actor.id and tgt.id in r.subjects and "stability" in r.topics]
    factors = {
        "fragilité réelle de la cible": (55 - tgt.stability) / 30,
        "cohésion de la cible": (50 - tgt.cohesion) / 45,
        "approbation de la cible": (45 - tgt.approval) / 50,
        "investissement": investment(inv, 12, 0.6),
    }
    if truth_intel:
        factors["renseignement préalable"] = max(-0.5, min(0.5, sum({"exact": 0.3, "partial": 0.15, "uncertain": 0.0, "misleading": -0.35}[r.accuracy] for r in truth_intel)))
    a = assess(logit(POLITICAL_SHOCK_BASE), factors, p.get("president_probability"))
    roll, outcome = draw(rng, a.probability)
    from .models import AuditRecord

    world.audit.append(AuditRecord(id=world.next_id("AUD"), round=world.round, ref=use.id, actor=actor.id, category="political_shock", factors=a.contributions,
                                   base_logit=logit(POLITICAL_SHOCK_BASE), probability_engine=a.probability_engine, probability=a.probability, roll=roll,
                                   outcome=outcome, seed_key=f"{world.round}:card:{use.id}"))
    m = OUTCOME_MAGNITUDE[outcome]
    E: list[Effect] = []
    if outcome in ("success", "major_success"):
        E += [Effect(actor=tgt.id, field="stability", delta=-15 * m, reason="Choc politique : crise intérieure"),
              Effect(actor=tgt.id, field="political", delta=-8 * m, reason="Choc politique : autorité contestée"),
              Effect(actor=tgt.id, field="cohesion", delta=-10 * m, reason="Choc politique : divisions internes")]
        city = tgt.regions[0] if tgt.regions else None
        _event(world, "political_crisis", f"Crise politique : {tgt.name}", f"Une grave crise politique secoue {tgt.name}. {p.get('intent', '')[:160]}",
               "public", [], [tgt.id], location=city, causes=[use.id])
    elif outcome == "partial":
        E.append(Effect(actor=tgt.id, field="stability", delta=-5, reason="Remous politiques"))
    elif outcome == "backfire":
        E += [Effect(actor=actor.id, field="political", delta=-6, reason="Ingérence politique exposée"),
              Effect(actor=tgt.id, field=f"trust:{actor.id}", delta=-20, reason="Tentative de déstabilisation attribuée"),
              Effect(actor=tgt.id, field="cohesion", delta=4, reason="Union sacrée face à l'ingérence")]
        _event(world, "interference_exposed", f"Ingérence de {actor.name} dénoncée", f"{tgt.name} accuse publiquement {actor.name} de tentative de déstabilisation.",
               "public", [], [actor.id, tgt.id], causes=[use.id])
    use.result = {"outcome": outcome, "outcome_label": OUTCOME_LABEL_FR[outcome], "estimate_shown": est["estimate"],
                  "summary": f"Choc politique contre {tgt.name} : {OUTCOME_LABEL_FR[outcome]}."}
    return E
