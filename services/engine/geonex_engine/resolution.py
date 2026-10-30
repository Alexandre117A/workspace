"""Résolution d'un round dans un environnement commun.

Ordre : mémoire des échanges → engagements → décisions des acteurs non joués →
résolution simultanée (probabilités sur l'état de début de round) → opérations
différées → cartes → suivi des engagements → application unique des effets →
évolution naturelle → situation intérieure → temps simulé → rapports.
"""
from __future__ import annotations

from typing import Any

from . import ai, cards, commitments, domestic, npc
from .actions import CATALOG, Decision, resolve_decisions, validate
from .ai.tasks import numbers_are_grounded, write_round_narrative
from .balance import camp_shares, snapshot
from .effects import apply_all, explain
from .models import CAPITAL_KEYS, Effect, Event, Operation, RoundSummary, WorldState
from .probability import OUTCOME_LABEL_FR, OUTCOME_MAGNITUDE, rng_for
from .text import sim_time_label


def _deferred_ops(world: WorldState) -> list[Effect]:
    """Opérations clandestines lancées au round précédent : conséquences retardées."""
    E: list[Effect] = []
    for op in world.operations:
        if op.status != "pending" or op.resolve_round > world.round:
            continue
        if op.category == "disinformation":
            op.status = "resolved"
            continue
        actor = world.actors.get(op.actor)
        target = world.actors.get(op.targets[0]) if op.targets else None
        if actor is None or target is None:
            op.status = "cancelled"
            continue
        m = float(op.params.get("magnitude", 0))
        outcome = op.params.get("outcome", "failure")
        intent = op.params.get("intent", "").lower()
        field = "economic" if any(w in intent for w in ("sabot", "économ", "econom", "infra", "énerg")) else "stability"
        if m > 0:
            E.append(Effect(actor=target.id, field=field, delta=-(8 if field == "stability" else 5) * m, reason="Incident d'origine indéterminée"))
            E.append(Effect(actor=target.id, field="approval", delta=-2 * m, reason="Inquiétude après un incident inexpliqué"))
            world.events.append(Event(id=world.next_id("EVT"), round=world.round, kind="covert_effect", scope="private", audience=[target.id],
                                      title="Incident inexpliqué", text=f"{target.name} subit un incident dont l'origine reste inconnue.",
                                      actors=[target.id], cause_refs=[op.id], location=target.regions[0] if target.regions else None))
        if outcome in ("failure", "backfire"):
            exposed = outcome == "backfire" or rng_for(world.seed, op.id, "exposure").random() < 0.4
            if exposed:
                E += [Effect(actor=actor.id, field="political", delta=-5, reason="Opération clandestine exposée"),
                      Effect(actor=target.id, field=f"trust:{actor.id}", delta=-20, reason=f"Opération de {actor.name} découverte"),
                      Effect(actor=target.id, field=f"tension:{actor.id}", delta=15, reason="Opération clandestine découverte")]
                world.events.append(Event(id=world.next_id("EVT"), round=world.round, kind="covert_exposed", scope="public",
                                          title=f"Opération clandestine de {actor.name} démasquée",
                                          text=f"{target.name} affirme avoir déjoué une opération conduite par {actor.name}.",
                                          actors=[actor.id, target.id], cause_refs=[op.id]))
                op.params["exposed"] = True
        op.status = "resolved"
        op.outcome = outcome
    return E


def _natural_evolution(world: WorldState) -> list[Effect]:
    E: list[Effect] = []
    for a in world.actors.values():
        at_war = [r for r in world.relations.values() if a.id in (r.a, r.b) and r.at_war]
        # Politique : légitimité et soutien intérieur.
        pol = (a.approval - 50) / 25 + (a.stability - 50) / 35
        E.append(Effect(actor=a.id, field="political", delta=round(max(-2.5, min(3.0, pol + 1.0)), 2), reason="Évolution du soutien intérieur"))
        # Économie : reconstitution lente, freinée par la guerre et les sanctions.
        sanctioned = sum(1 for d in world.decisions_log if d.get("round") == world.round and d.get("category") == "sanctions" and a.id in d.get("targets", []))
        eco = 1.2 - 1.5 * len(at_war) - 0.8 * sanctioned
        E.append(Effect(actor=a.id, field="economic", delta=round(max(-4.0, min(1.5, eco)), 2), reason="Activité économique (guerre, sanctions)" if eco < 0 else "Reconstitution économique"))
        # Militaire : jamais de réparation automatique d'une perte grave (+1 max par round).
        if a.capitals.military < a.initial_capitals.military:
            gap = a.initial_capitals.military - a.capitals.military
            E.append(Effect(actor=a.id, field="military", delta=round(min(1.0, gap * 0.08) * (a.capitals.economic / 70), 2), reason="Reconstitution lente des forces"))
        if at_war:
            E.append(Effect(actor=a.id, field="stability", delta=-1.5 * len(at_war), reason="Lassitude liée à la guerre"))
            E.append(Effect(actor=a.id, field="approval", delta=-1.0 * len(at_war), reason="Coût humain du conflit"))
        else:
            E.append(Effect(actor=a.id, field="stability", delta=round((60 - a.stability) / 40, 2), reason="Retour progressif au calme"))
        for r in a.resources:
            if r.regen_per_round > 0 and r.usable:
                E.append(Effect(actor=a.id, field=f"resource:{r.key}", delta=r.regen_per_round, reason="Reconstitution"))
    # Les tensions retombent lentement en l'absence d'incident.
    for rel in world.relations.values():
        if not rel.at_war and rel.tension > 25:
            rel.tension = round(max(0.0, rel.tension - 1.5), 2)
    return E


