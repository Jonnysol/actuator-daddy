# /// script
# dependencies = ["pillow", "numpy", "scipy"]
# ///
"""Turn the Vision cutout of Daddy into a black-and-white ASCII paper cutout.

Outputs (assets/):
  daddy-ascii.png   hi-res static render (transparent around the paper)
  daddy-ascii-shadow.png  same with a baked drop shadow, for posters / OG
  daddy-paper.png   paper silhouette only (the live renderer draws glyphs on it)
  daddy-grid.json   per-cell tone + region so the browser can redraw the glyphs live
"""
import json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda p: os.path.join(ROOT, p)

COLS = 160
ASPECT = 1.75          # cell height / cell width
OUT = 2                # output scale vs. source pixels
BORDER = 13            # paper margin around the silhouette, source px
PAD = 34               # transparent padding, source px
PAPER = (241, 240, 236)
INK = (17, 17, 17)
HAIR_WORD = "ACTUATORDADDY"
KNIT_WORD = "TAKETHATLOAD"

src = Image.open(A("assets/src/daddy-cutout.png")).convert("RGBA")
w0, h0 = src.size
canvas = Image.new("RGBA", (w0 + 2 * PAD, h0 + 2 * PAD), (0, 0, 0, 0))
canvas.paste(src, (PAD, PAD))
rgba = np.asarray(canvas).astype(np.float32) / 255
W, H = canvas.size

alpha = ndimage.gaussian_filter(rgba[..., 3], 1.2) > 0.5
lum = rgba[..., 0] * 0.299 + rgba[..., 1] * 0.587 + rgba[..., 2] * 0.114

# tone: hair and sweater are near-black, so equalise the skin on its own,
# otherwise the dark mass eats the whole range and the face washes out
DARK = 0.2
dark_px = alpha & (lum < DARK)
skin = alpha & ~dark_px
vals = np.sort(lum[skin])
s = np.interp(lum, vals, np.linspace(0, 1, len(vals)))
# flatten the side light: normalise against a wide local mean so features, not shading, carry the likeness
skin_f = skin.astype(np.float32)
m = ndimage.gaussian_filter(lum * skin_f, 14) / np.maximum(ndimage.gaussian_filter(skin_f, 14), 1e-3)
v = ndimage.gaussian_filter((lum - m) ** 2 * skin_f, 14) / np.maximum(ndimage.gaussian_filter(skin_f, 14), 1e-3)
local = np.clip(0.64 + (lum - m) / (np.sqrt(v) + 0.03) * 0.26, 0, 1)
detail = ndimage.gaussian_filter(lum, 0.8) - ndimage.gaussian_filter(lum, 4)
tone = np.clip(0.35 * s ** 0.7 + 0.65 * local + detail * 3.8, 0, 1)
tone[dark_px] = lum[dark_px] * 0.5
tone[~alpha] = 1

# paper silhouette: dilate, then smooth so it reads as a scissor cut
dist = ndimage.distance_transform_edt(~alpha)
paper = ndimage.gaussian_filter((dist <= BORDER).astype(np.float32), 3.0) > 0.5

