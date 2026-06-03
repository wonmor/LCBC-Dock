"""Generate Google Play Store assets for MolDock from the app icon.

Outputs:
  assets/play-store-icon.png   — 512×512, exactly what Play Console asks for
  assets/feature-graphic.png   — 1024×500, hero banner

Re-run after icon.png changes:
  python3 scripts/gen_play_assets.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"

# Source = icon.png — the iOS App Store icon is the canonical brand
# image; Play Store icon + Android adaptive-icon both mirror it. This
# guarantees the iOS App Store, Google Play listing, Android home
# screen, and macOS dock all render the same artwork.
ICON_SRC = ASSETS / "icon.png"
PLAY_ICON_OUT = ASSETS / "play-store-icon.png"
FEATURE_OUT = ASSETS / "feature-graphic.png"

BRAND = "MolDock"
TAGLINE = "Protein–Ligand Docking"

FONT_BOLD = "/Library/Fonts/SF-Pro-Display-Light.otf"
FONT_REG = "/Library/Fonts/SF-Pro-Display-Medium.otf"

# Background gradient — matches the icon's deep-navy → near-black.
BG_TOP = (15, 30, 70)
BG_BOTTOM = (4, 6, 14)


def vertical_gradient(size, top, bottom):
    img = Image.new("RGB", size, top)
    px = img.load()
    w, h = size
    for y in range(h):
        t = y / max(1, h - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return img


def play_store_icon():
    """Square icon at 512×512 — Play Console's exact requirement."""
    src = Image.open(ICON_SRC).convert("RGBA")
    out = src.resize((512, 512), Image.LANCZOS)
    out.save(PLAY_ICON_OUT, "PNG", optimize=True)
    print(f"✓ {PLAY_ICON_OUT.relative_to(ROOT)}  512×512")


def feature_graphic():
    """1024×500 banner: icon left, brand + tagline right."""
    W, H = 1024, 500
    bg = vertical_gradient((W, H), BG_TOP, BG_BOTTOM)

    # Icon — extract the molecule "glyph" from the square icon. The source
    # already has a dark background, so we layer it directly. Pad so it
    # doesn't crowd the edge.
    icon = Image.open(ICON_SRC).convert("RGBA")
    icon_size = 360
    icon = icon.resize((icon_size, icon_size), Image.LANCZOS)
    icon_x = 50
    icon_y = (H - icon_size) // 2
    bg.paste(icon, (icon_x, icon_y), icon)

    draw = ImageDraw.Draw(bg)
    title_font = ImageFont.truetype(FONT_BOLD, 110)
    tagline_font = ImageFont.truetype(FONT_REG, 32)

    text_x = icon_x + icon_size + 50
    title_bbox = draw.textbbox((0, 0), BRAND, font=title_font)
    title_h = title_bbox[3] - title_bbox[1]
    tagline_bbox = draw.textbbox((0, 0), TAGLINE, font=tagline_font)
    tagline_h = tagline_bbox[3] - tagline_bbox[1]

    block_h = title_h + 24 + tagline_h
    y_start = (H - block_h) // 2 - 10

    draw.text((text_x, y_start), BRAND, font=title_font, fill=(250, 250, 250))
    draw.text(
        (text_x, y_start + title_h + 24),
        TAGLINE,
        font=tagline_font,
        fill=(170, 195, 230),
    )

    bg.save(FEATURE_OUT, "PNG", optimize=True)
    print(f"✓ {FEATURE_OUT.relative_to(ROOT)}  {W}×{H}")


if __name__ == "__main__":
    play_store_icon()
    feature_graphic()
