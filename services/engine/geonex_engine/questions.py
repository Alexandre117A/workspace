"""Questions adaptatives (2 à 5) pour la création d'une simulation personnalisée.

Avec IA : chaque question est générée à partir de la description et de toutes
les réponses précédentes. Sans IA : un moteur de règles analyse la description
et les réponses (thèmes déjà couverts, univers détecté, éléments cités dans
les réponses) pour choisir la question suivante ; la sortie l'indique.
"""
from __future__ import annotations

import re

from . import ai
from .ai.tasks import next_question as ai_next_question
from .reference_data import normalize

MIN_QUESTIONS = 2
MAX_QUESTIONS = 5

THEMES: dict[str, list[str]] = {
    "power": ["puissance", "superpuissance", "domin", "armee", "militaire", "force", "flotte", "rapport de force", "hegemon"],
    "politics": ["regime", "democratie", "empire", "royaume", "republique", "dictature", "gouvern", "senat", "conseil", "theocratie"],
    "technology": ["technolog", "nucleaire", "spatial", "vaisseau", "laser", "ia", "cyber", "poudre", "voile", "hyperespace"],
    "territory": ["territoire", "frontiere", "planete", "continent", "ile", "region", "province", "colonie", "systeme"],
    "alliances": ["alliance", "coalition", "traite", "pacte", "allie", "federation", "ligue", "union"],
    "economy": ["ressource", "commerce", "economie", "minerai", "petrole", "energie", "or ", "monnaie", "route commerciale"],
    "trigger": ["crise", "guerre", "incident", "attentat", "invasion", "assassinat", "rupture", "ultimatum", "blocus"],
}

QUESTION_BANK: dict[str, tuple[str, str]] = {
    "power": ("Quels sont les rapports de puissance entre les principaux acteurs ? Qui domine, et dans quel domaine (militaire, économique, politique) ?", "Ex. : l'Empire possède la flotte la plus puissante mais son économie s'essouffle."),
    "politics": ("Comment sont gouvernés les principaux acteurs, et quelles tensions intérieures les traversent ?", "Régimes, factions, légitimité, contestation…"),
    "technology": ("Quel est le niveau technologique de cet univers, et existe-t-il une arme ou une capacité décisive ?", "Ex. : propulsion interstellaire réservée à deux puissances."),
    "territory": ("Quels territoires ou zones sont au cœur de la crise ?", "Lieux contestés, routes stratégiques, frontières instables…"),
    "alliances": ("Quelles alliances, rivalités ou dépendances lient les acteurs au début de la simulation ?", "Traités, pactes secrets, dettes, protectorats…"),
    "economy": ("Quelles ressources ou quels flux économiques font l'objet de la compétition ?", "Énergie, minerais, routes commerciales, monnaie…"),
    "trigger": ("Quel événement déclenche la crise au moment où la simulation commence ?", "Ex. : la destruction d'un convoi diplomatique à la frontière."),
}

PRIORITY = ["trigger", "power", "alliances", "territory", "politics", "technology", "economy"]


def _covered(text: str) -> set[str]:
    norm = normalize(text)
    return {theme for theme, words in THEMES.items() if any(w in norm for w in words)}


def _named_entities(text: str) -> list[str]:
    candidates = re.findall(r"\b([A-ZÉÈÀÂÎÔÛ][\w'’-]{2,}(?:\s+(?:de\s+|du\s+|des\s+|d’|d')?[A-ZÉÈÀÂÎÔÛ][\w'’-]{2,})*)", text)
    stop = {"Les", "Le", "La", "Une", "Un", "Des", "Dans", "Pour", "Mais", "Elle", "Ils", "Nous", "Ces", "Cette", "Chaque",
            "Lorsque", "Quand", "Alors", "Depuis", "Après", "Avant", "Entre", "Chez", "Sur", "Son", "Ses", "Leur", "Leurs"}
    seen: list[str] = []
    for c in candidates:
        if c not in stop and c not in seen:
            seen.append(c)
    return seen[:6]


def target_count(description: str) -> int:
    words = len(description.split())
    covered = len(_covered(description))
    if words > 220 and covered >= 5:
        return 2
    if words > 120 and covered >= 4:
        return 3
    if words > 50:
        return 4
    return 5


def rules_next_question(description: str, answers: list[dict[str, str]]) -> dict:
    asked_themes = {a.get("theme") for a in answers if a.get("theme")}
    full_text = description + " " + " ".join(a.get("answer", "") for a in answers)
    covered = _covered(full_text)
    target = target_count(description)
    if len(answers) >= MAX_QUESTIONS or (len(answers) >= max(MIN_QUESTIONS, target) and covered >= {"power", "trigger"}):
        return {"done": True, "generated_by": "rules"}
    remaining = [t for t in PRIORITY if t not in covered and t not in asked_themes]
    if not remaining:
        if len(answers) >= MIN_QUESTIONS:
            return {"done": True, "generated_by": "rules"}
        remaining = [t for t in PRIORITY if t not in asked_themes]
    theme = remaining[0]
    text, hint = QUESTION_BANK[theme]
    # Rebond sur la dernière réponse : on cite les entités qu'elle mentionne.
    if answers:
        entities = _named_entities(answers[-1].get("answer", "")) or _named_entities(description)
        if entities and theme in {"alliances", "power", "politics", "territory"}:
            names = ", ".join(entities[:3])
            text = text.rstrip("?") + f" — notamment pour {names} ?"
    elif theme == "trigger":
        entities = _named_entities(description)
        if entities:
            text = f"Vous évoquez {', '.join(entities[:3])}. " + text
    return {"done": False, "question": text, "hint": hint, "theme": theme, "generated_by": "rules"}


def next_question(name: str, description: str, answers: list[dict[str, str]]) -> dict:
    if len(answers) >= MAX_QUESTIONS:
        return {"done": True, "generated_by": "rules"}
    if ai.available():
        try:
            out, model = ai_next_question(name, description, answers, MAX_QUESTIONS)
            if out.done and len(answers) < MIN_QUESTIONS:
                raise ai.AIUnavailable("trop tôt")
            if out.done:
                return {"done": True, "generated_by": model}
            return {"done": False, "question": out.question, "hint": out.hint, "theme": "ai", "generated_by": model}
        except ai.AIUnavailable:
            pass
    return rules_next_question(description, answers)
