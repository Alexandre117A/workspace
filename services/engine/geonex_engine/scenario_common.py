"""Briques communes à la construction des scénarios : capitaux, ressources,
objectifs mesurables, relations initiales, camps."""
from __future__ import annotations

import math
import random
from typing import Optional

from .models import (
    Actor, Capitals, Objective, Personality, Region, Relation, Resource, SourceRef, Zone, relation_key,
)
from .reference_data import BILATERAL_ALLIANCES, BY_ISO3, COUNTRIES, KNOWN_TENSIONS, REFERENCE_SOURCE, CountryRef

P5 = {"USA", "CHN", "RUS", "FRA", "GBR"}
ABSTRACTION = SourceRef(status="hypothesis", label="Unité de jeu GEONEX (abstraction, pas une donnée réelle)")


def _raw_mil(c: CountryRef) -> float:
    return 0.55 * math.log10(1 + c.defense_b) + 0.30 * math.log10(1 + c.active_k) + (0.35 if c.nuclear else 0) + 0.08 * c.navy


def _raw_eco(c: CountryRef) -> float:
    return math.log10(1 + c.gdp_b) + 0.15 * math.log10(1 + c.pop_m)


_MIL = [_raw_mil(c) for c in COUNTRIES]
_ECO = [_raw_eco(c) for c in COUNTRIES]


def _scale(value: float, values: list[float], lo: float = 12, hi: float = 95) -> float:
    vmin, vmax = min(values), max(values)
    return round(lo + (hi - lo) * (value - vmin) / (vmax - vmin), 1)


def capitals_from_ref(c: CountryRef) -> Capitals:
    military = _scale(_raw_mil(c), _MIL)
    economic = _scale(_raw_eco(c), _ECO)
    political = 30 + 0.3 * c.stability + 3.5 * min(len(c.alliances), 3) + (8 if c.iso3 in P5 else 0) + 6 * (economic / 100)
    return Capitals(political=round(min(90, political), 1), economic=economic, military=military)


def resources_from_ref(c: CountryRef, capitals: Capitals) -> list[Resource]:
    res = [
        Resource(key="defense_budget", label="Budget de défense annuel", quantity=c.defense_b, unit="Md$", category="economic", usable=False, source=REFERENCE_SOURCE),
        Resource(key="active_personnel", label="Militaires d'active", quantity=c.active_k, unit="milliers", category="military", usable=False, source=REFERENCE_SOURCE),
        Resource(key="strike_groups", label="Groupements d'intervention", quantity=max(1, round(capitals.military / 12)), unit="unités", category="military", regen_per_round=0.25 if capitals.economic > 55 else 0.0, abstraction=True, source=ABSTRACTION),
        Resource(key="economic_reserve", label="Fonds d'action économique", quantity=max(1, round(c.gdp_b * 0.01)), unit="Md$", category="economic", regen_per_round=max(0.5, round(c.gdp_b * 0.0006, 1)), abstraction=True, source=ABSTRACTION),
        Resource(key="diplomatic_channels", label="Canaux diplomatiques actifs", quantity=3 + len(c.alliances), unit="canaux", category="political", regen_per_round=1, abstraction=True, source=ABSTRACTION),
        Resource(key="intel_assets", label="Moyens de renseignement", quantity=1 + round(capitals.military / 25), unit="équipes", category="other", regen_per_round=0.5, abstraction=True, source=ABSTRACTION),
    ]
    if c.navy >= 1:
        res.insert(3, Resource(key="naval_groups", label="Groupes navals projetables", quantity=c.navy * 2, unit="groupes", category="military", abstraction=True, source=ABSTRACTION))
    if c.nuclear:
        label = "Dissuasion nucléaire" if c.nuclear == 1 else "Capacité nucléaire non déclarée (estimation)"
        res.append(Resource(key="nuclear_deterrent", label=label, quantity=1, unit="", category="military", usable=False, source=REFERENCE_SOURCE))
    for r in res:
        r.max_quantity = r.quantity
    return res


