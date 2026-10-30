"""Couche probabiliste explicite et auditable.

Les facteurs sont exprimés en contributions log-odds bornées, puis saturés
(tanh) : aucun facteur ne peut à lui seul garantir un résultat, et l'addition
de bonus ne produit jamais une certitude. Chaque tirage est reproductible :
il dépend uniquement de la graine de session et d'une clé de tirage.
"""
from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass

P_MIN = 0.04
P_MAX = 0.96
FACTOR_CAP = 2.2
SATURATION = 3.0


def rng_for(seed: int | str, *parts: object) -> random.Random:
    raw = "|".join(str(p) for p in (seed, *parts))
    digest = hashlib.sha256(raw.encode("utf-8")).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


def logit(p: float) -> float:
    p = min(max(p, 1e-6), 1 - 1e-6)
    return math.log(p / (1 - p))


def sigmoid(x: float) -> float:
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    z = math.exp(x)
    return z / (1.0 + z)


def investment(points: float, scale: float = 12.0, weight: float = 0.85) -> float:
    """Rendement décroissant de l'investissement : log(1 + x/scale)."""
    return weight * math.log1p(max(0.0, points) / scale)


@dataclass
class Assessment:
    probability: float
    probability_engine: float
    contributions: dict[str, float]
    base_logit: float
    president_probability: float | None


def assess(base_logit: float, factors: dict[str, float], president_probability: float | None = None) -> Assessment:
    contributions = {k: round(max(-FACTOR_CAP, min(FACTOR_CAP, v)), 4) for k, v in factors.items() if abs(v) > 1e-9}
    x = base_logit + sum(contributions.values())
    x = SATURATION * math.tanh(x / SATURATION)
    p_engine = sigmoid(x)
    if president_probability is not None:
        pp = min(max(float(president_probability), 0.01), 0.99)
        # La probabilité validée par le Président domine, le moteur garde une part
        # de l'évaluation : le Président ne fixe jamais seul le résultat.
        p = sigmoid(0.65 * logit(pp) + 0.35 * logit(p_engine))
    else:
        p = p_engine
    p = min(max(p, P_MIN), P_MAX)
    return Assessment(round(p, 4), round(p_engine, 4), contributions, base_logit, president_probability)


OUTCOMES = ("major_success", "success", "partial", "failure", "backfire")


def draw(rng: random.Random, p: float) -> tuple[float, str]:
    roll = rng.random()
    if roll < p * 0.22:
        outcome = "major_success"
    elif roll < p:
        outcome = "success"
    elif roll < p + (1 - p) * 0.38:
        outcome = "partial"
    elif roll < 1 - (1 - p) * 0.16:
        outcome = "failure"
    else:
        outcome = "backfire"
    return round(roll, 6), outcome


OUTCOME_MAGNITUDE = {
    "major_success": 1.35,
    "success": 1.0,
    "partial": 0.45,
    "failure": 0.0,
    "backfire": -0.5,
}

OUTCOME_LABEL_FR = {
    "major_success": "succès majeur",
    "success": "succès",
    "partial": "résultat partiel",
    "failure": "échec",
    "backfire": "retournement défavorable",
}
