#!/usr/bin/env python3
"""Generate Cartwala birthday mug personalizer overlays and product mockups."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math
import os
import random

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "birthday-catalog"
SAMPLE = ROOT / "assets" / "birthday-sample"
W, H = 2550, 1050

SERIF = str(SAMPLE / "DejaVuSerif-Bold.ttf")
SANS = str(SAMPLE / "DejaVuSans.ttf")

DESIGNS = [
    ("burgundy-gold", "Burgundy Gold", "#65172a", "#f7eddb", "#d5aa53"),
    ("royal-blue-stars", "Royal Blue Stars", "#113b75", "#edf5ff", "#f7c84b"),
    ("pink-floral", "Pink Floral", "#a73368", "#fff0f6", "#e9a9c5"),
    ("black-gold-luxury", "Black Gold Luxury", "#151515", "#fff7e6", "#d6ae54"),
    ("sky-balloons", "Sky Balloons", "#167ca1", "#effbff", "#ffbd59"),
    ("purple-party", "Purple Party", "#5b278b", "#f6edff", "#e5b9ff"),
    ("green-botanical", "Green Botanical", "#1d654e", "#effaf4", "#d8bd72"),
    ("red-bold", "Red Bold", "#a61f25", "#fff1ee", "#202020"),
    ("peach-cake", "Peach Cake", "#c6625d", "#fff3e9", "#f1b778"),
    ("rainbow-celebration", "Rainbow Celebration", "#24345d", "#fffdf5", "#ff6b6b"),
]


def font(path, size):
    return ImageFont.truetype(path, size)


def atomic_save(image, destination, **kwargs):
    temp = destination.with_name(destination.name + ".tmp.png")
    image.save(temp, format="PNG", **kwargs)
    os.replace(temp, destination)


def center_text(draw, xy, text, fnt, fill):
    x, y = xy
    box = draw.textbbox((0, 0), text, font=fnt)
    draw.text((x - (box[2] - box[0]) / 2, y - (box[3] - box[1]) / 2), text, font=fnt, fill=fill)


def star(draw, cx, cy, radius, fill):
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        r = radius if i % 2 == 0 else radius * 0.42
        pts.append((cx + math.cos(ang) * r, cy + math.sin(ang) * r))
    draw.polygon(pts, fill=fill)


def confetti(draw, seed, colors, region=(0, 0, W, H), count=38):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    for _ in range(count):
        x, y = rnd.randint(x0, x1), rnd.randint(y0, y1)
        c = rnd.choice(colors)
        if rnd.random() < .5:
            draw.ellipse((x - 7, y - 7, x + 7, y + 7), fill=c)
        else:
            draw.rounded_rectangle((x - 4, y - 13, x + 4, y + 13), radius=3, fill=c)


def draw_decor(draw, idx, primary, accent):
    if idx in (1, 9):
        for x, y, r in [(1450, 150, 35), (2370, 170, 26), (1600, 860, 24), (2300, 850, 35)]:
            star(draw, x, y, r, accent)
    elif idx == 2:
        for x, y in [(1450, 165), (2380, 180), (1530, 860), (2330, 840)]:
            for a in range(0, 360, 45):
                dx, dy = math.cos(math.radians(a)) * 34, math.sin(math.radians(a)) * 34
                draw.ellipse((x+dx-13, y+dy-22, x+dx+13, y+dy+22), fill=accent)
            draw.ellipse((x-22, y-22, x+22, y+22), fill="#f8d36d")
    elif idx == 4:
        for x, y, c in [(1480,180,"#ff7474"),(2370,190,"#ffd166"),(1550,840,"#8ad3dd"),(2320,820,"#f28bb0")]:
            draw.ellipse((x-45,y-62,x+45,y+62), fill=c)
            draw.line((x,y+62,x+20,y+118), fill=accent, width=5)
    elif idx == 6:
        for side in (0, 1):
            bx = 1400 if side == 0 else 2460
            for k in range(8):
                y = 100 + k*115
                draw.ellipse((bx-45,y,bx+45,y+58), fill=accent)
                draw.line((bx,y+40,bx + (-70 if side == 0 else 70),y+105),fill=accent,width=10)
    elif idx == 8:
        draw.rounded_rectangle((1390, 735, 1620, 870), radius=22, fill=accent)
        draw.rounded_rectangle((1420, 665, 1590, 750), radius=18, fill="#fff3d6")
        for x in (1450, 1505, 1560):
            draw.line((x,665,x,610), fill="#fff3d6", width=12)
            draw.ellipse((x-12,590,x+12,618), fill="#ffdd59")
    else:
        confetti(draw, idx * 17, [accent, "#ffffff", primary], (1380, 80, 2460, 940), 42)


def make_overlay(idx, item):
    slug, title, primary, light, accent = item
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Full design background, then make the photo opening transparent.
    d.rectangle((0, 0, W, H), fill=light)
    d.rectangle((1275, 0, W, H), fill=primary)
    d.rectangle((0, 0, W-1, H-1), outline=accent, width=20)
    photo = (130, 120, 1150, 930)
    d.rounded_rectangle(photo, radius=70, fill=(0, 0, 0, 0), outline=accent, width=14)
    draw_decor(d, idx, primary, accent)
    center_text(d, (1930, 315), "HAPPY", font(SERIF, 126), "#ffffff")
    center_text(d, (1930, 455), "BIRTHDAY", font(SERIF, 142), "#ffffff")
    center_text(d, (1930, 790), "MAKE A WISH", font(SANS, 38), accent)
    # A quiet divider keeps the editable name visually distinct.
    d.rounded_rectangle((1570, 595, 2290, 605), radius=5, fill=accent)
    return im, photo


def make_mask():
    mask = Image.new("RGBA", (1000, 1000), (255, 255, 255, 0))
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((2, 2, 997, 997), radius=78, fill=(255, 255, 255, 255))
    return mask


def sample_wrap(overlay):
    result = Image.new("RGBA", overlay.size, (245, 239, 225, 255))
    d = ImageDraw.Draw(result)
    # Neutral sample portrait placeholder, intentionally not a real customer photo.
    d.rectangle((130, 120, 1150, 930), fill="#ddd7cd")
    d.ellipse((455, 205, 825, 575), fill="#c4b9aa")
    d.rounded_rectangle((350, 535, 930, 935), radius=190, fill="#b3a696")
    center_text(d, (640, 865), "YOUR PHOTO", font(SANS, 52), "#ffffff")
    result.alpha_composite(overlay)
    center_text(ImageDraw.Draw(result), (1930, 670), "YOUR NAME", font(SERIF, 76), "#ffffff")
    return result.convert("RGB")


def crop_view(wrap, view):
    # Each cup view shows a different part of the same printable wrap.
    if view == 0:
        box = (0, 0, 1120, H)
    elif view == 1:
        box = (715, 0, 1835, H)
    else:
        box = (1430, 0, 2550, H)
    return wrap.crop(box)


def heart_points(cx, cy, scale=1):
    pts = []
    for i in range(101):
        t = 2 * math.pi * i / 100
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2*t) - 2 * math.cos(3*t) - math.cos(4*t)
        pts.append((cx + x*scale, cy - y*scale))
    return pts


def draw_cup(base, x, y, body_w, body_h, art, model, view):
    d = ImageDraw.Draw(base)
    interior = "#b7192d" if model == "red" else "#d6d6d6"
    handle = "#b7192d" if model == "red" else "#f4f4f4"
    hx = x - 95 if view == 0 else x + body_w - 15
    if model == "love":
        hp = heart_points(hx + (10 if view == 0 else 90), y + 150, 7.2)
        d.line(hp + [hp[0]], fill="#c9c9c9", width=38, joint="curve")
        d.line(hp + [hp[0]], fill=handle, width=27, joint="curve")
    else:
        d.rounded_rectangle((hx, y+75, hx+120, y+285), radius=58, outline="#c9c9c9", width=34)
        d.rounded_rectangle((hx, y+75, hx+120, y+285), radius=58, outline=handle, width=24)
    d.rounded_rectangle((x, y+35, x+body_w, y+body_h), radius=35, fill="#111111" if model == "magic" else "#f4f4f4", outline="#d2d2d2", width=4)
    art = art.resize((body_w-12, body_h-55), Image.Resampling.LANCZOS)
    # Magic starts black but its heated printed area reveals the design.
    base.paste(art, (x+6, y+45))
    d.ellipse((x, y, x+body_w, y+86), fill="#f6f6f6", outline="#cfcfcf", width=7)
    d.ellipse((x+18, y+13, x+body_w-18, y+69), fill=interior)
    d.arc((x+3, y+body_h-52, x+body_w-3, y+body_h+8), 0, 180, fill="#c9c9c9", width=4)


def make_mockup(item, overlay, model):
    slug, title, primary, light, accent = item
    base = Image.new("RGB", (1500, 920), "white")
    d = ImageDraw.Draw(base)
    wrap = sample_wrap(overlay)
    positions = [105, 545, 985]
    views = ["Left View", "Front View", "Right View"]
    for i, x in enumerate(positions):
        draw_cup(base, x, 160, 330, 470, crop_view(wrap, i), model, i)
        center_text(d, (x+165, 700), views[i], font(SANS, 35), "#252525")
    if model == "magic":
        d.rounded_rectangle((680, 62, 820, 118), radius=28, fill="#5e2137")
        center_text(d, (750, 90), "HOT", font(SANS, 25), "white")
        d.rounded_rectangle((655, 750, 845, 865), radius=22, fill="#0d0d0d")
        d.ellipse((702, 735, 798, 765), fill="#cecece")
        center_text(d, (750, 888), "COLD", font(SANS, 25), "#333333")
    return base


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # Keep the approved Design 01 assets exactly as they are.
    for src in SAMPLE.glob("CW-BD-001-*.png"):
        (OUT / src.name).write_bytes(src.read_bytes())
    mask = make_mask()
    for idx, item in enumerate(DESIGNS, start=1):
        code = f"CW-BD-{idx:03d}"
        if idx == 1:
            continue
        overlay, _ = make_overlay(idx, item)
        atomic_save(overlay, OUT / f"{code}-personalizer-overlay.png", optimize=True)
        atomic_save(mask, OUT / f"{code}-personalizer-mask.png", optimize=True)
        for model in ("normal", "magic", "love", "red"):
            atomic_save(make_mockup(item, overlay, model), OUT / f"{code}-{model}-mockup.png", optimize=True)
    for font_name in ("DejaVuSans.ttf", "DejaVuSerif-Bold.ttf"):
        (OUT / font_name).write_bytes((SAMPLE / font_name).read_bytes())
    print(f"Generated {len(list(OUT.glob('*')))} files in {OUT}")


if __name__ == "__main__":
    main()