def actor_from_ref(c: CountryRef, relevance: float, camp: str, rng: random.Random) -> Actor:
    caps = capitals_from_ref(c)
    jitter = lambda: rng.uniform(-0.12, 0.12)
    return Actor(
        id=c.iso3,
        name=c.fr,
        short=c.iso3,
        kind="state",
        iso_a3=c.iso3,
        iso_n3=[c.n3],
        description="",
        camp=camp,
        capitals=caps,
        initial_capitals=caps.model_copy(),
        resources=resources_from_ref(c, caps),
        stability=c.stability,
        cohesion=round(min(90, c.stability + 5), 1),
        approval=45.0,
        indicators_source=SourceRef(status="estimate", label="Stabilité : estimation GEONEX ; approbation : hypothèse moteur (45) faute de donnée vérifiée"),
        relevance=relevance,
        engagement=min(1.0, 0.35 + relevance * 0.65),
        personality=Personality(
            aggression=round(min(0.9, max(0.1, (0.55 if c.bloc == "east" else 0.4) + jitter())), 2),
            caution=round(min(0.9, max(0.1, 0.5 + (0.1 if c.nuclear else 0) + jitter())), 2),
            cooperation=round(min(0.9, max(0.1, (0.55 if c.bloc != "east" else 0.4) + jitter())), 2),
        ),
        regions=[Region(name=n, lat=lat, lon=lon) for n, lat, lon in c.cities],
    )


def initial_relation(a: CountryRef, b: CountryRef) -> Relation:
    x, y = sorted((a.iso3, b.iso3))
    shared = set(a.alliances) & set(b.alliances)
    if a.bloc == b.bloc and a.bloc != "swing":
        trust = 32 if a.bloc == "west" else 24
    elif "swing" in (a.bloc, b.bloc):
        trust = 6
    else:
        trust = -28
    trust += 8 * len(shared)
    tension = 22.0
    at_war = False
    known = KNOWN_TENSIONS.get((x, y))
    if known:
        tension, at_war = known
        trust = min(trust, -(tension - 25))
    alliance = (x, y) in BILATERAL_ALLIANCES or bool(shared & {"OTAN", "OTSC", "CCG", "AUKUS"})
    return Relation(a=x, b=y, trust=round(max(-100, min(100, trust)), 1), tension=round(tension, 1), alliance=alliance, at_war=at_war)


def relations_for(actors: list[Actor]) -> list[Relation]:
    rels = []
    for i, a in enumerate(actors):
        for b in actors[i + 1:]:
            ra, rb = BY_ISO3.get(a.iso_a3 or ""), BY_ISO3.get(b.iso_a3 or "")
            if ra and rb:
                rels.append(initial_relation(ra, rb))
            else:
                x, y = sorted((a.id, b.id))
                same = a.camp == b.camp and a.camp != "neutral"
                rels.append(Relation(a=x, b=y, trust=25.0 if same else 0.0, tension=25.0 if same else 35.0))
    return rels


def assign_camps(actors: list[Actor], relations: list[Relation], protagonists: list[str]) -> None:
    rel = {relation_key(r.a, r.b): r for r in relations}

    def trust(a: str, b: str) -> float:
        r = rel.get(relation_key(a, b))
        return r.trust if r else 0.0

    if not protagonists:
        return
    a_id = protagonists[0]
    b_id = protagonists[1] if len(protagonists) > 1 else None
    if b_id is None:
        others = [x for x in actors if x.id != a_id]
        if others:
            b_id = min(others, key=lambda x: trust(a_id, x.id)).id
    for actor in actors:
        if actor.id == a_id:
            actor.camp = "camp_a"
        elif actor.id == b_id:
            actor.camp = "camp_b"
        elif b_id is not None:
            diff = trust(actor.id, a_id) - trust(actor.id, b_id)
            actor.camp = "camp_a" if diff > 15 else ("camp_b" if diff < -15 else "neutral")


# --------------------------------------------------------------------------- objectifs


