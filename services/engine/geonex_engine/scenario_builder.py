"""Construction complète d'un scénario, étape par étape, avec progression réelle.

Chemins :
- IA disponible : recherche externe (contemporain) → génération structurée par
  Claude → validation et contraintes du moteur.
- Sans IA : règles du moteur (table de référence + recherche externe pour le
  contemporain, bases historiques intégrées, génération procédurale pour les
  univers personnalisés). Le scénario indique toujours son mode de génération.
"""
from __future__ import annotations

import math
import random
import re
import time
from typing import Callable, Optional

from . import ai
from .ai.tasks import ScenarioOut, build_scenario as ai_build_scenario
from .models import (
    Actor, Capitals, Fact, Generation, Objective, Personality, Region, Relation, Resource, Scenario, Setting,
    SourceRef, Theatre, Zone, relation_key,
)
from .probability import rng_for
from .reference_data import BY_ISO3, KNOWN_THEATRES, briefs_for, detect_countries, nearest_countries, normalize
from .research import research_contemporary
from .scenario_common import (
    actor_from_ref, assign_camps, default_zone, make_objectives, make_red_lines, relations_for, theatre_center,
)
from .seeds_historical import available_titles, match_historical

ProgressFn = Callable[[str, str, str], None]

STEPS = [
    ("interpret", "Analyse de la demande"),
    ("research", "Recherche et vérification du contexte"),
    ("actors", "Construction des acteurs"),
    ("balance", "Établissement des rapports de force"),
    ("objectives", "Génération des objectifs confidentiels"),
    ("resources", "Inventaire des ressources"),
    ("engine", "Préparation du moteur"),
]


class ScenarioError(ValueError):
    pass


def _noop(step: str, status: str, detail: str) -> None:
    return None


# =========================================================================== contemporain (règles)

GREAT_POWERS = ["USA", "CHN", "RUS"]


