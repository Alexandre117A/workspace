"""Communiqués de Rome : événements de rupture.

Déclenchement : à partir du round 2, fréquence limitée, lorsque le rapport de
force caché entre dans la zone de domination (≈68-75 %). Le moment est choisi
par un aléa croissant dans la fenêtre (pas de déclenchement mécanique au seuil),
et aucun communiqué n'est produit si aucun événement plausible ne peut être
construit à partir de la situation réelle. Les effets découlent d'expositions
structurelles (proximité du théâtre, dépendances, secrets réels), jamais d'un
bonus automatique au camp qui perd.
"""
from __future__ import annotations

import random
from typing import Optional

from . import ai
from .ai.tasks import numbers_are_grounded, write_rome
from .balance import camp_shares
from .models import Actor, Effect, Event, Region, RomeCommunique, WorldState, Zone
from .probability import rng_for
from .reference_data import normalize
from .text import PRE_INDUSTRIAL, sim_time_label, vocab

WINDOW_LOW = 0.68
WINDOW_HIGH = 0.75
MIN_GAP_ROUNDS = 2

SHIP_NAMES = {
    "pre": ["la Diligente", "le Hardi", "la Sirène", "le Vengeur", "la Constance", "le Triton"],
    "cold": ["SS Marcula", "Bucharest", "Poltava", "Kimovsk", "Aleksandrovsk", "Gagarine"],
    "modern": ["MV Aurora Meridian", "MV Kestrel Bay", "MT Selene Star", "MV Orinoco Pride", "MT Nordic Halcyon", "MV Cape Varenne"],
    "space": ["Iridine-7", "Vaillance d'Orion", "Kessler Drift", "Halcyon IX", "Perséphone", "Arc de Tanit"],
}
COMPANIES = {"pre": ["Compagnie des Indes du Levant", "Maison Vernet & fils"], "cold": ["Sovfracht", "Atlantic Bulk Lines"],
             "modern": ["Halvorsen Maritime", "Meridian Freight", "Castellane Shipping"], "space": ["Consortium Tanit", "Lignes Orbitales Kessler"]}


def _era_key(world: WorldState) -> str:
    era = world.setting.era
    if era in PRE_INDUSTRIAL:
        return "pre"
    if era in ("industrial", "cold_war"):
        return "cold"
    if era == "space":
        return "space"
    return "modern"


def check(world: WorldState, phase: str) -> dict:
    """Évalue s'il faut préparer un communiqué maintenant. Met à jour l'état Rome."""
    r = world.rome
    info = camp_shares(world)
    out = {"prepare": False, "leader": info["leader"], "leader_share": info["leader_share"], "reason": ""}
    if world.round < 2:
        out["reason"] = "Aucun communiqué automatique avant le round 2."
        return out
    if r.count >= world.plan.rome_max:
        out["reason"] = "Quota de communiqués atteint pour cette durée de session."
        return out
    if r.last_round and world.round - r.last_round < MIN_GAP_ROUNDS:
        out["reason"] = "Délai minimal entre deux communiqués."
        return out
    s = info["leader_share"]
    if s < WINDOW_LOW:
        r.window_entered_round = None
        out["reason"] = "Pas de domination."
        return out
    if r.window_entered_round is None:
        r.window_entered_round = world.round
    in_window = world.round - r.window_entered_round
    hazard = 0.3 + 0.3 * in_window + (0.45 if s > WINDOW_HIGH else 0.0)
    rng = rng_for(world.seed, world.round, "rome-check", phase)
    if rng.random() > min(0.95, hazard):
        out["reason"] = "Fenêtre de domination : moment non retenu."
        return out
    comm = build(world, info["leader"], rng)
    if comm is None:
        out["reason"] = "Aucun événement plausible ne peut être construit."
        return out
    world.communiques.append(comm)
    r.pending_id = comm.id
    out.update({"prepare": True, "communique_id": comm.id, "deliver_offset": round(rng.uniform(0.25, 0.7), 2)})
    return out


