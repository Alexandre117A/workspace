"""Bases historiques disponibles sans IA.

Reconstitutions GEONEX à partir de connaissances encyclopédiques (liens
Wikipédia fournis pour vérification). Les faits notés `confirmed` sont des
faits bien établis ; les quantités sont des `estimate`. Aucun objectif ni
secret ne fait référence au dénouement réel : la connaissance des acteurs
s'arrête à la date de départ.
"""
from __future__ import annotations

from typing import Callable, Optional

from .models import (
    Actor, Capitals, Fact, Objective, Personality, Region, Relation, Resource, Scenario, Setting, SourceRef, Theatre, Zone,
)
from .reference_data import normalize


def _src(label: str, url: str, status: str = "confirmed") -> SourceRef:
    return SourceRef(status=status, label=label, url=url)


def _res(key, label, qty, unit, cat, status="estimate", usable=True, url=None) -> Resource:
    src = SourceRef(status=status, label="Reconstitution historique GEONEX" if status != "hypothesis" else "Unité de jeu GEONEX (abstraction)", url=url)
    return Resource(key=key, label=label, quantity=qty, unit=unit, category=cat, usable=usable, abstraction=status == "hypothesis", source=src, max_quantity=qty)


def _actor(id, name, kind, camp, leader, leader_url, iso, caps, stab, coh, appr, rel, pers, resources, objectives, red, secrets, facts, regions, desc) -> Actor:
    c = Capitals(political=caps[0], economic=caps[1], military=caps[2])
    return Actor(
        id=id, name=name, short=id, kind=kind, camp=camp, iso_n3=iso, description=desc,
        leader=leader, leader_source=_src("Wikipédia", leader_url),
        capitals=c, initial_capitals=c.model_copy(), stability=stab, cohesion=coh, approval=appr,
        indicators_source=SourceRef(status="estimate", label="Estimation GEONEX pour la période"),
        relevance=rel, engagement=min(1.0, 0.35 + rel * 0.65),
        personality=Personality(aggression=pers[0], caution=pers[1], cooperation=pers[2]),
        resources=resources,
        objectives=[Objective(id=f"{id}-{k[:3]}-{i}", kind=k, text=t, metric=m) for i, (k, t, m) in enumerate(objectives, 1)],
        red_lines=red, secrets=secrets, facts=facts,
        regions=[Region(name=n, lat=la, lon=lo) for n, la, lo in regions],
    )


def _rel(a, b, trust, tension, alliance=False, war=False) -> Relation:
    x, y = sorted((a, b))
    return Relation(a=x, b=y, trust=trust, tension=tension, alliance=alliance, at_war=war)


CUBA_URL = "https://fr.wikipedia.org/wiki/Crise_des_missiles_de_Cuba"