# grid
cw = W / COLS
ch = cw * ASPECT
ROWS = int(H // ch)
cells_tone = np.full((ROWS, COLS), 255, np.uint8)
cells_region = np.zeros((ROWS, COLS), np.uint8)   # 0 blank, 1 ramp, 2 hair word, 3 knit word
y_split = None
# neckline: first row below the chin where the dark sweater dominates the subject width
for r in range(ROWS):
    for c in range(COLS):
        y0, y1 = int(r * ch), int((r + 1) * ch)
        x0, x1 = int(c * cw), int((c + 1) * cw)
        a = alpha[y0:y1, x0:x1]
        if a.mean() < 0.45:
            continue
        t = tone[y0:y1, x0:x1][a].mean()
        cells_tone[r, c] = int(round(t * 255))
        cells_region[r, c] = 1 if lum[y0:y1, x0:x1][a].mean() >= 0.17 else 4

# regions for the word fills: the raw-black cells, hair above the chin, knit below
dark = cells_region == 4
rows_dark = dark.sum(1)
mid = ROWS // 2
chin = mid + int(np.argmax(rows_dark[mid:] > COLS * 0.18))
for r in range(ROWS):
    for c in range(COLS):
        if dark[r, c]:
            cells_region[r, c] = 2 if r < chin - 2 else 3

# glyph ramp measured from the actual font
FONT = A("fonts-src/JetBrainsMono.ttf")
fsize = cw * OUT / 0.6
font = ImageFont.truetype(FONT, int(round(fsize)))
font.set_variation_by_axes([800])
cand = "".join(chr(i) for i in range(33, 127))
cov = {}
cwo, cho = int(round(cw * OUT)), int(round(ch * OUT))
for g in cand:
    im = Image.new("L", (cwo, cho), 0)
    ImageDraw.Draw(im).text((0, cho * 0.5), g, font=font, fill=255, anchor="lm")
    cov[g] = np.asarray(im).mean() / 255
order = sorted(cov, key=cov.get)
maxc = cov[order[-1]]
# curated glyphs, ordered by their measured ink in this font
CURATED = ".,:;-=+*ixoeas2CO0%&#$B8MW@"
RAMP = " " + "".join(sorted(CURATED, key=cov.get))


def glyph_for(r, c, t):
    reg = cells_region[r, c]
    if reg == 2:
        return HAIR_WORD[(r * 7 + c) % len(HAIR_WORD)]
    if reg == 3:
        return KNIT_WORD[(c + r * 3) % len(KNIT_WORD)]
    k = (1 - t / 255) ** 0.9
    return RAMP[min(len(RAMP) - 1, int(k * len(RAMP)))]


def render(shadow=False):
    Wo, Ho = W * OUT, H * OUT
    paper_img = Image.fromarray((paper * 255).astype(np.uint8)).resize((Wo, Ho), Image.LANCZOS)
    base = Image.new("RGBA", (Wo, Ho), PAPER + (0,))
    rng = np.random.default_rng(7)
    grain = (rng.normal(0, 5, (Ho, Wo))).astype(np.int16)
    pap = np.zeros((Ho, Wo, 4), np.int16)
    for i in range(3):
        pap[..., i] = PAPER[i] + grain
    pap[..., 3] = np.asarray(paper_img)
    base = Image.fromarray(np.clip(pap, 0, 255).astype(np.uint8), "RGBA")
    ink = Image.new("L", (Wo, Ho), 0)
    d = ImageDraw.Draw(ink)
    for r in range(ROWS):
        for c in range(COLS):
            if not cells_region[r, c]:
                continue
            g = glyph_for(r, c, cells_tone[r, c])
            if g == " ":
                continue
            d.text((c * cw * OUT, (r + 0.5) * ch * OUT), g, font=font, fill=255, anchor="lm")
    # photocopy: slight spread + speckle loss
    ink = ink.filter(ImageFilter.GaussianBlur(0.6)).point(lambda v: 255 if v > 92 else int(v * 1.6))
    speck = (rng.random((Ho, Wo)) > 0.985) * 200
    ink_a = np.clip(np.asarray(ink).astype(np.int16) - speck, 0, 255).astype(np.uint8)
    ink_layer = Image.new("RGBA", (Wo, Ho), INK + (0,))
    ink_layer.putalpha(Image.fromarray(ink_a))
    out = Image.alpha_composite(base, ink_layer)
    if shadow:
        sh = Image.new("RGBA", (Wo, Ho), (0, 0, 0, 0))
        sh.putalpha(paper_img.filter(ImageFilter.GaussianBlur(18)).point(lambda v: int(v * 0.42)))
        shifted = Image.new("RGBA", (Wo, Ho), (0, 0, 0, 0))
        shifted.paste(sh, (14, 22))
        out = Image.alpha_composite(shifted, out)
    return out, base


static, paper_only = render()
static.save(A("assets/daddy-ascii.png"), optimize=True)
render(shadow=True)[0].save(A("assets/daddy-ascii-shadow.png"), optimize=True)
paper_only.resize((W, H), Image.LANCZOS).save(A("assets/daddy-paper.png"), optimize=True)

meta = {
    "w": W, "h": H, "cols": COLS, "rows": ROWS, "cw": cw, "ch": ch,
    "ramp": RAMP, "hair": HAIR_WORD, "knit": KNIT_WORD,
    # tone per cell as hex, region per cell as digits
    "tone": "".join(f"{v:02x}" for v in cells_tone.flatten()),
    "region": "".join(str(v) for v in cells_region.flatten()),
}
json.dump(meta, open(A("assets/daddy-grid.json"), "w"), separators=(",", ":"))
print("grid", COLS, "x", ROWS, "ramp", repr(RAMP), "chin row", chin, "size", static.size)