def _contemporary_rules(prompt: str, players: int, seed: int, progress: ProgressFn) -> Scenario:
    rng = rng_for(seed, "scenario")
    progress("interpret", "running", "Identification des États cités…")
    refs = detect_countries(prompt)
    if not refs:
        raise ScenarioError(
            "Aucun État n'a pu être identifié dans la demande. Sans fournisseur IA configuré, citez au moins un pays "
            "(ex. « Crise Chine–Taïwan »)."
        )
    progress("interpret", "done", "États identifiés : " + ", ".join(r.fr for r in refs))

    target = min(12, max(players + 3, 7))
    chosen: list[tuple[str, float]] = []
    for i, ref in enumerate(refs):
        chosen.append((ref.iso3, 1.0 if i < 2 else 0.88))
    ids = {c for c, _ in chosen}
    for gp in GREAT_POWERS:
        if gp not in ids and len(chosen) < target:
            chosen.append((gp, 0.75))
            ids.add(gp)
    proto_refs = [BY_ISO3[c] for c, rel in chosen if rel >= 0.88]
    allies = []
    for ref in proto_refs:
        for other in BY_ISO3.values():
            if other.iso3 in ids:
                continue
            shared = set(ref.alliances) & set(other.alliances) & {"OTAN", "QUAD", "AUKUS", "OTSC", "CCG"}
            if shared or (ref.iso3, other.iso3) in _bilateral() or (other.iso3, ref.iso3) in _bilateral():
                allies.append(other)
    allies.sort(key=lambda c: -c.gdp_b)
    for ref in allies[:3]:
        if len(chosen) < target and ref.iso3 not in ids:
            chosen.append((ref.iso3, 0.62))
            ids.add(ref.iso3)
    for ref in nearest_countries(proto_refs, ids, 4):
        if len(chosen) < target:
            chosen.append((ref.iso3, 0.55))
            ids.add(ref.iso3)

    progress("research", "running", "Consultation de Wikipédia et Wikidata…")
    research = research_contemporary(prompt, [c for c, _ in chosen])
    detail = f"{len(research.sources)} source(s) consultée(s)"
    if research.errors:
        detail += " — " + " ; ".join(research.errors)
    progress("research", "done", detail)

    progress("actors", "running", "Construction des acteurs étatiques…")
    actors = [actor_from_ref(BY_ISO3[c], rel, "neutral", rng) for c, rel in chosen]
    for actor in actors:
        leader = research.leaders.get(actor.iso_a3 or "")
        if leader:
            actor.leader, actor.leader_source = leader
        else:
            actor.leader = "Dirigeant à confirmer"
            actor.leader_source = SourceRef(status="hypothesis", label="Non vérifié : recherche Wikidata indisponible ou sans résultat")
        ref = BY_ISO3[actor.iso_a3 or actor.id]
        actor.description = (
            f"{ref.fr} — population ≈{ref.pop_m:g} M, PIB ≈{ref.gdp_b:g} Md$, dépenses militaires ≈{ref.defense_b:g} Md$ "
            f"(ordres de grandeur, estimation)."
        )
        actor.facts.append(Fact(text=actor.description, source=ref and actor.resources[0].source))
    # Acteurs non étatiques : organisation internationale médiatrice + entités adaptées.
    human_capable = [a for a in actors if a.relevance >= 0.6]
    actors.append(_org("ONU", "Organisation des Nations unies", "Organisation internationale ; le Conseil de sécurité peut être saisi.", rng, status="confirmed"))
    if players > len(human_capable):
        maritime = any(len(z) and z[0][3] == "maritime" for z in [KNOWN_THEATRES.get(frozenset(r.iso3 for r in proto_refs[:2]), [])])
        actors.append(_company("CME", "Consortium Meridian Énergie", "Consortium énergétique fictif exposé à la crise (acteur de simulation).", rng))
        if maritime:
            actors.append(_company("HMX", "Halvorsen Maritime", "Armateur fictif dont les navires transitent par le théâtre (acteur de simulation).", rng))
        actors.append(_armed("GAR", "Front armé régional", "Groupe armé fictif opérant dans le théâtre (acteur de simulation).", rng))
    progress("actors", "done", f"{len(actors)} acteurs construits")

    progress("balance", "running", "Calcul des relations et des camps…")
    relations = relations_for(actors)
    protagonists = [a.id for a in actors if a.relevance >= 0.88][:2]
    assign_camps(actors, relations, protagonists)
    for a in actors:
        if a.kind != "state":
            a.camp = "neutral" if a.kind in ("organization", "company") else (actors[1].camp if len(actors) > 1 else "neutral")
    pair = frozenset(protagonists)
    theatres = KNOWN_THEATRES.get(pair, [])
    zones: list[Zone] = []
    a_actor = next(a for a in actors if a.id == protagonists[0])
    b_actor = next((a for a in actors if len(protagonists) > 1 and a.id == protagonists[1]), None)
    for i, (name, lat, lon, domain) in enumerate(theatres[:2], start=1):
        control = {a_actor.id: 0.4}
        if b_actor:
            control[b_actor.id] = 0.4
        zones.append(default_zone(name, Region(name=name, lat=lat, lon=lon), domain, control, i))
    if not zones:
        target_actor = b_actor or a_actor
        r = target_actor.regions[0] if target_actor.regions else Region(name=target_actor.name)
        control = {a_actor.id: 0.45} | ({b_actor.id: 0.45} if b_actor else {})
        zones.append(default_zone(f"Zone de crise — {target_actor.name}", Region(name=r.name, lat=r.lat, lon=r.lon), "military", control, 1))
    camps = {"camp_a": f"Camp {a_actor.name}", "camp_b": f"Camp {b_actor.name}" if b_actor else "Camp adverse", "neutral": "Acteurs non alignés"}
    progress("balance", "done", f"Théâtre : {', '.join(z.name for z in zones)}")

    progress("objectives", "running", "Rédaction des objectifs et lignes rouges…")
    for actor in actors:
        make_objectives(actor, actors, zones, camps, rng)
        make_red_lines(actor, actors, zones, rng)
        actor.secrets = _secrets_for(actor, actors, rng)
    progress("objectives", "done", "Objectifs mesurables générés (règles du moteur)")
    progress("resources", "done", "Ressources issues de la table de référence (estimations) et unités de jeu")

    iso_theatre = sorted({n for a in actors if a.relevance >= 0.88 for n in a.iso_n3})
    setting = Setting(
        mode="contemporary", title=_title_from_prompt(prompt), topic=prompt,
        start_label=time.strftime("%d/%m/%Y") + " — situation initiale figée", start_date=time.strftime("%Y-%m-%d"),
        era="contemporary", tempo="mixed" if not theatres else ("military" if theatres[0][3] == "military" else "mixed"),
        theatre=Theatre(name=zones[0].name if theatres else f"Théâtre {a_actor.name}" + (f"–{b_actor.name}" if b_actor else ""),
                        iso_n3=iso_theatre, center=(zones[0].region.lon, zones[0].region.lat) if zones[0].region.lon is not None else theatre_center(actors),
                        maritime=any(z.domain == "maritime" for z in zones)),
        camps=camps, universe_notes=chr(10).join(briefs_for([z.name for z in zones])),
    )
    notes = ["Génération par règles (sans IA) : acteurs et capitaux issus de la table de référence GEONEX (estimations)."]
    notes += research.errors
    summary = research.summary[:420] + "…" if research.summary and len(research.summary) > 420 else (research.summary or f"Crise impliquant {', '.join(r.fr for r in refs)}. Contexte externe non vérifié.")
    return Scenario(
        id="", mode="contemporary", title=setting.title, prompt=prompt, summary=summary, setting=setting, actors=actors,
        relations=relations, zones=zones,
        generation=Generation(provider="rules", notes=notes, sources=research.sources),
    )


def _bilateral():
    from .reference_data import BILATERAL_ALLIANCES

    return BILATERAL_ALLIANCES


