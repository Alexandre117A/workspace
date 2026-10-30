"""Table de référence des États (monde contemporain).

Ces valeurs sont des ORDRES DE GRANDEUR arrondis (≈2023-2024 : FMI/Banque
mondiale pour le PIB, SIPRI pour les dépenses militaires, IISS pour les
effectifs). Elles sont toujours marquées `estimate` dans l'état du monde et
servent de base lorsque la couche de recherche externe ne fournit pas mieux.
Les dirigeants ne figurent PAS ici : ils sont recherchés (Wikidata) avec date
de consultation, ou laissés « à confirmer ».
"""
from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field

from .models import SourceRef

REFERENCE_SOURCE = SourceRef(
    status="estimate",
    label="Table de référence GEONEX — ordres de grandeur arrondis ≈2023-2024 (FMI, SIPRI, IISS), à actualiser",
)


@dataclass
class CountryRef:
    iso3: str
    n3: str
    fr: str
    en: str
    aliases: list[str]
    pop_m: float
    gdp_b: float
    defense_b: float
    active_k: float
    nuclear: int  # 0 non, 1 déclaré, 2 non déclaré / ambigu
    stability: float
    bloc: str  # west | east | swing
    alliances: list[str]
    navy: int  # 0..3
    cities: list[tuple[str, float, float]] = field(default_factory=list)


def _c(iso3, n3, fr, en, aliases, pop, gdp, dfn, act, nuc, stab, bloc, alli, navy, cities):
    return CountryRef(iso3, n3, fr, en, aliases, pop, gdp, dfn, act, nuc, stab, bloc, alli, navy, cities)