def _store_messages(world: WorldState, messages: list[dict[str, Any]]) -> None:
    for m in messages:
        world.comms.append({
            "round": world.round, "channel": m.get("channel", "diplomacy"), "from_actor": m.get("from_actor"),
            "to_actor": m.get("to_actor"), "text": str(m.get("text", ""))[:2000], "analyze": bool(m.get("analyze", True)),
        })


def resolve_round(world: WorldState, decisions: list[dict[str, Any]], messages: list[dict[str, Any]]) -> dict[str, Any]:
    before = {a.id: (a.capitals.model_copy(), a.stability, a.approval) for a in world.actors.values()}
    _store_messages(world, messages)
    new_commitments, extraction = commitments.extract(world, messages)
    world.commitments.extend(new_commitments)

    human = [Decision.from_dict(d) for d in decisions]
    accepted: list[Decision] = []
    rejected: list[dict[str, Any]] = []
    by_actor: dict[str, list[Decision]] = {}
    for d in human:
        if d.actor in world.actors and world.actors[d.actor].controlled_by == "human":
            by_actor.setdefault(d.actor, []).append(d)
    for actor_id, ds in sorted(by_actor.items()):
        ds = sorted(ds, key=lambda x: x.id)
        errs = validate(world, ds)
        if errs.get("_batch"):
            # Lot invalide : on ne garde que les décisions individuellement valides dans la limite des capitaux.
            ds = ds[:1]
            errs = validate(world, ds)
        for d in ds:
            if d.id in errs or errs.get("_batch"):
                rejected.append({"decision_id": d.id, "actor": actor_id, "errors": errs.get(d.id, []) + errs.get("_batch", [])})
            else:
                accepted.append(d)
    npc_decisions: list[Decision] = []
    for actor in sorted(world.actors.values(), key=lambda a: a.id):
        if actor.controlled_by == "npc":
            ds = npc.decide(world, actor)
            if not validate(world, ds):
                npc_decisions.extend(ds)
    all_decisions = sorted(accepted + npc_decisions, key=lambda x: (x.actor, x.id))
    rejected.sort(key=lambda x: (x["actor"], x["decision_id"]))
    outcome = resolve_decisions(world, all_decisions)
    effects: list[Effect] = list(outcome["effects"])
    for d in all_decisions:
        world.decisions_log.append({"round": world.round, **d.to_dict()})
    for op in outcome["deferred"]:
        world.operations.append(Operation(
            id=world.next_id("OPS"), actor=op["actor"], category=op["category"], targets=op["targets"], started_round=world.round,
            resolve_round=world.round + 1, secret=True, params={"intent": op["intent"], "outcome": op["outcome"], "magnitude": op["magnitude"], "decision_id": op["decision_id"]},
        ))
    effects += _deferred_ops(world)
    card_results = []
    for use in [c for c in world.cards_used if c.status == "submitted" and c.round == world.round]:
        effects += cards.resolve(world, use)
        card_results.append(use)
    effects += commitments.update(world, outcome["results"])
    applied = apply_all(world, effects)
    applied += apply_all(world, _natural_evolution(world))
    applied += apply_all(world, domestic.generate(world))

    # Événements publics des actions visibles.
    for r in outcome["results"]:
        if r["outcome"] == "refused" or r.get("secret"):
            continue
        actor = world.actors[r["actor"]]
        if r["category"] in ("military_strike", "military_deployment", "sanctions", "alliance", "ceasefire_offer", "economic_aid", "humanitarian", "diplomatic_initiative"):
            figures = {"attacker": r["actor"], "target": (r.get("targets") or [None])[0]} if r["category"] == "military_strike" else {}
            world.events.append(Event(id=world.next_id("EVT"), round=world.round, kind=r["category"], scope="public", title=r["summary"],
                                      text=r["summary"], actors=[r["actor"], *(r.get("targets") or [])], figures=figures, cause_refs=[r["decision_id"]]))

    world.sim_elapsed_hours += world.plan.sim_step_hours * (0.6 if any(rel.at_war for rel in world.relations.values()) else 1.0)
    record = snapshot(world)
    for a in world.actors.values():
        a.history.append({"round": world.round, "capitals": a.capitals.model_dump(), "stability": a.stability, "approval": a.approval})

    explanations = explain(applied)
    private: dict[str, Any] = {}
    for a in world.humans():
        b_caps, b_stab, b_appr = before[a.id]
        changes = {}
        for k in CAPITAL_KEYS:
            changes[k] = {"before": round(b_caps.get(k), 1), "after": round(a.capitals.get(k), 1), "delta": round(a.capitals.get(k) - b_caps.get(k), 1),
                          "reasons": explanations.get(a.id, {}).get(k, [])}
        private[a.id] = {
            "capital_changes": changes,
            "indicators": {"stability": {"before": b_stab, "after": a.stability, "reasons": explanations.get(a.id, {}).get("stability", [])},
                           "approval": {"before": b_appr, "after": a.approval, "reasons": explanations.get(a.id, {}).get("approval", [])}},
            "decisions": [{k: v for k, v in r.items() if k in ("decision_id", "category", "outcome_label", "summary", "targets")} for r in outcome["results"] if r["actor"] == a.id],
            "rejected": [r for r in rejected if r["actor"] == a.id],
            "cards": [{"card": c.card, "label": cards.CARDS[c.card], "result": c.result} for c in card_results if c.actor == a.id],
            "events": [{"title": e.title, "text": e.text, "figures": e.figures, "location": e.location.model_dump() if e.location else None}
                       for e in world.events if e.round == world.round and a.id in e.audience and e.scope == "private"],
            "commitments": [{"kind": c.kind, "text": c.text, "status": c.status, "with": c.to_actor if c.from_actor == a.id else c.from_actor}
                            for c in world.commitments if c.resolved_round == world.round and a.id in (c.from_actor, c.to_actor)],
        }
    summary = _round_summary(world, outcome["results"], record)
    world.rounds = [r for r in world.rounds if r.round != world.round] + [summary]
    shares = camp_shares(world)
    dominant = sorted(world.actors.values(), key=lambda a: -record["powers"][a.id])[:3]
    troubled = [a for a in world.actors.values() if a.stability < 35 or a.capitals.total() < 0.7 * a.initial_capitals.total()]
    president = {
        "balance": shares,
        "dominant": [{"id": a.id, "name": a.name, "power": record["powers"][a.id]} for a in dominant],
        "troubled": [{"id": a.id, "name": a.name, "stability": a.stability, "capitals": a.capitals.model_dump()} for a in troubled],
        "major": [{"title": e.title, "text": e.text, "scope": e.scope} for e in world.events if e.round == world.round][:20],
        "rejected": rejected,
        "extraction": extraction,
    }
    return {"round": world.round, "public": summary.model_dump(), "private": private, "president": president,
            "npc_decisions": len(npc_decisions), "commitments_extracted": len(new_commitments)}