def _obj(actor: Actor, kind: str, text: str, metric: dict, idx: int) -> Objective:
    return Objective(id=f"{actor.id}-{kind[:3]}-{idx}", kind=kind, text=text, metric=metric)


def make_objectives(actor: Actor, actors: list[Actor], zones: list[Zone], camp_labels: dict[str, str], rng: random.Random) -> None:
    """Objectifs mesurables générés par règles (variantes tirées par graine)."""
    others = [a for a in actors if a.id != actor.id]
    opponents = [a for a in others if a.camp not in ("neutral", actor.camp) and actor.camp != "neutral"]
    allies = [a for a in others if a.camp == actor.camp and actor.camp != "neutral"]
    protagonists = [a for a in actors if a.relevance >= 0.9]
    main_zone = zones[0] if zones else None
    opp = max(opponents, key=lambda a: a.relevance) if opponents else (max(others, key=lambda a: a.relevance) if others else None)
    ally = max(allies, key=lambda a: a.relevance) if allies else None
    externals = [a for a in others if a.camp == "neutral"]
    objs: list[Objective] = []
    camp_label = camp_labels.get(actor.camp, "votre camp")

    if actor.kind == "organization":
        if len(protagonists) >= 2:
            p1, p2 = protagonists[0], protagonists[1]
            objs.append(_obj(actor, "primary", f"Empêcher toute guerre ouverte entre {p1.name} et {p2.name}.", {"type": "no_war_between", "a": p1.id, "b": p2.id}, 1))
            objs.append(_obj(actor, "secondary", f"Ramener la tension entre {p1.name} et {p2.name} sous 60/100.", {"type": "tension_max_between", "a": p1.id, "b": p2.id, "value": 60}, 1))
        objs.append(_obj(actor, "secondary", "Renforcer votre légitimité : capital politique ≥ 60.", {"type": "capital_min", "capital": "political", "value": 60}, 2))
        objs.append(_obj(actor, "coalition", "Maintenir des relations de confiance (≥ 10) avec les principaux protagonistes.", {"type": "relation_min", "target": protagonists[0].id if protagonists else (opp.id if opp else actor.id), "value": 10}, 1))
        objs.append(_obj(actor, "secret", "Obtenir un rôle central : gagner 8 points de capital politique.", {"type": "capital_gain", "capital": "political", "delta": 8}, 1))
    elif actor.kind == "company":
        objs.append(_obj(actor, "primary", "Accroître vos capacités économiques de 8 points.", {"type": "capital_gain", "capital": "economic", "delta": 8}, 1))
        if len(protagonists) >= 2:
            objs.append(_obj(actor, "secondary", f"Préserver les flux : tension {protagonists[0].name}–{protagonists[1].name} ≤ 65.", {"type": "tension_max_between", "a": protagonists[0].id, "b": protagonists[1].id, "value": 65}, 1))
        objs.append(_obj(actor, "coalition", "Obtenir un accord avec un acteur étatique majeur.", {"type": "agreement_with", "target": protagonists[0].id if protagonists else ""}, 1))
        objs.append(_obj(actor, "secret", "Conserver un capital politique ≥ 40 malgré la crise.", {"type": "capital_min", "capital": "political", "value": 40}, 1))
    elif actor.kind == "armed_group":
        objs.append(_obj(actor, "primary", "Survivre à la crise en tant que force organisée.", {"type": "survive"}, 1))
        if opp:
            objs.append(_obj(actor, "secondary", f"Affaiblir militairement {opp.name} (−8 points).", {"type": "actor_weakened", "target": opp.id, "capital": "military", "delta": 8}, 1))
        if ally:
            objs.append(_obj(actor, "coalition", f"Obtenir une alliance avec {ally.name}.", {"type": "alliance_with", "target": ally.id}, 1))
        objs.append(_obj(actor, "secret", "Accroître votre influence politique de 6 points.", {"type": "capital_gain", "capital": "political", "delta": 6}, 1))
    else:
        if actor.relevance >= 0.9 and main_zone is not None and actor.capitals.military >= 40:
            objs.append(_obj(actor, "primary", f"Obtenir un contrôle majoritaire de la zone « {main_zone.name} ».", {"type": "zone_control", "zone": main_zone.id, "value": 0.5}, 1))
        elif actor.camp != "neutral":
            objs.append(_obj(actor, "primary", f"Faire prévaloir {camp_label} : au moins 55 % du rapport de force final.", {"type": "camp_share_min", "value": 0.55}, 1))
        else:
            objs.append(_obj(actor, "primary", "Préserver vos intérêts sans être entraîné dans un conflit : stabilité ≥ 55.", {"type": "stability_min", "value": 55}, 1))
        econ_floor = round(max(20, actor.initial_capitals.economic - 10))
        objs.append(_obj(actor, "secondary", f"Préserver votre économie : capital économique ≥ {econ_floor}.", {"type": "capital_min", "capital": "economic", "value": econ_floor}, 1))
        if rng.random() < 0.6:
            objs.append(_obj(actor, "secondary", "Maintenir la stabilité intérieure au-dessus de 50.", {"type": "stability_min", "value": 50}, 2))
        if ally:
            objs.append(_obj(actor, "coalition", f"Consolider votre lien avec {ally.name} (confiance ≥ 40).", {"type": "relation_min", "target": ally.id, "value": 40}, 1))
        else:
            objs.append(_obj(actor, "coalition", "Tenir vos engagements : au moins 70 % d'engagements honorés.", {"type": "honor_commitments", "ratio": 0.7}, 1))
        pool = []
        if opp:
            pool.append(("Affaiblir le capital militaire de {n} d'au moins 10 points.".format(n=opp.name), {"type": "actor_weakened", "target": opp.id, "capital": "military", "delta": 10}))
            pool.append(("Éviter tout état de guerre ouverte avec {n}.".format(n=opp.name), {"type": "no_war_with", "target": opp.id}))
        if externals:
            ext = rng.choice(externals)
            pool.append((f"Conclure un accord avec {ext.name}.", {"type": "agreement_with", "target": ext.id}))
        pool.append(("Accroître votre capital politique de 8 points.", {"type": "capital_gain", "capital": "political", "delta": 8}))
        if opp and opp.relevance < 0.9:
            pool.append((f"Rapprochement discret : confiance ≥ 15 avec {opp.name}.", {"type": "relation_min", "target": opp.id, "value": 15}))
        text, metric = rng.choice(pool)
        objs.append(_obj(actor, "secret", text, metric, 1))
    actor.objectives = objs


