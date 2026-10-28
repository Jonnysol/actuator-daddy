# /// script
# dependencies = ["fonttools", "shapely"]
# ///
"""Actuator Daddy brand exports.

Builds everything the brand book links to, from the identity files in brand/ (never redrawn here):

  brand/png/*                 PNG exports of the marks (rsvg-convert)
  apple-touch-icon.png        180x180, Big D small cut, paper on orange, opaque
  brand/stickers.svg / .png   die-cut sticker sheet, 2400 px wide
  brand/tee.svg               front / back tee mock
  og.png                      1200x630, rendered from og.html with Playwright (needs the dev server on :7760)

Run:  uv run tools/make_brand_assets.py [--no-og]
All text is converted to outlines so the SVGs render anywhere (rsvg, browsers, cutters) without the fonts.
"""
import math, os, re, subprocess, sys, shutil
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda p: os.path.join(ROOT, p)
RSVG = shutil.which("rsvg-convert") or "/opt/homebrew/bin/rsvg-convert"
ORANGE, PAPER, NIGHT, FOG, STEEL, WHITE = "#D9381E", "#F1F0EC", "#0B1117", "#A4ADB9", "#2B3F57", "#FFFFFF"
os.makedirs(A("brand/png"), exist_ok=True)


# ---------- helpers ----------
def rsvg(src, out, w=None, h=None, bg=None):
    cmd = [RSVG, src, "-o", out]
    if w: cmd += ["-w", str(w)]
    if h: cmd += ["-h", str(h)]
    if bg: cmd += ["-b", bg]
    subprocess.run(cmd, check=True)
    print("  wrote", os.path.relpath(out, ROOT))


def path_d(svg_file):
    """The d of the first path in one of the brand SVGs (all single-colour compound paths)."""
    s = open(A(svg_file)).read()
    return re.search(r'<path[^>]*? d="([^"]+)"', s).group(1)


def paths(svg_file):
    """All (fill, d) pairs of a brand SVG, in order."""
    s = open(A(svg_file)).read()
    return re.findall(r'<path fill="([^"]+)" d="([^"]+)"', s)


def rings_from_d(d):
    """Polygons from a M/L/Z-only path (what make_logos emits)."""
    out = []
    for sub in re.findall(r"M([^Z]+)Z", d):
        pts = [tuple(map(float, p.split())) for p in re.findall(r"(-?[\d.]+ -?[\d.]+)", sub)]
        if len(pts) >= 3:
            out.append(Polygon(pts))
    return out


