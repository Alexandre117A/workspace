#!/usr/bin/env python3
"""Décline le logo GEONEX (globe gravé bleu) : apps/client/assets/brand/logo-original.webp → toutes les tailles utiles.

Produit : l'emblème rond affiché dans l'application (brand/logo.png), l'icône d'application iOS/Android (images/icon.png,
android-icon-*.png), le favicon, l'écran de démarrage et l'icône « ajouter à l'écran d'accueil » (public/apple-touch-icon.png).
Le globe est détouré en disque : l'extérieur du cercle devient transparent, l'intérieur reste celui du logo d'origine.
Usage : npm run brand   (Pillow requis : pip install pillow)
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

CLIENT = Path(__file__).resolve().parent.parent / "apps" / "client"
SRC = CLIENT / "assets" / "brand" / "logo-original.webp"
INK = 200       # luminance en dessous de laquelle un pixel compte comme « encre » (sert à trouver le cercle)
EDGE = 3        # px (échelle d'origine) gardés autour du trait extérieur pour ne pas le rogner


def circle_of(im: Image.Image) -> tuple[float, float, float]:
    box = im.convert("L").point(lambda v: 255 if v < INK else 0).getbbox()
    if not box:
        raise SystemExit("logo vide : aucun trait détecté")
    return (box[0] + box[2]) / 2, (box[1] + box[3]) / 2, max(box[2] - box[0], box[3] - box[1]) / 2


def disc(im: Image.Image, diameter: int) -> Image.Image:
    """Le globe seul, en disque de `diameter` px, extérieur transparent (bord lissé)."""
    cx, cy, r = circle_of(im)
    r += EDGE
    tile = im.convert("RGBA").crop((round(cx - r), round(cy - r), round(cx + r), round(cy + r))).resize((diameter, diameter), Image.LANCZOS)
    mask = Image.new("L", (diameter * 4, diameter * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, diameter * 4 - 1, diameter * 4 - 1), fill=255)
    tile.putalpha(mask.resize((diameter, diameter), Image.LANCZOS))
    return tile


def on_canvas(globe: Image.Image, size: int, ratio: float, bg=None) -> Image.Image:
    """Pose le disque (`ratio` de la largeur) au centre d'un canevas carré, transparent ou de couleur `bg`."""
    out = Image.new("RGBA", (size, size), bg if bg else (0, 0, 0, 0))
    d = round(size * ratio)
    g = globe.resize((d, d), Image.LANCZOS)
    out.alpha_composite(g, ((size - d) // 2, (size - d) // 2))
    return out


def silhouette(globe: Image.Image) -> Image.Image:
    """Version monochrome (Android 13 « icônes thématiques ») : seul le tracé compte, en blanc, le reste est transparent."""
    lum = globe.convert("L")
    ink = lum.point(lambda v: min(255, int((255 - v) * 1.35)))
    a = Image.composite(ink, Image.new("L", globe.size, 0), globe.getchannel("A"))
    out = Image.new("RGBA", globe.size, (255, 255, 255, 0))
    out.putalpha(a)
    return out


def save(img: Image.Image, path: Path, palette: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if palette:  # palette de 256 couleurs : le logo n'a que deux teintes et leurs lissages, le fichier est bien plus léger
        img = img.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    img.save(path, "PNG", optimize=True)
    print(f"{path.relative_to(CLIENT)} {img.size[0]}x{img.size[1]} ({path.stat().st_size // 1024} Ko)")


def main() -> int:
    if not SRC.exists():
        print(f"Logo introuvable : {SRC}")
        return 1
    im = Image.open(SRC)
    big = disc(im, 1024)
    white = (255, 255, 255, 255)
    save(disc(im, 512), CLIENT / "assets" / "brand" / "logo.png", palette=True)
    save(on_canvas(big, 1024, 0.9, white).convert("RGB"), CLIENT / "assets" / "images" / "icon.png")                    # iOS : opaque, le système arrondit
    save(on_canvas(big, 1024, 0.6), CLIENT / "assets" / "images" / "android-icon-foreground.png")          # zone sûre ≈ 66 %
    save(Image.new("RGBA", (1024, 1024), white), CLIENT / "assets" / "images" / "android-icon-background.png")
    save(on_canvas(silhouette(big), 1024, 0.6), CLIENT / "assets" / "images" / "android-icon-monochrome.png")
    save(disc(im, 256), CLIENT / "assets" / "images" / "favicon.png")
    save(disc(im, 512), CLIENT / "assets" / "images" / "splash-icon.png", palette=True)
    save(on_canvas(big, 180, 0.92, white), CLIENT / "public" / "apple-touch-icon.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