def _line(effects: list[Effect], actor: Actor) -> list[str]:
    lines = []
    labels = {"political": "capital politique", "economic": "capital économique", "military": "capital militaire", "stability": "stabilité",
              "approval": "approbation", "cohesion": "cohésion", "engagement": "implication dans la crise"}
    for e in effects:
        if e.actor != actor.id:
            continue
        if e.field in labels and abs(e.delta) >= 1:
            lines.append(f"{labels[e.field].capitalize()} : {e.delta:+.0f} — {e.reason}.")
        elif e.field.startswith("control:") and abs(e.delta) >= 0.03:
            lines.append(f"Contrôle de zone {e.delta * 100:+.0f} pts — {e.reason}.")
        elif e.field.startswith("tension:") and abs(e.delta) >= 3:
            lines.append(f"Tension accrue avec un acteur clé ({e.delta:+.0f}).")
    return lines[:2]


def build(world: WorldState, leader_camp: Optional[str], rng: random.Random, forced_kind: Optional[str] = None,
          description: str = "", involved: Optional[list[str]] = None) -> Optional[RomeCommunique]:
    era = _era_key(world)
    v = vocab(world)
    dominant = [a for a in world.actors.values() if a.camp == leader_camp] if leader_camp else []
    dominant.sort(key=lambda a: -a.relevance)
    others = [a for a in world.actors.values() if a.camp != leader_camp]
    when = sim_time_label(world, extra_hours=rng.choice([2, 3, 5, 7]))
    candidates: list[tuple[float, str]] = []
    hidden_commit = [c for c in world.commitments if not c.public and c.round >= world.round - 3 and c.to_actor]
    pending_ops = [o for o in world.operations if o.status in ("pending", "resolved") and o.secret and o.category in ("covert_operation", "disinformation") and o.started_round >= world.round - 3]
    maritime_zones = [z for z in world.zones if z.domain == "maritime"]
    land_zones = [z for z in world.zones if z.domain != "maritime"]
    if hidden_commit or pending_ops:
        candidates.append((1.2, "leak"))
    if maritime_zones or world.setting.theatre.maritime:
        candidates.append((1.0, "incident_maritime"))
    if land_zones:
        candidates.append((0.9, "incident_border"))
    engaged_low = [a for a in world.actors.values() if a.engagement < 0.6 and a.controlled_by == "npc" and a.kind in ("state", "polity", "coalition", "organization")]
    if engaged_low:
        candidates.append((0.8, "new_actor"))
    candidates.append((0.7, "economic_crisis"))
    defectors = [a for a in dominant if a.controlled_by == "npc" and dominant and a.id != dominant[0].id and world.relation(a.id, dominant[0].id).trust < 25]
    if defectors:
        candidates.append((0.9, "balance_shift"))
    if forced_kind:
        candidates = [(1.0, forced_kind)]
    if not candidates:
        return None
    total = sum(w for w, _ in candidates)
    pick = rng.uniform(0, total)
    acc = 0.0
    kind = candidates[-1][1]
    for w, k in candidates:
        acc += w
        if pick <= acc:
            kind = k
            break

    effects: list[Effect] = []
    figures: dict = {}
    title = body = impact = ""
    hidden_cause = ""
    new_zone: Optional[Zone] = None
    causes: list[str] = []
    lead = dominant[0] if dominant else (max(world.actors.values(), key=lambda a: a.relevance))
    involved = [x for x in (involved or []) if x in world.actors]
    deferred_changes: dict = {}

    if kind == "leak":
        if hidden_commit:
            c = rng.choice(hidden_commit)
            a, b = world.actors[c.from_actor], world.actors[c.to_actor]
            figures = {"round_origine": c.round, "nature": c.kind}
            title = f"Fuite : échanges confidentiels entre {a.name} et {b.name}"
            body = (f"{when} — Des documents authentifiés révèlent un engagement de type « {c.kind} » pris par {a.name} envers {b.name} "
                    f"lors d'un échange confidentiel (round {c.round}). Leur diffusion par des {v['media']} provoque des réactions immédiates.")
            impact = "La confiance entre partenaires est ébranlée ; les capitales réévaluent leurs alignements."
            effects += [Effect(actor=a.id, field="political", delta=-6, reason="Fuite d'un engagement confidentiel"),
                        Effect(actor=b.id, field="political", delta=-3, reason="Fuite d'un engagement confidentiel")]
            for o in world.actors.values():
                if o.id not in (a.id, b.id) and o.camp in (a.camp, b.camp):
                    effects.append(Effect(actor=o.id, field=f"trust:{a.id}", delta=-8, reason=f"Révélation d'échanges secrets de {a.name}"))
            hidden_cause = f"Engagement réel {c.id} pris au round {c.round}."
            causes.append(c.id)
            deferred_changes["publish_commitment"] = c.id
        else:
            o = rng.choice(pending_ops)
            a = world.actors[o.actor]
            tgts = ", ".join(world.actors[t].name for t in o.targets if t in world.actors)
            title = f"Fuite : opération clandestine de {a.name}"
            body = f"{when} — Des pièces transmises à la presse internationale exposent une opération clandestine de {a.name} visant {tgts}."
            impact = "L'acteur exposé perd en crédibilité ; ses cibles durcissent le ton."
            effects.append(Effect(actor=a.id, field="political", delta=-7, reason="Opération clandestine exposée"))
            for t in o.targets:
                if t in world.actors:
                    effects.append(Effect(actor=t, field=f"trust:{a.id}", delta=-15, reason=f"Opération de {a.name} révélée"))
            hidden_cause = f"Opération réelle {o.id} lancée au round {o.started_round}."
            causes.append(o.id)
    elif kind == "incident_maritime":
        zone = (maritime_zones or world.zones or [None])[0]
        loc = zone.region if zone else Region(name=world.setting.theatre.name)
        ship = rng.choice(SHIP_NAMES[era])
        company = rng.choice(COMPANIES[era])
        crew = rng.randint(14, 31) if era != "pre" else rng.randint(120, 320)
        tonnage = rng.randint(18, 95) * 1000 if era in ("modern", "cold") else None
        other = involved[1] if len(involved) > 1 else (rng.choice(others).id if others else None)
        figures = {"navire": ship, "armateur": company, "équipage": crew, "heure": when}
        if tonnage:
            figures["tonnage"] = tonnage
        title = f"Incident maritime : le {ship} immobilisé ({zone.name if zone else loc.name})"
        body = (f"{when} — Le {v['ship']} {ship} ({company}{f', {tonnage} t' if tonnage else ''}, {crew} membres d'équipage) a été arraisonné "
                f"à proximité de {loc.name} après un contact avec des unités de {lead.name}. Les assurances suspendent les transits dans la zone.")
        impact = "La circulation maritime du théâtre est perturbée ; le risque d'escalade navale augmente."
        effects.append(Effect(actor=lead.id, field="political", delta=-4, reason=f"Incident du {ship}"))
        effects.append(Effect(actor=lead.id, field="economic", delta=-3, reason="Perturbation des flux maritimes"))
        if zone:
            effects.append(Effect(actor=lead.id, field=f"control:{zone.id}", delta=-0.08, reason="Liberté d'action réduite après l'incident"))
        if other:
            effects.append(Effect(actor=lead.id, field=f"tension:{other}", delta=15, reason=f"Incident du {ship}"))
            effects.append(Effect(actor=other, field="approval", delta=2, reason="Indignation après l'incident"))
        for a in world.actors.values():
            if a.kind == "company":
                effects.append(Effect(actor=a.id, field="economic", delta=-5, reason="Transits suspendus"))
    elif kind == "incident_border":
        zone = rng.choice(land_zones)
        other = involved[1] if len(involved) > 1 else next((o.id for o in others if o.relevance >= 0.85), (others[0].id if others else None))
        casualties = rng.randint(3, 27)
        figures = {"zone": zone.name, "victimes": casualties, "heure": when}
        title = f"Accrochage meurtrier : {zone.name}"
        body = (f"{when} — Un échange de tirs près de {zone.region.name} fait {casualties} victimes. Les deux parties s'accusent mutuellement ; "
                f"des {v['unit']}s de {lead.name} sont placées en alerte.")
        impact = "Le théâtre principal se tend brusquement ; la pression internationale s'accroît sur l'acteur dominant."
        effects += [Effect(actor=lead.id, field="political", delta=-4, reason=f"Accrochage de {zone.name}"),
                    Effect(actor=lead.id, field=f"control:{zone.id}", delta=-0.06, reason="Position contestée après l'accrochage")]
        if other:
            effects.append(Effect(actor=lead.id, field=f"tension:{other}", delta=18, reason=f"Accrochage de {zone.name}"))
    elif kind == "new_actor":
        newcomer = rng.choice(engaged_low) if not involved else world.actors[involved[0]]
        trust_lead = world.relation(newcomer.id, lead.id).trust
        joins = lead.camp if trust_lead > 20 else ("neutral" if abs(trust_lead) <= 20 else next((a.camp for a in others if a.camp not in ("neutral", lead.camp)), "neutral"))
        figures = {"acteur": newcomer.name, "position": world.setting.camps.get(joins, joins)}
        title = f"{newcomer.name} entre dans la crise"
        body = (f"{when} — {newcomer.name} annonce un engagement direct dans la crise et mobilise ses moyens. "
                f"Sa position : {world.setting.camps.get(joins, 'non alignée')}.")
        impact = "Un nouvel acteur pèse désormais sur l'équilibre ; ses intérêts propres guideront ses choix."
        effects.append(Effect(actor=newcomer.id, field="engagement", delta=0.45, reason="Entrée dans la crise"))
        deferred_changes["camp"] = {newcomer.id: joins}
        hidden_cause = f"Choix fondé sur ses relations réelles (confiance envers {lead.name} : {trust_lead:+.0f})."
    elif kind == "economic_crisis":
        shock = rng.randint(4, 9)
        figures = {"ampleur": f"{shock} %", "heure": when}
        title = "Choc économique international" if era != "pre" else "Disette et flambée des prix"
        body = (f"{when} — Un {v['economy']} frappe les économies engagées dans la crise : les principaux indicateurs reculent d'environ {shock} %. "
                f"Les acteurs les plus exposés au théâtre subissent les pertes les plus lourdes.")
        impact = "Les capacités économiques reculent, d'autant plus que l'acteur est engagé et dépendant des échanges."
        for a in world.actors.values():
            exposure = a.engagement * (a.capitals.economic / 100)
            if exposure > 0.15:
                effects.append(Effect(actor=a.id, field="economic", delta=-round(shock * exposure, 1), reason="Choc économique international"))
                effects.append(Effect(actor=a.id, field="approval", delta=-round(2 * exposure, 1), reason="Hausse des prix"))
    elif kind == "balance_shift":
        d = rng.choice(defectors)
        figures = {"acteur": d.name}
        title = f"{d.name} prend ses distances avec {lead.name}"
        body = f"{when} — {d.name} annonce suspendre sa coopération avec {lead.name} et revendique une position autonome dans la crise."
        impact = "La coalition dominante perd un soutien ; les équilibres se recomposent."
        deferred_changes["camp"] = {d.id: "neutral"}
        effects.append(Effect(actor=d.id, field=f"trust:{lead.id}", delta=-10, reason="Prise de distance"))
        hidden_cause = f"Confiance réelle de {d.name} envers {lead.name} déjà faible."
    if description:
        body = f"{body} Contexte signalé : {description[:240]}"
    if not title:
        return None
    comm = RomeCommunique(
        id=world.next_id("ROM"), round=world.round, kind=kind, title=title, dateline=when, body=body, figures=figures,
        general_impact=impact, effects=effects, new_zone=new_zone, cause_refs=causes, hidden_cause=hidden_cause,
        deferred_changes=deferred_changes,
    )
    for a in world.actors.values():
        lines = _line(effects, a)
        if lines:
            comm.per_actor[a.id] = lines
    if ai.available():
        try:
            facts = {"titre": title, "date": when, "faits": body, "impact": impact, "chiffres": figures}
            out, model = write_rome(facts)
            if numbers_are_grounded(out.body + out.title + out.general_impact, facts):
                comm.title, comm.body, comm.general_impact, comm.generated_by = out.title, out.body, out.general_impact, model
        except ai.AIUnavailable:
            pass
    return comm


