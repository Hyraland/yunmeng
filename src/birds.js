import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { U, COMMON } from './common.js';
import { tuning } from './tuning.js';
import { heightAt, PERIOD } from './terrain.js';

// Egrets wading in the shallows. The model, poses, wingbeat and behaviour are white_feather's (src/birds): they idle (peck, walk, preen,
// stretch), grow wary as you come near and burst into flight past a distance that depends on your pace, the panic spreading through the
// group; in the air they fly as boids within a flock that flees, circles, picks a quiet place away from you and glides down to it.
// One instanced mesh per level of detail: each bird uploads a pose and the vertex shader rebuilds its parts.

const TAU = Math.PI * 2;
const LEG_H = 0.61;
const POSE_STRIDE = 20;
const LOD_NEAR = 45; // m: full model inside, low-poly beyond
const LOD_THINK = 80; // m: resting birds beyond this only think every third frame

const KIND = { white: 0, beak: 1, leg: 2 };

function prep(g, kind) {
  g.deleteAttribute('uv');
  const out = g.index ? g : mergeVertices(g, 1e-5);
  out.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count).fill(kind), 1));
  return out;
}

// Spindle-shaped body along +Z (tail at -Z).
function bodyGeometry(lo) {
  const prof = [
    [0.0, -0.36], [0.02, -0.34], [0.05, -0.26], [0.085, -0.14], [0.115, -0.02],
    [0.125, 0.06], [0.11, 0.14], [0.075, 0.2], [0.035, 0.23], [0.0, 0.24],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(lo ? prof.filter((_, i) => i % 2 === 0 || i === prof.length - 1) : prof, lo ? 6 : 12);
  g.rotateX(Math.PI / 2); // lathe axis Y -> Z
  g.scale(0.95, 1.05, 1);
  g.computeVertexNormals();
  const tail = new THREE.ConeGeometry(0.055, 0.2, lo ? 4 : 6);
  tail.rotateX(-Math.PI / 2);
  tail.scale(1.4, 0.45, 1);
  tail.translate(0, 0.01, -0.4);
  return mergeGeometries([prep(g, KIND.white), prep(tail, KIND.white)]);
}

function neckGeometry(len, r0, r1, lo) {
  const g = new THREE.CylinderGeometry(r1, r0, len, lo ? 4 : 7, 1);
  g.translate(0, len / 2, 0);
  const cap = new THREE.SphereGeometry(r1, lo ? 4 : 7, lo ? 3 : 5);
  cap.translate(0, len, 0);
  return mergeGeometries([prep(g, KIND.white), prep(cap, KIND.white)]);
}

function headGeometry(lo) {
  const head = new THREE.SphereGeometry(0.045, lo ? 5 : 10, lo ? 4 : 8);
  head.scale(0.85, 0.9, 1.3);
  head.translate(0, 0.02, 0.02);
  const beak = new THREE.ConeGeometry(0.016, 0.15, lo ? 3 : 6);
  beak.rotateX(Math.PI / 2);
  beak.scale(1, 0.8, 1);
  beak.translate(0, 0.012, 0.13);
  if (lo) return mergeGeometries([prep(head, KIND.white), prep(beak, KIND.beak)]);
  const eye = new THREE.SphereGeometry(0.009, 5, 4);
  const eyeL = eye.clone().translate(0.034, 0.03, 0.045);
  const eyeR = eye.clone().translate(-0.034, 0.03, 0.045);
  return mergeGeometries([prep(head, KIND.white), prep(beak, KIND.beak), prep(eyeL, KIND.leg), prep(eyeR, KIND.leg)]);
}

function legGeometry(lo) {
  const L = 0.57;
  const shin = new THREE.CylinderGeometry(0.009, 0.011, L, lo ? 3 : 5);
  shin.translate(0, -L / 2, 0);
  if (lo) return prep(shin, KIND.leg);
  const toes = [];
  for (const a of [-0.5, 0, 0.5]) {
    const t = new THREE.CylinderGeometry(0.005, 0.006, 0.09, 4);
    t.rotateX(Math.PI / 2);
    t.translate(0, 0, 0.045);
    t.rotateY(a);
    t.translate(0, -L + 0.005, 0);
    toes.push(prep(t, KIND.leg));
  }
  const back = new THREE.CylinderGeometry(0.005, 0.006, 0.05, 4);
  back.rotateX(Math.PI / 2);
  back.translate(0, -L + 0.005, -0.025);
  return mergeGeometries([prep(shin, KIND.leg), ...toes, prep(back, KIND.leg)]);
}

// Wing panel lying in the XZ plane, leading edge along z=0, span toward +X (side=1) or -X.
function wingGeometry(side, outer) {
  const s = new THREE.Shape();
  if (!outer) {
    // inner wing: span 0.32, chord 0.3
    s.moveTo(0, 0.02);
    s.lineTo(0.33, 0.0);
    s.lineTo(0.33, -0.25);
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const x = 0.33 - (i / n) * 0.33;
      s.lineTo(x, -0.28 - (i % 2 ? 0.035 : 0));
    }
    s.lineTo(0, -0.24);
  } else {
    // outer wing with primaries fanning to a point
    s.moveTo(0, 0.0);
    s.lineTo(0.24, 0.01);
    s.lineTo(0.52, -0.05);
    const tips = [[0.55, -0.09], [0.48, -0.115], [0.5, -0.14], [0.4, -0.17], [0.42, -0.2], [0.3, -0.22], [0.3, -0.26], [0.17, -0.25], [0.12, -0.27]];
    for (const [x, y] of tips) s.lineTo(x, y);
    s.lineTo(0, -0.25);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -0.006);
  g.rotateX(-Math.PI / 2); // shape XY -> XZ; shape +Y becomes -Z (so chord runs toward -Z)
  g.scale(1, 1, -1); // ...put leading edge at z=0 and chord toward -Z
  if (side < 0) g.scale(-1, 1, 1);
  g.computeVertexNormals();
  return prep(g, KIND.white);
}