def _round_summary(world: WorldState, results: list[dict[str, Any]], record: dict) -> RoundSummary:
    visible = [r for r in results if not r.get("secret") and r["outcome"] != "refused"]
    events = [e for e in world.events if e.round == world.round and e.scope == "public"]
    highlights = [r["summary"] for r in visible if r["category"] in ("military_strike", "alliance", "ceasefire_offer", "sanctions")][:4]
    highlights += [e.title for e in events if e.kind.startswith("domestic") or e.kind in ("covert_exposed", "political_crisis", "new_front", "influence_exposed")][:3]
    lead = record.get("leader")
    lead_label = world.setting.camps.get(lead, lead) if lead else None
    wars = [r for r in world.relations.values() if r.at_war]
    sentences = [f"Round {world.round} — {sim_time_label(world)}."]
    if visible:
        sentences.append(f"{len(visible)} initiatives publiques ont marqué la séquence, dont {visible[0]['summary'].rstrip('.')}.")
    if wars:
        names = ", ".join(f"{world.actors[r.a].name}–{world.actors[r.b].name}" for r in wars[:3])
        sentences.append(f"État de guerre ouvert : {names}.")
    else:
        sentences.append("Aucun affrontement armé ouvert n'est en cours.")
    if events:
        sentences.append(f"Fait notable : {events[-1].title.rstrip('.')}.")
    narrative = " ".join(sentences)
    title = highlights[0] if highlights else "Positions et manœuvres"
    generated_by = "rules"
    if ai.available():
        facts = {"round": world.round, "date": sim_time_label(world), "décisions_publiques": [r["summary"] for r in visible],
                 "événements": [e.title + " — " + e.text for e in events], "guerres": [f"{world.actors[r.a].name}–{world.actors[r.b].name}" for r in wars]}
        try:
            out, model = write_round_narrative(facts)
            if numbers_are_grounded(out.narrative + out.title, facts):
                narrative, title, generated_by = out.narrative, out.title, model
                highlights = out.highlights[:5] or highlights
        except ai.AIUnavailable:
            pass
    return RoundSummary(round=world.round, sim_time_label=sim_time_label(world), title=title, narrative=narrative, highlights=highlights,
                        decisions={a.id: [r["summary"] for r in results if r["actor"] == a.id and not r.get("secret")] for a in world.humans()},
                        balance=record.get("shares", {}), generated_by=generated_by)
