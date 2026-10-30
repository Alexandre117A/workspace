"""Fournisseur de modèle (Claude via le SDK officiel Anthropic) + compteur de coûts.

Configuration :
- ANTHROPIC_API_KEY (ou profil `ant auth login`) : active l'IA.
- GEONEX_AI=off : force le mode règles même si une clé existe.
- GEONEX_AI_MODEL / GEONEX_AI_MODEL_<FONCTION> : modèle par fonction
  (défaut claude-opus-5-5 ; l'exploitant peut choisir un modèle moins coûteux).
- GEONEX_AI_BUDGET_USD : plafond de dépense IA par processus moteur
  (au-delà, retour automatique aux règles, signalé dans les sorties).
"""
from __future__ import annotations

import os
import threading
import time
from typing import Any, Optional, Type, TypeVar

from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)

DEFAULT_MODEL = "claude-opus-5-5"
# Tarifs publics ($ / million de jetons) pour l'estimation des coûts.
PRICING = {
    "claude-opus-5-5": (4.0, 20.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-fable-5-1": (10.0, 50.0),
}
FALLBACK_MODELS = {"claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"}


class AIUnavailable(RuntimeError):
    pass


_lock = threading.Lock()
_usage: dict[str, Any] = {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "by_function": {}, "failures": 0}
_client = None


def _has_credentials() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_PROFILE"))


def available() -> bool:
    # L'IA est retirée du fonctionnement normal : le moteur de règles (dynamics.py) la remplace.
    # Elle ne s'active que sur demande explicite (GEONEX_AI=on) ET avec des identifiants.
    if os.environ.get("GEONEX_AI", "off").lower() not in {"on", "1", "true", "yes"}:
        return False
    if not _has_credentials():
        return False
    budget = float(os.environ.get("GEONEX_AI_BUDGET_USD", "25"))
    return _usage["cost_usd"] < budget


def model_for(function: str) -> str:
    return os.environ.get(f"GEONEX_AI_MODEL_{function.upper()}") or os.environ.get("GEONEX_AI_MODEL") or DEFAULT_MODEL


def status() -> dict[str, Any]:
    return {
        "enabled": available(),
        "credentials": _has_credentials(),
        "forced_off": os.environ.get("GEONEX_AI", "on").lower() in {"off", "0", "false", "no"},
        "default_model": model_for("default"),
        "budget_usd": float(os.environ.get("GEONEX_AI_BUDGET_USD", "25")),
    }


def usage_snapshot() -> dict[str, Any]:
    with _lock:
        return {**_usage, "by_function": dict(_usage["by_function"])}


def _get_client():
    global _client
    if _client is None:
        import anthropic

        _client = anthropic.Anthropic(timeout=float(os.environ.get("GEONEX_AI_TIMEOUT", "150")), max_retries=2)
    return _client


def _record(function: str, model: str, usage: Any) -> None:
    inp = getattr(usage, "input_tokens", 0) or 0
    out = getattr(usage, "output_tokens", 0) or 0
    pin, pout = PRICING.get(model, PRICING[DEFAULT_MODEL])
    cost = inp / 1e6 * pin + out / 1e6 * pout
    with _lock:
        _usage["calls"] += 1
        _usage["input_tokens"] += inp
        _usage["output_tokens"] += out
        _usage["cost_usd"] = round(_usage["cost_usd"] + cost, 6)
        fn = _usage["by_function"].setdefault(function, {"calls": 0, "cost_usd": 0.0})
        fn["calls"] += 1
        fn["cost_usd"] = round(fn["cost_usd"] + cost, 6)


def call_structured(
    function: str,
    system: str,
    user: str,
    schema: Type[T],
    effort: str = "medium",
    max_tokens: int = 16000,
) -> tuple[T, str]:
    """Appel validé par schéma Pydantic. Retourne (objet, identifiant du modèle).

    Lève AIUnavailable si l'IA n'est pas configurée, a refusé, ou a produit une
    sortie invalide : l'appelant bascule alors sur les règles du moteur.
    """
    if not available():
        raise AIUnavailable("IA non configurée ou budget atteint")
    import anthropic

    model = model_for(function)
    client = _get_client()
    kwargs: dict[str, Any] = dict(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
        output_format=schema,
        output_config={"effort": effort},
    )
    started = time.monotonic()
    try:
        if model in FALLBACK_MODELS:
            # Repli serveur en cas de refus de sécurité (activé par défaut).
            response = client.beta.messages.parse(
                **kwargs, betas=["server-side-fallback-2026-07-01"], fallbacks="default"
            )
        else:
            response = client.messages.parse(**kwargs)
    except anthropic.APIConnectionError as exc:
        _fail()
        raise AIUnavailable(f"connexion au fournisseur impossible ({exc.__class__.__name__})") from exc
    except anthropic.RateLimitError as exc:
        _fail()
        raise AIUnavailable("limite de débit du fournisseur atteinte") from exc
    except anthropic.APIStatusError as exc:
        _fail()
        raise AIUnavailable(f"erreur fournisseur {exc.status_code}") from exc
    except ValidationError as exc:
        _fail()
        raise AIUnavailable("sortie IA non conforme au schéma") from exc
    _record(function, model, getattr(response, "usage", None))
    if response.stop_reason == "refusal":
        raise AIUnavailable("le modèle a décliné la demande")
    if response.stop_reason == "max_tokens":
        raise AIUnavailable("réponse IA tronquée")
    parsed: Optional[T] = getattr(response, "parsed_output", None)
    if parsed is None:
        raise AIUnavailable("réponse IA vide")
    _ = time.monotonic() - started
    return parsed, f"ai:{getattr(response, 'model', model)}"


def _fail() -> None:
    with _lock:
        _usage["failures"] += 1
