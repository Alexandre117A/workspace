"""Fin de partie : classement, dossiers d'équipe, chronologie, communiqués
archivés, cartes utilisées et « Ce que vous ignoriez »."""
from __future__ import annotations

from typing import Any

from .actions import CATALOG
from .cards import CARDS
from .models import WorldState
from .probability import OUTCOME_LABEL_FR
from .scoring import mentions, ranking
from .text import sim_time_label

CINEMATIC = {
    "space": "space_fleet", "maritime": "naval_dawn", "land": "land_theatre", "historic_sea": "age_of_sail", "historic_land": "historic_field",
}


def cinematic_theme(world: WorldState) -> str:
    s = world.setting
    if s.era == "space":
        return CINEMATIC["space"]
    pre = s.era in ("ancient", "medieval", "early_modern", "napoleonic", "fantasy")
    if s.theatre.maritime or any(z.domain == "maritime" for z in world.zones):
        return CINEMATIC["historic_sea"] if pre else CINEMATIC["maritime"]
    return CINEMATIC["historic_land"] if pre else CINEMATIC["land"]


def _team_narrative(world: WorldState, actor_id: str, score: dict) -> str:
    a = world.actors[actor_id]
    decisions = [d for d in world.decisions_log if d.get("actor") == actor_id]
    cats = {}
    for d in decisions:
        cats[d["category"]] = cats.get(d["category"], 0) + 1
    dominant = max(cats, key=cats.get) if cats else None
    done = [o for o in score["objectives"] if o["progress"] >= 0.99]
    first, last = (a.history[0] if a.history else None), (a.history[-1] if a.history else None)
    parts = [f"{a.name} a conduit {len(decisions)} décisions"]
    if dominant:
        parts[-1] += f", privilégiant {CATALOG[dominant]['label'].lower()}"
    parts[-1] += "."
    parts.append(f"{len(done)} objectif(s) sur {len(score['objectives'])} pleinement atteint(s).")
    if first and last:
        delta = sum(last["capitals"].values()) - sum(a.initial_capitals.model_dump().values())
        parts.append(f"Ses capitaux cumulés ont {'progressé' if delta >= 0 else 'reculé'} de {abs(delta):.0f} points sur la partie.")
    return " ".join(parts)


