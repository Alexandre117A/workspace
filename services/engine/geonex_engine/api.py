"""Service HTTP du moteur GEONEX (FastAPI).

Le moteur est sans état de session : le backend lui transmet l'état du monde
persisté, le moteur le transforme et renvoie le nouvel état + les vues filtrées.
Accès réservé au backend (jeton partagé GEONEX_ENGINE_TOKEN).
"""
from __future__ import annotations

import os
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from . import ai, archive, cards, jobs, questions, research, rome, session as session_mod, views
from .actions import CATALOG, NEEDS_ARBITRATION, Decision, assess_decision, validate
from .probability import assess
from .ai.tasks import analyse_request
from .models import Scenario, WorldState
from .planning import MIN_DURATION_MINUTES, RECOMMENDATION, build_plan
from .resolution import resolve_round

app = FastAPI(title="GEONEX Engine", version="0.1.0")


@app.on_event("startup")
def _warm() -> None:
    import threading

    threading.Thread(target=research.warm_leaders, daemon=True, name="warm-leaders").start()


def _auth(x_engine_token: Optional[str] = Header(default=None)) -> None:
    expected = os.environ.get("GEONEX_ENGINE_TOKEN")
    if expected and x_engine_token != expected:
        raise HTTPException(status_code=401, detail="Jeton moteur invalide.")


def _world(data: dict[str, Any]) -> WorldState:
    try:
        return WorldState.model_validate(data)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"État du monde invalide : {exc.__class__.__name__}")


def _dump(world: WorldState) -> dict[str, Any]:
    return world.model_dump(mode="json")


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "geonex-engine", "ai": ai.status(), "research": research.enabled(), "min_duration": MIN_DURATION_MINUTES}


@app.get("/usage", dependencies=[Depends(_auth)])
def usage() -> dict[str, Any]:
    return {"ai": ai.usage_snapshot()}


class QuestionReq(BaseModel):
    name: str = ""
    description: str
    answers: list[dict[str, str]] = Field(default_factory=list)


@app.post("/questions/next", dependencies=[Depends(_auth)])
def next_question(req: QuestionReq) -> dict[str, Any]:
    return questions.next_question(req.name, req.description, req.answers)


class JobReq(BaseModel):
    mode: str
    prompt: str
    name: str = ""
    answers: list[dict[str, str]] = Field(default_factory=list)
    players: int = Field(4, ge=1, le=16)
    seed: int = 1


@app.post("/scenarios/jobs", dependencies=[Depends(_auth)])
def create_job(req: JobReq) -> dict[str, Any]:
    if req.mode not in ("contemporary", "historical", "fictional"):
        raise HTTPException(400, "Mode inconnu.")
    return {"job_id": jobs.create(req.model_dump())}


@app.get("/scenarios/jobs/{job_id}", dependencies=[Depends(_auth)])
def get_job(job_id: str) -> dict[str, Any]:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "Tâche inconnue ou expirée.")
    return job


@app.delete("/scenarios/jobs/{job_id}", dependencies=[Depends(_auth)])
def cancel_job(job_id: str) -> dict[str, Any]:
    return {"cancelled": jobs.cancel(job_id)}


class PlanReq(BaseModel):
    duration_minutes: int
    team_count: int
    tempo: str = "mixed"


@app.post("/sessions/plan", dependencies=[Depends(_auth)])
def plan(req: PlanReq) -> dict[str, Any]:
    try:
        return {"plan": build_plan(req.duration_minutes, req.team_count, req.tempo).model_dump(), "recommendation": RECOMMENDATION}
    except ValueError as exc:
        raise HTTPException(400, str(exc))


class PrepareReq(BaseModel):
    scenario: dict[str, Any]
    session_id: str
    team_count: int = Field(ge=1, le=16)
    duration_minutes: int
    seed: int


@app.post("/sessions/prepare", dependencies=[Depends(_auth)])
def prepare(req: PrepareReq) -> dict[str, Any]:
    scenario = Scenario.model_validate(req.scenario)
    try:
        world = session_mod.prepare(scenario, req.session_id, req.team_count, req.duration_minutes, req.seed)
        playable = session_mod.select_playable(world, req.team_count)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"world": _dump(world), "plan": world.plan.model_dump(), "playable": playable}


class AssignReq(BaseModel):
    world: dict[str, Any]
    team_count: Optional[int] = None
    actor_ids: Optional[list[str]] = None


