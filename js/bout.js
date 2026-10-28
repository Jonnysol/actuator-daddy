// Take that load: hold to drive Big Daddy at peak torque and let go before the windings cook.
// Copper loss goes with the square of the current (and so of torque), the housing sheds heat in
// proportion to how hot it is. Class F insulation is good to 155 °C; past that the driver derates
// to rated torque, which this model holds forever without complaint. The numbers are a toy,
// the shape is real.
const PEAK = 230, RATED = 79, LIMIT = 155, AMBIENT = 40;
const TORQUE_DASH = 339.3, HEAT_DASH = 295.3;

const RANKS = [
  [145, 'Undisputed', (s, T) => `Undisputed. ${s} seconds at ${PEAK} N·m, out at ${T} °C.`],
  [120, 'Contender', (s, T) => `Contender. ${T} °C. There was more in him.`],
  [80, 'Warm-up', () => 'Warm-up. He has barely broken a sweat.'],
  [-1, 'Handshake', () => 'That was a handshake.'],
];

export class Bout {
  constructor({ stage, deck, onActive }) {
    this.stage = stage; this.deck = deck;
    this.$ = (id) => document.getElementById(id);
    this.btn = this.$('hold'); this.label = this.$('hold-label');
    this.ringT = this.btn.querySelector('.hold-torque'); this.ringH = this.btn.querySelector('.hold-heat');
    this.tau = 0; this.T = AMBIENT; this.Tmax = AMBIENT; this.peak = 0;
    this.holding = false; this.tripped = false; this.round = false; this.inView = false;
    this.result = null;

    const press = (e) => { e.preventDefault(); this.press(); };
    const release = () => this.release();
    this.btn.addEventListener('pointerdown', (e) => { this.btn.setPointerCapture(e.pointerId); press(e); });
    this.btn.addEventListener('pointerup', release);
    this.btn.addEventListener('pointercancel', release);
    this.btn.addEventListener('contextmenu', (e) => e.preventDefault());
    this.btn.addEventListener('click', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.repeat || !this.inView) return;
      const t = e.target;
      if (t !== document.body && t !== this.btn) return;
      e.preventDefault(); this.press();
    });
    addEventListener('keyup', (e) => { if (e.code === 'Space' && this.holding) { e.preventDefault(); this.release(); } });
    this.$('card-btn').addEventListener('click', () => this.card());
    this.onActive = onActive;
  }

  press() {
    if (this.holding) return;
    this.holding = true; this.tripped = false; this.round = true;
    this.Tmax = this.T; this.peak = 0;
    this.btn.classList.add('on');
    this.label.textContent = this.T > 90 ? 'Still hot' : 'Loading';
    this.$('verdict').textContent = '';
    this.$('card-btn').hidden = true;
    this.whine(true);
    this.onActive?.(true);
  }

  release() {
    if (!this.holding) return;
    this.holding = false;
    this.btn.classList.remove('on');
    this.whine(false);
    this.onActive?.(false);
    const s = this.peak.toFixed(1), T = Math.round(this.Tmax);
    if (this.tripped) {
      this.result = { rank: 'Derated', s, T: LIMIT };
      this.$('verdict').textContent = `Thermal limit. He derated himself to ${RATED} N·m and kept going, like a professional.`;
    } else {
      const [, rank, line] = RANKS.find(([min]) => this.Tmax >= min);
      this.result = { rank, s, T };
      this.$('verdict').textContent = line(s, T);
    }
    this.label.textContent = 'Again';
    this.$('card-btn').hidden = false;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const goal = this.holding ? (this.tripped ? RATED : PEAK) : 0;
    this.tau += (goal - this.tau) * (1 - Math.exp(-dt * (this.holding ? 5 : 6)));
    const dT = 3.6 * (this.tau / RATED) ** 2 - 0.15 * (this.T - AMBIENT);
    this.T = Math.max(AMBIENT, this.T + dT * dt);
    if (this.holding) {
      if (this.tau > PEAK - 10) this.peak += dt;
      this.Tmax = Math.max(this.Tmax, this.T);
      if (!this.tripped && this.T >= LIMIT) {
        this.tripped = true; this.T = LIMIT;
        this.label.textContent = 'Derated';
      }
    }
    if (this.osc) {
      const now = this.deck.ctx.currentTime;
      this.osc.frequency.setTargetAtTime(55 + this.tau * 1.6, now, 0.05);
      this.amp.gain.setTargetAtTime(this.holding ? 0.035 * (this.tau / PEAK) : 0, now, 0.06);
    }
    const heat = Math.max(0, (this.T - AMBIENT) / (LIMIT - AMBIENT));
    this.stage.heat(heat);
    if (!this.inView && !this.holding && heat < 0.01) return;
    this.$('g-torque').textContent = Math.round(this.tau);
    this.$('g-temp').textContent = Math.round(this.T);
    this.$('g-time').textContent = this.peak.toFixed(2);
    this.ringT.style.strokeDashoffset = TORQUE_DASH * (1 - this.tau / PEAK);
    this.ringH.style.strokeDashoffset = HEAT_DASH * (1 - Math.min(1, heat));
  }

  // a quiet motor whine that climbs with torque
  whine(on) {
    const ctx = this.deck.ctx;
    if (!ctx || ctx.state !== 'running' || this.deck.silent) return;
    if (!this.osc && on) {
      this.osc = ctx.createOscillator(); this.osc.type = 'sawtooth'; this.osc.frequency.value = 55;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 4;
      this.amp = ctx.createGain(); this.amp.gain.value = 0;
      this.osc.connect(lp).connect(this.amp).connect(ctx.destination);
      this.osc.start();
    }
  }

  async card() {
    const r = this.result;
    if (!r) return;
    const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
    await Promise.all([document.fonts.load('900 100px "Big Shoulders"'), document.fonts.load('italic 40px "Instrument Serif"')]);
    const [mark, word, daddy] = await Promise.all([load('brand/bigd-wink-orange.svg'), load('brand/wordmark.svg'), load('assets/daddy-ascii-shadow.png')]);
    const W = 1080, H = 1350, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#0B1117'; g.fillRect(0, 0, W, H);
    if (daddy) g.drawImage(daddy, W - 650, H - 690, 680, 660);
    if (mark) g.drawImage(mark, 72, 72, 132, 132);
    if (word) { const h = 104; g.drawImage(word, 228, 86, (word.naturalWidth / word.naturalHeight || 2.6) * h, h); }
    g.fillStyle = '#A4ADB9'; g.font = '700 30px "Big Shoulders"';
    g.fillText('LOAD CARD   ARTUS III', 72, 290);
    g.fillStyle = r.rank === 'Undisputed' ? '#D9381E' : '#F1F0EC';
    let size = 230;
    g.font = `900 ${size}px "Big Shoulders"`;
    const rank = r.rank.toUpperCase();
    while (g.measureText(rank).width > W - 144 && size > 80) { size -= 6; g.font = `900 ${size}px "Big Shoulders"`; }
    g.fillText(rank, 66, 290 + size * 0.95);
    g.fillStyle = '#F1F0EC'; g.font = '900 120px "Big Shoulders"';
    const y0 = 290 + size * 0.95 + 150;
    g.fillText(`${r.s}s`, 72, y0);
    g.fillText(`${r.T}°C`, 72, y0 + 150);
    g.fillStyle = '#A4ADB9'; g.font = '700 30px "Big Shoulders"';
    g.fillText(`AT ${PEAK} N·M`, 76, y0 + 42);
    g.fillText('PEAK WINDINGS', 76, y0 + 192);
    g.fillStyle = '#F1F0EC'; g.font = 'italic 46px "Instrument Serif"';
    g.fillText('Take that load.', 72, H - 120);
    g.fillStyle = '#D9381E'; g.font = '800 34px "Big Shoulders"';
    g.fillText('ACTUATORDADDY.COM', 72, H - 66);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
    const url = URL.createObjectURL(blob);
    const dlg = this.$('card-dialog');
    this.$('card-img').src = url;
    this.$('card-img').alt = `Load card: ${r.rank}, ${r.s} seconds at ${PEAK} newton metres, peak windings ${r.T} degrees.`;
    this.$('card-download').href = url;
    const file = new File([blob], 'actuator-daddy-load-card.png', { type: 'image/png' });
    const share = this.$('card-share');
    share.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    share.onclick = () => navigator.share({ files: [file], text: `${r.rank}. I took that load. actuatordaddy.com` }).catch(() => {});
    this.$('card-close').onclick = () => dlg.close();
    dlg.showModal();
  }
}