def _title_from_prompt(prompt: str) -> str:
    text = prompt.strip().rstrip(".")
    return text[:1].upper() + text[1:80]


def _np_actor(id: str, name: str, kind: str, desc: str, caps: tuple[float, float, float], res: list[Resource], rng: random.Random, status: str = "fiction") -> Actor:
    c = Capitals(political=caps[0], economic=caps[1], military=caps[2])
    return Actor(
        id=id, name=name, short=id, kind=kind, description=desc, capitals=c, initial_capitals=c.model_copy(),
        resources=res, stability=60, cohesion=60, approval=50, relevance=0.5 if kind == "organization" else 0.45,
        engagement=0.5, leader_source=SourceRef(status="hypothesis" if status != "fiction" else "fiction"),
        indicators_source=SourceRef(status="hypothesis" if status != "fiction" else "fiction", label="Paramètres de simulation"),
        personality=Personality(aggression=round(rng.uniform(0.1, 0.7), 2), caution=round(rng.uniform(0.3, 0.8), 2), cooperation=round(rng.uniform(0.3, 0.9), 2)),
    )


def _gres(key, label, qty, unit, cat, regen=0.0) -> Resource:
    return Resource(key=key, label=label, quantity=qty, unit=unit, category=cat, regen_per_round=regen, abstraction=True,
                    max_quantity=qty, source=SourceRef(status="hypothesis", label="Unité de jeu GEONEX (abstraction)"))


def _org(id, name, desc, rng, status="fiction") -> Actor:
    return _np_actor(id, name, "organization", desc, (62, 18, 5), [
        _gres("mediators", "Équipes de médiation", 4, "équipes", "political", 0.5),
        _gres("diplomatic_channels", "Canaux diplomatiques", 6, "canaux", "political", 1),
        _gres("economic_reserve", "Fonds d'urgence", 2, "Md$", "economic", 0.2),
        _gres("intel_assets", "Observateurs", 2, "équipes", "other", 0.5)], rng, status)


def _company(id, name, desc, rng) -> Actor:
    return _np_actor(id, name, "company", desc, (30, 58, 8), [
        _gres("economic_reserve", "Trésorerie mobilisable", 12, "Md$", "economic", 1),
        _gres("logistics", "Capacités logistiques", 4, "flottes", "economic", 0.2),
        _gres("diplomatic_channels", "Réseau d'influence", 3, "canaux", "political", 0.5),
        _gres("intel_assets", "Veille stratégique", 2, "équipes", "other", 0.5)], rng)


def _armed(id, name, desc, rng) -> Actor:
    return _np_actor(id, name, "armed_group", desc, (22, 12, 25), [
        _gres("strike_groups", "Cellules opérationnelles", 3, "cellules", "military", 0.2),
        _gres("economic_reserve", "Financements occultes", 1, "Md$", "economic", 0.1),
        _gres("diplomatic_channels", "Intermédiaires", 2, "canaux", "political", 0.3),
        _gres("intel_assets", "Informateurs", 2, "réseaux", "other", 0.3)], rng)


def _secrets_for(actor: Actor, actors: list[Actor], rng: random.Random) -> list[str]:
    others = [a for a in actors if a.id != actor.id]
    if not others:
        return []
    other = rng.choice(others)
    pool = [
        f"Vos services estiment que {other.name} dispose de moins de réserves qu'il ne l'affiche.",
        f"Un canal discret existe avec un conseiller de {other.name}.",
        "Une partie de votre appareil d'État doute de la ligne officielle.",
        f"Des contrats stratégiques vous lient discrètement à {other.name}.",
        "Votre opinion publique est plus divisée que ne le montrent les sondages officiels.",
    ]
    return [rng.choice(pool)]


# =========================================================================== univers personnalisé (règles)