function birdGeometry(lo) {
  const parts = [
    bodyGeometry(lo),
    neckGeometry(0.2, 0.042, 0.03, lo),
    neckGeometry(0.2, 0.03, 0.024, lo),
    headGeometry(lo),
    legGeometry(lo),
    legGeometry(lo),
    wingGeometry(1, false),
    wingGeometry(1, true),
    wingGeometry(-1, false),
    wingGeometry(-1, true),
  ];
  parts.forEach((g, i) => {
    g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(i), 1));
  });
  return mergeGeometries(parts);
}

// Mirrors the hierarchy the model was designed with:
//   root  = T(pos) · Ry(yaw) Rx(pitch) Rz(roll) · S(scale)
//   body  = root · Rx(bodyPitch)
//   neck1 = body · T(0,.05,.19) · Rx(n1) Ry(headYaw·.35);  neck2 = neck1 · T(0,.2,0) · Rx(n2)
//   head  = neck2 · T(0,.2,0) · Rx(hd) Ry(headYaw·.65)
//   legs  = root · T(±.045,-.04,-.02) · Rx(tuck ± swing)
//   wingI = body · T(±.07,.07,.1) · Ry Rz Rx (fold/flap) · S(fold shrink);  wingO = wingI · T(±.33,0,0) · Rz
const vert = /* glsl */ `
${COMMON}
attribute float aPart, aKind;
uniform float uLineW;
attribute vec4 iA; // position.xyz, scale
attribute vec4 iB; // yaw, pitch, roll, body pitch
attribute vec4 iC; // neck1, neck2, head, head yaw
attribute vec4 iD; // fold, inner flap, outer flap, leg tuck
attribute vec4 iE; // leg swing
varying vec3 vW, vN;
varying float vKind;
mat4 mT(vec3 t) { return mat4(1,0,0,0, 0,1,0,0, 0,0,1,0, t.x,t.y,t.z,1); }
mat4 mS(vec3 s) { return mat4(s.x,0,0,0, 0,s.y,0,0, 0,0,s.z,0, 0,0,0,1); }
mat4 mRx(float a) { float c = cos(a), s = sin(a); return mat4(1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1); }
mat4 mRy(float a) { float c = cos(a), s = sin(a); return mat4(c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1); }
mat4 mRz(float a) { float c = cos(a), s = sin(a); return mat4(c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1); }
mat4 birdMatrix() {
  int part = int(aPart + 0.5);
  mat4 M = mT(iA.xyz) * mRy(iB.x) * mRx(iB.y) * mRz(iB.z) * mS(vec3(iA.w));
  if (part == 4 || part == 5) {
    float side = part == 4 ? 1.0 : -1.0;
    return M * mT(vec3(0.045 * side, -0.04, -0.02)) * mRx(iD.w + side * iE.x);
  }
  M = M * mRx(iB.w);
  if (part >= 1 && part <= 3) {
    M = M * mT(vec3(0.0, 0.05, 0.19)) * mRx(iC.x) * mRy(iC.w * 0.35);
    if (part >= 2) M = M * mT(vec3(0.0, 0.2, 0.0)) * mRx(iC.y);
    if (part == 3) M = M * mT(vec3(0.0, 0.2, 0.0)) * mRx(iC.z) * mRy(iC.w * 0.65);
  } else if (part >= 6) {
    float side = part < 8 ? 1.0 : -1.0;
    float f = iD.x;
    M = M * mT(vec3(0.07 * side, 0.07, 0.1))
          * mRy(side * 1.4451 * f) * mRz(side * (iD.y * (1.0 - f) - 0.1 * f)) * mRx(-1.5708 * f)
          * mS(vec3(1.0 - 0.3 * f, 1.0, 1.0 - 0.55 * f));
    if (part == 7 || part == 9) M = M * mT(vec3(0.33 * side, 0.0, 0.0)) * mRz(side * (iD.z * (1.0 - f) - 2.95 * f));
  }
  return M;
}
void main() {
  mat4 M = birdMatrix();
  vec4 w = M * vec4(position, 1.0);
  vN = mat3(M) * normal;
#ifdef OUTLINE
  // 三渲二's line, as on the bones, or white birds are lost against white clouds
  w.xyz += normalize(vN) * uLineW * clamp(length(uCam - w.xyz) * 0.0012, 0.005, 0.12);
#endif
  vW = w.xyz;
  vKind = aKind;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const frag = /* glsl */ `
${COMMON}
uniform vec3 uBirdLit, uBirdShade, uBirdBeak, uBirdLeg;
uniform float uClipY;
uniform vec3 uLineCol;
varying vec3 vW, vN;
varying float vKind;
void main() {
  if (vW.y < uClipY) discard;
#ifdef OUTLINE
  gl_FragColor = vec4(hazedAt(uLineCol, vW), 1.0);
  return;
#endif
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  if (dot(N, V) < 0.0) N = -N;
  float l = dot(N, uSun);
  float vis = cloudShade(vW.xz) * (length(uCam - vW) < 90.0 ? boneShadowAt(vW, 0.3) : 1.0);
  vec3 base = vKind < 0.5 ? uBirdLit : vKind < 1.5 ? uBirdBeak : uBirdLeg;
  // white feathers are lit through as well as on: the shade is pale, and paler where it faces the sky
  vec3 shade = vKind < 0.5 ? mix(uBirdShade, uBirdLit, 0.15 + 0.2 * N.y) : base * 0.72;
  float lit = uToon > 0.5 ? step(0.02, l) * step(0.5, vis) : smoothstep(-0.05, 0.16, l) * vis;
  gl_FragColor = vec4(hazedAt(mix(shade, base, lit), vW), 1.0);
}
`;

const POSES = {
  rest: { n1: 0.5, n2: -0.95, hd: 0.9, body: -0.35 },
  alert: { n1: 0.12, n2: -0.05, hd: 0.33, body: -0.42 },
  peck: { n1: 2.05, n2: 0.45, hd: -1.35, body: 0.4 },
  stalk: { n1: 1.1, n2: -0.4, hd: 0.0, body: 0.05 },
  preen: { n1: -0.3, n2: -1.9, hd: 1.3, body: -0.3 },
  // In flight the neck folds into an S, the way herons and egrets fly.
  flight: { n1: 2.15, n2: -2.5, hd: 0.35, body: 0 },
  flare: { n1: -0.2, n2: 0.6, hd: -0.1, body: 0 },
};

let seed = 41123;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const randRange = (a, b) => a + (b - a) * rand();
const clamp = THREE.MathUtils.clamp;
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}
const dampAngle = (a, b, rate, dt) => a + angleDiff(a, b) * (1 - Math.exp(-rate * dt));
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _ali = new THREE.Vector3();
const _coh = new THREE.Vector3();
const _sep = new THREE.Vector3();

class Grid {
  constructor(cell) { this.cell = cell; this.m = new Map(); }
  clear() { this.m.clear(); }
  insert(o, x, z) {
    const k = `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
    let l = this.m.get(k);
    if (!l) this.m.set(k, (l = []));
    l.push(o);
  }
  query(x, z, r, f) {
    const c = this.cell;
    for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
      for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) {
        const l = this.m.get(`${i},${j}`);
        if (!l) continue;
        for (const o of l) if (f(o) === false) return;
      }
    }
  }
}