def apply(world: WorldState, comm_id: str) -> list[Effect]:
    from .effects import apply_all

    comm = next((c for c in world.communiques if c.id == comm_id), None)
    if comm is None or comm.delivered:
        return []
    applied = apply_all(world, comm.effects)
    for actor_id, camp in (comm.deferred_changes.get("camp") or {}).items():
        if actor_id in world.actors:
            world.actors[actor_id].camp = camp
    pub = comm.deferred_changes.get("publish_commitment")
    for c in world.commitments:
        if c.id == pub:
            c.public = True
    comm.delivered = True
    world.rome.pending_id = None
    world.rome.last_round = world.round
    world.rome.count += 1 if comm.origin == "auto" else 0
    world.events.append(Event(id=world.next_id("EVT"), round=world.round, kind="rome", scope="public", title=comm.title, text=comm.body,
                              figures=comm.figures, actors=list(comm.per_actor), cause_refs=[comm.id]))
    return applied


ANACHRONISMS = ["drone", "satellite", "internet", "cyber", "missile", "nucleaire", "avion", "radio", "telephone", "television", "reseaux sociaux"]
KIND_WORDS = [
    ("leak", ["fuite", "revel", "document", "divulg", "espion"]),
    ("incident_maritime", ["navire", "bateau", "maritime", "port", "detroit", "flotte", "petrolier", "fregate", "vaisseau"]),
    ("economic_crisis", ["econom", "march", "bourse", "petrole", "energie", "famine", "disette", "prix", "monnaie"]),
    ("new_actor", ["entre en guerre", "nouvel acteur", "intervient", "rejoint", "s engage", "intervention"]),
    ("incident_border", ["frontiere", "accrochage", "attaque", "attentat", "explosion", "tirs", "incident"]),
]


