// Daddy as live type. The grid comes from tools/make_daddy.py: one tone and one region per cell
// (0 blank, 1 skin ramp, 2 hair word, 3 knit word). The browser redraws every glyph, so the
// portrait can react: the hair spells ACTUATOR DADDY and lights up when the song says it,
// the knit lights up on "take that load", and the type scrambles where your pointer is.

const INK = '#111111', PAPER = '#F1F0EC', ORANGE = '#D9381E';
const FONT = (px) => `800 ${px}px "JetBrains Mono", ui-monospace, monospace`;

export function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

export class Poster {
  constructor(canvas, grid, paper) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.grid = grid; this.paper = paper;
    const { cols, rows } = grid;
    this.n = cols * rows;
    this.tone = new Uint8Array(this.n);
    for (let i = 0; i < this.n; i++) this.tone[i] = parseInt(grid.tone.substr(i * 2, 2), 16);
    this.region = Uint8Array.from(grid.region, (ch) => ch.charCodeAt(0) - 48);
    this.cells = [];
    for (let i = 0; i < this.n; i++) if (this.region[i]) this.cells.push(i);
    this.S = 2;                                   // canvas px per grid px
    canvas.width = Math.round(grid.w * this.S);
    canvas.height = Math.round(grid.h * this.S);
    this.hot = 0; this.hotStart = 0; this.hotEnd = 1; this.hotKind = 0;
    this.pulse = 0; this.ptr = null; this.dirty = true; this.flow = 0;
    this.atlas();
  }

  // every glyph we can need, pre-rendered in ink and in orange
  atlas() {
    const { cw, ch, ramp, hair, knit } = this.grid;
    const S = this.S, w = Math.ceil(cw * S) + 2, h = Math.ceil(ch * S) + 2;
    const chars = [...new Set((ramp + hair + knit).replace(' ', ''))];
    const a = document.createElement('canvas');
    a.width = w * chars.length; a.height = h * 2;
    const g = a.getContext('2d');
    g.font = FONT(cw * S / 0.6);
    g.textBaseline = 'middle';
    chars.forEach((c, i) => {
      g.fillStyle = INK; g.fillText(c, i * w + 1, h / 2);
      g.fillStyle = ORANGE; g.fillText(c, i * w + 1, h + h / 2);
    });
    this.A = a; this.aw = w; this.ah = h;
    this.idx = Object.fromEntries(chars.map((c, i) => [c, i]));
  }

  // hook lines: first half lights the hair (actuator daddy), second half the knit (take that load)
  hook(line, now) { this.hotStart = now; this.hotEnd = now + (line.end - line.start) * 1000; this.hot = 1; }
  beat() { this.pulse = 1; }
  pointer(x, y) { this.ptr = x === null ? null : [x, y]; }

  glyph(i, r, c, t, scramble) {
    const reg = this.region[i];
    const { hair, knit, ramp } = this.grid;
    if (reg === 2) return hair[(((r * 7 + c + this.flow) % hair.length) + hair.length) % hair.length];
    if (reg === 3) return knit[(c + r * 3) % knit.length];
    let k = Math.pow(1 - t / 255, 0.9) + this.pulse * 0.08;
    if (scramble) k = Math.min(1, k + scramble * (0.2 + 0.5 * Math.random()));
    return ramp[Math.min(ramp.length - 1, Math.max(0, Math.floor(k * ramp.length)))];
  }

  draw(now, dt) {
    const g = this.g, { cols, cw, ch } = this.grid, S = this.S;
    this.flow = Math.floor(now / 260);
    this.pulse *= Math.exp(-dt * 6);
    const hotP = this.hot ? (now - this.hotStart) / (this.hotEnd - this.hotStart) : -1;
    if (hotP > 1.05) this.hot = 0;

    g.clearRect(0, 0, this.c.width, this.c.height);
    g.drawImage(this.paper, 0, 0, this.c.width, this.c.height);
    const A = this.A, aw = this.aw, ah = this.ah;
    const px = this.ptr ? this.ptr[0] / S : -1e9, py = this.ptr ? this.ptr[1] / S : -1e9;
    const R2 = 70 * 70;
    for (const i of this.cells) {
      const r = (i / cols) | 0, c = i - r * cols;
      const x = c * cw, y = r * ch;
      const dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
      const scr = d2 < R2 ? 1 - d2 / R2 : 0;
      const ch_ = this.glyph(i, r, c, this.tone[i], scr);
      if (ch_ === ' ') continue;
      const reg = this.region[i];
      let lit = 0;
      if (hotP >= 0) {
        // a sweep left to right: hair in the first half of the line, knit in the second
        const sweep = reg === 2 ? hotP * 2 : reg === 3 ? (hotP - 0.5) * 2 : -1;
        if (sweep > c / cols) lit = 1;
      }
      const j = this.idx[ch_];
      if (j === undefined) continue;
      g.drawImage(A, j * aw, lit ? ah : 0, aw, ah, x * S - 1, y * S - 1, aw, ah);
    }
  }
}

// the record label: bridge orange, Big D in the middle, the title around the rim
export function drawLabel(canvas, px, mark) {
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d');
  const c = px / 2, R = px / 2;
  g.clearRect(0, 0, px, px);
  g.fillStyle = ORANGE;
  g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(241,240,236,.55)'; g.lineWidth = Math.max(1, px * 0.006);
  g.beginPath(); g.arc(c, c, R * 0.93, 0, Math.PI * 2); g.stroke();
  if (mark) {
    const m = R * 0.74;
    g.drawImage(mark, c - m / 2, c - m / 2, m, m);
  }
  if (px >= 96) {
    arcText(g, 'ACTUATOR DADDY', c, c, R * 0.8, -Math.PI / 2, px * 0.085, true);
    arcText(g, 'TAKE THAT LOAD', c, c, R * 0.8, Math.PI / 2, px * 0.07, false);
    g.fillStyle = PAPER;
    g.font = `800 ${px * 0.055}px "Big Shoulders", Impact, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('SIDE A', c - R * 0.62, c);
    g.fillText('45 RPM', c + R * 0.62, c);
  }
  // spindle hole
  g.fillStyle = '#060606';
  g.beginPath(); g.arc(c, c, Math.max(1.5, R * 0.05), 0, Math.PI * 2); g.fill();
}

function arcText(g, text, cx, cy, r, mid, size, top) {
  g.save();
  g.fillStyle = PAPER;
  g.font = `900 ${size}px "Big Shoulders", Impact, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const track = size * 0.08;
  const widths = [...text].map((ch) => g.measureText(ch).width + track);
  const total = widths.reduce((a, b) => a + b, 0) - track;
  let a = mid - (top ? 1 : -1) * (total / 2) / r;
  for (let i = 0; i < text.length; i++) {
    const w = widths[i];
    const am = a + (top ? 1 : -1) * (w - track) / 2 / r;
    g.save();
    g.translate(cx + Math.cos(am) * r, cy + Math.sin(am) * r);
    g.rotate(am + (top ? Math.PI / 2 : -Math.PI / 2));
    g.fillText(text[i], 0, 0);
    g.restore();
    a += (top ? 1 : -1) * w / r;
  }
  g.restore();
}
