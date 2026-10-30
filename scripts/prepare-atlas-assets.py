#!/usr/bin/env python3
"""Génère le grain de papier (tuile 256 px sans couture) utilisé par les surfaces cartographiques de l'accueil.

Aucune image n'est dessinée à la main : un bruit pseudo-aléatoire reproductible (graine fixe) de points clairs/sombres très
transparents et de quelques fibres, superposé en mode « multiplication » à un fond de carte. Usage : npm run atlas:assets
"""
import random
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "apps" / "client" / "assets" / "atlas" / "paper.png"
N = 256


def main() -> int:
    rnd = random.Random(1415)
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    px = img.load()
    for _ in range(N * N // 5):  # grain fin
        x, y = rnd.randrange(N), rnd.randrange(N)
        v = rnd.choice((20, 40, 70, 210, 235))
        px[x, y] = (v, v, int(v * 0.92), rnd.randrange(10, 34))
    d = ImageDraw.Draw(img)
    for _ in range(70):  # fibres : courts traits presque horizontaux ; chaque trait est répété aux bords opposés (tuile sans couture)
        x, y, l = rnd.randrange(N), rnd.randrange(N), rnd.randrange(6, 22)
        dy = rnd.uniform(-3, 3)
        a = rnd.randrange(8, 20)
        col = (60, 48, 30, a) if rnd.random() < 0.7 else (255, 250, 235, a)
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                d.line((x + ox, y + oy, x + ox + l, y + oy + dy), fill=col, width=1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"{OUT.name} {N}x{N} ({OUT.stat().st_size // 1024} Ko)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