SPACE_WORDS = ["planete", "galax", "spatial", "vaisseau", "orbit", "etoile", "stellaire", "extraterrestre", "lune", "colonie", "hyperespace", "systeme solaire"]
MEDIEVAL_WORDS = ["royaume", "chevalier", "medieval", "seigneur", "duche", "dragon", "epee", "chateau", "empire", "dynastie", "clan"]
SYLLABLES = {
    "space": ["vex", "ar", "kor", "ion", "tal", "zen", "or", "ka", "rion", "the", "lys", "dra", "nox", "vel"],
    "medieval": ["al", "dren", "mor", "gar", "val", "ric", "thal", "wen", "bor", "ast", "el", "dor", "lin", "sar"],
    "modern": ["nor", "ves", "ka", "lia", "tor", "an", "mar", "dia", "sel", "ru", "bal", "ten", "ia", "co"],
}
PREFIX = {
    "space": ["Hégémonie de", "Fédération de", "Collectif de", "Directoire de", "Ligue de"],
    "medieval": ["Royaume d'", "Duché de", "Empire de", "Principauté de", "Clans de"],
    "modern": ["République de", "Fédération de", "Union de", "État de", "Confédération de"],
}
THEMED_RES = {
    "space": [("orbital_fleets", "Flottes orbitales", 6, "flottes", "military"), ("strike_groups", "Escadrons d'assaut", 4, "escadrons", "military"),
              ("economic_reserve", "Réserves d'hélium-3", 30, "kt", "economic"), ("mining_stations", "Stations minières", 5, "stations", "economic"),
              ("diplomatic_channels", "Corps diplomatique", 4, "délégations", "political"), ("intel_assets", "Réseau d'espionnage", 2, "réseaux", "other")],
    "medieval": [("strike_groups", "Régiments", 5, "régiments", "military"), ("naval_groups", "Navires de guerre", 3, "escadres", "military"),
                 ("economic_reserve", "Trésor", 20, "milliers de pièces d'or", "economic"), ("diplomatic_channels", "Émissaires", 3, "émissaires", "political"),
                 ("intel_assets", "Espions", 2, "réseaux", "other")],
    "modern": [("strike_groups", "Brigades", 5, "brigades", "military"), ("naval_groups", "Escadres", 3, "escadres", "military"),
               ("economic_reserve", "Fonds souverain", 40, "Md", "economic"), ("diplomatic_channels", "Ambassades", 4, "canaux", "political"),
               ("intel_assets", "Agents", 2, "équipes", "other")],
}


def _setting_kind(text: str) -> str:
    norm = normalize(text)
    if any(w in norm for w in SPACE_WORDS):
        return "space"
    if any(w in norm for w in MEDIEVAL_WORDS):
        return "medieval"
    return "modern"


def _extract_names(text: str) -> list[str]:
    pattern = re.compile(
        r"\b((?:[Ll]'|[Ll]a |[Ll]e |[Ll]es )?(?:Empire|Royaume|République|Fédération|Hégémonie|Ligue|Union|Duché|Principauté|"
        r"Confédération|Alliance|Collectif|Directoire|Compagnie|Ordre|Clan|Clans|Coalition|Consortium|Front|Église|Conseil)"
        r"(?:\s+(?:de|du|des|d'|d’)\s*|\s+)[A-ZÉÈÀÂÎÔÛ][\w'’-]+(?:\s+[A-ZÉÈÀÂÎÔÛ][\w'’-]+)?)"
    )
    names = [m.group(1).strip() for m in pattern.finditer(text)]
    names = [re.sub(r"^(?:[Ll]'|[Ll]a |[Ll]e |[Ll]es )", "", n) for n in names]
    caps = re.findall(r"(?<=[a-zé,;] )([A-ZÉÈÀÂÎÔÛ][a-zéèêàâîôûç]{3,}(?:-[A-ZÉ][a-zé]+)?)\b", text)
    stop = {"Le", "La", "Les", "Une", "Dans", "Pour", "Mais", "Elle", "Ils", "Cette", "Chaque", "Leur", "Lorsque", "Alors", "Depuis"}
    result: list[str] = []
    for n in names + caps:
        if n not in stop and all(n not in r and r not in n for r in result):
            result.append(n)
    return result


def _gen_name(kind: str, rng: random.Random, used: set[str]) -> str:
    for _ in range(50):
        root = "".join(rng.choice(SYLLABLES[kind]) for _ in range(rng.choice([2, 2, 3]))).capitalize()
        pref = rng.choice(PREFIX[kind])
        name = f"{pref}{'' if pref.endswith(chr(39)) else ' '}{root}"
        if name not in used:
            used.add(name)
            return name
    return f"Puissance {len(used) + 1}"


def _short(name: str, used: set[str]) -> str:
    words = [w for w in re.split(r"[\s'’-]+", name) if w and w[0].isupper() and w.lower() not in {"de", "du", "des"}]
    base = (words[-1] if words else name)[:3].upper()
    base = normalize(base).strip().upper()[:3] or "ACT"
    short, i = base, 1
    while short in used:
        i += 1
        short = f"{base[:2]}{i}"
    used.add(short)
    return short