def cuba_1962() -> Scenario:
    w = CUBA_URL
    actors = [
        _actor("USA", "États-Unis", "state", "camp_a", "John F. Kennedy (président)", "https://fr.wikipedia.org/wiki/John_Fitzgerald_Kennedy", ["840"],
               (72, 92, 90), 72, 75, 62, 1.0, (0.45, 0.6, 0.45),
               [_res("air_wings", "Escadres aériennes en alerte", 8, "escadres", "military", "hypothesis"),
                _res("naval_groups", "Groupes navals de quarantaine", 6, "groupes", "military", "hypothesis"),
                _res("jupiter_turkey", "Missiles Jupiter déployés en Turquie", 15, "missiles", "military", "confirmed", False, "https://fr.wikipedia.org/wiki/PGM-19_Jupiter"),
                _res("economic_reserve", "Fonds d'action économique", 20, "Md$ (1962)", "economic", "hypothesis"),
                _res("diplomatic_channels", "Canaux diplomatiques", 6, "canaux", "political", "hypothesis"),
                _res("intel_assets", "Moyens de renseignement (U-2, CIA)", 4, "équipes", "other", "hypothesis")],
               [("primary", "Neutraliser les sites de missiles soviétiques à Cuba : contrôle ≥ 50 % de la zone.", {"type": "zone_control", "zone": "Z1", "value": 0.5}),
                ("secondary", "Éviter une guerre ouverte avec l'Union soviétique.", {"type": "no_war_with", "target": "URS"}),
                ("secondary", "Conserver un capital politique ≥ 65 à l'approche des élections de mi-mandat.", {"type": "capital_min", "capital": "political", "value": 65}),
                ("coalition", "Maintenir la confiance de la Turquie (≥ 40).", {"type": "relation_min", "target": "TUR", "value": 40}),
                ("secret", "Préserver votre supériorité stratégique : capital militaire ≥ 80.", {"type": "capital_min", "capital": "military", "value": 80})],
               ["Aucun missile offensif opérationnel ne doit rester à Cuba.", "Aucune attaque contre Berlin-Ouest sans riposte."],
               ["Le plan d'invasion de Cuba (OPLAN 316) est prêt à être exécuté.", "Les vols U-2 se poursuivent au-dessus de l'île."],
               [Fact(text="Le 14 octobre 1962, un avion U-2 photographie des sites de missiles balistiques soviétiques à Cuba.", source=_src("Wikipédia — Crise des missiles de Cuba", w))],
               [("Washington", 38.90, -77.04), ("Key West", 24.55, -81.78), ("Norfolk", 36.85, -76.29), ("Miami", 25.76, -80.19)],
               "Superpuissance occidentale ; le Comité exécutif (ExComm) délibère en secret."),
        _actor("URS", "Union soviétique", "state", "camp_b", "Nikita Khrouchtchev (premier secrétaire)", "https://fr.wikipedia.org/wiki/Nikita_Khrouchtchev",
               ["643", "804", "112", "398", "860", "795", "417", "762", "268", "051", "031", "498", "233", "428", "440"],
               (66, 60, 82), 68, 70, 55, 1.0, (0.55, 0.55, 0.4),
               [_res("r12_cuba", "Missiles balistiques R-12 acheminés à Cuba", 36, "missiles", "military", "estimate", True, w),
                _res("foxtrot_subs", "Sous-marins diesel (classe Foxtrot) dans l'Atlantique", 4, "sous-marins", "military", "confirmed", True, w),
                _res("troops_cuba", "Troupes soviétiques à Cuba", 43, "milliers", "military", "estimate", False, w),
                _res("naval_groups", "Convois maritimes vers Cuba", 5, "convois", "military", "hypothesis"),
                _res("economic_reserve", "Fonds d'aide aux alliés", 8, "Md$ (1962)", "economic", "hypothesis"),
                _res("diplomatic_channels", "Canaux diplomatiques", 5, "canaux", "political", "hypothesis"),
                _res("intel_assets", "Moyens de renseignement (KGB, GRU)", 4, "équipes", "other", "hypothesis")],
               [("primary", "Maintenir le contrôle des sites de missiles à Cuba : contrôle ≥ 50 %.", {"type": "zone_control", "zone": "Z1", "value": 0.5}),
                ("secondary", "Éviter une guerre ouverte avec les États-Unis.", {"type": "no_war_with", "target": "USA"}),
                ("secondary", "Conserver un capital politique ≥ 55 au sein du Praesidium.", {"type": "capital_min", "capital": "political", "value": 55}),
                ("coalition", "Garder la confiance de Cuba (≥ 40).", {"type": "relation_min", "target": "CUB", "value": 40}),
                ("secret", "Obtenir un accord avec les États-Unis.", {"type": "agreement_with", "target": "USA"})],
               ["Aucune invasion de Cuba sans réponse.", "Pas d'humiliation publique de l'URSS."],
               ["Des armes nucléaires tactiques sont déjà présentes sur l'île ; Washington l'ignore."],
               [Fact(text="L'opération Anadyr achemine secrètement missiles et troupes soviétiques vers Cuba depuis l'été 1962.", source=_src("Wikipédia — Opération Anadyr", "https://fr.wikipedia.org/wiki/Op%C3%A9ration_Anadyr"))],
               [("Moscou", 55.76, 37.62), ("Leningrad", 59.93, 30.36), ("Sébastopol", 44.62, 33.52)],
               "Superpuissance du bloc de l'Est ; l'opération Anadyr est en cours."),
        _actor("CUB", "Cuba", "state", "camp_b", "Fidel Castro (Premier ministre)", "https://fr.wikipedia.org/wiki/Fidel_Castro", ["192"],
               (50, 18, 30), 60, 70, 65, 0.9, (0.6, 0.35, 0.35),
               [_res("far_forces", "Forces armées révolutionnaires et milices", 270, "milliers", "military", "estimate", False),
                _res("aa_batteries", "Batteries antiaériennes", 6, "batteries", "military", "hypothesis"),
                _res("economic_reserve", "Réserves de change", 1, "Md$ (1962)", "economic", "hypothesis"),
                _res("diplomatic_channels", "Canaux diplomatiques", 3, "canaux", "political", "hypothesis"),
                _res("intel_assets", "Services de renseignement (DGI)", 2, "équipes", "other", "hypothesis")],
               [("primary", "Survivre : stabilité et capacités préservées.", {"type": "survive"}),
                ("secondary", "Obtenir un accord de non-agression avec les États-Unis.", {"type": "agreement_with", "target": "USA"}),
                ("coalition", "Maintenir l'alliance avec l'Union soviétique.", {"type": "alliance_with", "target": "URS"}),
                ("secret", "Maintenir la stabilité intérieure au-dessus de 55.", {"type": "stability_min", "value": 55})],
               ["Aucune inspection étrangère sur le sol cubain sans accord.", "Aucune invasion du territoire national."],
               ["Les autorités cubaines jugent une invasion américaine imminente."],
               [Fact(text="En avril 1961, le débarquement de la baie des Cochons a échoué.", source=_src("Wikipédia — Débarquement de la baie des Cochons", "https://fr.wikipedia.org/wiki/D%C3%A9barquement_de_la_baie_des_Cochons"))],
               [("La Havane", 23.11, -82.37), ("Santiago de Cuba", 20.02, -75.82), ("San Cristóbal", 22.71, -83.05)],
               "République révolutionnaire alignée sur Moscou."),
        _actor("TUR", "Turquie", "state", "camp_a", "Cemal Gürsel (président)", "https://fr.wikipedia.org/wiki/Cemal_G%C3%BCrsel", ["792"],
               (45, 30, 45), 52, 55, 50, 0.6, (0.4, 0.6, 0.5),
               [_res("jupiter_bases", "Bases accueillant des missiles Jupiter", 1, "site", "military", "confirmed", False, "https://fr.wikipedia.org/wiki/PGM-19_Jupiter"),
                _res("strike_groups", "Divisions mobilisables", 3, "divisions", "military", "hypothesis"),
                _res("economic_reserve", "Fonds d'action économique", 1, "Md$ (1962)", "economic", "hypothesis"),
                _res("diplomatic_channels", "Canaux diplomatiques", 3, "canaux", "political", "hypothesis"),
                _res("intel_assets", "Moyens de renseignement", 1, "équipes", "other", "hypothesis")],
               [("primary", "Préserver la garantie de sécurité américaine : confiance avec les États-Unis ≥ 45.", {"type": "relation_min", "target": "USA", "value": 45}),
                ("secondary", "Maintenir la stabilité intérieure au-dessus de 50.", {"type": "stability_min", "value": 50}),
                ("coalition", "Rester allié des États-Unis.", {"type": "alliance_with", "target": "USA"}),
                ("secret", "Accroître votre capital politique de 5 points.", {"type": "capital_gain", "capital": "political", "delta": 5})],
               ["Aucune décision concernant votre territoire sans consultation.", "Pas de rupture avec l'OTAN."],
               ["Le gouvernement craint d'être sacrifié dans un marchandage entre superpuissances."],
               [], [("Ankara", 39.93, 32.86), ("Izmir", 38.42, 27.14), ("Istanbul", 41.01, 28.98)],
               "Allié de l'OTAN sur le flanc sud-est, voisin direct de l'URSS."),
        _actor("ONU", "Organisation des Nations unies", "organization", "neutral", "U Thant (secrétaire général par intérim)", "https://fr.wikipedia.org/wiki/U_Thant", [],
               (60, 15, 5), 70, 60, 55, 0.7, (0.1, 0.7, 0.9),
               [_res("mediators", "Équipes de médiation", 4, "équipes", "political", "hypothesis"),
                _res("diplomatic_channels", "Canaux diplomatiques", 6, "canaux", "political", "hypothesis"),
                _res("economic_reserve", "Fonds d'urgence", 0.2, "Md$ (1962)", "economic", "hypothesis"),
                _res("intel_assets", "Observateurs", 1, "équipes", "other", "hypothesis")],
               [("primary", "Empêcher toute guerre ouverte entre les États-Unis et l'Union soviétique.", {"type": "no_war_between", "a": "USA", "b": "URS"}),
                ("secondary", "Ramener la tension États-Unis–URSS sous 60/100.", {"type": "tension_max_between", "a": "USA", "b": "URS", "value": 60}),
                ("coalition", "Maintenir un lien de confiance avec Cuba (≥ 20).", {"type": "relation_min", "target": "CUB", "value": 20}),
                ("secret", "Gagner 8 points de capital politique.", {"type": "capital_gain", "capital": "political", "delta": 8})],
               ["Ne jamais cautionner une agression armée.", "Préserver l'impartialité du Secrétariat."],
               ["Plusieurs États non alignés pressent le Secrétariat de proposer un moratoire."],
               [], [("New York (siège)", 40.75, -73.97)],
               "Organisation internationale ; le Conseil de sécurité peut être saisi."),
        _actor("GBR", "Royaume-Uni", "state", "camp_a", "Harold Macmillan (Premier ministre)", "https://fr.wikipedia.org/wiki/Harold_Macmillan", ["826"],
               (60, 55, 55), 68, 65, 50, 0.55, (0.35, 0.65, 0.6),
               [_res("v_bombers", "Bombardiers stratégiques (V-force)", 3, "escadres", "military", "hypothesis"),
                _res("naval_groups", "Escadres de la Royal Navy", 3, "escadres", "military", "hypothesis"),
                _res("economic_reserve", "Fonds d'action économique", 4, "Md$ (1962)", "economic", "hypothesis"),
                _res("diplomatic_channels", "Canaux diplomatiques", 6, "canaux", "political", "hypothesis"),
                _res("intel_assets", "Moyens de renseignement (MI6, GCHQ)", 3, "équipes", "other", "hypothesis")],
               [("primary", "Éviter l'escalade : tension États-Unis–URSS ≤ 70.", {"type": "tension_max_between", "a": "USA", "b": "URS", "value": 70}),
                ("secondary", "Consolider la relation spéciale : confiance avec les États-Unis ≥ 50.", {"type": "relation_min", "target": "USA", "value": 50}),
                ("coalition", "Tenir vos engagements : au moins 70 % honorés.", {"type": "honor_commitments", "ratio": 0.7}),
                ("secret", "Rester un intermédiaire indispensable : +6 de capital politique.", {"type": "capital_gain", "capital": "political", "delta": 6})],
               ["Aucune guerre en Europe déclenchée par la crise caraïbe.", "Pas de mise à l'écart des consultations alliées."],
               ["Londres dispose de ses propres sources sur les intentions soviétiques à Berlin."],
               [], [("Londres", 51.51, -0.13), ("Glasgow", 55.86, -4.25)],
               "Puissance nucléaire alliée, proche de Washington."),
    ]
    zones = [
        Zone(id="Z1", name="Sites de missiles de Cuba", domain="military", region=Region(name="San Cristóbal", lat=22.71, lon=-83.05), control={"URS": 0.65, "CUB": 0.35}, tension=80),
        Zone(id="Z2", name="Ligne de quarantaine (Atlantique)", domain="maritime", region=Region(name="Atlantique ouest", lat=24.5, lon=-72.0), control={"USA": 0.55, "URS": 0.25}, tension=70),
        Zone(id="Z3", name="Berlin-Ouest", domain="diplomatic", region=Region(name="Berlin", lat=52.52, lon=13.40), control={"USA": 0.35, "GBR": 0.2, "URS": 0.45}, tension=55),
    ]
    relations = [
        _rel("USA", "URS", -45, 80), _rel("USA", "CUB", -70, 85), _rel("URS", "CUB", 55, 10), _rel("USA", "TUR", 50, 10, True),
        _rel("USA", "GBR", 70, 8, True), _rel("TUR", "URS", -40, 55), _rel("GBR", "URS", -35, 50), _rel("GBR", "TUR", 40, 10, True),
        _rel("CUB", "TUR", 0, 20), _rel("CUB", "GBR", -10, 25), _rel("ONU", "USA", 15, 15), _rel("ONU", "URS", 10, 15),
        _rel("ONU", "CUB", 10, 15), _rel("ONU", "TUR", 10, 10), _rel("ONU", "GBR", 20, 10),
    ]
    setting = Setting(
        mode="historical", title="Crise des missiles de Cuba", topic="Crise des missiles de Cuba, octobre 1962",
        start_label="20 octobre 1962, 08 h 00 (heure de Washington)", start_date="1962-10-20", knowledge_cutoff="1962-10-20",
        era="cold_war", tempo="military",
        theatre=Theatre(name="Caraïbes et Atlantique Nord", iso_n3=["840", "192", "484", "044"], center=(-80.0, 24.0), maritime=True,
                        border_warning="Frontières contemporaines (Natural Earth) affichées à titre indicatif : en 1962, l'URSS englobait notamment l'Ukraine, la Biélorussie, les États baltes, le Caucase et l'Asie centrale."),
        camps={"camp_a": "Bloc occidental", "camp_b": "Bloc soviétique", "neutral": "Médiateurs"},
    )
    return Scenario(id="hist-cuba-1962", mode="historical", title=setting.title, prompt="Crise des missiles de Cuba, octobre 1962",
                    summary="Les sites de missiles soviétiques viennent d'être découverts à Cuba. Washington délibère ; Moscou poursuit ses livraisons. Le monde ignore encore l'issue.",
                    setting=setting, actors=actors, relations=relations, zones=zones)


