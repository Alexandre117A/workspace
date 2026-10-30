"""Couche IA de GEONEX, séparée par fonctions.

Chaque fonction (préparation des scénarios, questions adaptatives, analyse
des décisions, acteurs non joués, renseignement, Communiqués de Rome,
extraction d'engagements, comptes rendus) a son propre module d'appel et
son propre schéma de validation. Sans clé API, `ai.available()` est faux et
le moteur utilise ses règles déterministes, toujours signalées comme telles.
"""
from .provider import AIUnavailable, available, call_structured, status, usage_snapshot

__all__ = ["AIUnavailable", "available", "call_structured", "status", "usage_snapshot"]
