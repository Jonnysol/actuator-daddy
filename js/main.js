// Actuator Daddy: wiring. The record is the clock: the audio position drives the disc you see,
// the subtitles, the beats, the poster and the dancers. Scroll picks the camera shot.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { Turntable } from './audio.js';
import { Poster, drawLabel, loadImage } from './ascii.js';
import { Bots } from './bots.js';
import { Bout } from './bout.js';

gsap.registerPlugin(ScrollTrigger);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const RPM_RAD = (45 / 60) * Math.PI * 2;

const deck = new Turntable('assets/anthem.mp3');
deck.init().catch(() => {});        // decode while the sleeve is up; stays on the virtual clock if it fails

// smooth scroll, held until the needle drops
const lenis = reduced ? null : new Lenis({ anchors: true });
if (lenis) {
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  lenis.stop();
}
gsap.ticker.lagSmoothing(0);

// the 3D stage loads on its own; the page works without it
let stage = null;
const stageReady = import('./scene.js')
  .then(({ Stage }) => {
    stage = new Stage($('#stage'), deck); stage.shot('intro'); stage.snap();
    const table = $('.tape');
    stage.anchorY = () => table.getBoundingClientRect().top - 4;
    return stage;
  })
  .catch((e) => { console.warn('3D stage off:', e); $('#stage').remove(); return null; });

// labels for every record on the page
const markP = loadImage('brand/bigd-paper.svg');
Promise.all([markP, document.fonts.load('900 40px "Big Shoulders"'), stageReady]).then(([mark]) => {
  for (const c of $$('.disc-label')) {
    const px = Math.ceil(c.getBoundingClientRect().width * Math.min(devicePixelRatio, 2));
    drawLabel(c, Math.max(px, 48), mark);
  }
  stage?.setLabel((c, px) => drawLabel(c, px, mark));
});

// the poster: Daddy as live type
let poster = null;
Promise.all([fetch('assets/daddy-grid.json').then((r) => r.json()), loadImage('assets/daddy-paper.png'), document.fonts.load('800 20px "JetBrains Mono"')])
  .then(([grid, paper]) => { poster = new Poster($('#poster'), grid, paper); poster.draw(0, 0); })
  .catch((e) => console.warn('poster:', e));
