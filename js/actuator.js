// Procedural Artus actuators, after the Verros product renders: matte anodized body with ring fins,
// 16 rim screws, a raised step ring, and a brushed output flange. The flange carries the Big D face
// (two hex sockets and the torque mustache), so the logo is the front of the product.
// Units: 1 = 100 mm. The actuator axis is local +Y, output flange on top.
import * as THREE from 'three';

export const SIZES = [
  { name: 'Artus I', nick: 'Little Daddy', R: 0.40, L: 0.60, noLoad: 224 },
  { name: 'Artus II', nick: 'Daddy', R: 0.475, L: 0.60, noLoad: 163 },
  { name: 'Artus III', nick: 'Big Daddy', R: 0.625, L: 0.80, noLoad: 120 },
];

export const GEAR_RATIO = 9; // illustrative: the real one is classified

// a direction map for circular machining marks: radial highlight streaks on turned metal and vinyl
export function radialAniso(size = 256) {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size - 0.5, v = (y + 0.5) / size - 0.5, r = Math.hypot(u, v) || 1;
    const i = (y * size + x) * 4;
    d[i] = (u / r * 0.5 + 0.5) * 255; d[i + 1] = (v / r * 0.5 + 0.5) * 255; d[i + 2] = 255; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, size, size);
  t.needsUpdate = true;
  return t;
}

let M = null;
export function materials() {
  if (M) return M;
  const aniso = radialAniso();
  M = {
    body: new THREE.MeshPhysicalMaterial({ color: 0x3b4148, metalness: 0.55, roughness: 0.5, clearcoat: 0.18, clearcoatRoughness: 0.55, emissive: 0xff5a14, emissiveIntensity: 0 }),
    face: new THREE.MeshPhysicalMaterial({ color: 0x353b42, metalness: 0.55, roughness: 0.44, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
    hole: new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.9 }),
    brushed: new THREE.MeshPhysicalMaterial({ color: 0xa3a8ae, metalness: 1, roughness: 0.38, anisotropy: 0.9, anisotropyMap: aniso, envMapIntensity: 0.7 }),
    brushedSide: new THREE.MeshPhysicalMaterial({ color: 0xc4c8cd, metalness: 1, roughness: 0.34 }),
    copper: new THREE.MeshPhysicalMaterial({ color: 0xc46c36, metalness: 1, roughness: 0.32, emissive: 0xff4d0f, emissiveIntensity: 0 }),
    iron: new THREE.MeshPhysicalMaterial({ color: 0x5a6068, metalness: 0.9, roughness: 0.38 }),
    magA: new THREE.MeshPhysicalMaterial({ color: 0xaab0b8, metalness: 1, roughness: 0.22 }),
    magB: new THREE.MeshPhysicalMaterial({ color: 0x5d636b, metalness: 1, roughness: 0.3 }),
    pcb: new THREE.MeshStandardMaterial({ color: 0x0e2a20, roughness: 0.55, metalness: 0.1 }),
    chip: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.4 }),
    gold: new THREE.MeshPhysicalMaterial({ color: 0xd2a650, metalness: 1, roughness: 0.28 }),
    schematic: new THREE.LineBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9 }),
    faceDecal: null,
    aniso,
  };
  return M;
}

// Big D's features (eyes + mustache) cut out of the logo, for the flange decal
export function faceTexture() {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const tex = new THREE.CanvasTexture(c);
  const img = new Image();
  img.onload = () => {
    const g = c.getContext('2d');
    // logo units: centre (100,100); the flange ring's inner edge sits at 63.5
    const s = (S / 2) / 63.5;
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(img, S / 2 - 100 * s, S / 2 - 100 * s, 200 * s, 200 * s);
    tex.needsUpdate = true;
  };
  img.src = 'brand/bigd.svg';
  return tex;
}

