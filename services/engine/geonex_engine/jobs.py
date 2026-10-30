"""Tâches de préparation de scénario, avec progression liée au travail réel.

Délai visé : 180 s. Au-delà, la tâche est signalée « en retard » mais continue
(rien n'est déclaré terminé artificiellement) ; au-delà de la limite dure,
elle échoue proprement avec un message explicite.
"""
from __future__ import annotations

import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional

from .scenario_builder import STEPS, ScenarioError, build

TARGET_SECONDS = 180
HARD_LIMIT_SECONDS = 420
WEIGHTS = {"interpret": 0.05, "research": 0.15, "actors": 0.4, "balance": 0.1, "objectives": 0.12, "resources": 0.08, "engine": 0.1}

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="scenario")
_jobs: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def _now() -> float:
    return time.time()


def create(params: dict[str, Any]) -> str:
    job_id = uuid.uuid4().hex
    job = {
        "id": job_id, "status": "queued", "created_at": _now(), "started_at": None, "finished_at": None, "params": params,
        "steps": [{"key": k, "label": label, "status": "pending", "detail": "", "started_at": None, "finished_at": None} for k, label in STEPS],
        "result": None, "error": None, "cancelled": False,
    }
    with _lock:
        _prune()
        _jobs[job_id] = job
    _executor.submit(_run, job_id)
    return job_id


def _progress(job_id: str):
    def update(step: str, status: str, detail: str) -> None:
        with _lock:
            job = _jobs.get(job_id)
            if job is None:
                return
            if job["cancelled"]:
                raise ScenarioError("Préparation annulée par l'utilisateur.")
            for s in job["steps"]:
                if s["key"] == step:
                    if status == "running" and s["started_at"] is None:
                        s["started_at"] = _now()
                    if status == "done":
                        s["finished_at"] = _now()
                        s["started_at"] = s["started_at"] or s["finished_at"]
                    s["status"] = status
                    s["detail"] = detail
                    break
    return update


def _run(job_id: str) -> None:
    with _lock:
        job = _jobs[job_id]
        job["status"] = "running"
        job["started_at"] = _now()
        p = dict(job["params"])
    try:
        scenario = build(p["mode"], p["prompt"], int(p.get("players", 4)), int(p.get("seed", 1)), name=p.get("name", ""),
                         answers=p.get("answers") or [], progress=_progress(job_id))
        with _lock:
            elapsed = _now() - job["started_at"]
            if elapsed > HARD_LIMIT_SECONDS:
                job["status"] = "failed"
                job["error"] = "La préparation a dépassé la durée maximale autorisée."
            else:
                job["status"] = "done"
                job["result"] = scenario.model_dump(mode="json")
    except ScenarioError as exc:
        with _lock:
            job["status"] = "failed"
            job["error"] = str(exc)
    except Exception as exc:  # erreur inattendue : jamais de faux succès
        with _lock:
            job["status"] = "failed"
            job["error"] = f"Erreur interne du moteur ({exc.__class__.__name__})."
            job["trace"] = traceback.format_exc()[-2000:]
    finally:
        with _lock:
            job["finished_at"] = _now()


def get(job_id: str) -> Optional[dict[str, Any]]:
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            return None
        done_weight = sum(WEIGHTS.get(s["key"], 0.1) for s in job["steps"] if s["status"] == "done")
        running_weight = sum(WEIGHTS.get(s["key"], 0.1) * 0.35 for s in job["steps"] if s["status"] == "running")
        elapsed = (job["finished_at"] or _now()) - (job["started_at"] or job["created_at"])
        status = job["status"]
        if status == "running" and elapsed > HARD_LIMIT_SECONDS:
            job["cancelled"] = True
            job["status"] = status = "failed"
            job["error"] = "La préparation a dépassé la durée maximale autorisée ; aucun scénario incomplet n'a été conservé."
        return {
            "id": job["id"], "status": status, "progress": round(min(1.0, done_weight + running_weight) if status != "done" else 1.0, 3),
            "elapsed_seconds": round(elapsed, 1), "target_seconds": TARGET_SECONDS, "overdue": status == "running" and elapsed > TARGET_SECONDS,
            "steps": [dict(s) for s in job["steps"]], "error": job["error"], "result": job["result"] if status == "done" else None,
        }


def cancel(job_id: str) -> bool:
    with _lock:
        job = _jobs.get(job_id)
        if job is None or job["status"] not in ("queued", "running"):
            return False
        job["cancelled"] = True
        return True


def _prune() -> None:
    cutoff = _now() - 3600
    for jid in [j for j, job in _jobs.items() if job["created_at"] < cutoff]:
        del _jobs[jid]