let posterVisible = false;
new IntersectionObserver(([e]) => { posterVisible = e.isIntersecting; }).observe($('#poster'));
$('#poster').addEventListener('pointermove', (e) => {
  const c = e.currentTarget, r = c.getBoundingClientRect();
  poster?.pointer((e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height);
});
$('#poster').addEventListener('pointerleave', () => poster?.pointer(null));

const bots = reduced ? null : new Bots($('#bots'), deck);
let bout = null;
stageReady.then(() => {
  bout = new Bout({ stage: stage || { heat() {} }, deck });
});

// ---------- the needle drop ----------
let started = false;
let shot = 'hero';
function drop(sound) {
  if (started) return;
  started = true;
  deck.silent = !sound;
  if (sound && deck.ctx && deck.ctx.state !== 'running') deck.ctx.resume();   // must happen inside the gesture
  const sl = $('#sleeve');
  const tl = gsap.timeline();
  tl.to('.disc-out', { xPercent: 70, rotation: 400, duration: 1.1, ease: 'power2.inOut' }, 0)
    .to('.sleeve-art', { xPercent: -40, rotation: -8, opacity: 0, duration: 0.9, ease: 'power2.in' }, 0.15)
    .to('.sleeve-copy', { opacity: 0, y: 20, duration: 0.4 }, 0)
    .to('.disc-out', { scale: 0.4, opacity: 0, duration: 0.6, ease: 'power2.in' }, 0.75)
    .to(sl, { opacity: 0, duration: 0.7, ease: 'power1.out' }, 0.8)
    .add(() => {
      sl.remove();
      document.body.classList.remove('is-loading');
      lenis?.start();
      $('#player').hidden = false;
      gsap.from('#player', { y: 40, opacity: 0, duration: 0.6, ease: 'back.out(2)' });
      gsap.from('.hud', { y: -20, opacity: 0, duration: 0.6 });
    }, 1.45);
  stage?.shot('hero');
  // the arm swings over, then the needle drops and the platter comes up to speed
  gsap.delayedCall(1.35, () => deck.play(0.45));
  gsap.delayedCall(2.6, () => bots?.start());
  gsap.delayedCall(1.6, () => setShot(shot, true));
}
$('#drop').addEventListener('click', () => drop(true));
$('#silent').addEventListener('click', (e) => { e.stopPropagation(); drop(false); });
$('#sleeve').addEventListener('click', (e) => { if (!e.target.closest('button')) drop(true); });
addEventListener('keydown', (e) => {
  if (started || ['Tab', 'Shift', 'Meta', 'Alt', 'Control'].includes(e.key) || e.target.closest?.('#silent')) return;
  drop(true);
});
$('#drop').focus({ preventScroll: true });
// if the browser lets us play without a gesture, just play
deck.ready?.then(() => { if (deck.autoplayAllowed && !started) setTimeout(() => drop(true), 1400); }).catch(() => {});

// ---------- subtitles, hooks, beats ----------
const lyric = $('#lyric');
let disguiseOn = false, disguiseLocked = false;
deck.on('line', (l) => {
  if (l) {
    lyric.textContent = l.text;
    lyric.classList.toggle('hook', l.hook);
    lyric.classList.add('on');
  } else lyric.classList.remove('on');
  if (l?.hook) {
    poster?.hook(l, performance.now());
    bots?.hook(l);
    if (!disguiseLocked) disguise(true);
  } else {
    bots?.hook(null);
    if (!disguiseLocked) disguise(false);
  }
});
const brandImg = $('.hud-brand img');
deck.on('beat', () => {
  poster?.beat();
  if (!document.body.classList.contains('day')) gsap.fromTo(brandImg, { scale: 1.16 }, { scale: 1, duration: 0.32, ease: 'power2.out', overwrite: true });
});
deck.on('state', (on) => {
  const b = $('#playpause');
  b.classList.toggle('paused', !on);
  b.setAttribute('aria-label', on ? 'Stop the record' : 'Play the record');
});

// ---------- the disguise ----------
gsap.set('.disguise', { rotation: -6, opacity: 0 });
function disguise(on) {
  if (on === disguiseOn) return;
  disguiseOn = on;
  if (on) {
    gsap.fromTo('.d-glasses', { yPercent: -260, rotation: -26, opacity: 1 }, { yPercent: 0, rotation: -6, duration: 0.55, ease: 'bounce.out', overwrite: true });
    gsap.fromTo('.d-stache', { scale: 0, opacity: 1 }, { scale: 1, duration: 0.45, delay: 0.18, ease: 'back.out(3)', overwrite: true });
  } else {
    gsap.to('.d-glasses', { yPercent: -60, opacity: 0, duration: 0.3, ease: 'power2.in', overwrite: true });
    gsap.to('.d-stache', { scale: 0.4, opacity: 0, duration: 0.25, overwrite: true });
  }
}
$('#disguise-btn').addEventListener('click', (e) => {
  disguiseLocked = !disguiseLocked;
  e.currentTarget.setAttribute('aria-pressed', String(disguiseLocked));
  e.currentTarget.textContent = disguiseLocked ? 'Take the disguise off' : 'Put the disguise on';
  disguise(disguiseLocked);
});

// ---------- scroll shots ----------
function setShot(name, force) {
  if (name === shot && !force) return;
  shot = name;
  if (!started) return;
  stage?.shot(name);
  document.body.classList.toggle('scrolled', name !== 'hero');
  if (bout) bout.inView = name === 'bout';
  if (name !== 'tape') stage?.spin(-1);
}
for (const sec of $$('[data-shot]')) {
  ScrollTrigger.create({
    trigger: sec, start: 'top 55%', end: 'bottom 55%',
    onToggle: (s) => { if (s.isActive) setShot(sec.dataset.shot); },
  });
}
ScrollTrigger.create({
  trigger: '#inside', start: 'top top', end: 'bottom bottom',
  onUpdate: (s) => stage?.explode(clamp((s.progress - 0.06) / 0.6, 0, 1)),
});

// exploded-view callouts follow their parts
const callouts = $$('.callouts li');
const layer = $('#callout-layer');
layer.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
const svg = layer.firstChild;
const copy = $('.inside-copy');
const lines = callouts.map(() => {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.innerHTML = '<line/><circle r="3.5"/>';
  svg.appendChild(g);
  return g;
});
function updateCallouts() {
  const active = shot === 'inside' && stage;
  const e = active ? stage.cur.explode : 0;
  if (!active && !updateCallouts.shown) return;
  updateCallouts.shown = active;
  const pts = active ? stage.parts(callouts.map((li) => li.dataset.part)) : [];
  const W = innerWidth, narrow = W < 760;
  const byX = [...pts].sort((a, b) => (narrow ? a.y - b.y : a.x - b.x)).map((p) => p.name);
  const placed = [];
  const order = callouts.map((li, i) => i).sort((i, j) => byX.indexOf(callouts[i].dataset.part) - byX.indexOf(callouts[j].dataset.part));
  order.forEach((i) => {
    const li = callouts[i];
    const p = pts.find((q) => q.name === li.dataset.part);
    const k = p ? clamp((e - 0.3 - i * 0.07) / 0.15, 0, 1) : 0;
    li.style.opacity = k;
    lines[i].style.opacity = k;
    if (!p || k === 0) return;
    const w = li.offsetWidth, h = li.offsetHeight;
    let lx, ly, ax, ay;
    if (narrow) {
      lx = W - w - 12; ly = clamp(p.y - h / 2, copy.getBoundingClientRect().bottom + 8, innerHeight - h - 90);
      ax = lx; ay = ly + h / 2;
    } else {
      let above = byX.indexOf(p.name) % 2 === 0;
      lx = clamp(p.x - w / 2, 12, W - w - 12);
      ly = above ? p.y - 120 - h : p.y + 110;
      // keep clear of the heading block
      const cr = copy.getBoundingClientRect();
      if (above && lx < cr.right && ly < cr.bottom) { above = false; ly = p.y + 110; }
      ax = clamp(p.x, lx + 8, lx + w - 8); ay = above ? ly + h : ly;
    }
    // stack away from labels already placed on the same side
    for (let n = 0; n < 6; n++) {
      const hit = placed.find((q) => lx < q.x + q.w + 8 && lx + w + 8 > q.x && ly < q.y + q.h + 6 && ly + h + 6 > q.y);
      if (!hit) break;
      if (narrow) { ly = hit.y + hit.h + 6; ay = ly + h / 2; continue; }
      ly = ly < p.y ? hit.y - h - 10 : hit.y + hit.h + 10;
      ay = ly < p.y ? ly + h : ly;
    }
    placed.push({ x: lx, y: ly, w, h });
    li.style.transform = `translate(${lx}px, ${ly}px)`;
    const [ln, dot] = lines[i].children;
    ln.setAttribute('x1', p.x); ln.setAttribute('y1', p.y); ln.setAttribute('x2', ax); ln.setAttribute('y2', ay);
    dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
  });
}

// ---------- tale of the tape: point at a fighter ----------
for (const cell of $$('.tape [data-size]')) {
  const i = +cell.dataset.size;
  const lit = (on) => $$(`.tape [data-size="${i}"]`).forEach((c) => c.classList.toggle('lit', on));
  cell.addEventListener('pointerenter', () => { stage?.spin(i); lit(true); });
  cell.addEventListener('pointerleave', () => { stage?.spin(-1); lit(false); });
}

// ---------- the twin switch ----------
let resumeAfterDay = false;
for (const b of $$('.twin button')) b.addEventListener('click', () => setTwin(b.dataset.twin === 'day'));
function setTwin(day) {
  if (document.body.classList.contains('day') === day) return;
  document.body.classList.toggle('day', day);
  for (const b of $$('.twin button')) b.setAttribute('aria-pressed', String((b.dataset.twin === 'day') === day));
  for (const el of $$('[data-day]')) {
    if (!el.dataset.night) el.dataset.night = el.textContent;
    el.textContent = day ? el.dataset.day : el.dataset.night;
  }
  stage?.setDay(day);
  bots?.setDay(day);
  if (day) { resumeAfterDay = deck.playing; if (deck.playing) deck.stop(1.6); }
  else if (resumeAfterDay) deck.play(0.8);
}

// ---------- the day-shift documentary pauses the anthem ----------
const video = $('#dayshift');
let resumeAfterVideo = false;
video.addEventListener('play', () => { if (deck.playing) { resumeAfterVideo = true; deck.stop(0.8); } });
const back = () => { if (resumeAfterVideo && !document.body.classList.contains('day')) deck.play(0.6); resumeAfterVideo = false; };
video.addEventListener('pause', back);
video.addEventListener('ended', back);

// ---------- the player: play/stop, and scratch the little record ----------
$('#playpause').addEventListener('click', () => {
  if (deck.silent) { deck.unmute(); if (!deck.playing) deck.play(); return; }
  deck.toggle();
});
function scratcher(el, centre, pointerOk = () => true) {
  let last = null;
  const angle = (e) => { const c = centre(); return Math.atan2(e.clientY - c.y, e.clientX - c.x); };
  el.addEventListener('pointerdown', (e) => {
    if (!pointerOk(e)) return;
    e.preventDefault();
    if (deck.silent) deck.unmute();
    el.setPointerCapture?.(e.pointerId);
    last = { a: angle(e), t: performance.now() };
    deck.grab();
    document.body.classList.add('scratching');
  });
  el.addEventListener('pointermove', (e) => {
    if (!last) return;
    const a = angle(e), t = performance.now();
    let d = a - last.a;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const dt = Math.max(8, t - last.t) / 1000;
    deck.drag(d / dt / RPM_RAD);
    last = { a, t };
  });
  const up = () => { if (!last) return; last = null; deck.release(); document.body.classList.remove('scratching'); };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}
const deckEl = $('#deck');
scratcher(deckEl, () => { const r = deckEl.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
// the big record in the hero can be scratched with a mouse too
scratcher(window, () => stage.recordScreen(), (e) =>
  e.pointerType === 'mouse' && e.button === 0 && stage && started && !e.target.closest('a,button,video,input,dialog,.hud,#player') && stage.hitRecord(e.clientX, e.clientY));

// the crew loses it when you go near the X button
for (const x of $$('.xbtn')) x.addEventListener('pointerenter', () => bots?.cheer(2.4));

// ---------- the frame loop ----------
let posterAcc = 0;
gsap.ticker.add((time, deltaMs) => {
  const dt = Math.min(deltaMs / 1000, 0.1), now = performance.now();
  deck.update(dt);
  if (stage) stage.render(dt, now);
  bots?.update(dt);
  bout?.update(dt);
  posterAcc += dt;
  if (poster && posterVisible && posterAcc > 1 / 30) { poster.draw(now, posterAcc); posterAcc = 0; }
  deckEl.style.transform = `rotate(${deck.angle()}rad)`;
  updateCallouts();
});

// a handle for poking at it from the console
window.AD = { deck, lenis, bots, get stage() { return stage; }, get poster() { return poster; }, get bout() { return bout; }, setTwin, drop };