def egypt_1799() -> Scenario:
    w = "https://fr.wikipedia.org/wiki/Campagne_d%27%C3%89gypte"
    actors = [
        _actor("FRA", "République française — Armée d'Orient", "state", "camp_a", "Général Napoléon Bonaparte", "https://fr.wikipedia.org/wiki/Napol%C3%A9on_Ier", ["250"],
               (55, 35, 62), 55, 70, 55, 1.0, (0.7, 0.4, 0.35),
               [_res("troops", "Troupes de l'Armée d'Orient", 30, "milliers d'hommes", "military", "estimate", False, w),
                _res("strike_groups", "Divisions de campagne", 5, "divisions", "military", "hypothesis"),
                _res("frigates", "Frégates rescapées", 2, "frégates", "military", "hypothesis"),
                _res("treasury", "Trésor de l'armée", 6, "millions de francs", "economic", "hypothesis"),
                _res("diplomatic_channels", "Émissaires", 3, "émissaires", "political", "hypothesis"),
                _res("intel_assets", "Éclaireurs et informateurs", 2, "réseaux", "other", "hypothesis")],
               [("primary", "Prendre le contrôle de Saint-Jean-d'Acre : contrôle ≥ 50 %.", {"type": "zone_control", "zone": "Z1", "value": 0.5}),
                ("secondary", "Conserver le delta du Nil : contrôle ≥ 60 %.", {"type": "zone_control", "zone": "Z2", "value": 0.6}),
                ("secondary", "Préserver l'armée : capital militaire ≥ 40.", {"type": "capital_min", "capital": "military", "value": 40}),
                ("coalition", "Obtenir un accord avec les Mamelouks.", {"type": "agreement_with", "target": "MAM"}),
                ("secret", "Gagner 8 points de capital politique (prestige auprès du Directoire).", {"type": "capital_gain", "capital": "political", "delta": 8})],
               ["Ne pas évacuer l'Égypte sans conditions.", "Aucune capitulation de l'Armée d'Orient."],
               ["Les communications avec Paris sont interrompues depuis la destruction de la flotte à Aboukir (août 1798)."],
               [Fact(text="Le 1er août 1798, la flotte française est détruite par Nelson à Aboukir.", source=_src("Wikipédia — Bataille d'Aboukir (1798)", "https://fr.wikipedia.org/wiki/Bataille_d%27Aboukir_(1798)"))],
               [("Le Caire", 30.04, 31.24), ("Alexandrie", 31.20, 29.92), ("Damiette", 31.42, 31.81)],
               "Corps expéditionnaire isolé en Égypte depuis 1798."),
        _actor("OTT", "Empire ottoman", "state", "camp_b", "Sultan Sélim III", "https://fr.wikipedia.org/wiki/S%C3%A9lim_III", ["792", "760", "368", "400", "422"],
               (50, 40, 50), 45, 45, 45, 1.0, (0.5, 0.5, 0.45),
               [_res("strike_groups", "Armées provinciales mobilisables", 4, "armées", "military", "hypothesis"),
                _res("naval_groups", "Escadres ottomanes", 2, "escadres", "military", "hypothesis"),
                _res("treasury", "Trésor impérial", 10, "millions de piastres", "economic", "hypothesis"),
                _res("diplomatic_channels", "Canaux diplomatiques", 5, "canaux", "political", "hypothesis"),
                _res("intel_assets", "Réseaux d'information", 2, "réseaux", "other", "hypothesis")],
               [("primary", "Faire prévaloir la coalition : au moins 55 % du rapport de force.", {"type": "camp_share_min", "value": 0.55}),
                ("secondary", "Maintenir la stabilité de l'Empire au-dessus de 45.", {"type": "stability_min", "value": 45}),
                ("coalition", "Consolider le lien avec la Grande-Bretagne (≥ 40).", {"type": "relation_min", "target": "GBR", "value": 40}),
                ("secret", "Réaffirmer l'autorité de la Porte sur Acre : confiance avec Acre ≥ 30.", {"type": "relation_min", "target": "ACR", "value": 30})],
               ["Aucune annexion française de provinces ottomanes.", "Pas de paix séparée de vos alliés."],
               ["La loyauté de plusieurs pachas de province est incertaine."],
               [], [("Constantinople", 41.01, 28.98), ("Damas", 33.51, 36.28), ("Alep", 36.20, 37.13)],
               "Suzerain nominal de l'Égypte ; a déclaré la guerre à la France en 1798."),
        _actor("GBR", "Royaume de Grande-Bretagne", "state", "camp_b", "William Pitt le Jeune (Premier ministre)", "https://fr.wikipedia.org/wiki/William_Pitt_le_Jeune", ["826"],
               (62, 70, 70), 65, 65, 55, 0.85, (0.45, 0.55, 0.5),
               [_res("naval_groups", "Escadre du Levant", 3, "escadres", "military", "hypothesis"),
                _res("marines", "Détachements de marine", 2, "détachements", "military", "hypothesis"),
                _res("treasury", "Subsides aux alliés", 3, "millions de livres", "economic", "hypothesis"),
                _res("diplomatic_channels", "Canaux diplomatiques", 6, "canaux", "political", "hypothesis"),
                _res("intel_assets", "Agents et interception de courriers", 3, "réseaux", "other", "hypothesis")],
               [("primary", "Dominer la côte de Syrie : contrôle maritime ≥ 60 %.", {"type": "zone_control", "zone": "Z3", "value": 0.6}),
                ("secondary", "Affaiblir l'Armée d'Orient (−10 de capital militaire).", {"type": "actor_weakened", "target": "FRA", "capital": "military", "delta": 10}),
                ("coalition", "Maintenir la confiance de l'Empire ottoman (≥ 40).", {"type": "relation_min", "target": "OTT", "value": 40}),
                ("secret", "Préserver votre économie : capital économique ≥ 60.", {"type": "capital_min", "capital": "economic", "value": 60})],
               ["Aucun retour de la flotte française en Méditerranée.", "Pas de menace française sur la route des Indes."],
               ["Des courriers français interceptés révèlent l'isolement de l'Armée d'Orient."],
               [], [("Londres", 51.51, -0.13), ("Portsmouth", 50.82, -1.09)],
               "Maîtresse des mers depuis Aboukir."),
        _actor("MAM", "Mamelouks de Mourad Bey", "armed_group", "camp_b", "Mourad Bey", "https://fr.wikipedia.org/wiki/Mourad_Bey", ["818"],
               (30, 20, 28), 40, 50, 40, 0.75, (0.6, 0.4, 0.4),
               [_res("cavalry", "Cavalerie mamelouke", 3, "escadrons", "military", "hypothesis"),
                _res("treasury", "Trésor de Haute-Égypte", 1, "millions de piastres", "economic", "hypothesis"),
                _res("diplomatic_channels", "Émissaires", 2, "émissaires", "political", "hypothesis"),
                _res("intel_assets", "Informateurs du désert", 2, "réseaux", "other", "hypothesis")],
               [("primary", "Survivre en tant que force organisée.", {"type": "survive"}),
                ("secondary", "Affaiblir l'Armée d'Orient (−8 de capital militaire).", {"type": "actor_weakened", "target": "FRA", "capital": "military", "delta": 8}),
                ("coalition", "Obtenir une alliance avec l'Empire ottoman.", {"type": "alliance_with", "target": "OTT"}),
                ("secret", "Reprendre pied dans le delta : contrôle ≥ 20 %.", {"type": "zone_control", "zone": "Z2", "value": 0.2})],
               ["Aucune reddition sans garantie sur vos biens.", "Ne pas quitter la Haute-Égypte sans combat."],
               ["Mourad Bey mène une guérilla en Haute-Égypte."],
               [], [("Assiout", 27.18, 31.18), ("Louxor", 25.69, 32.64)],
               "Ancienne élite militaire de l'Égypte, repliée en Haute-Égypte."),
        _actor("ACR", "Pachalik d'Acre", "polity", "camp_b", "Ahmed Djezzar Pacha", "https://fr.wikipedia.org/wiki/Ahmed_Pacha_al-Djazzar", ["376", "422"],
               (35, 25, 35), 50, 55, 45, 0.9, (0.55, 0.5, 0.3),
               [_res("garrison", "Garnison d'Acre", 2, "régiments", "military", "hypothesis"),
                _res("treasury", "Trésor du pachalik", 1, "millions de piastres", "economic", "hypothesis"),
                _res("diplomatic_channels", "Émissaires", 2, "émissaires", "political", "hypothesis"),
                _res("intel_assets", "Informateurs", 1, "réseaux", "other", "hypothesis")],
               [("primary", "Tenir Saint-Jean-d'Acre : contrôle ≥ 50 %.", {"type": "zone_control", "zone": "Z1", "value": 0.5}),
                ("secondary", "Maintenir votre stabilité au-dessus de 45.", {"type": "stability_min", "value": 45}),
                ("coalition", "Obtenir une alliance avec la Grande-Bretagne.", {"type": "alliance_with", "target": "GBR"}),
                ("secret", "Préserver votre autonomie : capital politique ≥ 35.", {"type": "capital_min", "capital": "political", "value": 35})],
               ["Aucune reddition de la place.", "Pas de tutelle directe de la Porte sur vos affaires."],
               ["Les fortifications d'Acre ont été renforcées ces derniers mois."],
               [], [("Saint-Jean-d'Acre", 32.93, 35.08), ("Jaffa", 32.05, 34.75)],
               "Pacha quasi autonome de Syrie méridionale."),
        _actor("RUS", "Empire russe", "state", "camp_b", "Paul Ier", "https://fr.wikipedia.org/wiki/Paul_Ier_(empereur_de_Russie)", ["643"],
               (58, 45, 65), 55, 55, 50, 0.5, (0.5, 0.5, 0.45),
               [_res("naval_groups", "Escadre de la mer Noire (Ouchakov)", 2, "escadres", "military", "hypothesis"),
                _res("strike_groups", "Corps expéditionnaires", 2, "corps", "military", "hypothesis"),
                _res("treasury", "Trésor impérial", 5, "millions de roubles", "economic", "hypothesis"),
                _res("diplomatic_channels", "Canaux diplomatiques", 4, "canaux", "political", "hypothesis"),
                _res("intel_assets", "Réseaux d'information", 2, "réseaux", "other", "hypothesis")],
               [("primary", "Faire prévaloir la coalition : au moins 55 % du rapport de force.", {"type": "camp_share_min", "value": 0.55}),
                ("secondary", "Préserver votre stabilité au-dessus de 50.", {"type": "stability_min", "value": 50}),
                ("coalition", "Consolider l'alliance avec l'Empire ottoman (confiance ≥ 30).", {"type": "relation_min", "target": "OTT", "value": 30}),
                ("secret", "Accroître votre influence : +6 de capital politique.", {"type": "capital_gain", "capital": "political", "delta": 6})],
               ["Aucune présence française durable en Méditerranée orientale.", "Pas d'abandon de vos acquis en Méditerranée."],
               ["L'escadre d'Ouchakov opère en mer Ionienne."],
               [], [("Saint-Pétersbourg", 59.93, 30.36), ("Sébastopol", 44.62, 33.52)],
               "Allié de circonstance de la Porte dans la Deuxième Coalition."),
    ]
    zones = [
        Zone(id="Z1", name="Saint-Jean-d'Acre", domain="military", region=Region(name="Acre", lat=32.93, lon=35.08), control={"ACR": 0.6, "OTT": 0.2}, tension=65),
        Zone(id="Z2", name="Delta du Nil", domain="military", region=Region(name="Delta", lat=31.0, lon=31.0), control={"FRA": 0.7, "MAM": 0.1}, tension=45),
        Zone(id="Z3", name="Côte de Syrie (Méditerranée orientale)", domain="maritime", region=Region(name="Large de Jaffa", lat=32.6, lon=34.3), control={"GBR": 0.6, "FRA": 0.1}, tension=55),
    ]
    relations = [
        _rel("FRA", "OTT", -55, 75, war=True), _rel("FRA", "GBR", -65, 80, war=True), _rel("FRA", "MAM", -60, 75, war=True),
        _rel("FRA", "ACR", -50, 70, war=True), _rel("FRA", "RUS", -45, 60, war=True), _rel("OTT", "GBR", 35, 15, True),
        _rel("OTT", "RUS", 15, 35, True), _rel("OTT", "MAM", 5, 35), _rel("OTT", "ACR", 10, 30), _rel("GBR", "RUS", 30, 15, True),
        _rel("GBR", "ACR", 15, 20), _rel("GBR", "MAM", 10, 20), _rel("MAM", "ACR", 0, 30), _rel("RUS", "ACR", 0, 15), _rel("RUS", "MAM", 0, 10),
    ]
    setting = Setting(
        mode="historical", title="Campagne d'Égypte — l'expédition de Syrie", topic="Campagne d'Égypte de Napoléon en 1799",
        start_label="10 février 1799, Le Caire", start_date="1799-02-10", knowledge_cutoff="1799-02-10", era="napoleonic", tempo="mixed",
        theatre=Theatre(name="Égypte, Syrie et Méditerranée orientale", iso_n3=["818", "376", "275", "422", "760", "400"], center=(33.0, 31.0), maritime=True,
                        border_warning="Frontières contemporaines affichées à titre indicatif : en 1799, la région relève de l'Empire ottoman et de pachaliks autonomes."),
        camps={"camp_a": "Armée d'Orient", "camp_b": "Coalition anglo-ottomane", "neutral": "Neutres"},
    )
    return Scenario(id="hist-egypte-1799", mode="historical", title=setting.title, prompt="Campagne d'Égypte de Napoléon en 1799",
                    summary="Isolée depuis Aboukir, l'Armée d'Orient s'apprête à marcher vers la Syrie ottomane tandis que la Porte et Londres rassemblent leurs forces.",
                    setting=setting, actors=actors, relations=relations, zones=zones)


