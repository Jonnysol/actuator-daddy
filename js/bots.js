// Tiny actuator people. Their joints are actuator pucks and their heads are Big D.
// They wander along the bottom of the screen and dance whenever the song says "actuator daddy".
// Get the pointer close and they gang up into one giant humanoid that chases it,
// until they get bored and fall back apart into little guys.
import { beatAt } from './audio.js';

const PAPER = '#F1F0EC', ORANGE = '#D9381E', NIGHT = '#0B1117', DAY = '#1F2D3D';
const BORED_LINES = ['Bored now.', 'Rated for 79. Not this.', 'Thermal limit. Bye.', 'Back to work.', 'You win.', 'Union break.'];
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// giant skeleton: joints first (they read as the body), then bone midpoints for the rest of the crew
const SLOTS = ['head', 'neck', 'pelvis', 'shL', 'shR', 'elL', 'elR', 'haL', 'haR', 'hipL', 'hipR', 'knL', 'knR', 'ftL', 'ftR', 'chest',
  'mid:shL:elL', 'mid:shR:elR', 'mid:elL:haL', 'mid:elR:haR', 'mid:hipL:knL', 'mid:hipR:knR', 'mid:knL:ftL', 'mid:knR:ftR', 'mid:chest:pelvis', 'mid:neck:chest'];
const BONES = [['head', 'neck'], ['neck', 'chest'], ['chest', 'pelvis'], ['neck', 'shL'], ['neck', 'shR'], ['shL', 'elL'], ['elL', 'haL'], ['shR', 'elR'], ['elR', 'haR'],
  ['pelvis', 'hipL'], ['pelvis', 'hipR'], ['hipL', 'knL'], ['knL', 'ftL'], ['hipR', 'knR'], ['knR', 'ftR']];