COUNTRIES: list[CountryRef] = [
    _c("USA", "840", "États-Unis", "United States", ["etats-unis", "etats unis", "usa", "amerique", "americain", "americaine", "washington", "us"], 335, 28800, 997, 1330, 1, 62, "west", ["OTAN", "QUAD", "AUKUS"], 3, [("Washington", 38.90, -77.04), ("New York", 40.71, -74.01), ("Los Angeles", 34.05, -118.24), ("Honolulu", 21.31, -157.86)]),
    _c("CHN", "156", "Chine", "China", ["chine", "chinois", "chinoise", "pekin", "rpc", "beijing"], 1410, 18700, 314, 2035, 1, 70, "east", ["OCS", "BRICS"], 3, [("Pékin", 39.90, 116.40), ("Shanghai", 31.23, 121.47), ("Xiamen", 24.48, 118.09), ("Canton", 23.13, 113.26)]),
    _c("RUS", "643", "Russie", "Russia", ["russie", "russe", "moscou", "federation de russie", "kremlin"], 144, 2160, 149, 1320, 1, 60, "east", ["OTSC", "OCS", "BRICS"], 3, [("Moscou", 55.76, 37.62), ("Saint-Pétersbourg", 59.93, 30.36), ("Rostov-sur-le-Don", 47.24, 39.71), ("Vladivostok", 43.12, 131.89)]),
    _c("TWN", "158", "Taïwan", "Taiwan", ["taiwan", "taiwanais", "taipei", "formose", "roc"], 23.4, 790, 16.5, 170, 0, 72, "west", [], 2, [("Taipei", 25.03, 121.57), ("Kaohsiung", 22.63, 120.30), ("Taichung", 24.15, 120.67)]),
    _c("JPN", "392", "Japon", "Japan", ["japon", "japonais", "tokyo"], 124, 4100, 55, 247, 0, 80, "west", ["QUAD"], 3, [("Tokyo", 35.68, 139.69), ("Osaka", 34.69, 135.50), ("Naha", 26.21, 127.68)]),
    _c("KOR", "410", "Corée du Sud", "South Korea", ["coree du sud", "sud-coreen", "seoul"], 51.7, 1870, 47.6, 500, 0, 70, "west", [], 2, [("Séoul", 37.57, 126.98), ("Busan", 35.18, 129.08), ("Incheon", 37.46, 126.71)]),
    _c("PRK", "408", "Corée du Nord", "North Korea", ["coree du nord", "nord-coreen", "pyongyang"], 26, 25, 4, 1280, 1, 65, "east", [], 1, [("Pyongyang", 39.04, 125.76), ("Hamhung", 39.92, 127.54)]),
    _c("IND", "356", "Inde", "India", ["inde", "indien", "indienne", "new delhi"], 1440, 3900, 86, 1475, 1, 62, "swing", ["QUAD", "OCS", "BRICS"], 2, [("New Delhi", 28.61, 77.21), ("Bombay", 19.08, 72.88), ("Srinagar", 34.08, 74.80)]),
    _c("PAK", "586", "Pakistan", "Pakistan", ["pakistan", "pakistanais", "islamabad"], 245, 375, 10, 660, 1, 40, "swing", ["OCS"], 1, [("Islamabad", 33.68, 73.05), ("Karachi", 24.86, 67.01), ("Lahore", 31.55, 74.34)]),
    _c("IRN", "364", "Iran", "Iran", ["iran", "iranien", "iranienne", "teheran", "republique islamique"], 90, 400, 8, 610, 0, 45, "east", ["OCS", "BRICS"], 1, [("Téhéran", 35.69, 51.39), ("Ispahan", 32.65, 51.67), ("Bandar Abbas", 27.18, 56.27)]),
    _c("ISR", "376", "Israël", "Israel", ["israel", "israelien", "israelienne", "tel aviv", "jerusalem"], 9.9, 540, 46.5, 170, 2, 50, "west", [], 1, [("Jérusalem", 31.77, 35.21), ("Tel Aviv", 32.09, 34.78), ("Haïfa", 32.79, 34.99)]),
    _c("SAU", "682", "Arabie saoudite", "Saudi Arabia", ["arabie saoudite", "saoudien", "riyad"], 36, 1100, 80, 257, 0, 68, "swing", ["CCG"], 1, [("Riyad", 24.71, 46.68), ("Djeddah", 21.49, 39.19), ("Dammam", 26.43, 50.10)]),
    _c("ARE", "784", "Émirats arabes unis", "United Arab Emirates", ["emirats", "emirati", "abou dabi", "dubai"], 10, 540, 23, 63, 0, 78, "swing", ["CCG", "BRICS"], 1, [("Abou Dabi", 24.45, 54.38), ("Dubaï", 25.20, 55.27)]),
    _c("QAT", "634", "Qatar", "Qatar", ["qatar", "qatari", "doha"], 2.7, 220, 15, 17, 0, 80, "swing", ["CCG"], 0, [("Doha", 25.29, 51.53)]),
    _c("TUR", "792", "Turquie", "Turkey", ["turquie", "turc", "turque", "ankara"], 85, 1320, 25, 355, 0, 52, "swing", ["OTAN"], 2, [("Ankara", 39.93, 32.86), ("Istanbul", 41.01, 28.98), ("Izmir", 38.42, 27.14)]),
    _c("EGY", "818", "Égypte", "Egypt", ["egypte", "egyptien", "le caire"], 113, 390, 5, 440, 0, 50, "swing", ["BRICS"], 1, [("Le Caire", 30.04, 31.24), ("Alexandrie", 31.20, 29.92), ("Port-Saïd", 31.27, 32.30)]),
    _c("SYR", "760", "Syrie", "Syria", ["syrie", "syrien", "damas"], 23, 10, 2, 170, 0, 25, "swing", [], 0, [("Damas", 33.51, 36.28), ("Alep", 36.20, 37.13), ("Lattaquié", 35.52, 35.78)]),
    _c("IRQ", "368", "Irak", "Iraq", ["irak", "iraq", "irakien", "bagdad"], 46, 265, 8, 193, 0, 38, "swing", [], 0, [("Bagdad", 33.31, 44.36), ("Bassorah", 30.51, 47.78), ("Erbil", 36.19, 44.01)]),
    _c("UKR", "804", "Ukraine", "Ukraine", ["ukraine", "ukrainien", "ukrainienne", "kiev", "kyiv"], 37, 190, 65, 900, 0, 45, "west", [], 1, [("Kyiv", 50.45, 30.52), ("Kharkiv", 49.99, 36.23), ("Odessa", 46.48, 30.72)]),
    _c("BLR", "112", "Biélorussie", "Belarus", ["bielorussie", "belarus", "minsk"], 9.2, 72, 1.3, 48, 0, 55, "east", ["OTSC", "OCS"], 0, [("Minsk", 53.90, 27.57), ("Brest", 52.10, 23.69)]),
    _c("POL", "616", "Pologne", "Poland", ["pologne", "polonais", "varsovie"], 37, 860, 38, 216, 0, 70, "west", ["OTAN", "UE"], 1, [("Varsovie", 52.23, 21.01), ("Cracovie", 50.06, 19.94), ("Gdańsk", 54.35, 18.65)]),
    _c("DEU", "276", "Allemagne", "Germany", ["allemagne", "allemand", "allemande", "berlin"], 84, 4700, 88, 181, 0, 72, "west", ["OTAN", "UE"], 1, [("Berlin", 52.52, 13.40), ("Hambourg", 53.55, 9.99), ("Munich", 48.14, 11.58)]),
    _c("FRA", "250", "France", "France", ["france", "francais", "francaise", "paris"], 68, 3160, 64.7, 203, 1, 60, "west", ["OTAN", "UE"], 2, [("Paris", 48.86, 2.35), ("Marseille", 43.30, 5.37), ("Lyon", 45.76, 4.84), ("Brest", 48.39, -4.49), ("Ajaccio", 41.93, 8.74)]),
    _c("GBR", "826", "Royaume-Uni", "United Kingdom", ["royaume-uni", "royaume uni", "britannique", "angleterre", "londres", "uk"], 68, 3600, 82, 141, 1, 68, "west", ["OTAN", "AUKUS"], 2, [("Londres", 51.51, -0.13), ("Glasgow", 55.86, -4.25), ("Portsmouth", 50.82, -1.09)]),
    _c("ITA", "380", "Italie", "Italy", ["italie", "italien", "italienne", "rome"], 59, 2370, 38, 161, 0, 62, "west", ["OTAN", "UE"], 2, [("Rome", 41.90, 12.50), ("Milan", 45.46, 9.19), ("Naples", 40.85, 14.27)]),
    _c("ESP", "724", "Espagne", "Spain", ["espagne", "espagnol", "madrid"], 48, 1730, 24.6, 122, 0, 66, "west", ["OTAN", "UE"], 1, [("Madrid", 40.42, -3.70), ("Barcelone", 41.39, 2.17), ("Séville", 37.39, -5.98)]),
    _c("NLD", "528", "Pays-Bas", "Netherlands", ["pays-bas", "neerlandais", "hollande", "amsterdam"], 17.9, 1230, 22.9, 34, 0, 74, "west", ["OTAN", "UE"], 1, [("Amsterdam", 52.37, 4.90), ("Rotterdam", 51.92, 4.48)]),
    _c("BEL", "056", "Belgique", "Belgium", ["belgique", "belge", "bruxelles"], 11.8, 650, 7.8, 23, 0, 70, "west", ["OTAN", "UE"], 0, [("Bruxelles", 50.85, 4.35), ("Anvers", 51.22, 4.40)]),
    _c("SWE", "752", "Suède", "Sweden", ["suede", "suedois", "stockholm"], 10.5, 610, 12, 24, 0, 78, "west", ["OTAN", "UE"], 1, [("Stockholm", 59.33, 18.07), ("Göteborg", 57.71, 11.97)]),
    _c("FIN", "246", "Finlande", "Finland", ["finlande", "finlandais", "helsinki"], 5.6, 300, 7.3, 24, 0, 82, "west", ["OTAN", "UE"], 1, [("Helsinki", 60.17, 24.94), ("Tampere", 61.50, 23.79)]),
    _c("NOR", "578", "Norvège", "Norway", ["norvege", "norvegien", "oslo"], 5.5, 485, 9.0, 25, 0, 84, "west", ["OTAN"], 1, [("Oslo", 59.91, 10.75), ("Bergen", 60.39, 5.32)]),
    _c("DNK", "208", "Danemark", "Denmark", ["danemark", "danois", "copenhague", "groenland"], 5.9, 400, 9.9, 15, 0, 84, "west", ["OTAN", "UE"], 1, [("Copenhague", 55.68, 12.57), ("Aarhus", 56.16, 10.20)]),
    _c("GRC", "300", "Grèce", "Greece", ["grece", "grec", "athenes"], 10.4, 250, 8.1, 132, 0, 62, "west", ["OTAN", "UE"], 1, [("Athènes", 37.98, 23.73), ("Thessalonique", 40.64, 22.94)]),
    _c("ROU", "642", "Roumanie", "Romania", ["roumanie", "roumain", "bucarest"], 19, 380, 8.4, 70, 0, 62, "west", ["OTAN", "UE"], 0, [("Bucarest", 44.43, 26.10), ("Constanța", 44.18, 28.63)]),
    _c("HUN", "348", "Hongrie", "Hungary", ["hongrie", "hongrois", "budapest"], 9.6, 220, 4.5, 32, 0, 64, "west", ["OTAN", "UE"], 0, [("Budapest", 47.50, 19.04)]),
    _c("SRB", "688", "Serbie", "Serbia", ["serbie", "serbe", "belgrade"], 6.6, 82, 2.3, 28, 0, 58, "swing", [], 0, [("Belgrade", 44.79, 20.45), ("Novi Sad", 45.27, 19.83)]),
    _c("EST", "233", "Estonie", "Estonia", ["estonie", "estonien", "tallinn"], 1.4, 42, 1.4, 7, 0, 78, "west", ["OTAN", "UE"], 0, [("Tallinn", 59.44, 24.75), ("Narva", 59.38, 28.19)]),
    _c("LVA", "428", "Lettonie", "Latvia", ["lettonie", "letton", "riga"], 1.9, 43, 1.3, 7, 0, 74, "west", ["OTAN", "UE"], 0, [("Riga", 56.95, 24.11)]),
    _c("LTU", "440", "Lituanie", "Lithuania", ["lituanie", "lituanien", "vilnius", "suwalki"], 2.9, 80, 2.2, 23, 0, 76, "west", ["OTAN", "UE"], 0, [("Vilnius", 54.69, 25.28), ("Klaipėda", 55.70, 21.14)]),
    _c("MDA", "498", "Moldavie", "Moldova", ["moldavie", "moldave", "chisinau", "transnistrie"], 2.5, 16, 0.1, 6, 0, 50, "west", [], 0, [("Chișinău", 47.01, 28.86), ("Tiraspol", 46.84, 29.63)]),
    _c("CAN", "124", "Canada", "Canada", ["canada", "canadien", "ottawa"], 40, 2240, 29.3, 63, 0, 76, "west", ["OTAN"], 1, [("Ottawa", 45.42, -75.70), ("Toronto", 43.65, -79.38), ("Vancouver", 49.28, -123.12)]),
    _c("MEX", "484", "Mexique", "Mexico", ["mexique", "mexicain", "mexico"], 130, 1850, 16.7, 216, 0, 50, "swing", [], 1, [("Mexico", 19.43, -99.13), ("Monterrey", 25.69, -100.32), ("Tijuana", 32.51, -117.04)]),
    _c("BRA", "076", "Brésil", "Brazil", ["bresil", "bresilien", "brasilia"], 216, 2170, 22.9, 366, 0, 55, "swing", ["BRICS"], 1, [("Brasília", -15.79, -47.88), ("São Paulo", -23.55, -46.63), ("Rio de Janeiro", -22.91, -43.17)]),
    _c("ARG", "032", "Argentine", "Argentina", ["argentine", "argentin", "buenos aires", "malouines"], 46, 630, 3.4, 72, 0, 50, "swing", [], 1, [("Buenos Aires", -34.60, -58.38), ("Córdoba", -31.42, -64.18), ("Ushuaïa", -54.80, -68.30)]),
    _c("VEN", "862", "Venezuela", "Venezuela", ["venezuela", "venezuelien", "caracas"], 28, 100, 1, 123, 0, 30, "east", [], 1, [("Caracas", 10.48, -66.90), ("Maracaibo", 10.65, -71.64)]),
    _c("COL", "170", "Colombie", "Colombia", ["colombie", "colombien", "bogota"], 52, 420, 15, 293, 0, 48, "swing", [], 1, [("Bogota", 4.71, -74.07), ("Medellín", 6.24, -75.58), ("Cúcuta", 7.89, -72.51)]),
    _c("CUB", "192", "Cuba", "Cuba", ["cuba", "cubain", "la havane"], 11, 100, 0.5, 49, 0, 42, "east", [], 0, [("La Havane", 23.11, -82.37), ("Santiago de Cuba", 20.02, -75.82)]),
    _c("CHL", "152", "Chili", "Chile", ["chili", "chilien", "santiago"], 19.6, 330, 5.6, 68, 0, 62, "swing", [], 1, [("Santiago", -33.45, -70.67), ("Valparaíso", -33.05, -71.62)]),
    _c("AUS", "036", "Australie", "Australia", ["australie", "australien", "canberra"], 27, 1800, 33.8, 58, 0, 80, "west", ["QUAD", "AUKUS"], 2, [("Canberra", -35.28, 149.13), ("Sydney", -33.87, 151.21), ("Darwin", -12.46, 130.84)]),
    _c("IDN", "360", "Indonésie", "Indonesia", ["indonesie", "indonesien", "jakarta"], 278, 1400, 9.6, 400, 0, 62, "swing", ["BRICS"], 1, [("Jakarta", -6.21, 106.85), ("Surabaya", -7.25, 112.75)]),
    _c("PHL", "608", "Philippines", "Philippines", ["philippines", "philippin", "manille"], 115, 460, 6.1, 146, 0, 55, "west", [], 1, [("Manille", 14.60, 120.98), ("Cebu", 10.32, 123.89), ("Puerto Princesa", 9.74, 118.74)]),
    _c("VNM", "704", "Viêt Nam", "Vietnam", ["vietnam", "viet nam", "vietnamien", "hanoi"], 100, 470, 7.7, 450, 0, 70, "swing", [], 1, [("Hanoï", 21.03, 105.85), ("Hô Chi Minh-Ville", 10.82, 106.63), ("Da Nang", 16.05, 108.22)]),
    _c("THA", "764", "Thaïlande", "Thailand", ["thailande", "thailandais", "bangkok"], 72, 530, 5.8, 360, 0, 55, "swing", [], 1, [("Bangkok", 13.76, 100.50), ("Chiang Mai", 18.79, 98.98)]),
    _c("SGP", "702", "Singapour", "Singapore", ["singapour", "singapourien"], 6, 530, 13.2, 51, 0, 88, "swing", [], 1, [("Singapour", 1.35, 103.82)]),
    _c("MYS", "458", "Malaisie", "Malaysia", ["malaisie", "malaisien", "kuala lumpur"], 34, 420, 4.2, 113, 0, 64, "swing", [], 1, [("Kuala Lumpur", 3.14, 101.69), ("Kota Kinabalu", 5.98, 116.07)]),
    _c("ZAF", "710", "Afrique du Sud", "South Africa", ["afrique du sud", "sud-africain", "pretoria"], 62, 400, 2.8, 74, 0, 50, "swing", ["BRICS"], 1, [("Pretoria", -25.75, 28.19), ("Johannesburg", -26.20, 28.05), ("Le Cap", -33.92, 18.42)]),
    _c("NGA", "566", "Nigeria", "Nigeria", ["nigeria", "nigerian", "abuja"], 225, 250, 3.2, 143, 0, 35, "swing", [], 0, [("Abuja", 9.08, 7.40), ("Lagos", 6.52, 3.38), ("Maiduguri", 11.83, 13.15)]),
    _c("ETH", "231", "Éthiopie", "Ethiopia", ["ethiopie", "ethiopien", "addis-abeba"], 127, 205, 1.1, 160, 0, 30, "swing", ["BRICS"], 0, [("Addis-Abeba", 9.03, 38.74), ("Mekele", 13.50, 39.47)]),
    _c("DZA", "012", "Algérie", "Algeria", ["algerie", "algerien", "alger"], 46, 260, 21.8, 139, 0, 52, "swing", [], 1, [("Alger", 36.75, 3.06), ("Oran", 35.70, -0.63)]),
    _c("MAR", "504", "Maroc", "Morocco", ["maroc", "marocain", "rabat"], 37, 155, 5.5, 196, 0, 62, "swing", [], 1, [("Rabat", 34.02, -6.84), ("Casablanca", 33.57, -7.59), ("Laâyoune", 27.15, -13.20)]),
    _c("LBY", "434", "Libye", "Libya", ["libye", "libyen", "tripoli"], 7, 45, 3, 50, 0, 22, "swing", [], 0, [("Tripoli", 32.89, 13.19), ("Benghazi", 32.12, 20.07)]),
    _c("AZE", "031", "Azerbaïdjan", "Azerbaijan", ["azerbaidjan", "azeri", "bakou"], 10, 75, 3.8, 64, 0, 60, "swing", [], 0, [("Bakou", 40.41, 49.87), ("Gandja", 40.68, 46.36)]),
    _c("ARM", "051", "Arménie", "Armenia", ["armenie", "armenien", "erevan"], 3, 25, 1.5, 42, 0, 50, "swing", ["OTSC"], 0, [("Erevan", 40.18, 44.51), ("Gyumri", 40.79, 43.85)]),
    _c("GEO", "268", "Géorgie", "Georgia", ["georgie", "georgien", "tbilissi"], 3.7, 33, 0.5, 21, 0, 50, "swing", [], 0, [("Tbilissi", 41.72, 44.78), ("Batoumi", 41.64, 41.64)]),
    _c("KAZ", "398", "Kazakhstan", "Kazakhstan", ["kazakhstan", "kazakh", "astana"], 20, 290, 1.6, 39, 0, 60, "swing", ["OTSC", "OCS"], 0, [("Astana", 51.17, 71.45), ("Almaty", 43.24, 76.89)]),
    _c("AFG", "004", "Afghanistan", "Afghanistan", ["afghanistan", "afghan", "kaboul"], 41, 17, 1, 150, 0, 30, "swing", [], 0, [("Kaboul", 34.56, 69.21), ("Kandahar", 31.63, 65.71)]),
    _c("LBN", "422", "Liban", "Lebanon", ["liban", "libanais", "beyrouth"], 5.5, 18, 0.6, 60, 0, 25, "swing", [], 0, [("Beyrouth", 33.89, 35.50), ("Tyr", 33.27, 35.20)]),
    _c("JOR", "400", "Jordanie", "Jordan", ["jordanie", "jordanien", "amman"], 11.3, 53, 2.2, 100, 0, 60, "west", [], 0, [("Amman", 31.95, 35.93), ("Aqaba", 29.53, 35.01)]),
    _c("YEM", "887", "Yémen", "Yemen", ["yemen", "yemenite", "sanaa", "houthis", "houthi"], 34, 20, 1, 40, 0, 15, "swing", [], 0, [("Sanaa", 15.37, 44.19), ("Aden", 12.79, 45.04), ("Hodeïda", 14.80, 42.95)]),
    _c("CHE", "756", "Suisse", "Switzerland", ["suisse", "helvetique", "berne", "geneve"], 8.9, 940, 6.3, 20, 0, 90, "swing", [], 0, [("Berne", 46.95, 7.45), ("Genève", 46.20, 6.14)]),
    _c("SDN", "729", "Soudan", "Sudan", ["soudan", "soudanais", "khartoum"], 48, 30, 1, 100, 0, 10, "swing", [], 0, [("Khartoum", 15.50, 32.56), ("Port-Soudan", 19.62, 37.22)]),
    _c("NZL", "554", "Nouvelle-Zélande", "New Zealand", ["nouvelle-zelande", "neo-zelandais", "wellington"], 5.2, 250, 3.2, 9, 0, 85, "west", [], 1, [("Wellington", -41.29, 174.78), ("Auckland", -36.85, 174.76)]),
    _c("PRT", "620", "Portugal", "Portugal", ["portugal", "portugais", "lisbonne"], 10.4, 300, 4.2, 26, 0, 74, "west", ["OTAN", "UE"], 1, [("Lisbonne", 38.72, -9.14), ("Porto", 41.15, -8.61)]),
]