function lathe(points, seg = 96) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}
function annulus(r0, r1, y0, y1, seg = 96) {
  return lathe([[r0, y0], [r1, y0], [r1, y1], [r0, y1], [r0, y0]], seg);
}
function ringOf(geo, mat, n, radius, y, phase = 0) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  const o = new THREE.Object3D();
  for (let k = 0; k < n; k++) {
    const a = phase + (k / n) * Math.PI * 2;
    o.position.set(Math.cos(a) * radius, y, Math.sin(a) * radius);
    o.rotation.set(0, -a, 0);
    o.updateMatrix();
    m.setMatrixAt(k, o.matrix);
  }
  return m;
}
function gearShape(rRoot, rTip, teeth, hole) {
  const s = new THREE.Shape();
  const N = teeth * 4;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2, q = i % 4;
    const r = q === 1 || q === 2 ? rTip : rRoot;
    const p = [Math.cos(a) * r, Math.sin(a) * r];
    i ? s.lineTo(...p) : s.moveTo(...p);
  }
  if (hole) { const h = new THREE.Path(); h.absarc(0, 0, hole, 0, Math.PI * 2, true); s.holes.push(h); }
  return s;
}
function ringGearShape(rOut, rRoot, rTip, teeth) {
  const s = new THREE.Shape();
  s.absarc(0, 0, rOut, 0, Math.PI * 2, false);
  const h = new THREE.Path();
  const N = teeth * 4;
  for (let i = 0; i <= N; i++) {
    const a = -(i / N) * Math.PI * 2, q = i % 4;
    const r = q === 1 || q === 2 ? rTip : rRoot;
    const p = [Math.cos(a) * r, Math.sin(a) * r];
    i ? h.lineTo(...p) : h.moveTo(...p);
  }
  s.holes.push(h);
  return s;
}
function schematic(shape, depth, mat) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  return new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), mat);
}