def outer_buffer(d, r):
    """Outer contour of a compound path grown by r: the die-cut line."""
    geom = unary_union([p.buffer(0) for p in rings_from_d(d)]).buffer(r, join_style="round", quad_segs=24)
    polys = getattr(geom, "geoms", [geom])
    return " ".join("M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in list(p.exterior.coords)[:-1]) + " Z" for p in polys)


class Face:
    def __init__(self, path, axes=None):
        f = TTFont(A(path))
        self.font = instantiateVariableFont(f, axes) if axes and "fvar" in f else f
        self.gs, self.cmap, self.upm = self.font.getGlyphSet(), self.font.getBestCmap(), self.font["head"].unitsPerEm
        try:
            self.cap = self.font["OS/2"].sCapHeight
        except AttributeError:
            self.cap = self.upm * 0.7

    def outline(self, text, track=0.0):
        pen, bp, x = SVGPathPen(self.gs), BoundsPen(self.gs), 0
        for i, ch in enumerate(text):
            g = self.gs[self.cmap.get(ord(ch), self.cmap[ord("?")])]
            if not ch.isspace():
                g.draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
                g.draw(TransformPen(bp, (1, 0, 0, 1, x, 0)))
            x += g.width + (track * self.upm if i < len(text) - 1 else 0)
        b = bp.bounds or (0, 0, x, 0)
        return pen.getCommands(), b, x

    def text(self, s, x, y, size, fill, anchor="middle", track=0.0, extra=""):
        """A path for `s` with its baseline at y and size in px (em). anchor: start|middle|end."""
        d, (x0, y0, x1, y1), adv = self.outline(s, track)
        k = size / self.upm
        w = (x1 - x0) * k
        tx = x - (w / 2 + x0 * k if anchor == "middle" else (w + x0 * k if anchor == "end" else x0 * k))
        return f'<path fill="{fill}" transform="translate({tx:.2f} {y:.2f}) scale({k:.5f})"{extra} d="{d}"/>', w


BS = Face("fonts-src/BigShoulders.ttf", {"opsz": 72, "wght": 900})
BS_BOOK = Face("fonts-src/BigShoulders.ttf", {"opsz": 72, "wght": 700})
MONO = Face("fonts-src/JetBrainsMono.ttf", {"wght": 500})
VOICE = Face("fonts-src/InstrumentSerif-Italic.ttf")

BIGD, WINK, SMALL = path_d("brand/bigd.svg"), path_d("brand/bigd-wink.svg"), path_d("brand/bigd-small.svg")
WORDMARK = open(A("brand/wordmark.svg")).read()
DISGUISE = paths("brand/disguise.svg")  # [(night, glasses), (orange, stache)]
STACHE = path_d("brand/disguise-stache.svg")


# ---------- 1. PNG exports ----------
def exports():
    print("exports")
    for c in ("orange", "paper", ""):
        suffix = f"-{c}" if c else ""
        name = c or "night"
        for px in (512, 1024):
            rsvg(A(f"brand/bigd{suffix}.svg"), A(f"brand/png/bigd-{name}-{px}.png"), w=px, h=px)
    rsvg(A("brand/bigd-wink-paper.svg"), A("brand/png/bigd-wink-paper-1024.png"), w=1024, h=1024)
    rsvg(A("brand/bigd-wink-orange.svg"), A("brand/png/bigd-wink-orange-1024.png"), w=1024, h=1024)
    rsvg(A("brand/bigd-wink.svg"), A("brand/png/bigd-wink-night-1024.png"), w=1024, h=1024)
    rsvg(A("brand/lockup.svg"), A("brand/png/lockup-paper-2000.png"), w=2000)
    rsvg(A("brand/lockup-ink.svg"), A("brand/png/lockup-ink-2000.png"), w=2000)
    rsvg(A("brand/wordmark.svg"), A("brand/png/wordmark-paper-2000.png"), w=2000)
    rsvg(A("brand/wordmark-ink.svg"), A("brand/png/wordmark-ink-2000.png"), w=2000)
    rsvg(A("brand/disguise.svg"), A("brand/png/disguise-1024.png"), w=1024)
    # the portrait travels with the kit (and stickers.svg references it from here)
    shutil.copy(A("assets/daddy-ascii.png"), A("brand/png/daddy-ascii.png"))
    shutil.copy(A("assets/daddy-ascii-shadow.png"), A("brand/png/daddy-ascii-shadow.png"))
    print("  copied daddy-ascii*.png")
    # apple touch icon: small cut, paper on orange, opaque square
    tmp = A("brand/png/_touch.svg")
    open(tmp, "w").write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" fill="{ORANGE}"/>'
        f'<g transform="translate(16 16) scale(0.74)"><path fill="{PAPER}" d="{SMALL}"/></g></svg>')
    rsvg(tmp, A("apple-touch-icon.png"), w=180, h=180)
    os.remove(tmp)


