"""Mémoire structurée des engagements : extraction et suivi round après round.

Une promesse faite au round 2 reste dans `world.commitments` et peut être
honorée, rompue ou expirer bien plus tard ; les ruptures dégradent la
confiance de manière persistante (pas seulement dans un historique textuel).
"""
from __future__ import annotations

import re
from typing import Any

from . import ai
from .ai.tasks import extract_commitments as ai_extract
from .models import Commitment, Effect, WorldState
from .reference_data import normalize

PATTERNS: list[tuple[str, str, float]] = [
    (r"\b(cessez le feu|treve|cease ?fire)\b", "ceasefire", 0.75),
    (r"\b(n attaquer(ons|ai)? pas|non agression|pas d attaque|ne (vous )?attaquer(ons|ai)? (pas|jamais)|will not attack|won t attack)\b", "non_aggression", 0.8),
    (r"\b(alliance|allies|front commun|coalition avec|ally with)\b", "alliance", 0.65),
    (r"\b(accord|marche conclu|deal|d accord pour|nous acceptons|entente|we agree)\b", "agreement", 0.6),
    (r"\b(soutiendr|appuier|appuyer|fournir(ons|ai)|livrer(ons|ai)|aider(ons|ai)|we will support|we will help|soutien)\w*", "support", 0.6),
    (r"\b(si vous .{0,60}(nous|je) (frapper|riposter|repondr|sanctionner|attaquer)\w*|sinon|ultimatum|if you .{0,60}we will)\b", "threat", 0.7),
    (r"\b(nous (nous engageons|promettons|garantissons)|je (m engage|promets|garantis)|we (promise|commit|guarantee))\b", "promise", 0.7),
]
DUE_ROUNDS = {"ceasefire": 3, "non_aggression": 3, "alliance": 2, "agreement": 2, "support": 2, "threat": 2, "promise": 2}


def extract_rules(world: WorldState, messages: list[dict[str, Any]]) -> list[Commitment]:
    found: list[Commitment] = []
    for msg in messages:
        if not msg.get("analyze", True):
            continue  # consentement absent : l'échange n'est pas analysé
        text = normalize(msg.get("text", ""))
        speaker = msg.get("from_actor")
        if speaker not in world.actors:
            continue
        counterpart = msg.get("to_actor") if msg.get("to_actor") in world.actors else None
        for pattern, kind, conf in PATTERNS:
            if re.search(pattern, text):
                found.append(Commitment(
                    id=world.next_id("ENG"), round=world.round, from_actor=speaker, to_actor=counterpart, kind=kind,
                    text=msg.get("text", "")[:280], due_round=world.round + DUE_ROUNDS[kind], public=msg.get("channel") == "assembly",
                    source=msg.get("channel", "diplomacy"), confidence=conf,
                ))
                break
    return found


def extract(world: WorldState, messages: list[dict[str, Any]]) -> tuple[list[Commitment], str]:
    analysable = [m for m in messages if m.get("analyze", True) and m.get("text")]
    if not analysable:
        return [], "rules"
    if ai.available():
        try:
            transcript = "\n".join(f"[{m.get('channel')}] {m['from_actor']} → {m.get('to_actor') or 'tous'} : {m['text']}" for m in analysable)
            out, model = ai_extract(transcript, list(world.actors))
            items = []
            for it in out.items:
                if it.speaker in world.actors:
                    to = it.counterpart if it.counterpart in world.actors else None
                    public = any(m.get("channel") == "assembly" and m["from_actor"] == it.speaker for m in analysable)
                    items.append(Commitment(id=world.next_id("ENG"), round=world.round, from_actor=it.speaker, to_actor=to, kind=it.kind,
                                            text=it.text[:280], due_round=world.round + DUE_ROUNDS[it.kind], public=public, source="ai", confidence=max(0.0, min(1.0, it.confidence))))
            return items, model
        except ai.AIUnavailable:
            pass
    return extract_rules(world, analysable), "rules"


HOSTILE_VS = {"military_strike", "covert_operation", "sanctions"}
SUPPORTIVE = {"economic_aid", "diplomatic_initiative", "alliance", "humanitarian", "ceasefire_offer"}


def update(world: WorldState, results: list[dict[str, Any]]) -> list[Effect]:
    """Met à jour les engagements ouverts à partir des actions résolues ce round."""
    effects: list[Effect] = []
    actions = [(r["actor"], r["category"], set(r.get("targets") or [])) for r in results if r.get("outcome") != "refused"]
    for c in world.commitments:
        if c.status != "open" or c.round > world.round:
            continue
        mine = [(cat, tg) for a, cat, tg in actions if a == c.from_actor]
        hostile = any(cat in HOSTILE_VS and (c.to_actor in tg if c.to_actor else True) for cat, tg in mine)
        strike = any(cat in ("military_strike", "covert_operation") and (c.to_actor in tg if c.to_actor else True) for cat, tg in mine)
        supportive = any(cat in SUPPORTIVE and c.to_actor in tg for cat, tg in mine) if c.to_actor else False
        status = None
        if c.kind in ("non_aggression", "ceasefire") and strike:
            status = "broken"
        elif c.kind in ("alliance", "agreement") and hostile:
            status = "broken"
        elif c.kind in ("support", "promise") and supportive:
            status = "honored"
        elif c.kind == "alliance" and c.to_actor and world.relation(c.from_actor, c.to_actor).alliance:
            status = "honored"
        elif c.kind == "threat" and hostile:
            status = "honored"  # menace mise à exécution : crédibilité préservée
        elif world.round >= c.due_round:
            if c.kind in ("non_aggression", "ceasefire", "agreement"):
                status = "honored"
            else:
                status = "expired"
        if status is None:
            continue
        c.status = status
        c.resolved_round = world.round
        who = world.actors[c.from_actor].name
        if status == "broken" and c.to_actor:
            effects.append(Effect(actor=c.to_actor, field=f"trust:{c.from_actor}", delta=-18, reason=f"Engagement rompu par {who}"))
            if c.public:
                effects.append(Effect(actor=c.from_actor, field="political", delta=-3, reason="Engagement public rompu"))
                for other in world.actors:
                    if other not in (c.from_actor, c.to_actor):
                        effects.append(Effect(actor=other, field=f"trust:{c.from_actor}", delta=-4, reason=f"{who} a rompu un engagement public"))
        elif status == "honored" and c.to_actor and c.kind != "threat":
            effects.append(Effect(actor=c.to_actor, field=f"trust:{c.from_actor}", delta=8, reason=f"Engagement tenu par {who}"))
            effects.append(Effect(actor=c.from_actor, field="political", delta=1, reason="Engagement honoré"))
        elif status == "expired" and c.kind in ("support", "promise") and c.to_actor:
            effects.append(Effect(actor=c.to_actor, field=f"trust:{c.from_actor}", delta=-8, reason=f"Promesse non tenue par {who}"))
        elif status == "expired" and c.kind == "threat":
            effects.append(Effect(actor=c.from_actor, field="political", delta=-2, reason="Menace restée sans suite"))
    return effects
