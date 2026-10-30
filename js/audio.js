// The anthem on a turntable. An AudioWorklet reads the decoded song at any speed, backwards
// included, so the record can spin up, brake, and be scratched. The record's visual angle is
// derived from the playback position, so the disc you see is always the disc you hear.

const WORKLET = `
class Turntable extends AudioWorkletProcessor {
  constructor() {
    super();
    this.a = null; this.b = null; this.n = 0; this.sr = 44100;
    this.pos = 0; this.rate = 0; this.target = 0; this.k = 0.001; this.tick = 0; this.crackle = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.buffer) { this.a = m.buffer[0]; this.b = m.buffer[1]; this.n = this.a.length; this.sr = m.sr; }
      if (m.target !== undefined) this.target = m.target;
      if (m.k !== undefined) this.k = m.k;
      if (m.crackle !== undefined) this.crackle = m.crackle;
      if (m.seek !== undefined) { this.pos = m.seek * this.sr; this.rate = m.rate ?? this.rate; }
    };
  }
  process(_, outputs) {
    const o = outputs[0], L = o[0], R = o[1] || o[0];
    if (!this.a) { L.fill(0); if (R !== L) R.fill(0); return true; }
    const a = this.a, b = this.b, n = this.n, step = this.sr / sampleRate;
    for (let i = 0; i < L.length; i++) {
      this.rate += (this.target - this.rate) * this.k;
      let p = this.pos % n; if (p < 0) p += n;
      const i0 = p | 0, f = p - i0, i1 = i0 + 1 < n ? i0 + 1 : 0;
      // groove velocity sets the level, so a stopping record fades the way vinyl does
      const g = Math.min(1, Math.abs(this.rate) * 1.6);
      let c = 0;
      // the groove only crackles while it moves under the needle: a stopped record is silent
      if (this.crackle > 0 && g > 0.02) {
        if (Math.random() < 0.00022) c = (Math.random() - 0.5) * 0.32 * this.crackle * g;
        c += (Math.random() - 0.5) * 0.0028 * this.crackle * g;
      }
      L[i] = (a[i0] + (a[i1] - a[i0]) * f) * g + c;
      if (R !== L) R[i] = (b[i0] + (b[i1] - b[i0]) * f) * g + c;
      this.pos += this.rate * step;
    }
    if ((++this.tick & 7) === 0) this.port.postMessage({ pos: this.pos / this.sr, rate: this.rate });
    return true;
  }
}
registerProcessor('turntable', Turntable);
`;

// line timings from the track (whisper word timestamps, checked by ear)
export const LYRICS = [
  [0.0, 2.35, 'Tarun, Tarun, work that servo slow,'],
  [2.4, 4.85, 'drive that rod till the whole frame goes.'],
  [4.9, 7.6, 'Actuator daddy, take that load.', 1],
  [7.65, 10.25, 'Actuator daddy, take that load.', 1],
  [10.3, 12.95, 'Actuator daddy, take that load.', 1],
  [13.0, 15.55, 'Actuator daddy, take that load.', 1],
  [15.6, 18.2, 'Actuator daddy, take that load.', 1],
  [18.3, 20.85, 'Stoke that servo, make it cream.'],
  [20.9, 23.8, 'Tarun, Tarun, work that servo slow,'],
  [23.85, 26.05, 'drive that rod till the whole frame goes.'],
  [26.1, 28.75, 'Actuator daddy, take that load.', 1],
  [28.8, 31.4, 'Actuator daddy, take that load.', 1],
  [31.45, 34.05, 'Actuator daddy, take that load.', 1],
  [34.1, 36.7, 'Actuator daddy, take that load.', 1],
  [36.75, 39.5, 'Actuator daddy, take that load.', 1],
  [39.7, 42.35, 'Stoke that servo, make it cream.'],
  [42.4, 44.4, 'Stoke that servo…'],
  [50.6, 53.3, '…make it cream.'],
];
export const BREAK = [44.6, 50.5];   // the instrumental drop
// the hook lands every 2.654 s (one bar of four): fitted to all ten "actuator daddy" onsets
export const BEAT = 2.654 / 4, BEAT0 = 4.9;
export const beatAt = (t) => (t - BEAT0) / BEAT;