def finalize(world: WorldState, meta: dict[str, Any]) -> dict[str, Any]:
    world.finished = True
    scores = ranking(world)
    special = mentions(world, scores)
    teams = []
    for s in scores:
        a = world.actors[s["actor"]]
        audits = [x for x in world.audit if x.actor == a.id]
        decisions = [d for d in world.decisions_log if d.get("actor") == a.id]
        audit_by_ref = {x.ref: x for x in audits}
        main = []
        for d in decisions[-10:]:
            au = audit_by_ref.get(d["id"])
            main.append({"round": d["round"], "category": CATALOG[d["category"]]["label"], "targets": d.get("targets", []), "intent": d.get("intent", ""),
                         "outcome": OUTCOME_LABEL_FR.get(au.outcome, au.outcome) if au else ("refusée" if d.get("ruling") == "refused" else "—")})
        teams.append({
            "actor": a.id, "name": a.name, "rank": s["rank"], "score": s, "qualification": s["qualification"],
            "objectives": s["objectives"], "red_lines": a.red_lines, "final_capitals": a.capitals.model_dump(), "initial_capitals": a.initial_capitals.model_dump(),
            "decisions": main,
            "cards": [{"card": CARDS[c.card], "round": c.round, "request": c.official_request, "result": c.result} for c in world.cards_used if c.actor == a.id],
            "successes": sum(1 for x in audits if x.outcome in ("success", "major_success")),
            "failures": sum(1 for x in audits if x.outcome in ("failure", "backfire")),
            "final_position": next((i + 1 for i, r in enumerate(sorted(world.actors.values(), key=lambda z: -world.balance_history[-1]["powers"].get(z.id, 0))) if r.id == a.id), None) if world.balance_history else None,
            "narrative": _team_narrative(world, a.id, s),
            "mentions": [m for m in special if m["actor"] == a.id],
        })
    ignored = []
    for r in world.intel:
        if r.deceptive and r.owner in world.actors:
            ignored.append({"type": "renseignement trompeur", "actor": r.owner,
                            "text": f"{world.actors[r.owner].name} a reçu au round {r.round} un renseignement trompeur (fiabilité affichée {r.reliability_pct} %, « {r.confidence_label} »). Réalité : {r.truth_summary}"})
    for c in world.commitments:
        if not c.public and c.to_actor:
            ignored.append({"type": "négociation secrète", "actor": c.from_actor,
                            "text": f"Round {c.round} : {world.actors[c.from_actor].name} s'est engagé (« {c.kind} ») envers {world.actors[c.to_actor].name} — engagement {({'open': 'resté ouvert', 'honored': 'tenu', 'broken': 'rompu', 'expired': 'non tenu'})[c.status]}."})
    for o in world.operations:
        if o.secret and o.actor in world.actors:
            tg = ", ".join(world.actors[t].name for t in o.targets if t in world.actors)
            label = "opération clandestine" if o.category == "covert_operation" else "campagne de désinformation"
            res = OUTCOME_LABEL_FR.get(o.outcome or "", "") if o.category == "covert_operation" else ""
            ignored.append({"type": label, "actor": o.actor,
                            "text": f"Round {o.started_round} : {world.actors[o.actor].name} a mené une {label} contre {tg}{f' ({res})' if res else ''}{' — finalement exposée' if o.params.get('exposed') else ''}."})
    for comm in world.communiques:
        if comm.delivered and comm.hidden_cause:
            ignored.append({"type": "cause d'un Communiqué de Rome", "actor": None, "text": f"« {comm.title} » : {comm.hidden_cause}"})
    for a in world.actors.values():
        secret = next((o for o in a.objectives if o.kind == "secret"), None)
        if secret and a.controlled_by == "human":
            ignored.append({"type": "objectif secret", "actor": a.id, "text": f"{a.name} poursuivait secrètement : {secret.text}"})
    for d in world.decisions_log:
        if d.get("origin") == "npc" and d.get("secret"):
            ignored.append({"type": "manœuvre d'un acteur non joué", "actor": d["actor"],
                            "text": f"Round {d['round']} : {world.actors[d['actor']].name} ({CATALOG[d['category']]['label'].lower()}) — {d.get('intent', '')}"})
    communiques = []
    for c in world.communiques:
        if not c.delivered:
            continue
        impact = {}
        for e in c.effects:
            impact.setdefault(e.actor, []).append(f"{e.field} {e.delta:+.1f} ({e.reason})")
        communiques.append({"id": c.id, "round": c.round, "title": c.title, "dateline": c.dateline, "body": c.body, "general_impact": c.general_impact,
                            "origin": c.origin, "kind": c.kind, "real_impact": impact, "per_actor": c.per_actor, "hidden_cause": c.hidden_cause})
    winner = scores[0] if scores else None
    return {
        "title": world.setting.title,
        "mode": world.setting.mode,
        "era": world.setting.era,
        "rounds_played": world.round,
        "sim_time_final": sim_time_label(world),
        "winner": {"actor": winner["actor"], "name": winner["name"], "score": winner["total"], "qualification": winner["qualification"]} if winner else None,
        "ranking": [{"rank": s["rank"], "actor": s["actor"], "name": s["name"], "total": s["total"], "components": s["components"], "qualification": s["qualification"]} for s in scores],
        "mentions": special,
        "teams": teams,
        "timeline": [r.model_dump() for r in world.rounds],
        "communiques": communiques,
        "cards": [{"actor": c.actor, "actor_name": world.actors[c.actor].name, "card": CARDS[c.card], "round": c.round, "request": c.official_request,
                   "payload": {k: v for k, v in c.payload.items() if k != "invest"}, "invest": c.payload.get("invest", {}), "result": c.result}
                  for c in world.cards_used],
        "ignored": ignored,
        "balance_history": [{"round": h["round"], "shares": h["shares"]} for h in world.balance_history],
        "cinematic": cinematic_theme(world),
        "meta": meta,
        "audit_count": len(world.audit),
    }
