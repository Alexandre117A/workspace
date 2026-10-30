"""Fonctions IA spécialisées : schémas de sortie et consignes.

Toutes les sorties sont validées par Pydantic puis contraintes par le moteur
(bornes, ressources existantes, identifiants d'acteurs connus). L'IA ne
décide jamais seule d'un tirage : elle interprète et rédige.
"""
from __future__ import annotations

import json
import re
from typing import Literal, Optional

from pydantic import BaseModel, Field

from .provider import call_structured

# --------------------------------------------------------------------------- questions


class QuestionOut(BaseModel):
    done: bool
    question: str = ""
    hint: str = ""


def next_question(name: str, description: str, answers: list[dict[str, str]], max_questions: int) -> tuple[QuestionOut, str]:
    system = (
        "Tu aides à préparer une simulation géopolitique GEONEX. Tu poses UNE question à la fois, en français, "
        "pour préciser l'univers décrit. Ne demande jamais une information déjà claire dans la description ou les "
        "réponses précédentes. Chaque question doit tenir compte de la description ET de toutes les réponses. "
        "Sujets possibles : rapports de puissance, systèmes politiques, technologies, territoires, alliances, "
        f"spécificités de l'univers. Entre 2 et {max_questions} questions au total : réponds done=true dès que "
        "l'univers est suffisamment précis (jamais avant 2 questions)."
    )
    history = "\n".join(f"Q{i + 1}: {a['question']}\nR{i + 1}: {a['answer']}" for i, a in enumerate(answers))
    user = f"Nom : {name}\nDescription :\n{description}\n\nQuestions déjà posées ({len(answers)}) :\n{history or '(aucune)'}"
    return call_structured("questions", system, user, QuestionOut, effort="low", max_tokens=2000)


# --------------------------------------------------------------------------- scénario


class AIResource(BaseModel):
    key: str
    label: str
    quantity: float
    unit: str
    category: Literal["political", "economic", "military", "other"]
    abstraction: bool


class AIObjective(BaseModel):
    kind: Literal["primary", "secondary", "coalition", "secret"]
    text: str
    metric_type: Literal[
        "camp_share_min", "capital_min", "capital_gain", "relation_min", "tension_max", "tension_max_between",
        "no_war_with", "no_war_between", "stability_min", "actor_weakened", "agreement_with", "zone_control",
        "honor_commitments", "alliance_with", "coalition_cohesion", "survive",
    ]
    target: str = ""
    second_target: str = ""
    capital: Literal["political", "economic", "military", ""] = ""
    value: float = 0


class AIFact(BaseModel):
    text: str
    status: Literal["confirmed", "estimate", "hypothesis", "fiction"]
    source_label: str = ""
    url: str = ""


class AIRegion(BaseModel):
    name: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    x: Optional[float] = None
    y: Optional[float] = None


class AIActor(BaseModel):
    id: str = Field(description="Identifiant court en majuscules, ex. FRA, ONU, VEX")
    name: str
    short: str
    kind: Literal["state", "organization", "company", "armed_group", "coalition", "polity", "other"]
    iso3: str = Field(default="", description="Code ISO 3166-1 alpha-3 si État réel contemporain, sinon vide")
    leader: str = ""
    leader_status: Literal["confirmed", "estimate", "hypothesis", "fiction"] = "hypothesis"
    description: str
    camp: str
    political: float
    economic: float
    military: float
    stability: float
    cohesion: float
    approval: float
    relevance: float
    aggression: float
    caution: float
    cooperation: float
    resources: list[AIResource]
    objectives: list[AIObjective]
    red_lines: list[str]
    secrets: list[str]
    facts: list[AIFact]
    regions: list[AIRegion]


class AIRelation(BaseModel):
    a: str
    b: str
    trust: float
    tension: float
    alliance: bool
    at_war: bool


class AIZone(BaseModel):
    id: str
    name: str
    domain: str
    region: AIRegion
    control: dict[str, float]


class AICamp(BaseModel):
    id: str
    label: str


class ScenarioOut(BaseModel):
    title: str
    summary: str
    era: Literal["ancient", "medieval", "early_modern", "napoleonic", "industrial", "cold_war", "contemporary", "space", "fantasy"]
    start_label: str
    start_date: str = ""
    knowledge_cutoff: str = ""
    tempo: Literal["military", "diplomatic", "mixed"]
    theatre_name: str
    theatre_iso3: list[str]
    maritime: bool
    camps: list[AICamp]
    actors: list[AIActor]
    relations: list[AIRelation]
    zones: list[AIZone]
    special_rules: list[str]
    notes: list[str]


