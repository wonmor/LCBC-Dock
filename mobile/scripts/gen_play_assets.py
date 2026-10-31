"""Generate Google Play Store assets for MolDock from the app icon.

Outputs:
  assets/play-store-icon.png   512x512, exactly what Play Console asks for
  assets/feature-graphic.png   1024x500 Bauhaus banner (white ground, black
                               rules, blue/yellow/red fields, Jost type)

Re-run after icon.png changes:
  python3 scripts/gen_play_assets.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
FONTS = ASSETS / "fonts"

BLUE = (0x0F, 0x3F, 0xA8)
YELLOW = (0xF2, 0xC2, 0x30)
RED = (0xD6, 0x28, 0x28)


def play_store_icon(icon):
    icon.resize((512, 512), Image.LANCZOS).save(ASSETS / "play-store-icon.png", optimize=True)


def feature_graphic(icon):
    W, H = 1024, 500
    c = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(c)
    c.paste(icon.resize((H, H), Image.LANCZOS), (0, 0))
    d.rectangle([H, 0, H + 7, H], fill="black")
    x0 = H + 48
    bold = ImageFont.truetype(str(FONTS / "Jost-Bold.ttf"), 104)
    semi = ImageFont.truetype(str(FONTS / "Jost-SemiBold.ttf"), 30)
    med = ImageFont.truetype(str(FONTS / "Jost-Medium.ttf"), 24)
    d.text((x0, 40), "MolDock", font=bold, fill="black")
    d.text((x0 + 4, 170), "PROTEIN-LIGAND DOCKING", font=semi, fill="black")
    d.rectangle([x0, 215, W - 40, 222], fill="black")
    rows = [
        (BLUE, "white", "AutoDock Vina in the cloud"),
        (YELLOW, "black", "Binding poses in 3D"),
        (RED, "white", "Optional MolDock Pro"),
    ]
    y = 252
    for bg, fg, text in rows:
        d.rectangle([x0, y, W - 40, y + 60], fill=bg, outline="black", width=3)
        d.text((x0 + 18, y + 14), text, font=med, fill=fg)
        y += 72
    d.rectangle([0, 0, W - 1, H - 1], outline="black", width=8)
    c.save(ASSETS / "feature-graphic.png", optimize=True)


if __name__ == "__main__":
    src = Image.open(ASSETS / "icon.png").convert("RGB")
    play_store_icon(src)
    feature_graphic(src)
    print("wrote play-store-icon.png and feature-graphic.png")
