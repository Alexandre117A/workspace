#!/usr/bin/env python3
"""Prépare les emblèmes des trois modes de l'accueil : apps/client/assets/modes/originaux/mode{1,2,3}.* → mode{1,2,3}.png.

Chaque image est recadrée sur son contenu (marges transparentes retirées), centrée dans un carré et redimensionnée à
512 px (net sur écrans haute densité, affiché à ~100-130 px). Le fond transparent d'origine est conservé tel quel.
Usage : npm run logos   (Pillow requis : pip install pillow)
"""
import sys
from pathlib import Path

from PIL import Image

DIR = Path(__file__).resolve().parent.parent / "apps" / "client" / "assets" / "modes"
SIZE = 512
MARGIN = 0.03   # marge de respiration autour de l'emblème
THRESHOLD = 20  # alpha minimal pour compter comme « contenu » (ignore la brume très faible des halos)


def main() -> int:
    for n in (1, 2, 3):
        src = next((p for p in sorted((DIR / "originaux").glob(f"mode{n}.*"))), None)
        if not src:
            print(f"mode{n} : fichier source introuvable dans {DIR / 'originaux'}")
            return 1
        im = Image.open(src).convert("RGBA")
        box = im.getchannel("A").point(lambda v: 255 if v >= THRESHOLD else 0).getbbox()
        if not box:
            print(f"mode{n} : image entièrement transparente")
            return 1
        im = im.crop(box)
        side = max(im.size)
        inner = round(SIZE * (1 - 2 * MARGIN))
        scale = inner / side
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
        out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        out.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2), im)
        dest = DIR / f"mode{n}.png"
        out.save(dest, "PNG", optimize=True)
        print(f"mode{n} : {src.name} {Image.open(src).size} → {dest.name} {SIZE}x{SIZE} ({dest.stat().st_size // 1024} Ko), contenu {box[2]-box[0]}x{box[3]-box[1]} px")
    return 0


if __name__ == "__main__":
    sys.exit(main())