BY_ISO3: dict[str, CountryRef] = {c.iso3: c for c in COUNTRIES}

# Rivalités et conflits connus (tension initiale estimée, état de guerre).
KNOWN_TENSIONS: dict[tuple[str, str], tuple[float, bool]] = {
    ("CHN", "TWN"): (82, False), ("CHN", "USA"): (62, False), ("RUS", "UKR"): (95, True),
    ("IRN", "ISR"): (90, False), ("IRN", "USA"): (75, False), ("IND", "PAK"): (72, False),
    ("KOR", "PRK"): (78, False), ("RUS", "USA"): (68, False), ("CHN", "JPN"): (55, False),
    ("CHN", "PHL"): (60, False), ("ARM", "AZE"): (55, False), ("IRN", "SAU"): (45, False),
    ("GRC", "TUR"): (38, False), ("USA", "VEN"): (65, False), ("CUB", "USA"): (55, False),
    ("DZA", "MAR"): (55, False), ("ISR", "LBN"): (75, False), ("EGY", "ETH"): (50, False),
    ("POL", "RUS"): (65, False), ("GBR", "RUS"): (60, False), ("FIN", "RUS"): (52, False),
    ("CHN", "IND"): (55, False), ("CHN", "VNM"): (45, False), ("JPN", "PRK"): (65, False),
    ("PRK", "USA"): (75, False), ("EST", "RUS"): (60, False), ("LTU", "RUS"): (60, False),
    ("LVA", "RUS"): (58, False), ("FRA", "RUS"): (52, False), ("DEU", "RUS"): (55, False),
    ("RUS", "MDA"): (50, False), ("GEO", "RUS"): (50, False), ("ISR", "YEM"): (70, False),
    ("USA", "YEM"): (60, False), ("ARG", "GBR"): (30, False), ("AUS", "CHN"): (45, False),
    ("CHN", "KOR"): (35, False), ("IRN", "ARE"): (35, False), ("AFG", "PAK"): (50, False),
    ("COL", "VEN"): (40, False),
}

