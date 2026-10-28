# /// script
# dependencies = ["fonttools", "shapely"]
# ///
"""Actuator Daddy identity, v2.

The mark is Big D: the face of an Artus actuator is the face. 16 rim bolts, hex-socket eyes,
a mustache made of two torque arrows (both directions: zero backlash). Built with real boolean
geometry so every file is a clean single-colour compound path (embroidery, vinyl, laser safe).

brand/bigd.svg              mark, full detail (use >= 48 px)
brand/bigd-wink.svg         the wink, for stickers and reactions
brand/bigd-small.svg        optical cut for 16-40 px (8 bolts, heavier strokes, no flange ring)
brand/wordmark.svg          ACTUATOR / DADDY stacked, Big Shoulders Display 900
brand/wordmark-line.svg     one line
brand/lockup.svg            mark + stacked wordmark
brand/disguise.svg          the meme filter: two actuators as glasses + torque mustache
brand/disguise-glasses.svg, brand/disguise-stache.svg   the filter in parts
"""
import math, os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from shapely.geometry import Point, Polygon, LineString
from shapely.ops import unary_union
from shapely import affinity

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda p: os.path.join(ROOT, p)
os.makedirs(A("brand"), exist_ok=True)
ORANGE, PAPER, NIGHT = "#D9381E", "#F1F0EC", "#0B1117"


def to_d(geom):
    polys = getattr(geom, "geoms", [geom])
    out = []
    for p in polys:
        for ring in [p.exterior, *p.interiors]:
            pts = list(ring.coords)[:-1]
            out.append("M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in pts) + " Z")
    return " ".join(out)


def svg(vb, body, title, color=None):
    c = f' color="{color}"' if color else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"{c} role="img"><title>{title}</title>{body}</svg>\n')


def save(name, data):
    open(A(f"brand/{name}"), "w").write(data)


# ---------- geometry pieces ----------
def bezier(p0, p1, p2, p3, n=40):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append((u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
                    u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]))
    return pts


def torque_line(cx, cy, s, curl_r=13.0, end=-1.78):
    """Centre line of the right half: out from the philtrum, then a torque-arrow curl."""
    ox, oy = cx + 37 * s, cy - 9 * s
    r = curl_r * s
    bottom = (ox, oy + r)
    pts = bezier((cx, cy), (cx + 10 * s, cy + 5 * s), (ox - 15 * s, bottom[1] + 3 * s), bottom)
    th0, k = math.pi / 2, 40
    for i in range(1, k + 1):
        th = th0 + (end - th0) * i / k
        pts.append((ox + r * math.cos(th), oy + r * math.sin(th)))
    return pts


def arrow_head(pts, end, s, head):
    ex, ey = pts[-1]
    tx, ty = math.sin(end), -math.cos(end)          # travel direction (angle decreasing)
    nx, ny = -ty, tx
    L, W = 11 * s * head, 10.5 * s * head
    return Polygon([(ex + tx * L, ey + ty * L), (ex + nx * W - tx * s, ey + ny * W - ty * s),
                    (ex - nx * W - tx * s, ey - ny * W - ty * s)])


def mustache(cx, cy, s=1.0, w=11.0, curl_r=13.0, end=-1.78, head=1.0):
    """Two torque arrows, one each way (zero backlash), drawn as one continuous stroke."""
    right = torque_line(cx, cy, s, curl_r, end)
    left = [(2 * cx - x, y) for x, y in right]
    line = LineString(left[::-1] + right[1:]).buffer(w * s / 2, cap_style="flat", join_style="round", quad_segs=16)
    hr = arrow_head(right, end, s, head)
    hl = affinity.scale(hr, xfact=-1, yfact=1, origin=(cx, cy))
    return unary_union([line, hr, hl])


def hexagon(cx, cy, r, rot=math.pi / 6):
    return Polygon([(cx + r * math.cos(rot + k * math.pi / 3), cy + r * math.sin(rot + k * math.pi / 3)) for k in range(6)])


def bigd(small=False, wink=False):
    R = 92
    c = (100, 100)
    disc = Point(c).buffer(R, quad_segs=64)
    holes = []
    n, br, bd = (8, 6.4, 13.5) if small else (16, 4.7, 12.5)
    for k in range(n):
        a = k / n * 2 * math.pi + math.pi / n
        holes.append(Point(c[0] + (R - bd) * math.cos(a), c[1] + (R - bd) * math.sin(a)).buffer(br, quad_segs=12))
    if not small:
        holes.append(Point(c).buffer(66.5, quad_segs=64).difference(Point(c).buffer(63.5, quad_segs=64)))
    er = 13 if small else 10.5
    holes.append(hexagon(77, 81, er))
    if wink:
        arc = [(123 + 11.5 * math.cos(t), 77 + 7.5 * math.sin(t)) for t in [math.pi * (0.1 + 0.8 * i / 24) for i in range(25)]]
        holes.append(LineString(arc).buffer(4.2, cap_style="round", quad_segs=10))
    else:
        holes.append(hexagon(123, 81, er))
    holes.append(mustache(100, 131, 0.92, 15 if small else 12, curl_r=11.5, head=1.2 if small else 1.05))
    return disc.difference(unary_union(holes))