def _fictional_rules(name: str, description: str, answers: list[dict[str, str]], players: int, seed: int, progress: ProgressFn) -> Scenario:
    rng = rng_for(seed, "fiction")
    text = description + "\n" + "\n".join(a.get("answer", "") for a in answers)
    progress("interpret", "running", "Lecture de votre univers…")
    kind = _setting_kind(text)
    names = _extract_names(text)
    progress("interpret", "done", f"Univers détecté : {({'space': 'spatial', 'medieval': 'pré-industriel', 'modern': 'moderne'})[kind]} ; {len(names)} entité(s) nommée(s)")
    progress("research", "done", "Univers fictif : aucune recherche externe, les éléments proviennent de votre description")

    progress("actors", "running", "Construction des acteurs…")
    count = min(10, max(players + 3, 6))
    used_names: set[str] = set(names)
    while len(names) < count:
        names.append(_gen_name(kind, rng, used_names))
    names = names[:count]
    norm = normalize(text)
    used_short: set[str] = set()
    actors: list[Actor] = []
    for i, nm in enumerate(names):
        base = 78 - i * 6 + rng.uniform(-6, 6)
        window = norm[max(0, norm.find(normalize(nm).strip()) - 80): norm.find(normalize(nm).strip()) + 120] if normalize(nm).strip() in norm else ""
        mil = base + (12 if any(w in window for w in ["puissan", "domin", "armee", "flotte", "hegemon", "conquer"]) else 0) - (10 if "faibl" in window or "declin" in window else 0)
        eco = base + (12 if any(w in window for w in ["riche", "commerce", "marchand", "ressource", "minier"]) else 0) + rng.uniform(-8, 8)
        pol = 45 + rng.uniform(-10, 15) + (8 if any(w in window for w in ["legitim", "prestige", "influence"]) else 0)
        caps = Capitals(political=round(min(92, max(15, pol)), 1), economic=round(min(92, max(12, eco)), 1), military=round(min(95, max(10, mil)), 1))
        res = []
        for key, label, qty, unit, cat in THEMED_RES[kind]:
            scale = (caps.military if cat == "military" else caps.economic if cat == "economic" else caps.political) / 60
            q = max(1, round(qty * scale))
            res.append(_gres(key, label, q, unit, cat, regen=round(q * 0.08, 1) if cat != "military" else 0.0))
        lowered = normalize(nm)
        akind = "company" if any(w in lowered for w in ["compagnie", "consortium"]) else ("organization" if any(w in lowered for w in ["conseil", "ordre", "eglise", "ligue"]) else ("armed_group" if " front " in lowered else ("polity" if kind != "modern" else "state")))
        angle = 2 * math.pi * i / count
        actors.append(Actor(
            id=_short(nm, used_short), name=nm, short="", kind=akind, description="Acteur de l'univers décrit par l'organisateur.",
            capitals=caps, initial_capitals=caps.model_copy(), resources=res,
            stability=round(rng.uniform(40, 80), 1), cohesion=round(rng.uniform(45, 80), 1), approval=round(rng.uniform(35, 65), 1),
            indicators_source=SourceRef(status="fiction", label="Génération procédurale GEONEX"),
            leader=None, leader_source=SourceRef(status="fiction", label="À définir par les joueurs"),
            relevance=round(1.0 if i < 2 else max(0.4, 0.85 - 0.06 * i), 2), engagement=1.0 if i < 2 else 0.6,
            personality=Personality(aggression=round(rng.uniform(0.2, 0.8), 2), caution=round(rng.uniform(0.2, 0.8), 2), cooperation=round(rng.uniform(0.2, 0.8), 2)),
            regions=[Region(name=f"Cœur de {nm}", x=round(50 + 38 * math.cos(angle), 1), y=round(50 + 38 * math.sin(angle), 1))],
        ))
        actors[-1].short = actors[-1].id
    progress("actors", "done", f"{len(actors)} acteurs construits")

    progress("balance", "running", "Rapports de force et camps…")
    a, b = actors[0], actors[1]
    a.camp, b.camp = "camp_a", "camp_b"
    for i, actor in enumerate(actors[2:], start=2):
        actor.camp = ["camp_a", "camp_b", "neutral"][i % 3]
    relations: list[Relation] = []
    for i, x in enumerate(actors):
        for y in actors[i + 1:]:
            same = x.camp == y.camp and x.camp != "neutral"
            hostile = {x.camp, y.camp} == {"camp_a", "camp_b"}
            p, q = sorted((x.id, y.id))
            relations.append(Relation(a=p, b=q, trust=round((30 if same else -35 if hostile else 0) + rng.uniform(-10, 10), 1),
                                      tension=round((15 if same else 65 if hostile else 30) + rng.uniform(-8, 8), 1), alliance=same and rng.random() < 0.5))
    mid = Region(name="Zone contestée", x=round((a.regions[0].x + b.regions[0].x) / 2, 1), y=round((a.regions[0].y + b.regions[0].y) / 2, 1))
    zone_word = "Couloir orbital" if kind == "space" else ("Marches frontalières" if kind == "medieval" else "Zone frontalière")
    zones = [Zone(id="Z1", name=f"{zone_word} {a.id}–{b.id}", domain="military", region=mid, control={a.id: 0.4, b.id: 0.4}, tension=60)]
    camps = {"camp_a": f"Camp {a.name}", "camp_b": f"Camp {b.name}", "neutral": "Non-alignés"}
    progress("balance", "done", "Camps établis")

    progress("objectives", "running", "Objectifs confidentiels…")
    for actor in actors:
        make_objectives(actor, actors, zones, camps, rng)
        make_red_lines(actor, actors, zones, rng)
        actor.secrets = _secrets_for(actor, actors, rng)
    progress("objectives", "done", "Objectifs mesurables générés (règles du moteur)")
    progress("resources", "done", "Ressources adaptées à l'univers")

    era = {"space": "space", "medieval": "medieval", "modern": "contemporary"}[kind]
    setting = Setting(
        mode="fictional", title=name or "Simulation personnalisée", topic=description[:200], start_label="Jour 1, 08 h 00", era=era, tempo="mixed",
        theatre=Theatre(name="Carte schématique de l'univers", map_kind="fictional",
                        fictional_regions=[{"id": x.id, "name": x.name, "x": x.regions[0].x, "y": x.regions[0].y, "owner": x.id} for x in actors]),
        universe_notes=description[:1200], camps=camps,
    )
    return Scenario(
        id="", mode="fictional", title=setting.title, prompt=description, summary=description[:400], setting=setting, actors=actors,
        relations=relations, zones=zones, answers=answers,
        generation=Generation(provider="rules", notes=[
            "Génération procédurale sans IA : noms tirés de votre description (ou générés), rapports de force déduits des indices du texte.",
            "Carte schématique générée : ce ne sont pas des données géographiques réelles.",
        ]),
    )


