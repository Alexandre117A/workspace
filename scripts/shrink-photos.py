#!/usr/bin/env python3
"""Réduit les photographies de apps/client/assets/chronique/ (largeur max 1100 px, JPEG qualité 78).

Le fond ne les affiche qu'en recadrage partiel : des fichiers plus légers accélèrent le chargement, surtout en partage
public. Nécessite Pillow (pip install pillow). Idempotent : les images déjà petites ne sont pas retouchées.
Usage : npm run photos:shrink
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

OUT = Path(__file__).resolve().parent.parent / "apps" / "client" / "assets" / "chronique"
MAX_W, QUALITY = 1100, 78


def main() -> int:
    before = after = changed = 0
    for f in sorted(OUT.glob("*.jpg")):
        size = f.stat().st_size
        before += size
        try:
            with Image.open(f) as im:
                im = ImageOps.exif_transpose(im)
                if im.width <= MAX_W and size < 260_000:
                    after += size
                    continue
                if im.width > MAX_W:
                    im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
                im.convert("RGB").save(f, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        except Exception as exc:  # image illisible : on la laisse telle quelle
            print(f"ignorée {f.name} : {exc}")
            after += size
            continue
        after += f.stat().st_size
        changed += 1
    print(f"{changed} image(s) réduite(s) : {before / 1e6:.0f} Mo → {after / 1e6:.0f} Mo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