@app.post("/sessions/assign", dependencies=[Depends(_auth)])
def assign(req: AssignReq) -> dict[str, Any]:
    world = _world(req.world)
    try:
        ids = req.actor_ids or session_mod.select_playable(world, req.team_count or 1)
        if any(i not in world.actors for i in ids):
            raise ValueError("Acteur inconnu dans l'attribution.")
        session_mod.assign(world, ids)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"world": _dump(world), "assignment": ids, "dossiers": {i: session_mod.dossier(world, i) for i in ids}, "views": views.all_views(world)}


class WorldReq(BaseModel):
    world: dict[str, Any]


@app.post("/rounds/begin", dependencies=[Depends(_auth)])
def begin(req: WorldReq) -> dict[str, Any]:
    world = _world(req.world)
    briefing = session_mod.begin_round(world)
    return {"world": _dump(world), "briefing": briefing, "views": views.all_views(world)}


class ValidateReq(BaseModel):
    world: dict[str, Any]
    actor_id: str
    decisions: list[dict[str, Any]]


@app.post("/decisions/validate", dependencies=[Depends(_auth)])
def validate_decisions(req: ValidateReq) -> dict[str, Any]:
    world = _world(req.world)
    try:
        ds = [Decision.from_dict({**d, "actor": req.actor_id}) for d in req.decisions]
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(400, f"Décision mal formée ({exc.__class__.__name__}).")
    errors = validate(world, ds)
    return {"errors": errors, "needs_arbitration": [d.id for d in ds if d.category in NEEDS_ARBITRATION]}


@app.post("/decisions/preview", dependencies=[Depends(_auth)])
def preview_decisions(req: ValidateReq) -> dict[str, Any]:
    """Estimation de chance et facteurs d'une décision AVANT validation (aucun tirage, aucun effet)."""
    world = _world(req.world)
    try:
        ds = [Decision.from_dict({**d, "actor": req.actor_id}) for d in req.decisions]
    except (KeyError, ValueError, TypeError):
        raise HTTPException(400, "Décision mal formée.")
    out = []
    for d in ds:
        if d.actor not in world.actors or d.category not in CATALOG or any(t not in world.actors or t == d.actor for t in d.targets):
            continue
        base, factors, _ = assess_decision(world, d, ds)
        a = assess(base, factors, None)
        out.append({"id": d.id, "probability": a.probability, "factors": a.contributions, "hostile": CATALOG[d.category]["hostile"], "cost": sum(d.allocation.values())})
    return {"previews": out}


class InterpretReq(BaseModel):
    world: dict[str, Any]
    actor_id: str
    kind: str
    text: str


@app.post("/requests/interpret", dependencies=[Depends(_auth)])
def interpret(req: InterpretReq) -> dict[str, Any]:
    world = _world(req.world)
    actor = world.actors.get(req.actor_id)
    if actor is None:
        raise HTTPException(404, "Acteur inconnu.")
    text = req.text.strip()[:1500]
    if ai.available():
        try:
            out, model = analyse_request(text, req.kind, actor.name, list(world.actors), list(CATALOG))
            if out.faithful:
                return {"official_request": out.official_request, "category": out.category if out.category in CATALOG else None,
                        "targets": [t for t in out.targets if t in world.actors], "generated_by": model}
        except ai.AIUnavailable:
            pass
    return {"official_request": f"{actor.name} — {req.kind} : « {text} »", "category": None, "targets": [], "generated_by": "rules"}


class CardReq(BaseModel):
    world: dict[str, Any]
    actor_id: str
    card: str
    payload: dict[str, Any]


@app.post("/cards/validate", dependencies=[Depends(_auth)])
def card_validate(req: CardReq) -> dict[str, Any]:
    world = _world(req.world)
    errs = cards.validate(world, req.actor_id, req.card, req.payload)
    return {"errors": errs, "official_request": cards.official_request(world, req.actor_id, req.card, req.payload) if not errs else None}


@app.post("/cards/submit", dependencies=[Depends(_auth)])
def card_submit(req: CardReq) -> dict[str, Any]:
    world = _world(req.world)
    errs = cards.validate(world, req.actor_id, req.card, req.payload)
    if errs:
        raise HTTPException(400, " ".join(errs))
    use = cards.submit(world, req.actor_id, req.card, req.payload)
    return {"world": _dump(world), "use": use.model_dump(), "views": views.all_views(world)}


class CardRuleReq(BaseModel):
    world: dict[str, Any]
    use_id: str
    approve: bool
    probability: Optional[float] = None