const RPM = 45;                      // it's a 7-inch single

export class Turntable {
  constructor(url) {
    this.url = url;
    this.ctx = null; this.node = null;
    this.pos = 0; this.rate = 0; this.stamp = performance.now();
    this.target = 0; this.duration = 64.8;
    this.playing = false; this.virtual = true; this.silent = false; this.scratching = false;
    // exactly one engine ever makes sound: 'worklet' (the turntable) or, only if Web Audio
    // can't load at all, 'element' (a plain <audio>). Until one is ready a virtual clock keeps time.
    this.engine = 'virtual'; this.el = null; this.keep = null;
    this.level = 0; this.bass = 0; this.pulse = 0;
    this.line = -1; this.inBreak = false; this.beatN = null;
    this.handlers = {};
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  emit(ev, d) { (this.handlers[ev] || []).forEach((f) => f(d)); }

  // decoding can start before any gesture; the context just stays suspended
  init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx || !('audioWorklet' in Ctx.prototype)) throw new Error('no AudioWorklet');
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      const [, data] = await Promise.all([
        this.ctx.audioWorklet.addModule(url),
        fetch(this.url).then((r) => r.arrayBuffer()),
      ]);
      const buf = await this.ctx.decodeAudioData(data);
      this.duration = buf.duration;
      this.node = new AudioWorkletNode(this.ctx, 'turntable', { numberOfInputs: 0, outputChannelCount: [2] });
      const ch = [buf.getChannelData(0).slice(), (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice()];
      this.node.port.postMessage({ buffer: ch, sr: buf.sampleRate }, ch.map((c) => c.buffer));
      this.node.port.onmessage = (e) => {
        if (this.virtual) return;
        this.pos = e.data.pos; this.rate = e.data.rate; this.stamp = performance.now();
      };
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.72;
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.92;
      this.node.connect(this.analyser).connect(this.out).connect(this.ctx.destination);
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      if (!this.silent) this.goLive();
    })().catch(() => this.useElement());
    return this.ready;
  }

  // the last resort, and only when the turntable could not load: never both at once
  useElement() {
    if (this.engine === 'worklet' || this.el) return;
    this.engine = 'element';
    this.el = new Audio(this.url);
    this.el.loop = true; this.el.preload = 'auto';
    this.kick();
  }

  // call from every tap and key: starts or resumes whichever engine should be sounding, never a second one
  kick() {
    if (this.silent || !this.playing) return;
    if (this.engine === 'worklet' && this.ctx && this.ctx.state !== 'running') this.ctx.resume();
    if (this.engine === 'element' && this.el.paused && !this.scratching) {
      this.el.currentTime = this.time();
      this.el.play().catch(() => {});
    }
    if (this.keep && this.keep.paused) this.keep.play().catch(() => {});
  }

  // inside the first tap: ask iOS for a playback session so the silent switch doesn't mute the song.
  // Older iOS has no audioSession; there a looping silent clip does the same job while the record plays.
  unlock(silence) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
    if (!this.keep && !navigator.audioSession && /iP(hone|ad|od)|Macintosh.*Mobile/.test(navigator.userAgent) && silence) {
      this.keep = new Audio(silence); this.keep.loop = true;
      this.keep.play().catch(() => {});
    }
    // iOS only lets a media element play later if it was started inside a tap; play+pause does that silently
    if (this.el && this.el.paused) { this.el.play().catch(() => {}); if (!this.playing) this.el.pause(); }
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
  }

  // hand the record from the virtual clock to the real audio, at the same position and speed
  goLive() {
    if (!this.node || this.engine === 'element') return;
    this.node.port.postMessage({ seek: this.position(), rate: this.rate });
    this.virtual = false; this.engine = 'worklet';
    this.send(this.target, this.tau || 0.3, this.playing ? 1 : undefined);
  }
  unmute() {
    this.silent = false;
    if (this.node && this.virtual) this.goLive();
    this.kick();
    this.emit('state', this.playing);
  }

  get autoplayAllowed() { return !!this.ctx && this.ctx.state === 'running'; }

  // exponential approach with time constant tau (seconds), per sample
  send(target, tau, crackle) {
    this.target = target; this.tau = tau;
    if (this.virtual || !this.node) return;
    const k = 1 - Math.exp(-1 / (Math.max(0.002, tau) * this.ctx.sampleRate));
    this.node.port.postMessage({ target, k, ...(crackle !== undefined ? { crackle } : {}) });
  }

  play(spinup = 0.9) {
    this.playing = true;
    this.send(1, spinup / 3, 1);
    this.kick();
    this.emit('state', true);
  }
  stop(brake = 1.3) {
    this.playing = false;
    this.send(0, brake / 3);
    if (this.el) this.el.pause();
    if (this.keep) setTimeout(() => { if (!this.playing) this.keep.pause(); }, brake * 1000);
    this.emit('state', false);
  }
  toggle() { this.playing ? this.stop() : this.play(); }

  // scratching: the hand owns the record until it lets go, then the motor takes it back up to speed
  grab() { this.scratching = true; this.send(0, 0.03); if (this.el) this.el.pause(); }
  drag(rate) { if (this.scratching) this.send(Math.max(-4, Math.min(4, rate)), 0.02); }
  release() { this.scratching = false; this.send(this.playing ? 1 : 0, 0.22); this.kick(); }

  // unwrapped playback position in seconds (keeps counting across loops)
  position() {
    return this.pos + this.rate * (performance.now() - this.stamp) / 1000;
  }
  time() {
    const d = this.duration;
    return ((this.position() % d) + d) % d;
  }
  angle() { return this.position() * (RPM / 60) * Math.PI * 2; }
  get speed() { return this.rate; }

  update(dt) {
    if (this.virtual) {
      // no audio yet (silent entry, still decoding, or no Web Audio): a virtual record keeps time
      const tau = this.tau || 0.3;
      this.rate += (this.target - this.rate) * (1 - Math.exp(-dt / tau));
      this.pos += this.rate * dt; this.stamp = performance.now();
      this.level = 0; this.bass = 0;
      if (this.el && !this.el.paused) {
        const d = this.el.currentTime - this.time();
        if (Math.abs(d) > 0.25 && Math.abs(d) < this.duration / 2) this.pos += d;
      }
    } else {
      this.analyser.getByteFrequencyData(this.freq);
      let b = 0, l = 0;
      for (let i = 1; i < 7; i++) b += this.freq[i];
      for (let i = 1; i < 160; i++) l += this.freq[i];
      this.bass = b / (6 * 255);
      this.level = l / (159 * 255);
    }
    this.pulse *= Math.exp(-dt * 7);

    const moving = Math.abs(this.rate) > 0.5;
    const t = this.time();
    // beats come from the song's own grid, so silent mode dances in time too
    const bn = moving ? Math.floor(beatAt(t)) : null;
    if (bn !== this.beatN) {
      if (bn !== null && this.beatN !== null && bn > this.beatN) { this.pulse = 1; this.emit('beat', bn); }
      this.beatN = bn;
    }
    let idx = -1;
    if (moving) for (let i = 0; i < LYRICS.length; i++) if (t >= LYRICS[i][0] && t < LYRICS[i][1]) { idx = i; break; }
    if (idx !== this.line) {
      this.line = idx;
      this.emit('line', idx < 0 ? null : { text: LYRICS[idx][2], hook: !!LYRICS[idx][3], start: LYRICS[idx][0], end: LYRICS[idx][1] });
    }
    const brk = moving && t >= BREAK[0] && t < BREAK[1];
    if (brk !== this.inBreak) { this.inBreak = brk; this.emit('break', brk); }
  }
}
