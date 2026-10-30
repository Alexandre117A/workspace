#!/usr/bin/env python3
"""Télécharge des photographies libres de droits depuis Wikimedia Commons vers apps/client/assets/chronique/.

PRÉREQUIS : définir GEONEX_RESEARCH_CONTACT dans .env (une adresse email ou l'adresse de votre dépôt/site).
Wikimedia l'exige dans l'identifiant du client (sinon il refuse les requêtes) ; elle lui est transmise à chaque requête.

Règles : seules les images sous licence libre explicite sont gardées (domaine public, CC0, CC BY, CC BY-SA) ;
chaque image est créditée (auteur, licence, page source) dans credits.json et docs/CREDITS.md.
Usage : npm run photos            (toutes les requêtes)
        npm run photos -- 3       (3 images par requête au lieu de 4)
"""
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "apps" / "client" / "assets" / "chronique"
PER_QUERY = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 4
THEME = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("theme=")), None)  # ex. « theme=cartes » : un seul thème
ALLOWED = ("public domain", "cc0", "cc by", "cc-by", "pd-", "pdm", "attribution")
REFUSED = ("nc", "nd", "non-free", "fair use", "copyrighted")

# (requête, thème, légende affichée)
QUERIES = [
    # Dirigeants (portraits officiels et rencontres)
    ("Donald Trump official portrait", "dirigeants", "Donald Trump"), ("Vladimir Putin Kremlin 2024", "dirigeants", "Vladimir Poutine"),
    ("Xi Jinping 2023", "dirigeants", "Xi Jinping"), ("Emmanuel Macron official portrait", "dirigeants", "Emmanuel Macron"),
    ("Keir Starmer 2024", "dirigeants", "Keir Starmer"), ("Friedrich Merz 2025", "dirigeants", "Friedrich Merz"),
    ("Giorgia Meloni 2023", "dirigeants", "Giorgia Meloni"), ("Volodymyr Zelensky 2024", "dirigeants", "Volodymyr Zelensky"),
    ("Narendra Modi 2023", "dirigeants", "Narendra Modi"), ("Recep Tayyip Erdoğan 2023", "dirigeants", "Recep Tayyip Erdoğan"),
    ("Luiz Inácio Lula da Silva 2023", "dirigeants", "Lula"), ("Ursula von der Leyen 2023", "dirigeants", "Ursula von der Leyen"),
    ("António Guterres 2023", "dirigeants", "António Guterres"), ("Joe Biden official portrait", "dirigeants", "Joe Biden"),
    ("Angela Merkel 2019", "dirigeants", "Angela Merkel"), ("Mikhail Gorbachev Ronald Reagan", "dirigeants", "Gorbatchev et Reagan"),
    # Sommets et diplomatie
    ("G20 summit leaders family photo", "diplomatie", "Sommet du G20"), ("NATO summit leaders", "diplomatie", "Sommet de l'OTAN"),
    ("United Nations Security Council meeting", "diplomatie", "Conseil de sécurité de l'ONU"), ("Yalta Conference 1945 Churchill Roosevelt Stalin", "histoire", "Conférence de Yalta, 1945"),
    ("Camp David Accords 1978", "histoire", "Accords de Camp David, 1978"), ("Treaty of Versailles signing 1919", "histoire", "Traité de Versailles, 1919"),
    # Événements historiques
    ("Berlin Airlift 1948 Tempelhof", "histoire", "Pont aérien de Berlin, 1948"), ("Fall of the Berlin Wall 1989", "histoire", "Chute du mur de Berlin, 1989"),
    ("Cuban Missile Crisis reconnaissance photograph 1962", "histoire", "Crise des missiles de Cuba, 1962"), ("Suez Crisis 1956", "histoire", "Crise de Suez, 1956"),
    ("D-Day Normandy landings 1944", "histoire", "Débarquement de Normandie, 1944"), ("Cold War Checkpoint Charlie", "histoire", "Checkpoint Charlie"),
    # Équipements, renseignement, commandement
    ("nuclear submarine surfacing", "marine", "Sous-marin nucléaire"), ("aircraft carrier flight deck", "marine", "Porte-avions"),
    ("naval destroyer at sea", "marine", "Destroyer en mer"), ("MQ-9 Reaper drone", "aviation", "Drone MQ-9 Reaper"),
    ("B-2 Spirit stealth bomber", "aviation", "Bombardier furtif"), ("F-35 Lightning II fighter", "aviation", "Chasseur F-35"),
    ("Leopard 2 main battle tank", "terre", "Char de combat"), ("military command center operations room", "commandement", "Centre de commandement"),
    ("Situation Room White House", "commandement", "Salle de crise"), ("Enigma machine cipher", "renseignement", "Machine Enigma"),
    ("radar station antenna", "renseignement", "Station radar"), ("satellite ground station", "renseignement", "Station au sol"),
    ("container ship Strait of Hormuz", "maritime", "Détroit d'Ormuz"), ("oil tanker at sea", "maritime", "Pétrolier"),
    # Cartes anciennes (atlas, cartes marines, cartes de campagne) : fond cartographique de la Chronique
    ("Ortelius Theatrum Orbis Terrarum map Europe", "cartes", "Atlas d'Ortelius"), ("Mercator Atlas Europe map 1595", "cartes", "Carte de l'Europe, Mercator"),
    ("Blaeu Atlas Maior map France", "cartes", "Atlas Blaeu"), ("Carte de Cassini France", "cartes", "Carte de Cassini"),
    ("portolan chart Mediterranean", "cartes", "Carte marine de la Méditerranée"), ("antique map Russia 18th century", "cartes", "Carte ancienne de la Russie"),
    ("Napoleonic Europe map 1812", "cartes", "Europe napoléonienne"), ("map of Europe 1914 political", "cartes", "Europe en 1914"),
    ("Cold War map NATO Warsaw Pact", "cartes", "Europe de la guerre froide"), ("old map Black Sea Ottoman Empire", "cartes", "Carte ancienne de la mer Noire"),
]