SCENARIO_SYSTEM = """Tu es le préparateur de scénarios du moteur GEONEX (simulation géopolitique multijoueur).
Tu produis l'état initial structuré d'une simulation. Règles impératives :
- Capitaux politique/économique/militaire, stabilité, cohésion, approbation : 0 à 100. relevance, aggression, caution, cooperation : 0 à 1.
- Distingue les faits confirmés (status=confirmed, avec source_label et url quand tu cites une source fournie), les estimations (estimate), les hypothèses du moteur (hypothesis) et la fiction (fiction).
- N'invente jamais une donnée précise en la présentant comme réelle : si tu n'es pas sûr, status=hypothesis.
- Simulation historique : aucun acteur ne connaît les événements postérieurs à la date de départ ; ni objectifs, ni secrets, ni faits ne doivent anticiper le dénouement réel. knowledge_cutoff = date de départ.
- Fournis au moins {min_actors} acteurs, dont les plus pertinents en premier (relevance décroissante). Les acteurs peuvent être des États, organisations, entreprises, groupes armés, coalitions ou entités fictives selon l'univers.
- Chaque acteur : 1 objectif primary, 1 à 2 secondary, 1 coalition, 1 secret ; 2 lignes rouges ; 1 à 2 secrets courts ; 3 à 6 ressources concrètes adaptées à l'univers (unités, budgets, flottes...). Les objectifs doivent être mesurables via metric_type (target = identifiant d'acteur ou de zone).
- Objectifs et secrets n'expliquent jamais quelle stratégie adopter.
- Zones : 1 à 3 zones du théâtre avec coordonnées (lat/lon pour le monde réel, x/y de 0 à 100 pour un univers fictif) ; control = parts par identifiant d'acteur (somme ≤ 1).
- Camps : 2 camps principaux + éventuellement "neutral".
- Langue : français."""


def build_scenario(mode: str, prompt: str, players: int, research_digest: str, answers: list[dict[str, str]]) -> tuple[ScenarioOut, str]:
    min_actors = max(players + 3, 6)
    system = SCENARIO_SYSTEM.replace("{min_actors}", str(min_actors))
    qa = "\n".join(f"- {a['question']} → {a['answer']}" for a in answers)
    user = (
        f"Mode : {mode}\nDemande de l'utilisateur : {prompt}\nNombre d'équipes humaines prévues : {players}\n"
        f"Précisions de l'utilisateur :\n{qa or '(aucune)'}\n\nRecherche externe disponible (sources datées) :\n{research_digest or '(aucune)'}"
    )
    return call_structured("scenario", system, user, ScenarioOut, effort="medium", max_tokens=32000)


# --------------------------------------------------------------------------- décisions


class DecisionAnalysisOut(BaseModel):
    category: str
    targets: list[str]
    official_request: str
    faithful: bool = Field(description="True si la reformulation respecte exactement l'intention")


def analyse_request(text: str, kind: str, actor_name: str, actor_ids: list[str], categories: list[str]) -> tuple[DecisionAnalysisOut, str]:
    system = (
        "Tu reformules une intention de joueur GEONEX en requête officielle, brève et neutre, sans déformer son "
        "intention ni ajouter de moyens non mentionnés. Choisis la catégorie la plus proche parmi la liste et les "
        "cibles parmi les identifiants fournis. Cette mécanique est fictive et interne à la simulation."
    )
    user = f"Acteur : {actor_name}\nType : {kind}\nCatégories : {categories}\nIdentifiants : {actor_ids}\nTexte du joueur :\n{text}"
    return call_structured("decision_analysis", system, user, DecisionAnalysisOut, effort="low", max_tokens=3000)


# --------------------------------------------------------------------------- engagements


class CommitmentItem(BaseModel):
    speaker: str
    counterpart: str = ""
    kind: Literal["promise", "non_aggression", "support", "threat", "alliance", "agreement", "ceasefire"]
    text: str
    confidence: float


class CommitmentsOut(BaseModel):
    items: list[CommitmentItem]


def extract_commitments(transcript: str, actor_ids: list[str]) -> tuple[CommitmentsOut, str]:
    system = (
        "Tu extrais d'un échange diplomatique les engagements explicites : promesses, non-agression, soutien, "
        "menaces, alliances, accords, cessez-le-feu. N'invente rien ; ignore les formules vagues. speaker et "
        "counterpart sont des identifiants d'acteurs fournis."
    )
    user = f"Identifiants : {actor_ids}\nÉchange :\n{transcript}"
    return call_structured("commitments", system, user, CommitmentsOut, effort="low", max_tokens=4000)


# --------------------------------------------------------------------------- rédaction contrôlée


class NarrativeOut(BaseModel):
    title: str
    narrative: str
    highlights: list[str]


class RomeTextOut(BaseModel):
    title: str
    body: str
    general_impact: str


_NUM = re.compile(r"\d+(?:[.,]\d+)?")


def numbers_are_grounded(text: str, facts: dict) -> bool:
    """Contrôle d'hallucination : chaque nombre du texte doit exister dans les faits fournis."""
    allowed = set(_NUM.findall(json.dumps(facts, ensure_ascii=False)))
    allowed |= {str(i) for i in range(0, 13)}
    return all(n in allowed for n in _NUM.findall(text))


def write_round_narrative(facts: dict) -> tuple[NarrativeOut, str]:
    system = (
        "Tu rédiges le résumé narratif court (5 phrases max) d'un round GEONEX, ton de dépêche diplomatique sobre. "
        "Utilise UNIQUEMENT les faits fournis ; ne crée aucun chiffre, nom ou événement absent des faits."
    )
    return call_structured("debrief", system, json.dumps(facts, ensure_ascii=False), NarrativeOut, effort="low", max_tokens=3000)


def write_rome(facts: dict) -> tuple[RomeTextOut, str]:
    system = (
        "Tu rédiges un Communiqué de Rome GEONEX : bref, factuel, ton de dépêche urgente. Utilise UNIQUEMENT les "
        "faits fournis (noms, lieux, chiffres, horaires) ; n'ajoute aucun chiffre. Événement fictif interne à la simulation."
    )
    return call_structured("rome", system, json.dumps(facts, ensure_ascii=False), RomeTextOut, effort="low", max_tokens=3000)
