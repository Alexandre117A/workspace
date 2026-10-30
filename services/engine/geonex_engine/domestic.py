"""Situation intérieure : événements localisés, chiffrés, qui modifient réellement
les variables du moteur."""
from __future__ import annotations

from .models import Effect, Event, WorldState
from .probability import rng_for
from .reference_data import BY_ISO3
from .text import vocab


def generate(world: WorldState) -> list[Effect]:
    effects: list[Effect] = []
    v = vocab(world)
    for actor in sorted(world.actors.values(), key=lambda a: a.id):
        rng = rng_for(world.seed, world.round, "domestic", actor.id)
        at_war = any(r.at_war for r in world.relations.values() if actor.id in (r.a, r.b))
        p = 0.16 + max(0.0, 60 - actor.stability) / 140 + (0.14 if at_war else 0) + (0.08 if actor.approval < 35 else 0)
        if actor.controlled_by == "human":
            p += 0.1
        if rng.random() > min(0.75, p):
            continue
        weights = [
            ("protest", 1.0 + max(0, 50 - actor.approval) / 20),
            ("strike", 0.6 + max(0, 50 - actor.capitals.economic) / 25),
            ("scandal", 0.6),
            ("sabotage", 0.3 + (0.8 if at_war else 0)),
            ("rally", 0.4 + (0.6 if actor.approval > 55 else 0)),
            ("economic_shock", 0.5),
        ]
        total = sum(w for _, w in weights)
        pick, acc, kind = rng.uniform(0, total), 0.0, "protest"
        for k, w in weights:
            acc += w
            if pick <= acc:
                kind = k
                break
        city = rng.choice(actor.regions) if actor.regions else None
        place = city.name if city else actor.name
        ref = BY_ISO3.get(actor.iso_a3 or "")
        pop_scale = (ref.pop_m if ref else 10) ** 0.5
        E: list[Effect] = []
        figures: dict = {}
        if kind == "protest":
            people = int(rng.uniform(0.4, 2.2) * pop_scale * 2500)
            figures = {"participants": people, "lieu": place}
            title = f"{v['unrest'].capitalize()} à {place}"
            text = f"Environ {people:,} personnes protestent à {place} contre la conduite de la crise.".replace(",", " ")
            E += [Effect(actor=actor.id, field="stability", delta=-round(rng.uniform(2.5, 5.5), 1), reason=title),
                  Effect(actor=actor.id, field="approval", delta=-round(rng.uniform(2, 4.5), 1), reason=title)]
        elif kind == "strike":
            share = rng.randint(8, 35)
            figures = {"secteurs_touchés_pct": share, "lieu": place}
            title = f"{v['strike'].capitalize()} : {place}"
            text = f"Un mouvement social paralyse environ {share} % de l'activité de la région de {place}."
            E.append(Effect(actor=actor.id, field="economic", delta=-round(rng.uniform(1.5, 4), 1), reason=title))
        elif kind == "scandal":
            pts = rng.randint(4, 11)
            figures = {"recul_sondage_pts": pts}
            title = "Scandale au sommet de l'État" if actor.kind in ("state", "polity") else f"Scandale interne : {actor.name}"
            text = f"Des révélations sur la gestion de crise provoquent un recul d'environ {pts} points dans l'opinion."
            E += [Effect(actor=actor.id, field="political", delta=-round(rng.uniform(2.5, 5.5), 1), reason=title),
                  Effect(actor=actor.id, field="approval", delta=-float(pts) / 2, reason=title)]
        elif kind == "sabotage":
            hours = rng.randint(6, 48)
            figures = {"durée_interruption_h": hours, "lieu": place}
            title = f"{v['attack'].capitalize()} près de {place}"
            text = f"Une infrastructure stratégique près de {place} est mise hors service pendant environ {hours} heures."
            E += [Effect(actor=actor.id, field="military", delta=-round(rng.uniform(1, 3), 1), reason=title),
                  Effect(actor=actor.id, field="stability", delta=-round(rng.uniform(1, 3), 1), reason=title)]
        elif kind == "rally":
            pts = rng.randint(3, 8)
            figures = {"hausse_sondage_pts": pts, "lieu": place}
            title = f"Rassemblement de soutien à {place}"
            text = f"Une large mobilisation de soutien au pouvoir se tient à {place} (+{pts} points d'approbation estimés)."
            E += [Effect(actor=actor.id, field="approval", delta=float(pts), reason=title), Effect(actor=actor.id, field="stability", delta=2, reason=title)]
        else:
            pct = round(rng.uniform(1.5, 6.5), 1)
            figures = {"inflation_mensuelle_pct": pct}
            title = "Tensions économiques intérieures"
            text = f"Les prix progressent d'environ {pct} % sur le mois ; les ménages réduisent leur consommation."
            E += [Effect(actor=actor.id, field="economic", delta=-round(pct / 2, 1), reason=title), Effect(actor=actor.id, field="approval", delta=-1.5, reason=title)]
        big = figures.get("participants", 0) > 60000 or kind in ("sabotage",)
        world.events.append(Event(
            id=world.next_id("EVT"), round=world.round, kind=f"domestic_{kind}", scope="public" if big else "private", audience=[actor.id],
            title=title, text=text, figures=figures, location=city, actors=[actor.id], effects=E,
        ))
        effects.extend(E)
    return effects