BILATERAL_ALLIANCES: set[tuple[str, str]] = {
    ("JPN", "USA"), ("KOR", "USA"), ("PHL", "USA"), ("AUS", "USA"), ("CHN", "PRK"),
    ("PRK", "RUS"), ("ISR", "USA"), ("NZL", "AUS"),
}

# Théâtres nommés pour des paires connues : nom, (lat, lon), domaine, maritime.
KNOWN_THEATRES: dict[frozenset[str], list[tuple[str, float, float, str]]] = {
    frozenset({"CHN", "TWN"}): [("Détroit de Taïwan", 24.3, 119.6, "maritime"), ("Îles Kinmen", 24.45, 118.38, "military")],
    frozenset({"IRN", "USA"}): [("Détroit d'Ormuz", 26.57, 56.25, "maritime"), ("Golfe Persique", 27.5, 51.5, "maritime")],
    frozenset({"IRN", "ISR"}): [("Front Levant", 33.3, 35.6, "military"), ("Espace aérien irakien", 33.0, 42.0, "military")],
    frozenset({"RUS", "UKR"}): [("Front du Donbass", 48.0, 37.8, "military"), ("Mer Noire", 44.0, 33.5, "maritime")],
    frozenset({"IND", "PAK"}): [("Ligne de contrôle (Cachemire)", 34.2, 74.3, "military"), ("Mer d'Arabie", 22.0, 65.0, "maritime")],
    frozenset({"KOR", "PRK"}): [("Zone démilitarisée", 38.0, 127.0, "military"), ("Mer Jaune", 37.5, 124.5, "maritime")],
    frozenset({"CHN", "PHL"}): [("Mer de Chine méridionale", 12.0, 115.0, "maritime"), ("Second Thomas Shoal", 9.73, 115.87, "maritime")],
    frozenset({"CHN", "USA"}): [("Pacifique occidental", 20.0, 130.0, "maritime"), ("Détroit de Taïwan", 24.3, 119.6, "maritime")],
    frozenset({"ARM", "AZE"}): [("Corridor du Syunik", 39.2, 46.4, "military")],
    frozenset({"USA", "VEN"}): [("Mer des Caraïbes", 13.0, -68.0, "maritime")],
    frozenset({"DZA", "MAR"}): [("Sahara occidental", 25.0, -13.0, "military")],
    frozenset({"EGY", "ETH"}): [("Bassin du Nil (GERD)", 11.21, 35.09, "economic")],
    frozenset({"POL", "RUS"}): [("Corridor de Suwałki", 54.1, 23.3, "military"), ("Kaliningrad", 54.7, 20.5, "military")],
    frozenset({"LTU", "RUS"}): [("Corridor de Suwałki", 54.1, 23.3, "military")],
    frozenset({"ISR", "LBN"}): [("Ligne bleue", 33.1, 35.4, "military")],
    frozenset({"ARG", "GBR"}): [("Îles Malouines", -51.7, -59.5, "maritime")],
}


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    for ch in "’'–—-,.;:!?()\"«»/":
        text = text.replace(ch, " ")
    return " " + " ".join(text.split()) + " "


