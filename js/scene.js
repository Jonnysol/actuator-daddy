// The stage: an Artus III working as a turntable motor under a 7-inch single, lit like a title fight.
// Every section of the page is a camera shot on this one set. Shots set goals; the frame loop eases
// the camera, the actuator's pose and the effects toward them, so scrolling never cuts.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SIZES, makeActuator, setExplode, setSpin, faceTexture, radialAniso } from './actuator.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
const POSE = {
  up: new THREE.Quaternion(),
  // axis to +X, yawed toward the camera so the face side reads
  side: new THREE.Quaternion().multiplyQuaternions(Q(0, -0.42, 0), Q(0, 0, -Math.PI / 2)),
  // face to camera, a little 3/4 like the product shot
  front: new THREE.Quaternion().multiplyQuaternions(Q(0, 0.32, 0), Q(Math.PI / 2, 0, 0)),
  bout: new THREE.Quaternion().multiplyQuaternions(Q(0, -0.2, 0), Q(Math.PI / 2, 0, 0)),
};
const III = SIZES[2];
const UP_Y = III.L / 2 + 0.01;              // resting on the rear cover
const DECK_Y = UP_Y + III.L / 2 + 0.058;     // top of the output flange
const REC_R = 0.889;                         // a 7-inch single

// each shot: camera, look target, actuator pose and place, plus record/arm/lineup/dim
// n: overrides for narrow (portrait) screens
const SHOTS = {
  intro:   { cam: [0.02, 3.1, 0.25], look: [0, DECK_Y, 0], pose: 'up', at: [0, UP_Y, 0], lift: 0, arm: 0, lineup: 0, dim: 1 },
  hero:    { cam: [-0.3, 2.55, 4.6], look: [-1.0, 0.5, 0], pose: 'up', at: [0, UP_Y, 0], lift: 0, arm: 1, lineup: 0, dim: 1,
             n: { cam: [0.4, 3.6, 4.6], look: [0.15, 0.95, 0] } },
  daddy:   { cam: [1.55, 1.18, 1.25], look: [0.1, DECK_Y, 0], pose: 'up', at: [0, UP_Y, 0], lift: 0, arm: 1, lineup: 0, dim: 0.32 },
  twin:    { cam: [-1.35, 1.02, 1.55], look: [0, DECK_Y, 0], pose: 'up', at: [0, UP_Y, 0], lift: 0, arm: 1, lineup: 0, dim: 0.3 },
  inside:  { cam: [0.1, 1.85, 7.9], look: [-0.38, 0.72, 0], pose: 'side', at: [0, 0.95, 0], lift: 1, arm: 0, lineup: 0, dim: 1,
             n: { cam: [3.4, 3.4, 12.8], look: [0, 2.75, 0], pose: 'up', at: [0, 1.95, 0] } },
  tape:    { cam: [-0.25, 1.2, 7.4], look: [-0.25, 0.5, 0], pose: 'front', at: [1.0, III.R, 0], lift: 1, arm: 0, lineup: 1, dim: 1,
             n: { cam: [-0.2, 1.3, 7.4], look: [-0.25, 0.45, 0] } },
  bout:    { cam: [0.05, 0.8, 4.5], look: [0.12, III.R, 0], pose: 'bout', at: [0, III.R, 0], lift: 1, arm: 0, lineup: 0, dim: 0.9,
             n: { cam: [0.05, 0.9, 3.6], look: [0, 1.0, 0] } },
  joints:  { cam: [-0.7, 3.4, 1.0], look: [-0.95, 0.4, 0], pose: 'up', at: [0, UP_Y, 0], lift: 0, arm: 1, lineup: 0, dim: 0.55,
             n: { cam: [0, 4.4, 1.2], look: [0, 0.4, 0] } },
  credits: { cam: [0, 3.0, 0.05], look: [0, DECK_Y, 0], pose: 'up', at: [0, UP_Y, 0], lift: 0, arm: 1, lineup: 0, dim: 0.34 },
};

const LINEUP_X = [-1.62, -0.46];