def load_env() -> None:
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$", line)
            if m and not line.strip().startswith("#"):
                os.environ.setdefault(m.group(1), m.group(2).strip("\"'"))


def licence_ok(meta: dict) -> tuple[bool, str]:
    name = (meta.get("LicenseShortName", {}).get("value") or "").lower()
    if not name or any(x in name.split() or x in name for x in ("-nc", "-nd", "non-free", "fair use")):
        return False, name
    if meta.get("NonFree", {}).get("value") == "true":
        return False, name
    return any(a in name for a in ALLOWED), name


def strip(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html or "")).strip()


def main() -> int:
    load_env()
    contact = os.environ.get("GEONEX_RESEARCH_CONTACT", "").strip()
    if not contact:
        print("GEONEX_RESEARCH_CONTACT n'est pas défini dans .env : Wikimedia exige un contact (email ou URL). Rien n'a été téléchargé.")
        return 1
    ua = {"User-Agent": f"GEONEX/0.1 ({contact}) python-httpx"}
    OUT.mkdir(parents=True, exist_ok=True)
    credits_file = OUT / "credits.json"
    credits = json.loads(credits_file.read_text(encoding="utf-8")) if credits_file.exists() else []
    have = {c["file"] for c in credits}
    added = 0
    with httpx.Client(headers=ua, timeout=60, follow_redirects=True) as client:
        for q, theme, label in [x for x in QUERIES if not THEME or x[1] == THEME]:
            r = client.get("https://commons.wikimedia.org/w/api.php", params={
                "action": "query", "format": "json", "generator": "search", "gsrnamespace": 6, "gsrsearch": f"{q} filetype:bitmap",
                "gsrlimit": 14, "prop": "imageinfo", "iiprop": "url|extmetadata|size|mime", "iiurlwidth": 1600})
            if r.status_code == 429:
                wait = min(int(r.headers.get("retry-after", "60")), 300)
                print(f"Limite de débit : pause de {wait} s"); time.sleep(wait); continue
            if r.status_code != 200:
                print(f"{q} : refusé ({r.status_code}) — arrêt"); return 1
            pages = sorted((r.json().get("query", {}).get("pages", {})).values(), key=lambda p: p.get("index", 0))
            kept = 0
            for p in pages:
                if kept >= PER_QUERY:
                    break
                info = (p.get("imageinfo") or [{}])[0]
                meta = info.get("extmetadata", {})
                ok, lic = licence_ok(meta)
                if not ok or info.get("mime") not in ("image/jpeg", "image/png") or info.get("width", 0) < 900:
                    continue
                slug = re.sub(r"[^a-z0-9]+", "-", p["title"].removeprefix("File:").rsplit(".", 1)[0].lower()).strip("-")[:60]
                fname = f"commons-{slug}.jpg"
                if fname in have:
                    kept += 1; continue
                img = client.get(info.get("thumburl") or info["url"])
                time.sleep(0.6)  # courtoisie envers le service
                if img.status_code != 200 or not img.headers.get("content-type", "").startswith("image/"):
                    continue
                (OUT / fname).write_bytes(img.content)
                credits.append({"file": fname, "label": label, "theme": theme, "year": re.sub(r"\D", "", strip(meta.get("DateTimeOriginal", {}).get("value", "")))[:4],
                                "credit": strip(meta.get("Artist", {}).get("value", "")) or "Auteur non précisé", "license": lic, "source": info.get("descriptionurl")})
                have.add(fname); kept += 1; added += 1
                print(f"+ {fname} ({len(img.content) // 1024} Ko) — {lic} — {label}")
            credits_file.write_text(json.dumps(credits, ensure_ascii=False, indent=2), encoding="utf-8")
    md = ["# Crédits des images", "", "Photographies du fond défilant. Les images Wikimedia Commons sont sous licence libre (domaine public, CC0, CC BY, CC BY-SA) : respectez l'attribution ci-dessous.", "",
          "| Fichier | Légende | Auteur / crédit | Licence | Source |", "|---|---|---|---|---|"]
    for c in credits:
        md.append(f"| {c['file']} | {c.get('label','')} | {c.get('credit','')} | {c.get('license','domaine public (NASA)')} | {c.get('source','')} |")
    md += ["", "Les images « nasa-* » proviennent du catalogue de la NASA (https://images.nasa.gov), généralement libres d'usage."]
    (ROOT / "docs" / "CREDITS.md").write_text("\n".join(md), encoding="utf-8")
    print(f"Terminé : {added} image(s) ajoutée(s), {len(credits)} au total.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