def hundred_years_1415() -> Scenario:
    w = "https://fr.wikipedia.org/wiki/Si%C3%A8ge_d%27Harfleur_(1415)"
    actors = [
        _actor("ENG", "Royaume d'Angleterre", "polity", "camp_a", "Henri V", "https://fr.wikipedia.org/wiki/Henri_V_(roi_d%27Angleterre)", ["826"],
               (62, 55, 62), 58, 62, 55, 1.0, (0.65, 0.45, 0.35),
               [_res("army", "Hommes d'armes et archers débarqués", 12, "milliers", "military", "estimate", False, w),
                _res("strike_groups", "Batailles (corps de troupe)", 3, "batailles", "military", "hypothesis"),
                _res("siege_guns", "Pièces d'artillerie de siège", 3, "batteries", "military", "hypothesis"),
                _res("treasury", "Trésor royal", 4, "dizaines de milliers de livres", "economic", "hypothesis"),
                _res("diplomatic_channels", "Hérauts et ambassadeurs", 3, "émissaires", "political", "hypothesis"),
                _res("intel_assets", "Espions et éclaireurs", 2, "réseaux", "other", "hypothesis")],
               [("primary", "Prendre Harfleur : contrôle ≥ 60 %.", {"type": "zone_control", "zone": "Z1", "value": 0.6}),
                ("secondary", "Préserver l'armée : capital militaire ≥ 40.", {"type": "capital_min", "capital": "military", "value": 40}),
                ("secondary", "Maintenir la stabilité du royaume au-dessus de 50.", {"type": "stability_min", "value": 50}),
                ("coalition", "Obtenir un accord avec le duc de Bourgogne.", {"type": "agreement_with", "target": "BUR"}),
                ("secret", "Légitimer votre revendication : +8 de capital politique.", {"type": "capital_gain", "capital": "political", "delta": 8})],
               ["Aucune renonciation à vos droits sur les terres réclamées.", "Pas de retraite sans combat."],
               ["Le complot de Southampton a été déjoué en juillet : la loyauté de certains barons reste incertaine."],
               [Fact(text="L'armée d'Henri V débarque près de Harfleur à la mi-août 1415.", source=_src("Wikipédia — Siège d'Harfleur (1415)", w))],
               [("Londres", 51.51, -0.13), ("Southampton", 50.90, -1.40), ("Calais", 50.95, 1.86)],
               "Royaume en campagne, revendiquant la couronne de France."),
        _actor("FRA", "Royaume de France (parti armagnac)", "polity", "camp_b", "Charles VI ; le dauphin Louis de Guyenne participe au gouvernement", "https://fr.wikipedia.org/wiki/Charles_VI_(roi_de_France)", ["250"],
               (48, 60, 58), 40, 40, 45, 1.0, (0.5, 0.5, 0.4),
               [_res("strike_groups", "Osts féodaux mobilisables", 4, "osts", "military", "hypothesis"),
                _res("garrisons", "Garnisons normandes", 3, "garnisons", "military", "hypothesis"),
                _res("treasury", "Aides et impôts levés", 5, "dizaines de milliers de livres", "economic", "hypothesis"),
                _res("diplomatic_channels", "Ambassadeurs", 4, "émissaires", "political", "hypothesis"),
                _res("intel_assets", "Informateurs", 2, "réseaux", "other", "hypothesis")],
               [("primary", "Conserver Harfleur : contrôle ≥ 50 %.", {"type": "zone_control", "zone": "Z1", "value": 0.5}),
                ("secondary", "Rétablir la stabilité intérieure au-dessus de 45.", {"type": "stability_min", "value": 45}),
                ("coalition", "Rallier la Bourgogne : confiance ≥ 20.", {"type": "relation_min", "target": "BUR", "value": 20}),
                ("secret", "Affaiblir l'armée anglaise (−10 de capital militaire).", {"type": "actor_weakened", "target": "ENG", "capital": "military", "delta": 10})],
               ["Aucune cession de territoire.", "Pas d'accord avec l'Angleterre sans le conseil du roi."],
               ["La rivalité entre Armagnacs et Bourguignons paralyse une partie du conseil royal."],
               [Fact(text="Le royaume est divisé par la guerre civile entre Armagnacs et Bourguignons.", source=_src("Wikipédia — Guerre civile entre Armagnacs et Bourguignons", "https://fr.wikipedia.org/wiki/Guerre_civile_entre_Armagnacs_et_Bourguignons"))],
               [("Paris", 48.86, 2.35), ("Rouen", 49.44, 1.10), ("Amiens", 49.89, 2.30)],
               "Royaume affaibli par la folie du roi et la guerre civile."),
        _actor("BUR", "Duché de Bourgogne", "polity", "neutral", "Jean sans Peur", "https://fr.wikipedia.org/wiki/Jean_sans_Peur", ["056"],
               (55, 62, 50), 62, 60, 55, 0.8, (0.45, 0.55, 0.45),
               [_res("strike_groups", "Compagnies bourguignonnes", 3, "compagnies", "military", "hypothesis"),
                _res("treasury", "Revenus de Flandre", 6, "dizaines de milliers de livres", "economic", "hypothesis"),
                _res("diplomatic_channels", "Émissaires", 4, "émissaires", "political", "hypothesis"),
                _res("intel_assets", "Agents à Paris", 3, "réseaux", "other", "hypothesis")],
               [("primary", "Accroître votre influence : +8 de capital politique.", {"type": "capital_gain", "capital": "political", "delta": 8}),
                ("secondary", "Préserver vos revenus : capital économique ≥ 55.", {"type": "capital_min", "capital": "economic", "value": 55}),
                ("coalition", "Obtenir un accord avec l'un des deux rois.", {"type": "agreement_with", "target": "ENG"}),
                ("secret", "Affaiblir le parti armagnac (−8 de capital politique).", {"type": "actor_weakened", "target": "FRA", "capital": "political", "delta": 8})],
               ["Aucune menace sur la Flandre.", "Pas de soumission au parti armagnac."],
               ["Le duc entretient des contacts discrets avec des émissaires anglais."],
               [], [("Dijon", 47.32, 5.04), ("Gand", 51.05, 3.72), ("Bruges", 51.21, 3.22)],
               "Puissance princière riche, arbitre de la guerre civile."),
        _actor("BRE", "Duché de Bretagne", "polity", "neutral", "Jean V", "https://fr.wikipedia.org/wiki/Jean_V_de_Bretagne", ["250"],
               (40, 40, 35), 60, 60, 55, 0.55, (0.3, 0.65, 0.55),
               [_res("strike_groups", "Lances bretonnes", 2, "compagnies", "military", "hypothesis"),
                _res("naval_groups", "Navires bretons", 1, "flottille", "military", "hypothesis"),
                _res("treasury", "Trésor ducal", 2, "dizaines de milliers de livres", "economic", "hypothesis"),
                _res("diplomatic_channels", "Émissaires", 3, "émissaires", "political", "hypothesis"),
                _res("intel_assets", "Informateurs", 1, "réseaux", "other", "hypothesis")],
               [("primary", "Rester à l'écart de la guerre : stabilité ≥ 55.", {"type": "stability_min", "value": 55}),
                ("secondary", "Préserver vos revenus : capital économique ≥ 35.", {"type": "capital_min", "capital": "economic", "value": 35}),
                ("coalition", "Tenir vos engagements : 70 % honorés.", {"type": "honor_commitments", "ratio": 0.7}),
                ("secret", "Éviter toute guerre avec l'Angleterre.", {"type": "no_war_with", "target": "ENG"})],
               ["Aucune armée étrangère sur le sol breton.", "Pas d'engagement militaire sans contrepartie."],
               ["Le duc hésite entre ses devoirs envers le roi de France et ses intérêts commerciaux."],
               [], [("Nantes", 47.22, -1.55), ("Vannes", 47.66, -2.76)],
               "Principauté semi-indépendante, jouant de sa neutralité."),
        _actor("HRE", "Saint-Empire romain germanique", "organization", "neutral", "Sigismond de Luxembourg, roi des Romains", "https://fr.wikipedia.org/wiki/Sigismond_Ier_du_Saint-Empire", ["276"],
               (55, 45, 30), 55, 45, 50, 0.45, (0.2, 0.6, 0.8),
               [_res("mediators", "Légats et médiateurs", 3, "équipes", "political", "hypothesis"),
                _res("diplomatic_channels", "Canaux diplomatiques", 5, "canaux", "political", "hypothesis"),
                _res("treasury", "Trésor impérial", 2, "dizaines de milliers de florins", "economic", "hypothesis"),
                _res("intel_assets", "Informateurs", 1, "réseaux", "other", "hypothesis")],
               [("primary", "Empêcher une guerre ouverte prolongée entre l'Angleterre et la France.", {"type": "no_war_between", "a": "ENG", "b": "FRA"}),
                ("secondary", "Ramener la tension Angleterre–France sous 60.", {"type": "tension_max_between", "a": "ENG", "b": "FRA", "value": 60}),
                ("coalition", "Maintenir la confiance de la Bourgogne (≥ 20).", {"type": "relation_min", "target": "BUR", "value": 20}),
                ("secret", "Accroître votre prestige : +8 de capital politique.", {"type": "capital_gain", "capital": "political", "delta": 8})],
               ["Ne jamais cautionner une agression contre l'Empire.", "Préserver les travaux du concile de Constance."],
               ["Le concile de Constance réclame l'unité de la chrétienté."],
               [], [("Constance", 47.66, 9.18), ("Prague", 50.08, 14.44)],
               "Souverain médiateur, mobilisé par le concile de Constance."),
    ]
    zones = [
        Zone(id="Z1", name="Harfleur", domain="military", region=Region(name="Harfleur", lat=49.51, lon=0.20), control={"FRA": 0.8, "ENG": 0.1}, tension=70),
        Zone(id="Z2", name="Pale de Calais", domain="military", region=Region(name="Calais", lat=50.95, lon=1.86), control={"ENG": 0.8, "FRA": 0.1}, tension=45),
        Zone(id="Z3", name="Manche", domain="maritime", region=Region(name="Manche", lat=50.2, lon=-0.5), control={"ENG": 0.5, "FRA": 0.25, "BRE": 0.1}, tension=55),
    ]
    relations = [
        _rel("ENG", "FRA", -60, 85, war=True), _rel("ENG", "BUR", 10, 30), _rel("ENG", "BRE", 0, 30), _rel("ENG", "HRE", 10, 20),
        _rel("FRA", "BUR", -35, 60), _rel("FRA", "BRE", 15, 25), _rel("FRA", "HRE", 15, 20), _rel("BUR", "BRE", 10, 15),
        _rel("BUR", "HRE", 20, 15), _rel("BRE", "HRE", 5, 10),
    ]
    setting = Setting(
        mode="historical", title="Guerre de Cent Ans — campagne de 1415", topic="Guerre de Cent Ans, 1415",
        start_label="14 août 1415, embouchure de la Seine", start_date="1415-08-14", knowledge_cutoff="1415-08-14", era="medieval", tempo="military",
        theatre=Theatre(name="Normandie, Picardie et Manche", iso_n3=["250", "826", "056"], center=(1.2, 50.0), maritime=True,
                        border_warning="Frontières contemporaines affichées à titre indicatif : en 1415, le royaume de France, les principautés et les possessions anglaises ont des limites très différentes."),
        camps={"camp_a": "Royaume d'Angleterre", "camp_b": "Royaume de France", "neutral": "Principautés"},
    )
    return Scenario(id="hist-1415", mode="historical", title=setting.title, prompt="Guerre de Cent Ans, 1415",
                    summary="Henri V vient de débarquer à l'embouchure de la Seine. Le royaume de France, déchiré par la guerre civile, doit réagir.",
                    setting=setting, actors=actors, relations=relations, zones=zones)


HISTORICAL_SEEDS: list[tuple[list[str], Callable[[], Scenario]]] = [
    (["cuba", "missiles", "1962", "khrouchtchev", "kennedy"], cuba_1962),
    (["egypte", "bonaparte", "napoleon", "1799", "1798", "acre", "aboukir"], egypt_1799),
    (["cent ans", "1415", "azincourt", "harfleur", "henri v"], hundred_years_1415),
]


def match_historical(prompt: str) -> Optional[Scenario]:
    norm = normalize(prompt)
    best, best_score = None, 0
    for keywords, factory in HISTORICAL_SEEDS:
        score = sum(1 for k in keywords if f" {k} " in norm or k in norm)
        if score > best_score:
            best, best_score = factory, score
    return best() if best and best_score >= 1 else None


def available_titles() -> list[str]:
    return [factory().title for _, factory in HISTORICAL_SEEDS]