// full: build the internals too (only the hero Artus III needs them)
export function makeActuator(size, { full = false, face = null } = {}) {
  const m = materials();
  const { R, L } = size;
  const h = L / 2;
  const root = new THREE.Group();
  const parts = {};
  const part = (name, obj, y) => {
    const g = new THREE.Group();
    g.add(obj); g.position.y = y; g.userData.base = y;
    root.add(g); parts[name] = g;
    return g;
  };

  // housing: ring fins cut into the side, an open sleeve
  const fins = [];
  const wall = R * 0.86, top = h - 0.002, bot = -h + 0.04;
  fins.push([wall, bot], [R * 0.985, bot], [R, bot + 0.012]);
  const n = 7, f0 = -h + 0.12, f1 = h - 0.2, pitch = (f1 - f0) / n, cut = R * 0.035;
  for (let k = 0; k < n; k++) {
    const y = f0 + k * pitch;
    fins.push([R, y], [R - cut, y + 0.006], [R - cut, y + pitch * 0.42], [R, y + pitch * 0.42 + 0.006]);
  }
  fins.push([R, top - 0.012], [R * 0.99, top], [wall, top], [wall, bot]);
  const housing = new THREE.Mesh(lathe(fins, 128), m.body);
  part('sleeve', housing, 0);

  // front plate with the raised step ring and screws
  const fp = new THREE.Group();
  fp.add(new THREE.Mesh(annulus(R * 0.6, R * 0.995, 0, 0.03, 128), m.face));
  fp.add(new THREE.Mesh(annulus(R * 0.6, R * 0.69, 0.03, 0.052, 128), m.face));
  fp.add(new THREE.Mesh(annulus(R * 0.585, R * 0.6, -0.01, 0.045, 96), m.hole));
  const screw = new THREE.CylinderGeometry(R * 0.032, R * 0.032, 0.006, 16);
  fp.add(ringOf(screw, m.hole, 16, R * 0.88, 0.03, Math.PI / 16));
  fp.add(ringOf(new THREE.CylinderGeometry(R * 0.022, R * 0.022, 0.006, 12), m.hole, 8, R * 0.645, 0.052, Math.PI / 8));
  part('front', fp, h);

  // output flange: brushed, with the face
  const flR = R * 0.58;
  const fl = new THREE.Group();
  const flGeo = new THREE.CylinderGeometry(flR, flR, 0.05, 128, 1);
  fl.add(new THREE.Mesh(flGeo, [m.brushedSide, m.brushed, m.brushed]));
  const bore = new THREE.Mesh(new THREE.CircleGeometry(R * 0.05, 32), m.hole);
  bore.rotation.x = -Math.PI / 2; bore.position.y = 0.0252;
  fl.add(bore);
  if (face) {
    const decalMat = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 1, envMapIntensity: 0.15, transparent: true, alphaMap: face, emissive: 0xff6a1a, emissiveMap: face, emissiveIntensity: 0, depthWrite: false });
    const decal = new THREE.Mesh(new THREE.CircleGeometry(flR * 0.995, 96), decalMat);
    // canvas top ends up at world +Y once the actuator is tilted to face the camera (+Z)
    decal.rotation.x = -Math.PI / 2; decal.position.y = 0.0254;
    fl.add(decal);
    root.userData.faceMat = decalMat;
  }
  const flange = part('flange', fl, h + 0.03);
  root.userData.spinners = [flange];

  // rear cover with connectors (power and comms)
  const rc = new THREE.Group();
  rc.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.985, R * 0.985, 0.05, 128), m.face));
  for (const x of [-0.18, 0.18]) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(R * 0.22, 0.05, R * 0.12), m.chip);
    k.position.set(x * R * 2, -0.045, R * 0.55);
    rc.add(k);
  }
  rc.add(ringOf(screw, m.hole, 8, R * 0.88, -0.026, 0));
  part('rear', rc, -h + 0.015);

  if (full) {
    // stator: back iron and twelve copper-wound teeth
    const st = new THREE.Group();
    st.add(new THREE.Mesh(annulus(R * 0.7, R * 0.8, -L * 0.18, L * 0.18, 96), m.iron));
    const tooth = new THREE.BoxGeometry(R * 0.16, L * 0.32, R * 0.13);
    st.add(ringOf(tooth, m.copper, 12, R * 0.6, 0, 0));
    root.userData.copper = m.copper;
    part('stator', st, -0.02);

    // rotor: a ring of magnets on a hub
    const ro = new THREE.Group();
    ro.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.4, R * 0.4, L * 0.3, 64), m.iron));
    const mag = new THREE.BoxGeometry(R * 0.06, L * 0.3, R * 0.16);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const mm = new THREE.Mesh(mag, k % 2 ? m.magA : m.magB);
      mm.position.set(Math.cos(a) * R * 0.43, 0, Math.sin(a) * R * 0.43);
      mm.rotation.y = -a;
      ro.add(mm);
    }
    root.userData.rotor = part('rotor', ro, -0.02);

    // gearbox: drawn as a schematic, because the real one is a secret
    const gb = new THREE.Group();
    const d = 0.1;
    gb.add(schematic(ringGearShape(R * 0.66, R * 0.6, R * 0.56, 42), d, m.schematic));
    const sun = schematic(gearShape(R * 0.12, R * 0.16, 12, R * 0.04), d, m.schematic);
    gb.add(sun);
    const planets = [];
    for (let k = 0; k < 3; k++) {
      const p = schematic(gearShape(R * 0.17, R * 0.21, 15, R * 0.05), d, m.schematic);
      const pg = new THREE.Group();
      pg.add(p);
      const a = (k / 3) * Math.PI * 2;
      pg.position.set(Math.cos(a) * R * 0.37, 0, Math.sin(a) * R * 0.37);
      pg.userData.a = a;
      gb.add(pg);
      planets.push(pg);
    }
    root.userData.gear = { sun, planets, carrierR: R * 0.37 };
    part('gearbox', gb, h - 0.16);

    // driver board
    const pc = new THREE.Group();
    pc.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.8, R * 0.8, 0.014, 96), m.pcb));
    const chips = [[0, 0, 0.3, 0.3], [0.42, 0.1, 0.14, 0.2], [-0.4, -0.18, 0.18, 0.12], [-0.1, 0.48, 0.24, 0.1], [0.2, -0.45, 0.12, 0.12]];
    for (const [x, z, w, dd] of chips) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(R * w, 0.02, R * dd), m.chip);
      c.position.set(x * R, 0.016, z * R);
      pc.add(c);
    }
    pc.add(new THREE.Mesh(annulus(R * 0.72, R * 0.76, 0.007, 0.01, 96), m.gold));
    part('pcb', pc, -h + 0.09);

    // exploded positions, in multiples of the body length, along the axis
    root.userData.explode = { flange: 2.7, front: 2.05, gearbox: 1.45, rotor: 0.8, stator: 0.2, sleeve: -0.6, pcb: -1.45, rear: -2.05 };
  }
  root.userData.parts = parts;
  root.userData.size = size;
  return root;
}

// e: 0 assembled, 1 fully exploded. Parts leave in order from the front.
export function setExplode(act, e) {
  const ex = act.userData.explode;
  if (!ex) return;
  const L = act.userData.size.L;
  const names = Object.keys(ex);
  names.forEach((n, i) => {
    const p = act.userData.parts[n];
    const k = THREE.MathUtils.clamp(e * 1.35 - i * 0.05, 0, 1);
    const s = k * k * (3 - 2 * k);
    p.position.y = p.userData.base + ex[n] * L * s;
  });
}

// output angle in radians; the rotor runs at the gear ratio, the planets counter-rotate
export function setSpin(act, out) {
  for (const s of act.userData.spinners) s.rotation.y = out;
  const { rotor, gear } = act.userData;
  if (rotor) rotor.rotation.y = out * GEAR_RATIO;
  if (gear) {
    gear.sun.rotation.y = out * GEAR_RATIO;
    for (const p of gear.planets) {
      const a = p.userData.a + out;
      p.position.set(Math.cos(a) * gear.carrierR, 0, Math.sin(a) * gear.carrierR);
      p.rotation.y = -out * GEAR_RATIO * 0.55;
    }
  }
}