# ---------- 2. sticker sheet ----------
def stickers():
    print("stickers")
    W, H, CUT = 2400, 1800, 22  # CUT = white die-cut border
    el = [f'<rect width="{W}" height="{H}" fill="{NIGHT}"/>']

    def place(x, y, s, inner):
        el.append(f'<g transform="translate({x} {y}) scale({s:.4f})">{inner}</g>')

    # 1. Big D: night disc under an orange mark so the holes read night, white kiss-cut ring
    cut = outer_buffer(BIGD, CUT / 2.9)
    place(90, 80, 2.9, f'<path fill="{WHITE}" d="{cut}"/><circle cx="100" cy="100" r="92" fill="{NIGHT}"/><path fill="{ORANGE}" d="{BIGD}"/>')
    # 2. the wink: paper mark on an orange disc
    place(720, 80, 2.9, f'<path fill="{WHITE}" d="{cut}"/><circle cx="100" cy="100" r="92" fill="{ORANGE}"/><path fill="{PAPER}" d="{WINK}"/>')
    # 3. the disguise, kiss-cut around the whole thing
    glasses, stache = DISGUISE[0][1], DISGUISE[1][1]
    dcut = outer_buffer(glasses + " " + stache, CUT / 3.2)
    place(1350, 40, 3.2, f'<path fill="{WHITE}" d="{dcut}"/><path fill="{NIGHT}" d="{glasses}"/><path fill="{ORANGE}" d="{stache}"/>')
    el.append(f'<path fill="{NIGHT}" transform="translate(1350 40) scale(3.2)" d="{glasses}"/>')  # keep the glasses crisp above

    # 4. TAKE THAT LOAD: paper block, night stack, LOAD in orange
    x, y, w, h = 90, 760, 500, 620
    el.append(f'<rect x="{x - CUT}" y="{y - CUT}" width="{w + 2 * CUT}" height="{h + 2 * CUT}" rx="{36 + CUT}" fill="{WHITE}"/>')
    el.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="36" fill="{PAPER}"/>')
    for i, (word, col) in enumerate((("TAKE", NIGHT), ("THAT", NIGHT), ("LOAD", ORANGE))):
        p, _ = BS.text(word, x + w / 2, y + 200 + i * 185, 220, col, track=0.01)
        el.append(p)

    # 5. Torque advisory (parody of the black-and-white advisory label)
    x, y, w, h = 690, 760, 620, 380
    el.append(f'<rect x="{x - CUT}" y="{y - CUT}" width="{w + 2 * CUT}" height="{h + 2 * CUT}" rx="{CUT}" fill="{WHITE}"/>')
    el.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{NIGHT}"/>')
    el.append(f'<rect x="{x + 18}" y="{y + 18}" width="{w - 36}" height="{h - 36}" fill="none" stroke="{WHITE}" stroke-width="6"/>')
    p, _ = BS.text("TORQUE", x + w / 2, y + 130, 110, WHITE, track=0.04); el.append(p)
    p, _ = BS.text("ADVISORY", x + w / 2, y + 235, 110, WHITE, track=0.04); el.append(p)
    el.append(f'<rect x="{x + 18}" y="{y + 262}" width="{w - 36}" height="{h - 280}" fill="{WHITE}"/>')
    p, _ = BS_BOOK.text("EXPLICIT SPECS", x + w / 2, y + 338, 66, NIGHT, track=0.06); el.append(p)

    # 6. 230 N·m hex nut
    cx, cy, r = 1105, 1430, 240
    def hexpts(r):
        return " ".join(f"{cx + r * math.cos(math.radians(60 * k)):.1f},{cy + r * math.sin(math.radians(60 * k)):.1f}" for k in range(6))
    el.append(f'<polygon points="{hexpts(r + CUT)}" fill="{WHITE}"/>')
    el.append(f'<polygon points="{hexpts(r)}" fill="{ORANGE}"/>')
    p, _ = BS.text("230", cx, cy + 40, 230, PAPER); el.append(p)
    p, _ = BS_BOOK.text("N·m AT PEAK", cx, cy + 118, 58, PAPER, track=0.05); el.append(p)
    p, _ = MONO.text("ARTUS III", cx, cy - 150, 34, NIGHT); el.append(p)

    # 7. Verros by day. (pill, Daddy's voice)
    x, y, w, h = 1420, 1580, 590, 150
    el.append(f'<rect x="{x - CUT}" y="{y - CUT}" width="{w + 2 * CUT}" height="{h + 2 * CUT}" rx="{h / 2 + CUT}" fill="{WHITE}"/>')
    el.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h / 2}" fill="{NIGHT}"/>')
    p, _ = VOICE.text("Verros by day.", x + w / 2, y + 104, 112, PAPER); el.append(p)

    # 8. the ASCII Daddy cutout, kiss-cut with a filter around the paper
    el.append('<defs><filter id="cut" x="-10%" y="-10%" width="120%" height="120%">'
              f'<feMorphology in="SourceAlpha" operator="dilate" radius="{CUT * 0.5:.0f}" result="d"/>'
              f'<feFlood flood-color="{WHITE}"/><feComposite in2="d" operator="in" result="rim"/>'
              '<feMerge><feMergeNode in="rim"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>')
    ph = 920  # portrait height
    pw = ph * 1606 / 1558
    el.append(f'<image href="png/daddy-ascii.png" x="{2340 - pw:.0f}" y="620" width="{pw:.0f}" height="{ph}" filter="url(#cut)"/>')

    # the sheet's own label
    p, _ = MONO.text("ACTUATOR DADDY  ·  STICKER SHEET 01  ·  KISS-CUT ON WHITE VINYL  ·  ACTUATORDADDY.COM", 90, H - 44, 26, FOG, anchor="start")
    el.append(p)

    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img">'
           f'<title>Actuator Daddy sticker sheet</title>{"".join(el)}</svg>\n')
    open(A("brand/stickers.svg"), "w").write(svg)
    print("  wrote brand/stickers.svg")
    rsvg(A("brand/stickers.svg"), A("brand/stickers.png"), w=2400)