# =========================================================================== IA


def _clamp(v: float, lo: float = 0, hi: float = 100) -> float:
    return round(max(lo, min(hi, float(v))), 2)


def _from_ai(out: ScenarioOut, mode: str, prompt: str, players: int, model: str, seed: int, sources: list[SourceRef], leaders: dict) -> Scenario:
    rng = rng_for(seed, "ai-fix")
    used: set[str] = set()
    actors: list[Actor] = []
    for a in out.actors:
        aid = re.sub(r"[^A-Z0-9]", "", a.id.upper())[:6] or _short(a.name, used)
        if aid in used:
            continue
        used.add(aid)
        caps = Capitals(political=_clamp(a.political), economic=_clamp(a.economic), military=_clamp(a.military))
        ref = BY_ISO3.get(a.iso3.upper()) if a.iso3 else None
        resources = [Resource(key=re.sub(r"[^a-z0-9_]", "_", r.key.lower())[:32] or f"res{i}", label=r.label, quantity=max(0.0, r.quantity), unit=r.unit,
                              category=r.category, abstraction=r.abstraction, max_quantity=max(0.0, r.quantity),
                              regen_per_round=0.0 if r.category == "military" else round(max(0.0, r.quantity) * 0.06, 2),
                              source=SourceRef(status="hypothesis" if r.abstraction else ("fiction" if mode == "fictional" else "estimate"), label=f"Préparation IA ({model})"))
                     for i, r in enumerate(a.resources)]
        if not any(r.category == "other" for r in resources):
            resources.append(_gres("intel_assets", "Moyens de renseignement", 2, "équipes", "other", 0.5))
        actor = Actor(
            id=aid, name=a.name, short=a.short[:6] or aid, kind=a.kind, iso_a3=ref.iso3 if ref else None, iso_n3=[ref.n3] if ref else [],
            leader=a.leader or None, leader_source=SourceRef(status=a.leader_status, label=f"Préparation IA ({model})"),
            description=a.description, camp=a.camp if a.camp in {c.id for c in out.camps} | {"neutral"} else "neutral",
            capitals=caps, initial_capitals=caps.model_copy(), resources=resources,
            stability=_clamp(a.stability), cohesion=_clamp(a.cohesion), approval=_clamp(a.approval),
            indicators_source=SourceRef(status="estimate" if mode != "fictional" else "fiction", label=f"Préparation IA ({model})"),
            relevance=_clamp(a.relevance, 0, 1), engagement=min(1.0, 0.35 + _clamp(a.relevance, 0, 1) * 0.65),
            personality=Personality(aggression=_clamp(a.aggression, 0, 1), caution=_clamp(a.caution, 0, 1), cooperation=_clamp(a.cooperation, 0, 1)),
            red_lines=a.red_lines[:3], secrets=a.secrets[:2],
            facts=[Fact(text=f.text, source=SourceRef(status=f.status, label=f.source_label or None, url=f.url or None)) for f in a.facts[:6]],
            regions=[Region(name=r.name, lat=r.lat, lon=r.lon, x=r.x, y=r.y) for r in a.regions[:5]],
        )
        if ref and ref.iso3 in leaders:
            actor.leader, actor.leader_source = leaders[ref.iso3]
        if ref and not actor.regions:
            actor.regions = [Region(name=n, lat=la, lon=lo) for n, la, lo in ref.cities]
        actor.objectives = []
        for i, o in enumerate(a.objectives, start=1):
            metric = {"type": o.metric_type}
            if o.target:
                metric["target" if o.metric_type not in ("zone_control",) else "zone"] = o.target.upper() if o.metric_type != "zone_control" else o.target
            if o.second_target:
                metric["a"], metric["b"] = (o.target.upper(), o.second_target.upper())
            if o.capital:
                metric["capital"] = o.capital
            if o.metric_type in ("capital_gain", "actor_weakened"):
                metric["delta"] = o.value or 8
            elif o.metric_type in ("camp_share_min", "zone_control", "honor_commitments"):
                metric["value" if o.metric_type != "honor_commitments" else "ratio"] = o.value if o.value <= 1 else o.value / 100
            elif o.value:
                metric["value"] = o.value
            actor.objectives.append(Objective(id=f"{aid}-{o.kind[:3]}-{i}", kind=o.kind, text=o.text, metric=metric))
        actors.append(actor)
    if len(actors) < 2:
        raise ScenarioError("La préparation IA n'a pas produit assez d'acteurs.")
    ids = {a.id for a in actors}
    zones = []
    for i, z in enumerate(out.zones[:3], start=1):
        control = {k.upper(): _clamp(v, 0, 1) for k, v in z.control.items() if k.upper() in ids}
        total = sum(control.values())
        if total > 1:
            control = {k: round(v / total, 3) for k, v in control.items()}
        zones.append(Zone(id=f"Z{i}", name=z.name, domain=z.domain, region=Region(name=z.region.name, lat=z.region.lat, lon=z.region.lon, x=z.region.x, y=z.region.y), control=control, tension=55))
    zone_by_name = {z.name: z.id for z in zones}
    camps = {c.id: c.label for c in out.camps}
    camps.setdefault("neutral", "Non-alignés")
    # Validation des objectifs : cibles inconnues → objectifs régénérés par règles.
    for actor in actors:
        bad = False
        for obj in actor.objectives:
            m = obj.metric
            if m["type"] == "zone_control":
                m["zone"] = zone_by_name.get(m.get("zone", ""), m.get("zone", ""))
                bad |= m["zone"] not in {z.id for z in zones}
            for key in ("target", "a", "b"):
                if key in m and m[key] not in ids:
                    bad = True
        kinds = {o.kind for o in actor.objectives}
        if bad or "primary" not in kinds:
            make_objectives(actor, actors, zones, camps, rng)
        if not actor.red_lines:
            make_red_lines(actor, actors, zones, rng)
    relations: dict[str, Relation] = {}
    for r in out.relations:
        a, b = r.a.upper(), r.b.upper()
        if a in ids and b in ids and a != b:
            x, y = sorted((a, b))
            relations[relation_key(x, y)] = Relation(a=x, b=y, trust=_clamp(r.trust, -100, 100), tension=_clamp(r.tension), alliance=r.alliance, at_war=r.at_war)
    for rel in relations_for(actors):
        relations.setdefault(relation_key(rel.a, rel.b), rel)
    iso = [BY_ISO3[c.upper()].n3 for c in out.theatre_iso3 if c.upper() in BY_ISO3]
    fictional = mode == "fictional" and not iso
    if fictional:
        for i, actor in enumerate(actors):
            if not actor.regions or actor.regions[0].x is None:
                angle = 2 * math.pi * i / len(actors)
                actor.regions = [Region(name=f"Cœur de {actor.name}", x=round(50 + 38 * math.cos(angle), 1), y=round(50 + 38 * math.sin(angle), 1))]
    theatre = Theatre(
        name=out.theatre_name, map_kind="fictional" if fictional else "natural_earth", iso_n3=iso, maritime=out.maritime,
        center=(zones[0].region.lon, zones[0].region.lat) if zones and zones[0].region.lon is not None else theatre_center(actors),
        border_warning=("Frontières contemporaines affichées à titre indicatif : elles diffèrent de celles de la période simulée." if mode == "historical" else None),
        fictional_regions=[{"id": a.id, "name": a.name, "x": a.regions[0].x, "y": a.regions[0].y, "owner": a.id} for a in actors if a.regions and a.regions[0].x is not None] if fictional else [],
    )
    setting = Setting(
        mode=mode, title=out.title, topic=prompt, start_label=out.start_label, start_date=out.start_date or None,
        knowledge_cutoff=(out.knowledge_cutoff or out.start_date or None) if mode == "historical" else None,
        era=out.era, theatre=theatre, tempo=out.tempo, camps=camps, special_rules=out.special_rules[:6],
        universe_notes=prompt[:1200] if mode == "fictional" else "",
    )
    return Scenario(id="", mode=mode, title=out.title, prompt=prompt, summary=out.summary, setting=setting, actors=actors,
                    relations=list(relations.values()), zones=zones,
                    generation=Generation(provider=model, notes=list(out.notes[:5]), sources=sources))