def make_red_lines(actor: Actor, actors: list[Actor], zones: list[Zone], rng: random.Random) -> None:
    lines = []
    if actor.kind == "state" or actor.kind == "polity":
        lines.append("Aucune frappe directe sur votre territoire ne restera sans réponse.")
    allies = [a for a in actors if a.camp == actor.camp and a.id != actor.id and actor.camp != "neutral"]
    if allies:
        lines.append(f"Ne jamais abandonner publiquement {rng.choice(allies).name}.")
    if zones and actor.relevance >= 0.9:
        lines.append(f"Ne pas perdre le contrôle de « {zones[0].name} ».")
    if actor.kind == "organization":
        lines.append("Ne jamais cautionner une agression armée.")
    if actor.kind == "company":
        lines.append("Pas d'interruption durable des flux commerciaux essentiels.")
    actor.red_lines = lines[:2] or ["Préserver l'intégrité de vos moyens essentiels."]


def default_zone(name: str, region: Region, domain: str, control: dict[str, float], idx: int = 1) -> Zone:
    return Zone(id=f"Z{idx}", name=name, domain=domain, region=region, control=control, tension=55.0)


def theatre_center(actors: list[Actor]) -> Optional[tuple[float, float]]:
    pts = [(r.lon, r.lat) for a in actors[:2] for r in a.regions[:1] if r.lat is not None and r.lon is not None]
    if not pts:
        return None
    return (round(sum(p[0] for p in pts) / len(pts), 2), round(sum(p[1] for p in pts) / len(pts), 2))
