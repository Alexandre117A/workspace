#!/usr/bin/env python3
"""Télécharge les drapeaux nationaux réels (service libre Flagpedia / flagcdn.com) vers apps/client/assets/flags/.
Les drapeaux sont des symboles officiels ; ils sont embarqués localement (aucune dépendance au service à l'exécution)."""
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "apps" / "client" / "assets" / "flags"
ISO = {
    "USA": "us", "CHN": "cn", "RUS": "ru", "TWN": "tw", "JPN": "jp", "KOR": "kr", "PRK": "kp", "IND": "in", "PAK": "pk", "IRN": "ir", "ISR": "il", "SAU": "sa",
    "ARE": "ae", "QAT": "qa", "TUR": "tr", "EGY": "eg", "SYR": "sy", "IRQ": "iq", "UKR": "ua", "BLR": "by", "POL": "pl", "DEU": "de", "FRA": "fr", "GBR": "gb",
    "ITA": "it", "ESP": "es", "NLD": "nl", "BEL": "be", "SWE": "se", "FIN": "fi", "NOR": "no", "DNK": "dk", "GRC": "gr", "ROU": "ro", "HUN": "hu", "SRB": "rs",
    "EST": "ee", "LVA": "lv", "LTU": "lt", "MDA": "md", "CAN": "ca", "MEX": "mx", "BRA": "br", "ARG": "ar", "VEN": "ve", "COL": "co", "CUB": "cu", "CHL": "cl",
    "AUS": "au", "IDN": "id", "PHL": "ph", "VNM": "vn", "THA": "th", "SGP": "sg", "MYS": "my", "ZAF": "za", "NGA": "ng", "ETH": "et", "DZA": "dz", "MAR": "ma",
    "LBY": "ly", "AZE": "az", "ARM": "am", "GEO": "ge", "KAZ": "kz", "AFG": "af", "LBN": "lb", "JOR": "jo", "YEM": "ye", "CHE": "ch", "SDN": "sd", "NZL": "nz",
    "PRT": "pt", "ONU": "un", "UE": "eu",
}
OUT.mkdir(parents=True, exist_ok=True)
ok = 0
with httpx.Client(headers={"User-Agent": "GEONEX-dev/0.1 (outil local de developpement; drapeaux nationaux)"}, timeout=30) as c:
    for iso3, iso2 in ISO.items():
        f = OUT / f"{iso3}.png"
        if f.exists():
            ok += 1; continue
        r = c.get(f"https://flagcdn.com/w320/{iso2}.png")
        if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/"):
            f.write_bytes(r.content); ok += 1
        else:
            print("échec", iso3, r.status_code)
        time.sleep(0.1)
print(f"{ok}/{len(ISO)} drapeaux disponibles")