# =========================================================================== point d'entrée


def build(mode: str, prompt: str, players: int, seed: int, name: str = "", answers: Optional[list[dict[str, str]]] = None,
          progress: ProgressFn = _noop, use_ai: Optional[bool] = None) -> Scenario:
    answers = answers or []
    started = time.monotonic()
    if not prompt or len(prompt.strip()) < 3:
        raise ScenarioError("Décrivez la situation à simuler.")
    use_ai = ai.available() if use_ai is None else use_ai
    scenario: Optional[Scenario] = None
    ai_note: Optional[str] = None

    if mode == "historical" and not use_ai:
        progress("interpret", "running", "Recherche d'une base historique…")
        scenario = match_historical(prompt)
        if scenario is None:
            raise ScenarioError(
                "La reconstitution historique libre nécessite le fournisseur IA (clé ANTHROPIC_API_KEY non configurée). "
                "Bases historiques disponibles hors IA : " + " ; ".join(available_titles()) + "."
            )
        for key, label in STEPS:
            progress(key, "done", {"interpret": f"Base historique : {scenario.title}", "research": "Reconstitution GEONEX (sources Wikipédia citées)",
                                   "actors": f"{len(scenario.actors)} acteurs d'époque", "balance": "Rapports de force de la période",
                                   "objectives": "Objectifs sans connaissance du dénouement", "resources": "Ressources d'époque",
                                   "engine": "Validation"}.get(key, label))
        scenario.generation = Generation(provider="rules", notes=["Base historique intégrée (reconstitution GEONEX, sans IA)."],
                                         sources=[f.source for a in scenario.actors for f in a.facts])
    elif use_ai:
        sources: list[SourceRef] = []
        leaders: dict = {}
        digest = ""
        progress("interpret", "running", "Analyse de la demande…")
        refs = detect_countries(prompt) if mode != "fictional" else []
        progress("interpret", "done", "Demande analysée" + (f" — États cités : {', '.join(r.fr for r in refs)}" if refs else ""))
        if mode == "contemporary":
            progress("research", "running", "Consultation de Wikipédia et Wikidata…")
            research = research_contemporary(prompt, [r.iso3 for r in refs])
            sources, leaders = research.sources, research.leaders
            digest = "\n".join(f"- {f.text} [{f.source.label}, consulté le {f.source.retrieved_at}, {f.source.url}]" for f in research.facts)
            digest += "\n" + "\n".join(f"- Dirigeant(s) {iso}: {name} [{src.label}, {src.retrieved_at}]" for iso, (name, src) in leaders.items())
            progress("research", "done", f"{len(sources)} source(s)" + (" — " + " ; ".join(research.errors) if research.errors else ""))
        elif mode == "historical":
            progress("research", "done", "Reconstitution historique : connaissances arrêtées à la date de départ")
        else:
            progress("research", "done", "Univers fictif : aucune recherche externe")
        progress("actors", "running", "Préparation IA : acteurs, relations, objectifs, ressources…")
        try:
            out, model = ai_build_scenario(mode, prompt if mode != "fictional" else f"{name}\n{prompt}", players, digest, answers)
            progress("actors", "done", f"{len(out.actors)} acteurs proposés ({model})")
            progress("balance", "running", "Contrôle des rapports de force…")
            scenario = _from_ai(out, mode, prompt, players, model, seed, sources, leaders)
            progress("balance", "done", "Relations et camps validés")
            progress("objectives", "done", "Objectifs validés par le moteur (cibles vérifiées)")
            progress("resources", "done", "Ressources bornées et typées")
        except (ai.AIUnavailable, ScenarioError) as exc:
            ai_note = f"Préparation IA indisponible ({exc}) : bascule sur les règles du moteur."
            progress("actors", "running", ai_note)
            scenario = None
    if scenario is None:
        if mode == "contemporary":
            scenario = _contemporary_rules(prompt, players, seed, progress)
        elif mode == "historical":
            scenario = match_historical(prompt)
            if scenario is None:
                raise ScenarioError(((ai_note + " ") if ai_note else "") + "Aucune base historique intégrée ne correspond. Disponibles : " + " ; ".join(available_titles()))
            for key, _ in STEPS[2:6]:
                progress(key, "done", "Base historique intégrée")
        else:
            scenario = _fictional_rules(name, prompt, answers, players, seed, progress)
        if ai_note:
            scenario.generation.notes.insert(0, ai_note)

    progress("engine", "running", "Validation de l'état initial…")
    if mode == "fictional" and name:
        scenario.title = name
        scenario.setting.title = name
    scenario.answers = answers
    scenario.generation.duration_seconds = round(time.monotonic() - started, 2)
    _validate(scenario)
    progress("engine", "done", f"Scénario prêt : {len(scenario.actors)} acteurs, {len(scenario.zones)} zone(s)")
    return scenario


def _validate(s: Scenario) -> None:
    ids = [a.id for a in s.actors]
    if len(set(ids)) != len(ids):
        raise ScenarioError("Identifiants d'acteurs dupliqués.")
    for a in s.actors:
        for k in ("political", "economic", "military"):
            a.capitals.set(k, a.capitals.get(k))
        a.initial_capitals = a.capitals.model_copy()
        for r in a.resources:
            r.quantity = max(0.0, r.quantity)
        if not a.objectives:
            raise ScenarioError(f"Acteur sans objectif : {a.name}")