export class Bots {
  constructor(canvas, deck) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.deck = deck;
    this.bots = []; this.mode = 'off';
    this.ptr = null; this.ptrSeen = 0; this.cool = 0;
    this.dance = 0; this.day = false; this.say = null;
    this.giant = { x: 0, y: 0, vx: 0, vy: 0, phase: 0, assemble: 0, t: 0, bored: 8, slump: 0, face: 1 };
    this.resize();
    addEventListener('resize', () => this.resize());
    const move = (e) => { this.ptr = [e.clientX, e.clientY]; this.ptrSeen = performance.now(); };
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerdown', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { this.ptr = null; });
  }
  resize() {
    const d = Math.min(devicePixelRatio, 2);
    this.W = innerWidth; this.H = innerHeight; this.d = d;
    this.c.width = this.W * d; this.c.height = this.H * d;
    this.floor = this.H - 3;
    this.U = clamp(this.H * 0.5, 200, 400);
  }

  start() {
    if (this.mode !== 'off') return;
    const n = this.W < 700 ? 16 : 26;
    for (let i = 0; i < n; i++) {
      const fromLeft = i % 2 === 0;
      this.bots.push({
        i, x: fromLeft ? -20 - i * 22 : this.W + 20 + i * 22, y: this.floor, vx: 0, vy: 0,
        dir: fromLeft ? 1 : -1, speed: rand(34, 58), phase: rand(0, TAU), state: 'walk',
        s: rand(0.92, 1.12), color: i % 4 === 1 ? ORANGE : PAPER, move: i % 4, pause: rand(3, 9), spin: 0,
        home: rand(0.06, 0.94),
      });
    }
    this.mode = 'wander';
  }

  hook(line) { this.dance = line ? line.end : 0; }
  // a dance on demand (the X button), on its own clock when the record isn't playing
  cheer(sec) { this.cheerUntil = performance.now() + sec * 1000; }
  setDay(on) { this.day = on; }

  // the crew assembles: each slot takes the nearest free bot
  gangUp() {
    const gi = this.giant;
    gi.x = clamp(this.ptr[0], this.U * 0.3, this.W - this.U * 0.3);
    gi.y = this.floor - this.U * 0.5; gi.vx = 0; gi.vy = 0; gi.t = 0; gi.assemble = 0; gi.slump = 0;
    gi.bored = rand(7, 9.5);
    const joints = this.skeleton(0);
    const free = [...this.bots];
    SLOTS.slice(0, this.bots.length).forEach((name, k) => {
      const p = joints[name];
      let best = 0, bd = 1e12;
      free.forEach((b, j) => { const d = (b.x - p[0]) ** 2 + (b.y - p[1]) ** 2; if (d < bd) { bd = d; best = j; } });
      const b = free.splice(best, 1)[0];
      b.slot = name; b.state = 'fly'; b.delay = k * 0.025; b.vx = rand(-60, 60); b.vy = rand(-420, -260);
    });
    this.mode = 'giant';
  }

  scatter() {
    const gi = this.giant;
    for (const b of this.bots) {
      b.state = 'fall'; b.slot = null;
      b.vx = (b.x - gi.x) * 2.2 + rand(-120, 120); b.vy = rand(-520, -180); b.spin = rand(-14, 14);
      b.dir = b.vx > 0 ? 1 : -1;
    }
    this.mode = 'wander'; this.cool = 3.5;
  }

  // giant joint positions for the current pose
  skeleton(dt) {
    const gi = this.giant, U = this.U;
    const t = performance.now() / 1000;
    const sl = gi.slump;
    const pel = [gi.x, gi.y + sl * U * 0.08];
    const lean = clamp(gi.vx / 900, -0.25, 0.25) * (1 - sl);
    const up = (a, l, from) => [from[0] + Math.sin(a) * l, from[1] - Math.cos(a) * l];
    const chest = up(lean, U * 0.27 * (1 - sl * 0.15), pel);
    const neck = up(lean + sl * 0.5, U * 0.14, chest);
    const head = up(lean + sl * 0.9, U * 0.1, neck);
    const shL = [neck[0] - U * 0.13, neck[1] + U * 0.03], shR = [neck[0] + U * 0.13, neck[1] + U * 0.03];
    const hipL = [pel[0] - U * 0.075, pel[1] + U * 0.02], hipR = [pel[0] + U * 0.075, pel[1] + U * 0.02];
    // legs: a walk when moving, dangling kicks when airborne
    const air = clamp((this.floor - U * 0.5 - gi.y) / (U * 0.3), 0, 1);
    const amp = clamp(Math.abs(gi.vx) / 200, 0.15, 0.6) * (1 - sl);
    const ph = gi.phase;
    const leg = (hip, side) => {
      const a = Math.sin(ph + (side > 0 ? 0 : Math.PI)) * amp + air * 0.3 * side;
      const knee = [hip[0] + Math.sin(a) * U * 0.24, hip[1] + Math.cos(a) * U * 0.24];
      const b = a - Math.max(0, Math.sin(ph + (side > 0 ? 0.9 : Math.PI + 0.9))) * 0.9 * (1 - air) - air * 0.5 + sl * 0.6;
      const foot = [knee[0] + Math.sin(b) * U * 0.24, knee[1] + Math.cos(b) * U * 0.24];
      return [knee, foot];
    };
    const [knL, ftL] = leg(hipL, -1), [knR, ftR] = leg(hipR, 1);
    // arms: the near arm reaches for the pointer (two-bone IK), the other pumps on the beat
    const L1 = U * 0.2, L2 = U * 0.2;
    const reach = (sh, tgt) => {
      let dx = tgt[0] - sh[0], dy = tgt[1] - sh[1];
      let d = Math.hypot(dx, dy); const m = L1 + L2 - 1;
      if (d > m) { dx *= m / d; dy *= m / d; d = m; }
      const a0 = Math.atan2(dy, dx);
      const cos = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
      const a1 = a0 - Math.acos(cos) * (tgt[0] > sh[0] ? 1 : -1);
      const el = [sh[0] + Math.cos(a1) * L1, sh[1] + Math.sin(a1) * L1];
      return [el, [sh[0] + dx, sh[1] + dy]];
    };
    const ptr = this.ptr || [gi.x + gi.face * U, gi.y];
    const dancing = this.dancing();
    const bt = dancing ? this.beat() : t * 1.5;
    const pump = (sh, side, k) => {
      const up = dancing ? (Math.floor(bt) % 2 === k ? -1 : 0.2) : 0.6;
      const a = Math.PI / 2 + side * (dancing ? 1.0 : 0.25 + Math.sin(t * 2 + k) * 0.08) + up * side * 0.9;
      const el = [sh[0] + Math.cos(a) * L1 * side * -1 * -1, sh[1] + Math.sin(a) * L1];
      const ha = [el[0] + side * L2 * (dancing ? 0.2 : 0.1), el[1] + L2 * (dancing && up < 0 ? -0.95 : 0.95)];
      return [el, ha];
    };
    const sag = (sh, side) => [[sh[0] + side * U * 0.04, sh[1] + L1], [sh[0] + side * U * 0.05, sh[1] + L1 + L2]];
    let elL, haL, elR, haR;
    if (sl > 0.3) { [elL, haL] = sag(shL, -1); [elR, haR] = sag(shR, 1); }
    else if (dancing) { [elL, haL] = pump(shL, -1, 0); [elR, haR] = pump(shR, 1, 1); }
    else if (ptr[0] < gi.x) { [elL, haL] = reach(shL, ptr); [elR, haR] = pump(shR, 1, 1); }
    else { [elR, haR] = reach(shR, ptr); [elL, haL] = pump(shL, -1, 0); }
    const J = { head, neck, chest, pelvis: pel, shL, shR, elL, elR, haL, haR, hipL, hipR, knL, knR, ftL, ftR };
    for (const s of SLOTS) if (s.startsWith('mid:')) {
      const [, a, b] = s.split(':');
      J[s] = [(J[a][0] + J[b][0]) / 2, (J[a][1] + J[b][1]) / 2];
    }
    return J;
  }

  songDance() { return !!this.dance && this.deck.time() < this.dance && Math.abs(this.deck.speed) > 0.5; }
  dancing() { return this.songDance() || performance.now() < (this.cheerUntil || 0); }
  beat() { return this.songDance() || Math.abs(this.deck.speed) > 0.5 ? beatAt(this.deck.time()) : performance.now() / 663; }

  update(dt) {
    if (this.mode === 'off') return;
    dt = Math.min(dt, 0.05);
    const W = this.W, F = this.floor, gi = this.giant;
    this.cool = Math.max(0, this.cool - dt);

    if (this.mode === 'wander' && this.ptr && this.cool === 0) {
      for (const b of this.bots) {
        if (b.state !== 'walk' && b.state !== 'idle') continue;
        if (Math.hypot(b.x - this.ptr[0], b.y - 18 - this.ptr[1]) < 64) { this.gangUp(); break; }
      }
    }

    if (this.mode === 'giant') {
      gi.t += dt;
      gi.assemble = Math.min(1, gi.assemble + dt * 1.1);
      const idle = performance.now() - this.ptrSeen > 4000;
      if (gi.slump === 0 && (gi.t > gi.bored || (!this.ptr && gi.t > 2) || (idle && gi.t > 4))) {
        gi.slump = 0.001;
        this.say = { text: BORED_LINES[(Math.random() * BORED_LINES.length) | 0], t: 0 };
      }
      if (gi.slump > 0) {
        gi.slump = Math.min(1, gi.slump + dt * 1.4);
        gi.vx *= Math.exp(-dt * 6);
        if (gi.slump >= 1 && this.say && this.say.t > 1.3) this.scatter();
      } else if (gi.assemble > 0.7 && this.ptr) {
        // chase: slower than a hand, so you can always get away
        const U = this.U;
        const side = this.ptr[0] >= gi.x ? 1 : -1;
        gi.face = side;
        const tx = clamp(this.ptr[0] - side * U * 0.3, U * 0.25, W - U * 0.25);
        const ty = clamp(this.ptr[1] + U * 0.05, U * 0.62, F - U * 0.5);
        gi.vx += clamp((tx - gi.x) * 3 - gi.vx * 2.2, -1400, 1400) * dt;
        gi.vx = clamp(gi.vx, -330, 330);
        gi.vy += ((ty - gi.y) * 5 - gi.vy * 3.2) * dt;
      }
      gi.x += gi.vx * dt; gi.y += gi.vy * dt;
      gi.y = Math.min(gi.y, F - this.U * 0.5);
      gi.phase += dt * (2 + Math.abs(gi.vx) / 40);
    }
    if (this.say) this.say.t += dt;
    if (this.say && this.say.t > 3) this.say = null;

    const J = this.mode === 'giant' ? this.skeleton(dt) : null;
    for (const b of this.bots) {
      switch (b.state) {
        case 'walk': {
          // wander toward a home spot, turn at the edges, sometimes stop and look around
          b.x += b.dir * b.speed * dt * (this.dancing() ? 0 : 1);
          b.phase += dt * b.speed * 0.16;
          b.pause -= dt;
          if (b.x < 14 && b.dir < 0) b.dir = 1;
          if (b.x > W - 14 && b.dir > 0) b.dir = -1;
          if (b.pause < 0) { b.state = 'idle'; b.pause = rand(1, 3); }
          break;
        }
        case 'idle':
          b.pause -= dt;
          if (b.pause < 0) { b.state = 'walk'; b.pause = rand(3, 10); if (Math.random() < 0.5) b.dir *= -1; }
          break;
        case 'fly': {
          if (b.delay > 0) { b.delay -= dt; b.x += b.vx * dt * 0.2; break; }
          const p = J[b.slot];
          b.vx += ((p[0] - b.x) * 60 - b.vx * 11) * dt;
          b.vy += ((p[1] - b.y) * 60 - b.vy * 11) * dt;
          b.x += b.vx * dt; b.y += b.vy * dt;
          b.spin += dt * 12;
          if (Math.hypot(p[0] - b.x, p[1] - b.y) < 6) b.state = 'slot';
          break;
        }
        case 'slot': {
          const p = J[b.slot];
          b.x += (p[0] - b.x) * (1 - Math.exp(-dt * 30));
          b.y += (p[1] - b.y) * (1 - Math.exp(-dt * 30));
          b.spin += dt * 2;
          break;
        }
        case 'fall':
          b.vy += 1500 * dt;
          b.x += b.vx * dt; b.y += b.vy * dt; b.spin += dt * 10;
          if (b.x < 10) { b.x = 10; b.vx = Math.abs(b.vx) * 0.5; }
          if (b.x > W - 10) { b.x = W - 10; b.vx = -Math.abs(b.vx) * 0.5; }
          if (b.y >= F) {
            b.y = F;
            if (Math.abs(b.vy) > 240) { b.vy *= -0.32; b.vx *= 0.6; }
            else { b.vy = 0; b.state = 'walk'; b.spin = 0; b.pause = rand(2, 6); b.dir = b.vx >= 0 ? 1 : -1; }
          }
          break;
      }
    }
    this.draw(J);
  }

  draw(J) {
    const g = this.g, d = this.d;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    const ink = this.day ? DAY : PAPER;
    if (J) {
      // the giant's body: bones first, faint, filled in by the crew
      const a = this.giant.assemble;
      g.strokeStyle = ink; g.lineCap = 'round';
      g.globalAlpha = 0.36 * a * (1 - this.giant.slump * 0.6);
      g.lineWidth = this.U * 0.045;
      g.beginPath();
      for (const [p, q] of BONES) { g.moveTo(...J[p]); g.lineTo(...J[q]); }
      g.stroke();
      g.globalAlpha = 1;
    }
    for (const b of this.bots) {
      if (b.state === 'fly' || b.state === 'slot' || b.state === 'fall') {
        const big = b.slot === 'head' && b.state === 'slot';
        this.puck(b.x, b.y, big ? this.U * 0.075 : 8 * b.s, b.spin, b.color === ORANGE ? ORANGE : ink, big);
      } else this.bot(b, ink);
    }
    if (this.say && J) {
      const [hx, hy] = J.head;
      this.bubble(hx + this.U * 0.06, hy - this.U * 0.12, this.say.text);
    }
  }

  // a curled-up bot: just its own actuator face
  puck(x, y, r, spin, col, big) {
    const g = this.g;
    g.save(); g.translate(x, y); g.rotate(big ? Math.sin(spin) * 0.15 : spin);
    g.fillStyle = col; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.fillStyle = NIGHT;
    const e = r * 0.26;
    const look = big && this.ptr ? clamp((this.ptr[0] - x) / 400, -1, 1) * r * 0.1 : 0;
    g.beginPath(); g.arc(-e + look, -r * 0.2, r * 0.12, 0, TAU); g.arc(e + look, -r * 0.2, r * 0.12, 0, TAU); g.fill();
    g.strokeStyle = NIGHT; g.lineWidth = r * 0.12; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-r * 0.46, r * 0.18); g.quadraticCurveTo(0, r * 0.62, r * 0.46, r * 0.18); g.stroke();
    if (big) {
      g.fillStyle = NIGHT;
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; g.beginPath(); g.arc(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86, r * 0.045, 0, TAU); g.fill(); }
    }
    g.restore();
  }

  bot(b, ink) {
    const g = this.g, s = b.s, dir = b.dir;
    const dancing = this.dancing();
    let hipA = 0, hipB = 0, knA = 0, knB = 0, shA = 0.2, shB = -0.2, elA = 0.4, elB = 0.4, bob = 0, lean = 0, hop = 0;
    if (dancing) {
      const bt = this.beat() + (b.i % 3) * 0.02;
      const f = bt - Math.floor(bt), n = Math.floor(bt);
      switch (b.move) {
        case 0: // pump
          shA = n % 2 ? 2.9 : 0.4; shB = n % 2 ? 0.4 : 2.9; elA = elB = 0.2; bob = (1 - f) * 3; knA = knB = (1 - f) * 0.5; hipA = hipB = -(1 - f) * 0.25;
          break;
        case 1: // the robot, obviously
          shA = [0.1, 1.57, 1.57, 2.8][n % 4]; shB = [1.57, 0.1, 2.8, 1.57][n % 4]; elA = elB = n % 2 ? 1.57 : 0; lean = n % 2 ? 0.12 : -0.12;
          break;
        case 2: // squat
          bob = Math.sin(f * Math.PI) * 5; knA = knB = Math.sin(f * Math.PI) * 1.1; hipA = hipB = -Math.sin(f * Math.PI) * 0.55; shA = shB = 1.45; elA = elB = 0.3;
          break;
        default: // hop and turn
          hop = Math.sin(f * Math.PI) * 9; shA = 2.5; shB = 2.5; elA = elB = 0.2; if (n % 4 === 0 && f < 0.1) b.dir = n % 8 ? 1 : -1;
      }
    } else if (b.state === 'walk') {
      const p = b.phase;
      hipA = Math.sin(p) * 0.55; hipB = -hipA;
      knA = Math.max(0, Math.sin(p + 0.9)) * 0.9; knB = Math.max(0, Math.sin(p + 0.9 + Math.PI)) * 0.9;
      shA = -hipA * 0.8; shB = -hipB * 0.8; elA = elB = 0.35; bob = Math.abs(Math.cos(p)) * 1.2; lean = 0.08;
    } else {
      const t = performance.now() / 1000 + b.i;
      shA = 0.15 + Math.sin(t * 1.3) * 0.05; shB = -0.1; bob = Math.sin(t * 2) * 0.4;
    }
    const x = b.x, y = b.y - hop;
    const pel = [x, y - (14 - bob) * s];
    const up = (a, l, p) => [p[0] + Math.sin(a) * dir * l * s, p[1] - Math.cos(a) * l * s];
    const down = (a, l, p) => [p[0] + Math.sin(a) * dir * l * s, p[1] + Math.cos(a) * l * s];
    const neck = up(lean, 11, pel);
    const head = up(lean, 6.5, neck);
    const kA = down(hipA, 7, pel), fA = down(hipA - knA, 7, kA);
    const kB = down(hipB, 7, pel), fB = down(hipB - knB, 7, kB);
    const eA = down(shA, 6, neck), hA = down(shA + elA, 5.5, eA);
    const eB = down(shB, 6, neck), hB = down(shB + elB, 5.5, eB);
    const col = b.color === ORANGE ? ORANGE : ink;
    g.lineCap = 'round'; g.lineJoin = 'round';
    const limb = (pts, w, alpha) => { g.globalAlpha = alpha; g.lineWidth = w * s; g.strokeStyle = col; g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.stroke(); g.globalAlpha = 1; };
    limb([neck, eB, hB], 2.2, 0.6); limb([pel, kB, fB], 2.6, 0.6);
    limb([pel, neck], 3.6, 1);
    limb([pel, kA, fA], 2.6, 1); limb([neck, eA, hA], 2.2, 1);
    // joints are actuators
    g.fillStyle = col; g.strokeStyle = NIGHT; g.lineWidth = 0.9;
    for (const p of [kA, eA, pel, neck]) { g.beginPath(); g.arc(p[0], p[1], 2.3 * s, 0, TAU); g.fill(); g.stroke(); g.fillStyle = NIGHT; g.beginPath(); g.arc(p[0], p[1], 0.7 * s, 0, TAU); g.fill(); g.fillStyle = col; }
    // head: Big D
    const r = 5.4 * s;
    g.fillStyle = col; g.beginPath(); g.arc(head[0], head[1], r, 0, TAU); g.fill();
    g.fillStyle = NIGHT;
    g.beginPath(); g.arc(head[0] - 1.7 * s + dir * 0.9 * s, head[1] - 1.1 * s, 0.9 * s, 0, TAU); g.arc(head[0] + 1.7 * s + dir * 0.9 * s, head[1] - 1.1 * s, 0.9 * s, 0, TAU); g.fill();
    g.strokeStyle = NIGHT; g.lineWidth = 0.9 * s;
    g.beginPath(); g.moveTo(head[0] - 2.5 * s + dir * 0.6 * s, head[1] + 1.2 * s); g.quadraticCurveTo(head[0] + dir * 0.6 * s, head[1] + 3.4 * s, head[0] + 2.5 * s + dir * 0.6 * s, head[1] + 1.2 * s); g.stroke();
  }

  bubble(x, y, text) {
    const g = this.g;
    g.font = '800 16px "Big Shoulders", Impact, sans-serif';
    const w = g.measureText(text).width + 20, h = 30;
    x = clamp(x, 8, this.W - w - 8); y = clamp(y, 8, this.H - h - 8);
    g.fillStyle = this.day ? '#fff' : PAPER;
    g.beginPath(); g.roundRect(x, y, w, h, 15); g.fill();
    g.beginPath(); g.moveTo(x + 14, y + h - 1); g.lineTo(x + 6, y + h + 9); g.lineTo(x + 24, y + h - 1); g.fill();
    g.fillStyle = NIGHT; g.textBaseline = 'middle';
    g.fillText(text, x + 10, y + h / 2 + 1);
  }
}
