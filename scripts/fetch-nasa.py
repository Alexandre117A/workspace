#!/usr/bin/env python3
"""Récolte des photographies de la NASA (catalogue public https://images.nasa.gov) pour le fond défilant.

Thèmes choisis pour leur lien avec la géopolitique : centres de commandement (salles de contrôle), aviation
d'essai et drones civils de la NASA, navires de récupération, détroits et canaux stratégiques vus de l'espace,
villes et frontières de nuit, Arctique, antennes et radars, lancements, diplomatie spatiale (Apollo-Soyuz).
Seules les images des centres NASA sont gardées ; celles qui mentionnent un tiers (copyright, ©) sont écartées.
Usage : npm run photos:nasa            (jusqu'à 8 images par thème)
        npm run photos:nasa -- 14      (14 images par thème)
"""
import json
import re
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "apps" / "client" / "assets" / "chronique"
PER = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8
UA = {"User-Agent": "GEONEX-dev/0.1 (outil local de developpement; images du domaine public NASA)"}
CENTERS = {"JSC", "MSFC", "KSC", "GSFC", "AFRC", "DFRC", "GRC", "LARC", "ARC", "JPL", "HQ", "SSC", "NASA"}

THEMES = {
    "commandement": ["Mission Control Center Houston flight controllers", "launch control center firing room", "Apollo mission operations control room"],
    "aviation": ["SR-71 Blackbird research aircraft", "X-15 rocket plane", "B-52 research aircraft", "F-15 research aircraft flight", "supersonic aircraft sonic boom", "Global Hawk unmanned aircraft", "Ikhana unmanned aircraft system", "helicopter research flight"],
    "marine": ["Apollo recovery ship aircraft carrier", "Navy recovery ship splashdown", "ship at sea recovery capsule"],
    "espace": ["Space Shuttle landing", "rocket launch Cape Canaveral", "International Space Station crew", "Apollo-Soyuz handshake", "satellite deployment"],
    "renseignement": ["Deep Space Network antenna", "radar antenna dish", "radio telescope antenna array"],
    "detroits": ["Strait of Hormuz astronaut photograph", "Suez Canal astronaut photograph", "Panama Canal astronaut photograph", "Strait of Gibraltar astronaut photograph", "Bosphorus Istanbul astronaut photograph", "Persian Gulf astronaut photograph", "Black Sea astronaut photograph", "Taiwan Strait astronaut photograph", "South China Sea astronaut photograph", "Baltic Sea astronaut photograph"],
    "villes": ["Moscow astronaut photograph", "Beijing astronaut photograph", "Washington D.C. astronaut photograph", "Paris astronaut photograph night", "London astronaut photograph night", "Tokyo astronaut photograph night", "New Delhi astronaut photograph", "Tehran astronaut photograph", "Cairo Nile astronaut photograph", "Korean Peninsula night lights", "Europe city lights at night", "Middle East city lights at night"],
    "arctique": ["Arctic sea ice astronaut photograph", "Antarctica ice shelf", "Greenland ice sheet"],
}


def tidy(title: str, desc: str) -> str:
    t = re.sub(r"\s+", " ", title or "").strip()
    if len(t) < 6 or re.fullmatch(r"[\w\-~]*\d[\w\-~]*", t.replace(" ", "")):
        t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", desc or "")).strip().split(". ")[0]
    return t[:80].rstrip(" .,;:") or "Archive NASA"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    cf = OUT / "credits.json"
    credits = json.loads(cf.read_text(encoding="utf-8")) if cf.exists() else []
    have = {c["file"] for c in credits}
    added = 0
    with httpx.Client(headers=UA, timeout=60, follow_redirects=True) as client:
        for theme, queries in THEMES.items():
            for q in queries:
                r = client.get("https://images-api.nasa.gov/search", params={"q": q, "media_type": "image", "page_size": 40})
                if r.status_code != 200:
                    print(f"{q}: {r.status_code}"); time.sleep(2); continue
                kept = 0
                for it in r.json()["collection"]["items"]:
                    if kept >= PER:
                        break
                    d = it["data"][0]
                    blob = f"{d.get('description','')} {d.get('secondary_creator','')} {d.get('title','')}".lower()
                    if d.get("center") not in CENTERS or "copyright" in blob or "©" in blob or "courtesy" in blob:
                        continue
                    nid = d["nasa_id"]
                    fname = f"nasa-{re.sub(r'[^A-Za-z0-9_-]', '', nid)}.jpg"
                    if fname in have:
                        kept += 1; continue
                    href = it["links"][0]["href"] if it.get("links") else None
                    if not href:
                        continue
                    img = client.get(re.sub(r"~(thumb|small)\.", "~medium.", href))
                    if img.status_code != 200 or not img.headers.get("content-type", "").startswith("image/") or len(img.content) < 25_000:
                        continue
                    (OUT / fname).write_bytes(img.content)
                    credits.append({"file": fname, "label": tidy(d.get("title", ""), d.get("description", "")), "theme": theme, "year": (d.get("date_created") or "")[:4],
                                    "credit": f"NASA / {d.get('center')}", "license": "Domaine public (NASA)", "source": f"https://images.nasa.gov/details/{nid}"})
                    have.add(fname); kept += 1; added += 1
                    time.sleep(0.15)
                cf.write_text(json.dumps(credits, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"[{theme}] {q}: +{kept} (total {len(credits)})", flush=True)
    write_md(credits)
    print(f"Terminé : {added} image(s) ajoutée(s), {len(credits)} au total.")
    return 0


def write_md(credits: list) -> None:
    md = ["# Crédits des images", "", "Photographies du fond défilant. NASA : https://images.nasa.gov (généralement libres d'usage ; voir https://www.nasa.gov/nasa-brand-center/images-and-media/). Wikimedia Commons : licences libres, attribution ci-dessous.", "",
          "| Fichier | Légende | Auteur / crédit | Licence | Source |", "|---|---|---|---|---|"]
    for c in credits:
        md.append(f"| {c['file']} | {str(c.get('label', '')).replace('|', '/')} | {str(c.get('credit', '')).replace('|', '/')} | {c.get('license', 'Domaine public (NASA)')} | {c.get('source', '')} |")
    (ROOT / "docs" / "CREDITS.md").write_text("\n".join(md) + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