function vinylMaps() {
  // grooves: rough music bands, glossy gaps between tracks, glossy run-out
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(0,95,0)'; g.fillRect(0, 0, S, S);
  const band = (r0, r1, v) => {
    g.fillStyle = `rgb(0,${v},0)`;
    g.beginPath(); g.arc(S / 2, S / 2, r1 * S / 2, 0, Math.PI * 2); g.arc(S / 2, S / 2, r0 * S / 2, 0, Math.PI * 2, true); g.fill();
  };
  band(0.5, 0.995, 105);
  for (const r of [0.62, 0.74, 0.86]) band(r - 0.006, r + 0.006, 30);
  band(0.97, 1, 40);
  band(0.44, 0.5, 35);
  for (let r = 0.5; r < 0.97; r += 0.0045) band(r, r + 0.0018, 80 + Math.random() * 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function shadowTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(0.45, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

const FinishShader = {
  uniforms: { tDiffuse: { value: null }, dim: { value: 1 }, vig: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float dim; uniform float vig; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 p = (vUv - 0.5) * vec2(1.0, 0.85);
      float v = smoothstep(0.78, 0.18, length(p));
      c.rgb *= mix(1.0, mix(0.42, 1.0, v), vig) * dim;
      gl_FragColor = c;
    }`,
};

export class Stage {
  constructor(canvas, deck) {
    this.deck = deck;                      // the Turntable (audio clock)
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    r.toneMapping = THREE.AgXToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;

    const s = (this.scene = new THREE.Scene());
    this.night = new THREE.Color(0x0b1117);
    this.dayC = new THREE.Color(0xe6e8eb);
    s.background = this.night.clone();
    s.fog = new THREE.Fog(this.night.clone(), 6.5, 17);
    const pm = new THREE.PMREMGenerator(r);
    s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);

    // lights: an overhead ring light, a warm key, and the bridge-orange rim from behind
    const ring = (this.ring = new THREE.SpotLight(0xfff2dd, 3.2, 0, 0.42, 0.65, 0));
    ring.position.set(0, 6.2, 0.4); ring.target.position.set(0, 0, 0);
    s.add(ring, ring.target);
    const key = (this.key = new THREE.DirectionalLight(0xffe9d2, 0.9));
    key.position.set(2.5, 4, 3.5);
    s.add(key);
    const rim = (this.rim = new THREE.SpotLight(0xd9381e, 7, 0, 0.6, 0.8, 0));
    rim.position.set(-3.2, 1.6, -3.4); rim.target.position.set(0, 0.6, 0);
    s.add(rim, rim.target);
    const fill = (this.fill = new THREE.DirectionalLight(0x9fb4d0, 0.35));
    fill.position.set(-3, 1, 3);
    s.add(fill);

    // floor, contact shadow, and the light shaft with dust in it
    this.floorMat = new THREE.MeshStandardMaterial({ color: 0x10161d, roughness: 0.62, metalness: 0.35 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.85 }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.002;
    s.add(this.shadow);
    this.shaft = this.makeShaft(); s.add(this.shaft);
    this.dust = this.makeDust(); s.add(this.dust);

    // the actuators
    this.face = faceTexture();
    this.act = makeActuator(III, { full: true, face: this.face });
    this.rig = new THREE.Group();
    this.rig.add(this.act);
    s.add(this.rig);
    this.little = [0, 1].map((i) => {
      const a = makeActuator(SIZES[i], { face: this.face });
      const g = new THREE.Group(); g.add(a); g.quaternion.copy(POSE.front);
      g.position.set(LINEUP_X[i], SIZES[i].R, 0); g.scale.setScalar(0.001);
      g.userData.act = a; g.userData.spin = 0;
      s.add(g);
      return g;
    });
    this.spins = [0, 0, 0];
    this.hover = -1;

    this.record = this.makeRecord(); s.add(this.record);
    this.arm = this.makeArm(); s.add(this.arm);

    // post: bloom catches the hot copper and the label, then tone map, then the finish
    const comp = (this.composer = new EffectComposer(r));
    comp.addPass(new RenderPass(s, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.55, 0.86);
    comp.addPass(this.bloom);
    comp.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    comp.addPass(this.finish);

    this.cur = { cam: V(...SHOTS.intro.cam), look: V(...SHOTS.intro.look), q: new THREE.Quaternion(), at: V(...SHOTS.intro.at), lift: 0, arm: 0, lineup: 0, dim: 0, explode: 0, heat: 0, day: 0 };
    this.goal = { ...this.cur, cam: this.cur.cam.clone(), look: this.cur.look.clone(), q: new THREE.Quaternion(), at: this.cur.at.clone(), dim: 1 };
    this.name = 'intro';
    this.flangeA = 0; this.armA = this.armRest;
    this.sway = V(0, 0, 0); this.ptr = [0, 0];
    this.anchorP = V(-0.3, 0, 0); this.anchorOff = 0; this.anchorY = null;
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('pointermove', (e) => { this.ptr = [e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5]; }, { passive: true });
  }

  makeShaft() {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(0xffe6c4) }, opacity: { value: 0.04 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; uniform float opacity; varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){ float f = pow(abs(dot(vN, vV)), 2.0); float a = f * smoothstep(0.0, 1.0, vY) * opacity; gl_FragColor = vec4(color * a, a); }`,
    });
    const c = new THREE.Mesh(new THREE.ConeGeometry(2.3, 6.2, 64, 1, true), m);
    c.position.y = 3.1;
    return c;
  }
  makeDust() {
    const n = 420, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * 2.0;
      p[i * 3] = Math.cos(a) * rr; p[i * 3 + 1] = Math.random() * 4.5; p[i * 3 + 2] = Math.sin(a) * rr;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffe2b8, size: 0.012, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  }

  makeRecord() {
    const g = new THREE.Group();
    const vinyl = new THREE.MeshPhysicalMaterial({
      color: 0x08080a, roughness: 0.4, roughnessMap: vinylMaps(), metalness: 0.0,
      clearcoat: 0.5, clearcoatRoughness: 0.22, anisotropy: 1, anisotropyMap: radialAniso(),
    });
    const edge = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.5 });
    this.vinyl = new THREE.Mesh(new THREE.CylinderGeometry(REC_R, REC_R, 0.014, 160), [edge, vinyl, vinyl]);
    g.add(this.vinyl);
    this.labelCanvas = document.createElement('canvas');
    this.labelTex = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTex.colorSpace = THREE.SRGBColorSpace;
    this.labelTex.anisotropy = 8;
    const label = new THREE.Mesh(new THREE.CircleGeometry(0.43, 96), new THREE.MeshPhysicalMaterial({ map: this.labelTex, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4 }));
    label.rotation.x = -Math.PI / 2; label.position.y = 0.0075;
    g.add(label);
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 24), new THREE.MeshPhysicalMaterial({ color: 0xd9dce0, metalness: 1, roughness: 0.2 }));
    spindle.position.y = 0.03;
    g.add(spindle);
    g.position.set(0, DECK_Y + 0.007, 0);
    return g;
  }
  setLabel(draw) { draw(this.labelCanvas, 1024); this.labelTex.needsUpdate = true; }

  makeArm() {
    // the tonearm pivots on a little Artus I, because of course it does
    const g = new THREE.Group();
    const piv = makeActuator(SIZES[0], { face: this.face });
    const ps = 0.55;
    piv.scale.setScalar(ps);
    piv.position.y = (SIZES[0].L / 2 + 0.01) * ps;
    g.add(piv);
    const baseTop = (SIZES[0].L + 0.07) * ps;
    const armY = DECK_Y + 0.014 + 0.075;
    const chrome = new THREE.MeshPhysicalMaterial({ color: 0xdfe2e6, metalness: 1, roughness: 0.18 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, armY - baseTop, 24), chrome);
    post.position.y = baseTop + (armY - baseTop) / 2;
    g.add(post);
    const yaw = (this.armYaw = new THREE.Group());
    yaw.position.y = armY;
    g.add(yaw);
    const tilt = (this.armTilt = new THREE.Group());
    yaw.add(tilt);
    const La = (this.armLen = 1.18);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, La + 0.2, 16), chrome);
    tube.rotation.z = Math.PI / 2; tube.position.x = (La - 0.2) / 2;
    tilt.add(tube);
    const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 32), new THREE.MeshPhysicalMaterial({ color: 0x1b2026, metalness: 0.8, roughness: 0.35 }));
    cw.rotation.z = Math.PI / 2; cw.position.x = -0.22;
    tilt.add(cw);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.055), chrome);
    head.position.set(La, 0, 0);
    tilt.add(head);
    const cart = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.04), new THREE.MeshPhysicalMaterial({ color: 0xd9381e, roughness: 0.4, clearcoat: 0.6 }));
    cart.position.set(La, -0.027, 0);
    tilt.add(cart);
    g.position.set(1.12, 0, -0.78);
    // needle radius from the record centre for an arm yaw (rotation.y)
    const px = g.position.x, pz = g.position.z;
    const radiusAt = (a) => Math.hypot(px + Math.cos(a) * La, pz - Math.sin(a) * La);
    const solve = (r) => { let best = 0, err = 1e9; for (let a = 1.2; a < 4.2; a += 0.002) { const e = Math.abs(radiusAt(a) - r); if (e < err) { err = e; best = a; } } return best; };
    this.armOuter = solve(0.84); this.armInner = solve(0.47);
    this.armRest = this.armOuter - 0.5;
    return g;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.narrow = w / h < 0.9;
    this.shot(this.name, true);
  }

  shot(name, keep = false) {
    const base = SHOTS[name];
    if (!base) return;
    this.name = name;
    const s = this.narrow && base.n ? { ...base, ...base.n } : base;
    const goal = this.goal;
    goal.cam.set(...s.cam); goal.look.set(...s.look);
    goal.q.copy(POSE[s.pose]); goal.at.set(...s.at);
    goal.lift = s.lift; goal.arm = s.arm; goal.lineup = s.lineup; goal.dim = s.dim;
    if (name !== 'inside') goal.explode = 0;
    if (!keep) this.t0 = performance.now();
  }
  snap() {
    const c = this.cur, g = this.goal;
    c.cam.copy(g.cam); c.look.copy(g.look); c.q.copy(g.q); c.at.copy(g.at);
    c.lift = g.lift; c.arm = g.arm; c.lineup = g.lineup; c.dim = g.dim;
  }
  explode(p) { this.goal.explode = p; }
  heat(h) { this.goal.heat = h; }
  spin(i) { this.hover = i; }
  setDay(on) { this.goal.day = on ? 1 : 0; }

  // part positions on screen, for the exploded-view callouts
  parts(names) {
    const out = [], v = new THREE.Vector3(), w = innerWidth, h = innerHeight;
    for (const n of names) {
      const p = this.act.userData.parts[n];
      if (!p) continue;
      p.getWorldPosition(v);
      v.project(this.camera);
      out.push({ name: n, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h });
    }
    return out;
  }
  recordScreen() {
    const v = this.record.getWorldPosition(new THREE.Vector3()).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  }
  hitRecord(x, y) {
    if (this.cur.lift > 0.2) return false;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), this.camera);
    return ray.intersectObject(this.vinyl, false).length > 0;
  }

  render(dt, now) {
    const c = this.cur, g = this.goal, deck = this.deck;
    const k = 1 - Math.exp(-dt * 2.4), kf = 1 - Math.exp(-dt * 7);
    c.cam.lerp(g.cam, k); c.look.lerp(g.look, k);
    c.q.slerp(g.q, 1 - Math.exp(-dt * 2.0)); c.at.lerp(g.at, k);
    c.lift += (g.lift - c.lift) * (1 - Math.exp(-dt * 2.8));
    c.arm += (g.arm - c.arm) * (1 - Math.exp(-dt * 3));
    c.lineup += (g.lineup - c.lineup) * k;
    c.dim += (g.dim - c.dim) * (1 - Math.exp(-dt * 3));
    c.explode += ((this.name === 'inside' ? g.explode : 0) - c.explode) * kf;
    c.heat += (g.heat - c.heat) * kf;
    c.day += (g.day - c.day) * (1 - Math.exp(-dt * 3));

    // pose
    this.rig.quaternion.copy(c.q);
    this.rig.position.copy(c.at);
    setExplode(this.act, c.explode);

    // the record lifts off and away when the actuator is needed elsewhere; the arm folds away with it
    const L = c.lift, Ls = L * L * (3 - 2 * L);
    this.record.position.set(c.at.x * (1 - Ls), DECK_Y + 0.007 + Ls * 4.2, 0);
    this.record.rotation.x = Ls * 0.6;
    this.record.visible = Ls < 0.98;
    const angle = deck.angle();
    this.vinyl.parent.rotation.y = -angle;
    const armS = Math.max(0.0001, 1 - Ls * 1.6);
    this.arm.scale.setScalar(Math.max(0.0001, armS));
    this.arm.visible = armS > 0.01;

    // the flange drives the record; away from the deck it settles with the face upright
    const recordMode = L < 0.5;
    const target = recordMode ? -angle : Math.round(this.flangeA / (Math.PI * 2)) * Math.PI * 2;
    let d = target - this.flangeA;
    if (recordMode) d = Math.atan2(Math.sin(d), Math.cos(d));
    this.flangeA += Math.abs(d) < 0.02 ? d : d * kf;
    if (this.hover === 2 && this.name === 'tape') this.spins[2] -= dt * (III.noLoad / 60) * Math.PI * 2 * 0.25;
    else this.spins[2] += (Math.round(this.spins[2] / (Math.PI * 2)) * Math.PI * 2 - this.spins[2]) * kf;
    setSpin(this.act, this.flangeA + this.spins[2]);

    // tonearm: cue from rest, then track inward over the side
    const prog = deck.time() / deck.duration;
    const play = this.armOuter + (this.armInner - this.armOuter) * prog;
    const armGoal = this.armRest + (play - this.armRest) * c.arm;
    this.armA += (armGoal - this.armA) * (1 - Math.exp(-dt * 4));
    this.armYaw.rotation.y = this.armA;
    this.armTilt.rotation.z = (1 - c.arm) * 0.09 + Math.min(0.06, Math.abs(armGoal - this.armA) * 0.4);

    // the lineup: Little Daddy and Daddy join Big Daddy, at true relative size
    this.little.forEach((m, i) => {
      const s = Math.max(0.001, c.lineup);
      m.scale.setScalar(s);
      m.position.set(LINEUP_X[i], SIZES[i].R * s, -0.2 * (1 - s));
      m.visible = c.lineup > 0.01;
      const sp = this.hover === i ? -dt * (SIZES[i].noLoad / 60) * Math.PI * 2 * 0.25 : 0;
      if (sp) this.spins[i] += sp;
      else this.spins[i] += (Math.round(this.spins[i] / (Math.PI * 2)) * Math.PI * 2 - this.spins[i]) * kf;
      setSpin(m.userData.act, this.spins[i]);
    });

    // heat: copper first, then the face's sockets, then the body
    const H = c.heat;
    if (this.act.userData.copper) this.act.userData.copper.emissiveIntensity = H * H * 3.2;
    if (this.act.userData.faceMat) this.act.userData.faceMat.emissiveIntensity = Math.pow(H, 1.6) * 4.5;
    this.act.userData.parts.sleeve.children[0].material.emissiveIntensity = Math.pow(H, 3) * 0.22;

    // day: Verros' grey studio. night: the fight
    const day = c.day;
    this.scene.background.copy(this.night).lerp(this.dayC, day);
    this.scene.fog.color.copy(this.scene.background);
    this.floorMat.color.setRGB(0.063 + day * 0.68, 0.086 + day * 0.68, 0.114 + day * 0.68);
    this.ring.intensity = 3.2 * (1 - day) + day * 1.2;
    this.rim.intensity = 7 * (1 - day);
    this.key.intensity = 0.9 + day * 1.6;
    this.fill.intensity = 0.35 + day * 0.6;
    this.scene.environmentIntensity = 0.55 + day * 0.5;
    this.shaft.material.uniforms.opacity.value = 0.04 * (1 - day);
    this.dust.material.opacity = 0.55 * (1 - day);
    this.bloom.strength = 0.42 * (1 - day * 0.7) + H * 0.5;
    this.finish.uniforms.dim.value = c.dim * (1 - day * 0.15) + day * 0.15;
    this.finish.uniforms.vig.value = 1 - day * 0.8;

    // dust drifts up through the light
    const pos = this.dust.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + dt * 0.05;
      if (y > 4.5) y -= 4.5;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    this.dust.rotation.y += dt * 0.02;

    // camera: eased shot, a little handheld sway and pointer parallax
    const t = now / 1000;
    this.sway.set(Math.sin(t * 0.31) * 0.03 + this.ptr[0] * 0.18, Math.sin(t * 0.23) * 0.02 - this.ptr[1] * 0.1, 0);
    this.camera.position.copy(c.cam).add(this.sway);
    this.camera.lookAt(c.look);
    let want = 0;
    if (this.anchorY && this.name === 'tape') {
      // slide the camera so the lineup's floor line sits on the top edge of the table
      this.camera.updateMatrixWorld();
      const v = this.anchorP.clone().applyMatrix4(this.camera.matrixWorldInverse);
      const p = this.anchorP.clone().project(this.camera);
      const wpp = 2 * -v.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / innerHeight;
      want = ((-p.y * 0.5 + 0.5) * innerHeight - this.anchorY()) * wpp * c.lineup;
    }
    this.anchorOff += (want - this.anchorOff) * (1 - Math.exp(-dt * 14));
    if (Math.abs(this.anchorOff) > 1e-4) {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.camera.position.addScaledVector(up, -this.anchorOff);
      this.camera.lookAt(c.look.clone().addScaledVector(up, -this.anchorOff));
    }
    this.shadow.position.x = c.at.x;
    this.shadow.scale.setScalar(1 + (c.q.angleTo(POSE.up) > 0.5 ? -0.25 : 0));

    this.composer.render(dt);
  }
}