# ---------- 3. tee mock ----------
def tee_shape(x, y, s, fill, stroke):
    """Flat crew-neck tee silhouette in a 400x440 box at (x,y), scale s."""
    d = ("M135 0 C150 0 160 10 200 10 C240 10 250 0 265 0 "
         "C300 0 340 18 400 48 L372 150 L318 136 L318 440 L82 440 L82 136 L28 150 L0 48 "
         "C60 18 100 0 135 0 Z")
    neck = "M160 6 C165 30 235 30 240 6 C230 20 170 20 160 6 Z"
    return (f'<g transform="translate({x} {y}) scale({s})"><path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="2" stroke-linejoin="round"/>'
            f'<path d="{neck}" fill="{stroke}" opacity=".35"/></g>')


def tee():
    print("tee")
    W, H = 1800, 1180
    el = [f'<rect width="{W}" height="{H}" fill="{PAPER}"/>']
    s = 2.0
    # front
    fx, fy = 120, 140
    el.append(tee_shape(fx, fy, s, NIGHT, STEEL))
    # left chest: wearer's left = viewer's right. Big D small? No: at 90 px on a 440-unit body the full mark reads fine.
    chest = 150
    el.append(f'<g transform="translate({fx + 318 * s - chest - 70} {fy + 160 * s}) scale({chest / 200})"><path fill="{ORANGE}" d="{BIGD}"/></g>')
    # back
    bx, by = 960, 140
    el.append(tee_shape(bx, by, s, NIGHT, STEEL))
    wm_w = 470
    vb = re.search(r'viewBox="0 0 (\d+) (\d+)"', WORDMARK)
    ww, wh = float(vb.group(1)), float(vb.group(2))
    k = wm_w / ww
    inner = re.search(r"<title>.*?</title>(.*)</svg>", WORDMARK, re.S).group(1)
    el.append(f'<g transform="translate({bx + 200 * s - wm_w / 2} {by + 150 * s}) scale({k:.5f})" style="color:{PAPER}">{inner}</g>')
    p, _ = BS.text("TAKE THAT LOAD", bx + 200 * s, by + 150 * s + wh * k + 88, 74, ORANGE, track=0.02); el.append(p)
    # labels
    for label, x in (("FRONT", fx + 200 * s), ("BACK", bx + 200 * s)):
        p, _ = MONO.text(label, x, fy + 440 * s + 64, 30, STEEL); el.append(p)
    p, _ = MONO.text("TEE 01  ·  NIGHT (BLACK) BLANK  ·  FRONT: BIG D, LEFT CHEST, 90 MM  ·  BACK: WORDMARK + TAKE THAT LOAD, 300 MM", W / 2, H - 40, 26, STEEL); el.append(p)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img"><title>Actuator Daddy tee</title>{"".join(el)}</svg>\n')
    open(A("brand/tee.svg"), "w").write(svg)
    print("  wrote brand/tee.svg")
    rsvg(A("brand/tee.svg"), A("brand/png/tee-1800.png"), w=1800)


# ---------- 4. og image ----------
def og():
    print("og")
    scratch = os.environ.get("TMPDIR", "/tmp")
    r = subprocess.run(["npx", "--no-install", "playwright", "screenshot", "--channel=chrome", "--viewport-size=1200,630",
                        "--wait-for-timeout=1200", "http://127.0.0.1:7760/og.html", A("og.png")], cwd=scratch)
    if r.returncode:
        print("  og.png failed (is the dev server on :7760?)")
    else:
        print("  wrote og.png")


if __name__ == "__main__":
    exports()
    stickers()
    tee()
    if "--no-og" not in sys.argv:
        og()
    print("brand assets ok")