class Bird {
  constructor(x, z, id, size) {
    this.id = id;
    this.scale = randRange(0.88, 1.1) * size;
    this.pos = new THREE.Vector3(x, heightAt(x, z) + LEG_H * this.scale, z);
    this.vel = new THREE.Vector3();
    this.yaw = rand() * TAU;
    this.pitch = 0;
    this.roll = 0;
    this.turnRate = 0;
    this.state = 'ground';
    this.stateT = 0;
    this.action = 'stand';
    this.actionT = randRange(0.5, 3);
    this.peckT = 0;
    this.preenSide = 1;
    this.walkTarget = new THREE.Vector3();
    this.walkPhase = rand() * TAU;
    this.fear = 0;
    this.lodDt = 0;
    this.takeoffAt = -1;
    this.pendingFlock = null;
    this.pendingAway = new THREE.Vector3();
    this.flock = null;
    this.landSpot = new THREE.Vector3();
    this.landedAt = -100;
    this.flapPhase = rand() * TAU;
    this.glide = false;
    this.glideT = randRange(1, 3);
    this.headYawTarget = 0;
    this.p = { n1: 0.5, n2: -0.95, hd: 0.9, body: -0.35, headYaw: 0, fold: 1, amp: 0, dihedral: 0.1, legTuck: 0, legSwing: 0, lift: 0 };
  }
}

class Flock {
  constructor(origin, away, calm) {
    this.birds = new Set();
    this.calm = calm;
    this.recruited = 0;
    this.cap = calm ? Math.round(randRange(12, 26)) : 60; // past this, panic stops spreading
    this.phase = 'flee';
    this.timer = calm ? randRange(1.5, 2.5) : randRange(2.5, 3.5);
    this.origin = origin.clone();
    this.away = away.clone().setY(0).normalize();
    this.target = new THREE.Vector3();
    this.center = origin.clone();
    this.orbitCenter = new THREE.Vector3();
    this.orbitR = 30;
    this.orbitA = 0;
    this.orbitDir = 1;
    this.landCenter = new THREE.Vector3();
    this.cruise = randRange(11, 17);
  }
}