for name, g in (("bigd", bigd()), ("bigd-wink", bigd(wink=True)), ("bigd-small", bigd(small=True))):
    body = f'<path fill="currentColor" d="{to_d(g)}"/>'
    save(f"{name}.svg", svg("0 0 200 200", body, "Actuator Daddy", NIGHT))
    save(f"{name}-paper.svg", svg("0 0 200 200", body, "Actuator Daddy", PAPER))
    save(f"{name}-orange.svg", svg("0 0 200 200", body, "Actuator Daddy", ORANGE))
open(A("favicon.svg"), "w").write(svg("0 0 200 200", f'<path fill="{ORANGE}" d="{to_d(bigd(small=True))}"/>', "Actuator Daddy"))


# ---------- the disguise (meme filter) ----------
def lens(cx, cy, R):
    d = Point(cx, cy).buffer(R, quad_segs=48)
    h = [Point(cx + (R - 7.5) * math.cos(k / 16 * 2 * math.pi + math.pi / 16),
               cy + (R - 7.5) * math.sin(k / 16 * 2 * math.pi + math.pi / 16)).buffer(2.5, quad_segs=8) for k in range(16)]
    h.append(Point(cx, cy).buffer(R * 0.36 + 1.7).difference(Point(cx, cy).buffer(R * 0.36 - 1.7)))
    h.append(Point(cx, cy).buffer(R * 0.1))
    return d.difference(unary_union(h))


R, gap, cy = 34, 14, 60
L, Rt = 100 - (R + gap / 2), 100 + (R + gap / 2)
bridge = LineString(bezier((100 - gap / 2 - 4, cy - 11), (97, cy - 21), (103, cy - 21), (100 + gap / 2 + 4, cy - 11))).buffer(4, cap_style="flat")
temples = unary_union([LineString([(L - R + 3, cy - 14), (L - R - 15, cy - 22)]).buffer(4),
                       LineString([(Rt + R - 3, cy - 14), (Rt + R + 15, cy - 22)]).buffer(4)])
glasses = unary_union([lens(L, cy, R), lens(Rt, cy, R), bridge, temples])
stache = mustache(100, 128, 1.25, 11)
save("disguise.svg", svg("0 0 200 160", f'<path fill="{NIGHT}" d="{to_d(glasses)}"/><path fill="{ORANGE}" d="{to_d(stache)}"/>', "Actuator Daddy disguise"))
save("disguise-glasses.svg", svg("0 16 200 88", f'<path fill="currentColor" d="{to_d(glasses)}"/>', "Disguise glasses", NIGHT))
save("disguise-stache.svg", svg("40 95 120 60", f'<path fill="currentColor" d="{to_d(stache)}"/>', "Disguise mustache", ORANGE))


# ---------- wordmark: Big Shoulders Display 900 ----------
def instance(path, axes):
    return instantiateVariableFont(TTFont(A(path)), axes)


def outline(font, text, track=0.0):
    gs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font["head"].unitsPerEm
    pen, bp, x = SVGPathPen(gs), BoundsPen(gs), 0
    for i, ch in enumerate(text):
        g = gs[cmap[ord(ch)]]
        if ch != " ":
            g.draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
            g.draw(TransformPen(bp, (1, 0, 0, 1, x, 0)))
        x += g.width + (track * upm if i < len(text) - 1 else 0)
    return pen.getCommands(), bp.bounds, font["OS/2"].sCapHeight


bs = instance("fonts-src/BigShoulders.ttf", {"opsz": 72, "wght": 900})
d1, b1, cap = outline(bs, "ACTUATOR", 0.012)
d2, b2, _ = outline(bs, "DADDY", 0.012)
lead = cap * 1.1
W = max(b1[2], b2[2]) - min(b1[0], b2[0])
x0 = -min(b1[0], b2[0])
stack = (f'<path fill="currentColor" transform="translate({x0:.0f} {cap:.0f})" d="{d1}"/>'
         f'<path fill="currentColor" transform="translate({x0:.0f} {cap + lead:.0f})" d="{d2}"/>')
SH = cap + lead
save("wordmark.svg", svg(f"0 0 {W:.0f} {SH:.0f}", stack, "Actuator Daddy", PAPER))
save("wordmark-ink.svg", svg(f"0 0 {W:.0f} {SH:.0f}", stack, "Actuator Daddy", NIGHT))
dl, bl, _ = outline(bs, "ACTUATOR DADDY", 0.012)
WL = bl[2] - bl[0]
line = f'<path fill="currentColor" transform="translate({-bl[0]:.0f} {cap:.0f})" d="{dl}"/>'
save("wordmark-line.svg", svg(f"0 0 {WL:.0f} {cap:.0f}", line, "Actuator Daddy", PAPER))

mh = SH * 1.08
gapx = mh * 0.2
mark = to_d(bigd())
lock = (f'<g transform="translate(0 {(SH - mh) / 2:.0f}) scale({mh / 200:.4f})"><path fill="{ORANGE}" d="{mark}"/></g>'
        f'<g transform="translate({mh + gapx:.0f} 0)">{stack}</g>')
save("lockup.svg", svg(f"0 {(SH - mh) / 2:.0f} {mh + gapx + W:.0f} {mh:.0f}", lock, "Actuator Daddy", PAPER))
save("lockup-ink.svg", svg(f"0 {(SH - mh) / 2:.0f} {mh + gapx + W:.0f} {mh:.0f}", lock, "Actuator Daddy", NIGHT))
print("identity v2 ok", round(W), "x", round(SH))