def propose(world: WorldState, text: str, seed_key: str) -> dict:
    """Communiqué proposé par le Président : analyse, cohérence, construction."""
    norm = normalize(text)
    issues: list[str] = []
    if len(norm.strip()) < 15:
        issues.append("Décrivez l'événement en une ou deux phrases.")
    if world.setting.era in PRE_INDUSTRIAL:
        found = [w for w in ANACHRONISMS if f" {w}" in norm]
        if found:
            issues.append(f"Anachronisme pour l'époque simulée : {', '.join(found)}.")
    kind = next((k for k, words in KIND_WORDS if any(w in norm for w in words)), "incident_border")
    involved = [a.id for a in world.actors.values() if normalize(a.name).strip() in norm or f" {a.id.lower()} " in norm]
    if kind == "incident_border" and not any(z.domain != "maritime" for z in world.zones):
        kind = "incident_maritime" if world.zones else "economic_crisis"
    if kind == "leak" and not ([c for c in world.commitments if not c.public] or [o for o in world.operations if o.secret]):
        issues.append("Aucun échange ou opération secrète réelle ne peut fonder une fuite à ce stade.")
    if kind == "new_actor" and not involved:
        issues.append("Précisez quel acteur entre dans la crise.")
    if issues:
        return {"coherent": False, "issues": issues, "kind": kind}
    rng = rng_for(world.seed, seed_key)
    info = camp_shares(world)
    comm = build(world, info["leader"], rng, forced_kind=kind, description=text, involved=involved)
    if comm is None:
        return {"coherent": False, "issues": ["Impossible de construire un événement exploitable."], "kind": kind}
    comm.origin = "president"
    world.communiques.append(comm)
    world.rome.pending_id = comm.id
    return {"coherent": True, "issues": [], "kind": kind, "communique_id": comm.id}