@app.post("/cards/rule", dependencies=[Depends(_auth)])
def card_rule(req: CardRuleReq) -> dict[str, Any]:
    """Arbitrage présidentiel d'une carte : refusée → carte rendue ; acceptée →
    probabilité éventuellement transmise au tirage."""
    world = _world(req.world)
    use = next((c for c in world.cards_used if c.id == req.use_id and c.status == "submitted"), None)
    if use is None:
        raise HTTPException(404, "Utilisation de carte introuvable.")
    if req.approve:
        if req.probability is not None:
            use.payload["president_probability"] = max(0.01, min(0.99, req.probability))
    else:
        use.status = "rejected"
        use.result = {"summary": "Demande refusée par le Président de séance ; la carte reste disponible."}
    return {"world": _dump(world), "views": views.all_views(world)}


class ControlReq(BaseModel):
    world: dict[str, Any]
    actor_id: str
    controlled_by: str


@app.post("/sessions/control", dependencies=[Depends(_auth)])
def control(req: ControlReq) -> dict[str, Any]:
    """Absence prolongée : le Président peut confier temporairement un acteur au moteur."""
    world = _world(req.world)
    actor = world.actors.get(req.actor_id)
    if actor is None or req.controlled_by not in ("human", "npc"):
        raise HTTPException(400, "Paramètres invalides.")
    actor.controlled_by = req.controlled_by  # type: ignore[assignment]
    return {"world": _dump(world), "views": views.all_views(world)}


class EstimateReq(BaseModel):
    world: dict[str, Any]
    actor_id: str
    target: str


@app.post("/cards/estimate", dependencies=[Depends(_auth)])
def card_estimate(req: EstimateReq) -> dict[str, Any]:
    world = _world(req.world)
    if req.target not in world.actors or req.actor_id not in world.actors:
        raise HTTPException(404, "Acteur inconnu.")
    return cards.political_shock_estimate(world, req.actor_id, req.target)


class ResolveReq(BaseModel):
    world: dict[str, Any]
    decisions: list[dict[str, Any]] = Field(default_factory=list)
    messages: list[dict[str, Any]] = Field(default_factory=list)


@app.post("/rounds/resolve", dependencies=[Depends(_auth)])
def resolve(req: ResolveReq) -> dict[str, Any]:
    world = _world(req.world)
    report = resolve_round(world, req.decisions, req.messages)
    return {"world": _dump(world), "report": report, "views": views.all_views(world)}


class RomeCheckReq(BaseModel):
    world: dict[str, Any]
    phase: str


@app.post("/rome/check", dependencies=[Depends(_auth)])
def rome_check(req: RomeCheckReq) -> dict[str, Any]:
    world = _world(req.world)
    result = rome.check(world, req.phase)
    payload = views.rome_payload(world, result["communique_id"]) if result.get("prepare") else None
    return {"world": _dump(world), "check": result, "payload": payload}


class RomeProposeReq(BaseModel):
    world: dict[str, Any]
    text: str
    seed_key: str


@app.post("/rome/propose", dependencies=[Depends(_auth)])
def rome_propose(req: RomeProposeReq) -> dict[str, Any]:
    world = _world(req.world)
    result = rome.propose(world, req.text, req.seed_key)
    payload = views.rome_payload(world, result["communique_id"]) if result.get("coherent") else None
    return {"world": _dump(world), "result": result, "payload": payload}


class RomeApplyReq(BaseModel):
    world: dict[str, Any]
    communique_id: str


@app.post("/rome/apply", dependencies=[Depends(_auth)])
def rome_apply(req: RomeApplyReq) -> dict[str, Any]:
    world = _world(req.world)
    applied = rome.apply(world, req.communique_id)
    return {"world": _dump(world), "applied": [e.model_dump() for e in applied], "views": views.all_views(world)}


@app.post("/rome/cancel", dependencies=[Depends(_auth)])
def rome_cancel(req: RomeApplyReq) -> dict[str, Any]:
    world = _world(req.world)
    world.communiques = [c for c in world.communiques if c.id != req.communique_id or c.delivered]
    if world.rome.pending_id == req.communique_id:
        world.rome.pending_id = None
    return {"world": _dump(world)}


class FinalizeReq(BaseModel):
    world: dict[str, Any]
    meta: dict[str, Any] = Field(default_factory=dict)


@app.post("/game/finalize", dependencies=[Depends(_auth)])
def finalize(req: FinalizeReq) -> dict[str, Any]:
    world = _world(req.world)
    result = archive.finalize(world, req.meta)
    return {"world": _dump(world), "archive": result, "views": views.all_views(world)}


@app.post("/views", dependencies=[Depends(_auth)])
def all_views(req: WorldReq) -> dict[str, Any]:
    return views.all_views(_world(req.world))
