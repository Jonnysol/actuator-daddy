# /// script
# dependencies = ["fonttools"]
# ///
"""Wordmark exploration: outline 'ACTUATOR DADDY' in candidate faces, optionally cut fins through each D."""
import os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = lambda n: os.path.join(ROOT, "fonts-src", n)
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "brand", "explore")
os.makedirs(OUT, exist_ok=True)


def load(name, axes=None):
    f = TTFont(F(name))
    if axes:
        f = instantiateVariableFont(f, axes)
    return f


def wordmark(font, text, track=0.0, fins=0, fin_side=0.5, fin_h=0.075, upper=True):
    gs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font["head"].unitsPerEm
    cap = font["OS/2"].sCapHeight or upm * 0.7
    pen = SVGPathPen(gs)
    x, slots, bb = 0, [], [1e9, 1e9, -1e9, -1e9]
    for i, ch in enumerate(text):
        g = gs[cmap[ord(ch)]]
        if ch != " ":
            g.draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
            bp = BoundsPen(gs)
            g.draw(TransformPen(bp, (1, 0, 0, 1, x, 0)))
            b = bp.bounds
            bb = [min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3])]
            if fins and ch == "D":
                # slots across the bowl, like the radial fins on the Artus housing
                gx0 = b[0] + (b[2] - b[0]) * fin_side
                for k in range(fins):
                    yc = b[1] + (b[3] - b[1]) * (0.26 + 0.48 * k / max(1, fins - 1))
                    h = (b[3] - b[1]) * fin_h
                    slots.append((gx0, -(yc + h / 2), b[2] + 40 - gx0, h))
        x += g.width + track * upm
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    tx, ty = -bb[0], bb[3]
    mask = ""
    if slots:
        rects = "".join(f'<rect x="{sx + tx:.0f}" y="{sy + ty:.0f}" width="{sw:.0f}" height="{sh:.0f}" rx="{sh / 2:.0f}" fill="#000"/>' for sx, sy, sw, sh in slots)
        mask = f'<mask id="m" maskUnits="userSpaceOnUse"><rect width="{w:.0f}" height="{h:.0f}" fill="#fff"/>{rects}</mask>'
    body = f'<g{" mask=\"url(#m)\"" if slots else ""}><path fill="currentColor" transform="translate({tx:.0f} {ty:.0f})" d="{pen.getCommands()}"/></g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}">{mask}{body}</svg>'


specs = {
    "anybody-ital": (load("Anybody-Italic.ttf", {"wdth": 150, "wght": 900}), 0.0, 4, 0.48),
    "archivo-xital": (load("Archivo-Italic.ttf", {"wdth": 125, "wght": 900}), 0.0, 4, 0.5),
    "archivo-x": (load("Archivo.ttf", {"wdth": 125, "wght": 900}), 0.0, 3, 0.5),
    "dela": (load("DelaGothicOne-Regular.ttf"), 0.0, 3, 0.5),
    "bowlby": (load("BowlbyOne-Regular.ttf"), 0.0, 3, 0.52),
    "grenze": (load("GrenzeGotisch.ttf", {"wght": 900}), 0.0, 0, 0.5),
    "rubikmono": (load("RubikMonoOne-Regular.ttf"), 0.0, 3, 0.5),
}
for name, (font, tr, fins, side) in specs.items():
    for t, tag in (("ACTUATOR DADDY", ""), ("DADDY", "-daddy")):
        open(os.path.join(OUT, f"{name}{tag}.svg"), "w").write(wordmark(font, t, tr))
        if fins:
            open(os.path.join(OUT, f"{name}{tag}-fins.svg"), "w").write(wordmark(font, t, tr, fins, side))
    if name == "grenze":
        open(os.path.join(OUT, "grenze-mixed.svg"), "w").write(wordmark(font, "Actuator Daddy", tr))
print("ok", sorted(os.listdir(OUT)))