export function createBirds({ scene, bones, reeds, startView }) {
  const t0 = tuning.birds;
  const count = Math.round(t0.count);
  const S = t0.size;
  const uniforms = {
    ...U,
    uBirdLit: { value: new THREE.Color() },
    uBirdShade: { value: new THREE.Color() },
    uBirdBeak: { value: new THREE.Color() },
    uBirdLeg: { value: new THREE.Color() },
    uClipY: { value: -1000 },
    uLineW: { value: 1 },
    uLineCol: { value: new THREE.Color() },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, side: THREE.DoubleSide });
  const lineMaterial = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, side: THREE.BackSide, defines: { OUTLINE: 1 } });
  const levels = [false, true].map((lo) => {
    const merged = birdGeometry(lo);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = merged.index;
    for (const name of ['position', 'normal', 'aKind', 'aPart']) geo.setAttribute(name, merged.attributes[name]);
    const pose = new Float32Array(count * POSE_STRIDE);
    const buffer = new THREE.InstancedInterleavedBuffer(pose, POSE_STRIDE, 1).setUsage(THREE.DynamicDrawUsage);
    ['iA', 'iB', 'iC', 'iD', 'iE'].forEach((n, k) => geo.setAttribute(n, new THREE.InterleavedBufferAttribute(buffer, 4, k * 4)));
    geo.instanceCount = 0;
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const line = new THREE.Mesh(geo, lineMaterial);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    return { mesh, pose, buffer, line };
  });

  // Shallow, open water: what they wade in. Not among the reeds, where they couldn't be seen, nor under the bones.
  const bonesAt = bones?.spots || [];
  const clearOfBones = new Map();
  const nearBone = (x, z) => {
    const k = `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
    let v = clearOfBones.get(k);
    if (v === undefined) {
      const cx = (Math.floor(x / 8) + 0.5) * 8;
      const cz = (Math.floor(z / 8) + 0.5) * 8;
      const wrap = (d) => d - Math.round(d / PERIOD) * PERIOD;
      v = bonesAt.some((b) => Math.hypot(wrap(b.x - cx), wrap(b.z - cz)) < b.r + 4);
      clearOfBones.set(k, v);
    }
    return v;
  };
  const isSpot = (x, z) => {
    const h = heightAt(x, z);
    return h < -0.02 && h > -0.32 && !nearBone(x, z) && !reeds?.crowded(x, z);
  };

  const birds = [];
  let flocks = [];
  const occ = new Grid(2 * S);
  const air = new Grid(14);

  function findSpot(x, z, radius, spacing) {
    const s2 = spacing * spacing;
    for (let i = 0; i < 24; i++) {
      const a = rand() * TAU;
      const r = Math.sqrt(rand()) * radius;
      const sx = x + Math.cos(a) * r;
      const sz = z + Math.sin(a) * r;
      if (!isSpot(sx, sz)) continue;
      let ok = true;
      occ.query(sx, sz, spacing, (b) => {
        const p = b.state === 'landing' ? b.landSpot : b.pos;
        if ((p.x - sx) ** 2 + (p.z - sz) ** 2 < s2) {
          ok = false;
          return false;
        }
      });
      if (ok) return { x: sx, z: sz };
    }
    return null;
  }

  // ~14 birds to a group, spread over the wetland. The first group stands where you see it on arriving.
  function seed_() {
    const want = Math.max(1, Math.ceil(count / 14));
    const groups = [];
    for (let tries = 0; groups.length < want && tries < want * 2000; tries++) {
      const first = groups.length === 0 && tries < 1500;
      let x;
      let z;
      if (first) {
        const a = startView.yaw + randRange(-0.5, 0.5);
        const r = randRange(45, 130);
        x = startView.x + Math.sin(a) * r;
        z = startView.z + Math.cos(a) * r;
      } else {
        x = rand() * PERIOD;
        z = rand() * PERIOD;
        if (Math.hypot(x - startView.x, z - startView.z) < 40) continue;
      }
      if (!isSpot(x, z)) continue;
      const wrap = (d) => d - Math.round(d / PERIOD) * PERIOD;
      if (groups.some((g) => Math.hypot(wrap(g.x - x), wrap(g.z - z)) < 70)) continue;
      groups.push({ x, z });
    }
    let id = 0;
    for (let gi = 0; gi < groups.length && id < count; gi++) {
      const g = groups[gi];
      const n = gi === groups.length - 1 ? count - id : Math.round((count / groups.length) * randRange(0.8, 1.2));
      const radius = 7 * S * Math.sqrt(Math.max(1, n / 15));
      for (let k = 0, misses = 0; k < n && id < count && misses < n * 3;) {
        const spot = findSpot(g.x, g.z, radius, 0.9 * S);
        if (!spot) { misses++; continue; }
        const b = new Bird(spot.x, spot.z, id++, S);
        birds.push(b);
        occ.insert(b, spot.x, spot.z);
        k++;
      }
    }
    return groups;
  }
  const groups = seed_();
  const spontaneousScale = () => Math.sqrt(5 / Math.max(5, groups.length));
  let spontaneousT = randRange(10, 18) * spontaneousScale();
  let frame = 0;
  let clock = 0;

  // Your pace decides how close you can get: creeping from close by, a run from a long way off.
  function threatRadii(player) {
    const flee = (4.5 + player.speed * 0.9) * tuning.birds.shy;
    return { flee, alert: flee * 1.8 + 2 };
  }

  function scheduleTakeoff(b, t, flock, away, delay, force = false) {
    if (b.takeoffAt >= 0) return;
    if (!force && flock.recruited >= flock.cap) return;
    flock.recruited++;
    b.takeoffAt = t + delay;
    b.pendingFlock = flock;
    b.pendingAway.copy(away);
  }

  function beginTakeoff(b, t) {
    const flock = b.pendingFlock;
    b.state = 'takeoff';
    b.stateT = 0;
    b.takeoffAt = -1;
    b.flock = flock;
    flock.birds.add(b);
    if (!flocks.includes(flock)) flocks.push(flock);
    const away = _v.copy(b.pendingAway).setY(0);
    if (away.lengthSq() < 1e-4) away.set(Math.sin(b.yaw), 0, Math.cos(b.yaw));
    away.normalize();
    away.applyAxisAngle(THREE.Object3D.DEFAULT_UP, randRange(-0.5, 0.5)); // so the flock fans out
    b.pendingAway.copy(away);
    b.vel.copy(away).multiplyScalar(1.5).setY(2.4);
    b.flapPhase = rand() * 0.5;
    // Panic (or simple sociability) spreads to neighbours as a wave.
    const reach = (flock.calm ? 6 : 7.5) * S;
    occ.query(b.pos.x, b.pos.z, reach, (o) => {
      if (o === b || o.state !== 'ground' || o.takeoffAt >= 0) return;
      const d = o.pos.distanceTo(b.pos);
      if (d > reach) return;
      if (flock.calm && rand() < 0.3) return;
      const oa = _w.subVectors(o.pos, b.pos).setY(0).normalize().add(flock.away).normalize();
      scheduleTakeoff(o, t, flock, oa, 0.1 + d * 0.06 + rand() * (flock.calm ? 0.6 : 0.25));
    });
  }

  function poseToward(b, pose, dt, rate) {
    const p = b.p;
    p.n1 = damp(p.n1, pose.n1, rate, dt);
    p.n2 = damp(p.n2, pose.n2, rate, dt);
    p.hd = damp(p.hd, pose.hd, rate, dt);
    p.body = damp(p.body, pose.body, rate, dt);
    p.headYaw = damp(p.headYaw, b.headYawTarget, 5, dt);
  }

  function orientToVelocity(b, dt, rate) {
    const v = b.vel;
    const hs = Math.hypot(v.x, v.z);
    if (hs < 0.05) return;
    const yaw = Math.atan2(v.x, v.z);
    const dy = angleDiff(b.yaw, yaw);
    b.yaw = dampAngle(b.yaw, yaw, rate, dt);
    b.turnRate = damp(b.turnRate, (dy / Math.max(dt, 1e-3)) * 0.02, 4, dt);
    b.pitch = damp(b.pitch, -Math.atan2(v.y, hs) * 0.7, 4, dt);
    b.roll = damp(b.roll, clamp(-b.turnRate * 2.2, -0.85, 0.85), 3, dt);
  }

  function pickAction(b) {
    const r = rand();
    if (r < 0.32) { b.action = 'stand'; b.actionT = randRange(1.5, 5); }
    else if (r < 0.62) { b.action = 'peck'; b.actionT = randRange(3, 8); b.peckT = randRange(0.3, 1); }
    else if (r < 0.9) {
      const s = findSpot(b.pos.x, b.pos.z, 3.5 * S, 0.8 * S);
      if (s) { b.action = 'walk'; b.walkTarget.set(s.x, 0, s.z); b.actionT = 12; }
      else { b.action = 'stand'; b.actionT = 2; }
    } else if (r < 0.96) { b.action = 'preen'; b.actionT = randRange(2, 4); b.preenSide = rand() < 0.5 ? -1 : 1; }
    else { b.action = 'stretch'; b.actionT = 1.6; }
  }

  function updateGround(b, dt, t, player, radii) {
    const p = b.p;
    const dx = player.pos.x - b.pos.x;
    const dz = player.pos.z - b.pos.z;
    // flying far overhead doesn't trouble them
    const d = player.pos.y - b.pos.y > 25 ? Infinity : Math.hypot(dx, dz);
    const toPlayerYaw = Math.atan2(dx, dz);

    if (b.takeoffAt >= 0) {
      if (t >= b.takeoffAt) { beginTakeoff(b, t); return; }
    } else if (d < radii.flee) {
      const away = new THREE.Vector3(-dx, 0, -dz);
      let flock = null;
      for (const f of flocks) if (!f.calm && f.phase === 'flee' && f.recruited < f.cap && f.origin.distanceTo(b.pos) < 25) flock = f;
      if (!flock) { flock = new Flock(b.pos, away, false); flocks.push(flock); }
      scheduleTakeoff(b, t, flock, away, rand() * 0.15, true);
    } else if (d < radii.alert) {
      const k = 1 - (d - radii.flee) / (radii.alert - radii.flee);
      b.fear += dt * k * (0.2 + player.speed * 0.12);
      if (b.fear > 1) {
        const away = new THREE.Vector3(-dx, 0, -dz);
        const flock = new Flock(b.pos, away, false);
        flocks.push(flock);
        scheduleTakeoff(b, t, flock, away, 0, true);
      }
    } else {
      b.fear = Math.max(0, b.fear - dt * 0.12);
    }

    const alerted = d < radii.alert || b.fear > 0.25 || t - b.landedAt < 2.5;
    let pose = POSES.rest;
    let walkSpeed = 0;
    b.headYawTarget = 0;
    if (alerted) {
      pose = POSES.alert;
      b.headYawTarget = clamp(angleDiff(b.yaw, toPlayerYaw), -1.3, 1.3) * (d < radii.alert ? 1 : 0);
      if (b.fear > 0.35 && d < radii.alert) {
        // Edge away from the intruder, head held high.
        b.yaw = dampAngle(b.yaw, toPlayerYaw + Math.PI, 3, dt);
        walkSpeed = 0.75 + b.fear * 0.6;
        const nx = b.pos.x + Math.sin(b.yaw) * walkSpeed * dt;
        const nz = b.pos.z + Math.cos(b.yaw) * walkSpeed * dt;
        if (isSpot(nx, nz)) { b.pos.x = nx; b.pos.z = nz; } else walkSpeed = 0;
      }
      b.action = 'stand';
      b.actionT = Math.min(b.actionT, randRange(1, 2.5));
    } else {
      b.actionT -= dt;
      if (b.actionT <= 0) pickAction(b);
      switch (b.action) {
        case 'peck': {
          b.peckT -= dt;
          if (b.peckT < 0) b.peckT = randRange(0.9, 1.8);
          pose = b.peckT > 0.45 ? POSES.stalk : POSES.peck;
          if (b.peckT < 0.1) pose = POSES.stalk;
          break;
        }
        case 'walk': {
          const wx = b.walkTarget.x - b.pos.x;
          const wz = b.walkTarget.z - b.pos.z;
          const wd = Math.hypot(wx, wz);
          if (wd < 0.1) { b.actionT = 0; break; }
          b.yaw = dampAngle(b.yaw, Math.atan2(wx, wz), 4, dt);
          walkSpeed = 0.38;
          const step = Math.min(wd, walkSpeed * dt);
          b.pos.x += Math.sin(b.yaw) * step;
          b.pos.z += Math.cos(b.yaw) * step;
          pose = POSES.stalk;
          break;
        }
        case 'preen': pose = POSES.preen; b.headYawTarget = 1.2 * b.preenSide; break;
        case 'stretch': pose = POSES.alert; break;
        default: b.headYawTarget = Math.sin(t * 0.5 + b.id) * 0.5;
      }
    }

    // Gentle separation from neighbours.
    const sepR = 0.71 * S;
    occ.query(b.pos.x, b.pos.z, sepR, (o) => {
      if (o === b || o.state !== 'ground') return;
      const sx = b.pos.x - o.pos.x;
      const sz = b.pos.z - o.pos.z;
      const s2 = sx * sx + sz * sz;
      if (s2 < sepR * sepR && s2 > 1e-6) {
        const s = Math.sqrt(s2);
        const push = (sepR - s) * dt * 1.5;
        b.pos.x += (sx / s) * push;
        b.pos.z += (sz / s) * push;
      }
    });

    if (walkSpeed > 0) b.walkPhase += dt * walkSpeed * 11;
    const gy = heightAt(b.pos.x, b.pos.z);
    b.pos.y = damp(b.pos.y, gy + LEG_H * b.scale + (walkSpeed > 0 ? Math.abs(Math.sin(b.walkPhase)) * 0.015 : 0), 12, dt);
    poseToward(b, pose, dt, 5);
    p.legSwing = damp(p.legSwing, walkSpeed > 0 ? Math.sin(b.walkPhase) * 0.38 : 0, 14, dt);
    p.legTuck = damp(p.legTuck, 0, 8, dt);
    const stretching = !alerted && b.action === 'stretch';
    p.fold = damp(p.fold, stretching ? 0.15 : 1, stretching ? 4 : 5, dt);
    p.lift = damp(p.lift, stretching ? 0.9 : 0, 4, dt);
    p.amp = damp(p.amp, 0, 6, dt);
    p.dihedral = 0.1;
    b.pitch = damp(b.pitch, 0, 6, dt);
    b.roll = damp(b.roll, 0, 6, dt);
    b.vel.set(0, 0, 0);
  }

  function updateTakeoff(b, dt) {
    const away = b.pendingAway;
    const climb = Math.max(0, 6.5 - b.stateT * 3.2);
    b.vel.x += away.x * 5.5 * dt;
    b.vel.z += away.z * 5.5 * dt;
    b.vel.y += climb * dt;
    b.vel.y = Math.min(b.vel.y, 4);
    b.pos.addScaledVector(b.vel, dt);
    orientToVelocity(b, dt, 5);
    b.flapPhase += dt * TAU * 3.3;
    const p = b.p;
    p.fold = damp(p.fold, 0, 14, dt);
    p.amp = damp(p.amp, 1.1, 10, dt);
    p.dihedral = 0.25;
    p.lift = damp(p.lift, 0, 8, dt);
    p.legTuck = damp(p.legTuck, b.stateT > 0.35 ? 1 : 0.2, 3, dt);
    p.legSwing = damp(p.legSwing, 0, 8, dt);
    poseToward(b, b.stateT < 0.4 ? POSES.flare : POSES.flight, dt, 4);
    if (b.stateT > 1.1) { b.state = 'flying'; b.stateT = 0; }
  }

  function updateFlying(b, dt, player) {
    const f = b.flock;
    const acc = _v.set(0, 0, 0);
    const seek = _w.subVectors(f.target, b.pos);
    const sd = seek.length();
    if (sd > 0.01) acc.addScaledVector(seek, (Math.min(9, sd) / sd) * 0.55);
    // Boids within the flock.
    let nAli = 0;
    let nCoh = 0;
    const ali = _ali.set(0, 0, 0);
    const coh = _coh.set(0, 0, 0);
    const sep = _sep.set(0, 0, 0);
    air.query(b.pos.x, b.pos.z, 14, (o) => {
      if (o === b || o.flock !== f) return;
      const dx = b.pos.x - o.pos.x;
      const dy = b.pos.y - o.pos.y;
      const dz = b.pos.z - o.pos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 6.5 * S * S && d2 > 1e-6) { sep.x += dx / d2; sep.y += dy / d2; sep.z += dz / d2; }
      if (d2 < 100) { ali.add(o.vel); nAli++; }
      if (d2 < 196) { coh.add(o.pos); nCoh++; }
    });
    acc.addScaledVector(sep, 6);
    if (nAli) acc.addScaledVector(ali.divideScalar(nAli).sub(b.vel), 0.6);
    if (nCoh) acc.addScaledVector(coh.divideScalar(nCoh).sub(b.pos), 0.12);
    // Clear of the land, and of you.
    const gy = Math.max(0, heightAt(b.pos.x, b.pos.z));
    if (b.pos.y < gy + 4) acc.y += (gy + 4 - b.pos.y) * 3;
    const px = b.pos.x - player.pos.x;
    const pz = b.pos.z - player.pos.z;
    const pd = Math.hypot(px, pz);
    if (pd < 10 && b.pos.y - player.pos.y < 8 && pd > 0.01) { acc.x += (px / pd) * 4; acc.z += (pz / pd) * 4; acc.y += 3; }
    // Around the great bones, and over them.
    for (const s of bonesAt) {
      if (b.pos.y > s.r * 1.6) continue;
      const wrapX = b.pos.x - s.x - Math.round((b.pos.x - s.x) / PERIOD) * PERIOD;
      const wrapZ = b.pos.z - s.z - Math.round((b.pos.z - s.z) / PERIOD) * PERIOD;
      const dd = Math.hypot(wrapX, wrapZ);
      const reach = s.r + 7;
      if (dd < reach && dd > 0.01) {
        const k = (reach - dd) / reach;
        acc.x += (wrapX / dd) * 7 * k;
        acc.z += (wrapZ / dd) * 7 * k;
        acc.y += 6 * k;
      }
    }

    b.vel.addScaledVector(acc, dt);
    const sp = b.vel.length();
    const maxS = 9.5;
    const minS = 4.8;
    if (sp > maxS) b.vel.multiplyScalar(maxS / sp);
    else if (sp < minS) b.vel.multiplyScalar(minS / Math.max(sp, 1e-3));
    b.pos.addScaledVector(b.vel, dt);
    orientToVelocity(b, dt, 3);

    // Flap-and-glide rhythm; always flap while climbing.
    b.glideT -= dt;
    if (b.glideT <= 0) { b.glide = !b.glide; b.glideT = b.glide ? randRange(1.2, 3) : randRange(1.2, 2.6); }
    const flapping = !b.glide || b.vel.y > 0.8;
    const p = b.p;
    if (flapping) b.flapPhase += dt * TAU * 2.2;
    else b.flapPhase = damp(b.flapPhase, Math.round(b.flapPhase / TAU) * TAU + 0.35, 3, dt);
    p.amp = damp(p.amp, flapping ? 0.85 : 0.05, 4, dt);
    p.dihedral = flapping ? 0.18 : 0.08;
    p.fold = damp(p.fold, 0, 8, dt);
    p.legTuck = damp(p.legTuck, 1, 4, dt);
    p.legSwing = damp(p.legSwing, 0, 8, dt);
    poseToward(b, POSES.flight, dt, 4);

    // Peel off to land once the flock is on final approach.
    if (f.phase === 'approach' && b.stateT > 0.5) {
      const hd = Math.hypot(b.pos.x - f.landCenter.x, b.pos.z - f.landCenter.z);
      if (hd < 30) {
        const s = findSpot(f.landCenter.x, f.landCenter.z, 8 * S * Math.sqrt(Math.max(1, f.birds.size / 15)), 0.95 * S);
        if (s) {
          b.state = 'landing';
          b.stateT = 0;
          b.landSpot.set(s.x, heightAt(s.x, s.z), s.z);
          occ.insert(b, s.x, s.z); // reserve it for the rest of this frame
        } else b.stateT = 0;
      }
    }
  }

  function touchdown(b, t) {
    b.state = 'ground';
    b.stateT = 0;
    b.vel.set(0, 0, 0);
    b.fear = 0;
    b.landedAt = t;
    b.action = 'stand';
    b.actionT = randRange(2, 4);
    if (b.flock) b.flock.birds.delete(b);
    b.flock = null;
  }

  function startCircle(f, duration) {
    f.phase = 'circle';
    f.timer = duration;
    f.orbitR = randRange(22, 38);
    f.orbitCenter.copy(f.center).addScaledVector(f.away, f.orbitR * 0.6).setY(0);
    f.orbitA = Math.atan2(f.center.z - f.orbitCenter.z, f.center.x - f.orbitCenter.x);
    f.orbitDir = rand() < 0.5 ? 1 : -1;
  }

  function updateLanding(b, dt, t, player, radii) {
    const s = b.landSpot;
    // Abort if you're standing on the spot.
    if (Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < radii.flee * 1.3) {
      b.state = 'flying';
      b.stateT = 0;
      if (b.flock.phase === 'approach') startCircle(b.flock, 5);
      return;
    }
    const standY = s.y + LEG_H * b.scale;
    const hx = s.x - b.pos.x;
    const hz = s.z - b.pos.z;
    const hd = Math.hypot(hx, hz);
    const speed = clamp(hd * 0.75, 0.25, 8.5);
    const desired = _v.set(hd > 1e-3 ? (hx / hd) * speed : 0, 0, hd > 1e-3 ? (hz / hd) * speed : 0);
    const targetY = standY + Math.min(hd * 0.38, 30);
    desired.y = clamp((targetY - b.pos.y) * 1.6, -3.2, 2);
    b.vel.lerp(desired, 1 - Math.exp(-2.4 * dt));
    b.pos.addScaledVector(b.vel, dt);

    const flare = hd < 5;
    const p = b.p;
    if (flare) {
      b.flapPhase += dt * TAU * 2.6;
      p.amp = damp(p.amp, 1.0, 5, dt);
    } else {
      b.flapPhase = damp(b.flapPhase, Math.round(b.flapPhase / TAU) * TAU + 0.4, 3, dt);
      p.amp = damp(p.amp, 0.08, 4, dt);
    }
    p.dihedral = 0.22;
    p.fold = damp(p.fold, 0, 8, dt);
    p.legTuck = damp(p.legTuck, hd < 8 ? 0 : 1, 3, dt);
    p.legSwing = damp(p.legSwing, hd < 8 ? -0.35 : 0, 3, dt);
    poseToward(b, flare ? POSES.flare : POSES.flight, dt, 3);
    if (b.vel.x * b.vel.x + b.vel.z * b.vel.z > 0.1) {
      orientToVelocity(b, dt, 3);
      if (flare) b.pitch = damp(b.pitch, -0.6, 5, dt);
    }
    if ((hd < 0.3 && b.pos.y - standY < 0.25) || b.stateT > 25) {
      b.pos.set(s.x, standY, s.z);
      touchdown(b, t);
    }
  }

  function chooseLanding(f, player) {
    let best = null;
    let bestScore = -Infinity;
    const grounded = birds.filter((b) => b.state === 'ground');
    for (let i = 0; i < 60; i++) {
      const a = rand() * TAU;
      const r = randRange(f.calm ? 30 : 50, f.calm ? 110 : 170);
      const x = f.center.x + Math.cos(a) * r;
      const z = f.center.z + Math.sin(a) * r;
      if (!isSpot(x, z)) continue;
      const pd = Math.hypot(x - player.pos.x, z - player.pos.z);
      if (pd < 38) continue;
      let good = 0;
      for (let k = 0; k < 8; k++) {
        const ka = (k / 8) * TAU;
        if (isSpot(x + Math.cos(ka) * 5, z + Math.sin(ka) * 5)) good++;
      }
      if (good < 6) continue;
      // Far from you, and near (but not on top of) other resting egrets.
      let near = Infinity;
      for (const g of grounded) near = Math.min(near, Math.hypot(g.pos.x - x, g.pos.z - z));
      const social = near < Infinity ? -Math.abs(near - 12) * 0.2 : 0;
      const score = Math.min(pd, 80) * 0.5 + social + rand() * 8;
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    }
    if (!best) return false;
    f.landCenter.set(best.x, 0, best.z);
    f.phase = 'approach';
    return true;
  }

  function updateFlock(f, dt, player) {
    let n = 0;
    const c = _v.set(0, 0, 0);
    for (const b of f.birds) if (b.state !== 'landing') { c.add(b.pos); n++; }
    if (n) f.center.copy(c.divideScalar(n));
    f.timer -= dt;
    // (cruise is over the land under the goal: there are hills here)
    const over = (x, z) => Math.max(0, heightAt(x, z));
    if (f.phase === 'flee') {
      f.target.copy(f.origin).addScaledVector(f.away, 55);
      f.target.y = over(f.target.x, f.target.z) + f.cruise;
      if (f.timer <= 0) startCircle(f, f.calm ? randRange(3, 7) : randRange(7, 15));
    } else if (f.phase === 'circle') {
      f.orbitA += f.orbitDir * (7.5 / f.orbitR) * dt;
      f.target.set(f.orbitCenter.x + Math.cos(f.orbitA) * f.orbitR, 0, f.orbitCenter.z + Math.sin(f.orbitA) * f.orbitR);
      f.target.y = over(f.target.x, f.target.z) + f.cruise + Math.sin(f.orbitA * 2) * 3;
      if (f.timer <= 0 && !chooseLanding(f, player)) f.timer = 3;
    } else if (f.phase === 'approach') {
      f.target.copy(f.landCenter).setY(7);
      if (Math.hypot(player.pos.x - f.landCenter.x, player.pos.z - f.landCenter.z) < 20) startCircle(f, 4);
    }
  }

  // Everything stays on the copy of the land within half a period of you, so distances and steering never straddle the seam.
  function rebase(cam) {
    const shift = (v, c) => PERIOD * Math.round((c - v) / PERIOD);
    const moved = new Set();
    for (const f of flocks) {
      const dx = shift(f.center.x, cam.x);
      const dz = shift(f.center.z, cam.z);
      if (!dx && !dz) continue;
      for (const v of [f.origin, f.target, f.center, f.orbitCenter, f.landCenter]) { v.x += dx; v.z += dz; }
      for (const b of f.birds) {
        b.pos.x += dx; b.pos.z += dz;
        b.walkTarget.x += dx; b.walkTarget.z += dz;
        b.landSpot.x += dx; b.landSpot.z += dz;
        moved.add(b);
      }
    }
    for (const b of birds) {
      if (moved.has(b)) continue;
      const q = b.state === 'landing' ? b.landSpot : b.pos;
      const dx = shift(q.x, cam.x);
      const dz = shift(q.z, cam.z);
      if (!dx && !dz) continue;
      b.pos.x += dx; b.pos.z += dz;
      b.walkTarget.x += dx; b.walkTarget.z += dz;
      b.landSpot.x += dx; b.landSpot.z += dz;
    }
  }

  function sync(cam) {
    const counts = [0, 0];
    const near2 = LOD_NEAR * LOD_NEAR;
    for (const b of birds) {
      const dx = b.pos.x - cam.x;
      const dz = b.pos.z - cam.z;
      const L = dx * dx + dz * dz < near2 ? 0 : 1;
      const P = levels[L].pose;
      const o = counts[L]++ * POSE_STRIDE;
      const p = b.p;
      P[o] = b.pos.x; P[o + 1] = b.pos.y; P[o + 2] = b.pos.z; P[o + 3] = b.scale;
      P[o + 4] = b.yaw; P[o + 5] = b.pitch; P[o + 6] = b.roll; P[o + 7] = p.body;
      P[o + 8] = p.n1; P[o + 9] = p.n2; P[o + 10] = p.hd; P[o + 11] = p.headYaw;
      P[o + 12] = p.fold;
      P[o + 13] = p.amp * Math.sin(b.flapPhase) + p.dihedral + p.lift; // inner wing
      P[o + 14] = p.amp * 0.75 * Math.sin(b.flapPhase - 0.75) + 0.04 - p.lift * 0.4; // outer wing, lagging
      P[o + 15] = p.legTuck * 1.45;
      P[o + 16] = p.legSwing;
    }
    levels.forEach((lv, L) => {
      lv.mesh.geometry.instanceCount = counts[L];
      lv.buffer.needsUpdate = true;
    });
  }

  return {
    birds,
    groups,
    get flocks() { return flocks; },
    apply() {
      const t = tuning.birds;
      uniforms.uBirdLit.value.set(t.lit);
      uniforms.uBirdShade.value.set(t.shade);
      uniforms.uBirdBeak.value.set(t.beak);
      uniforms.uBirdLeg.value.set(t.leg);
      uniforms.uLineW.value = tuning.toon.outline;
      uniforms.uLineCol.value.set(tuning.toon.outlineColor);
      for (const lv of levels) lv.line.visible = tuning.toon.on && tuning.toon.outline > 0;
    },
    forMirror(on) { uniforms.uClipY.value = on ? 0 : -1000; },
    update(dt, player) {
      if (!birds.length) return;
      clock += dt;
      const t = clock;
      rebase(player.pos);
      const radii = threatRadii(player);
      occ.clear();
      air.clear();
      for (const b of birds) {
        if (b.state === 'ground') occ.insert(b, b.pos.x, b.pos.z);
        else if (b.state === 'landing') occ.insert(b, b.landSpot.x, b.landSpot.z);
        else air.insert(b, b.pos.x, b.pos.z);
      }
      frame++;
      const lodR2 = LOD_THINK * LOD_THINK;
      for (const b of birds) {
        let bdt = dt;
        // Resting birds far from you only think now and then, catching up on the time.
        if (b.state === 'ground' && b.takeoffAt < 0) {
          b.lodDt += dt;
          const dx = b.pos.x - player.pos.x;
          const dz = b.pos.z - player.pos.z;
          if (dx * dx + dz * dz > lodR2 && (frame + b.id) % 3 !== 0) continue;
          bdt = b.lodDt;
          b.lodDt = 0;
        }
        b.stateT += bdt;
        if (b.state === 'ground') updateGround(b, bdt, t, player, radii);
        else if (b.state === 'takeoff') updateTakeoff(b, dt);
        else if (b.state === 'flying') updateFlying(b, dt, player);
        else if (b.state === 'landing') updateLanding(b, dt, t, player, radii);
      }
      for (const f of flocks) updateFlock(f, dt, player);
      flocks = flocks.filter((f) => f.birds.size > 0);

      // Now and then a group lifts off on its own and resettles elsewhere.
      spontaneousT -= dt;
      if (spontaneousT <= 0) {
        spontaneousT = randRange(18, 40) * spontaneousScale();
        const candidates = birds.filter((b) => b.state === 'ground' && b.takeoffAt < 0 && t - b.landedAt > 20 && b.pos.distanceTo(player.pos) > 22);
        if (candidates.length) {
          const b = candidates[Math.floor(rand() * candidates.length)];
          const a = rand() * TAU;
          const away = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
          const flock = new Flock(b.pos, away, true);
          flocks.push(flock);
          scheduleTakeoff(b, t, flock, away, 0, true);
        }
      }
      sync(player.pos);
    },
    sync,
  };
}