def detect_countries(prompt: str) -> list[CountryRef]:
    """Repère les États cités dans une demande libre, dans l'ordre d'apparition."""
    norm = normalize(prompt)
    found: list[tuple[int, CountryRef]] = []
    for c in COUNTRIES:
        best = None
        for alias in {c.fr, c.en, *c.aliases}:
            token = normalize(alias)
            if len(token.strip()) < 2:
                continue
            idx = norm.find(token)
            if idx >= 0 and (best is None or idx < best):
                best = idx
        if best is not None:
            found.append((best, c))
    found.sort(key=lambda item: item[0])
    seen: set[str] = set()
    result = []
    for _, c in found:
        if c.iso3 not in seen:
            seen.add(c.iso3)
            result.append(c)
    return result


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    import math

    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def nearest_countries(refs: list[CountryRef], exclude: set[str], k: int) -> list[CountryRef]:
    anchors = [(r.cities[0][1], r.cities[0][2]) for r in refs if r.cities]
    scored = []
    for c in COUNTRIES:
        if c.iso3 in exclude or not c.cities:
            continue
        d = min(haversine_km(anchor, (c.cities[0][1], c.cities[0][2])) for anchor in anchors)
        scored.append((d, c))
    scored.sort(key=lambda item: item[0])
    return [c for d, c in scored[:k] if d < 3500]
