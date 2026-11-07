import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { U, COMMON } from './common.js';
import { tuning } from './tuning.js';
import { heightAt, PERIOD, DRY, BONE_RISE, DRAGON } from './terrain.js';

// Huge white bones lying in the grass, gathered in one field ahead of where you arrive. Each placement is one part at a size
// in metres, turned and partly sunk. The land tiles, so each is drawn at its copy nearest the camera. A depth pass from the
// sun gives real shadows on the grass. The surface is one white: the scans' small relief is smoothed away, not shown.

const vert = /* glsl */ `
${COMMON}
attribute float aOpen;
varying vec3 vW;
varying vec3 vN;
varying float vOpen;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vOpen = aOpen;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const frag = /* glsl */ `
${COMMON}
uniform vec3 uBoneLit, uBoneShade;
uniform float uClipY, uBoneDepth;
uniform vec3 uBoneForm; // how much of the grass's light, of the dark in the hollows, of the colour of what's around
uniform vec3 uBoneBand, uBoneBounce, uBoneGrass, uBoneSheen;
uniform vec2 uBoneFoot; // how much of the grass's own colour gets into the bounce, how high up the bone it reaches (m)
uniform float uBoneSpec;
uniform float uBoneCastFade;
uniform vec3 uBoneEdge; // how far the edge of light and dark is moved, how strong the band on it, how strong the shadows they throw on each other
varying vec3 vW;
varying vec3 vN;
varying float vOpen;

// White, but in the same air as the grass: the grass's own light code on the bone's own shape, what a white thing picks up from what's
// around it, and the dark where little light gets in. The surface itself stays one plain white.
vec3 inTheAir(vec3 N, vec3 V, float vis, vec3 shadow) {
  float l = dot(N, uSun);
  float f = smoothstep(-uBandLook.x, uBandLook.x, l - 0.02 - uBoneEdge.x);
  // What comes up from below goes by how near the ground this is, which way it faces, and a wandering patchiness. By height alone it
  // would stop along a ruled line, and level ground would draw that line straight across every bone.
  float above = vW.y - max(texture2D(uHeightTex, vW.xz / uPeriod).r, 0.0);
  float near = 1.0 - smoothstep(0.0, uBoneFoot.y, above);
  float w1 = texture2D(uNoiseTex, vec2(vW.x + vW.z, vW.y * 2.3) / (uBoneFoot.y * 7.0)).r - 0.5;
  float w2 = texture2D(uNoiseTex, vec2(vW.x - vW.z, vW.y * 2.3) / (uBoneFoot.y * 2.6) + 0.37).g - 0.5;
  float wander = w1 + 0.5 * w2;
  float faceDown = 0.5 - 0.5 * N.y;
  // two colours in it: its own, and nearer the ground the grass's, in patches
  float grassy = near * 0.9 + wander * 1.1;
  grassy = uToon > 0.5 ? step(0.45, grassy) : smoothstep(0.2, 0.7, grassy);
  vec3 green = mix(uBoneBounce, uBoneGrass, grassy * uBoneFoot.x);
  // out of the sun it's lit by what's around: the shadow's own colour from the sky over it, and from the grass under it a greyed
  // yellow-green. It stays white: only a little of the colour shows, or it reads as painted, or as mother-of-pearl.
  float shadowL = dot(shadow, vec3(0.3, 0.59, 0.11));
  vec3 fromGrass = mix(vec3(shadowL), shadowL * green / max(dot(green, vec3(0.3, 0.59, 0.11)), 0.2), 0.5);
  gOwn = 2.0;
  gOwnSheen = uBoneSheen;
  gOwnSpec = uBoneSpec;
  gOwnCol = mix(uBoneLit, uBoneBand, 4.0 * f * (1.0 - f) * uBoneEdge.y);
  gOwnShade = mix(shadow, fromGrass, uBoneForm.z * (1.0 - smoothstep(-0.7, 0.2, N.y)));
  // (the land's slope light doesn't apply: here the terminator is the bone's own, in vis)
  vec3 c = furColor(vW.xz, vec3(0.0, 1.0, 0.0), f * vis, uWindDir, vec4(0.0), N, N, 0.5, V, 0.0, uBandLook.w * 0.4);
  // down in the grass: its colour comes up onto the bone, and less light gets there
  // (mostly on what faces down or sideways: what faces the sky stays white)
  float footV = near * (0.1 + 1.2 * faceDown * faceDown * 2.0) + wander * 0.45;
  float foot = uToon > 0.5 ? step(0.42, footV) : smoothstep(0.15, 0.7, footV);
  float hollow = 1.0 - vOpen;
  if (uToon > 0.5) {
    c = mix(c, mix(c, green, 0.26), foot * uBoneForm.z);
    return mix(c, mix(c, uShade, 0.32), step(0.42, hollow) * uBoneForm.y);
  }
  c = mix(c, c * mix(vec3(1.0), green * 1.15, 0.55), foot * uBoneForm.z);
  return mix(c, mix(c, uShade, 0.62), smoothstep(0.08, 0.8, hollow) * uBoneForm.y);
}

void main() {
  if (vW.y < uClipY) discard;
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  if (dot(N, V) < 0.0) N = -N;
  float bias = 0.12 + 0.3 * (1.0 - max(dot(N, uSun), 0.0));
  // looked up a little way off the surface: a texel of the shadow map is about 10 cm, and where light only grazes a bone its own surface
  // would shadow itself in a row of little teeth, along each texel of the map
  float nlOff = max(dot(N, uSun), 0.0);
  float l = dot(N, uSun);
  float vis = boneShadowSoft(vW + N * (0.18 + 0.5 * (1.0 - nlOff)), bias);
  // The scans are coarse at this size. Where the sun only grazes, the smooth normal says lit while the real facets turn away from it and
  // shadow each other, in angular blocks that have nothing to do with the bone's shape: so there, what's thrown on it fades out.
  if (uBoneCastFade > 0.0) vis = mix(1.0, vis, smoothstep(uBoneCastFade / 3.0, uBoneCastFade, l));
  vis = mix(1.0, vis, uBoneEdge.z);
  float lit;
  if (uToon > 0.5) lit = step(0.04, l) * step(0.5, vis) * step(0.5, cloudShade(vW.xz));
  else lit = smoothstep(0.0, 0.1, l) * vis * cloudShade(vW.xz);
  // all over white: even the side away from the sun is only a little way towards the shadow colour
  vec3 shadow = mix(uBoneLit, uBoneShade, uBoneDepth);
  vec3 col = mix(shadow, uBoneLit, lit);
  if (uBoneForm.x > 0.0) col = mix(col, inTheAir(N, V, vis, shadow), uBoneForm.x);
  gl_FragColor = vec4(hazedAt(col, vW), 1.0);
}
`;
// 三渲二's line: the back faces, pushed out along their normals by an amount that holds on screen
const outlineVert = /* glsl */ `
uniform float uOutlineW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec3 N = normalize(mat3(modelMatrix) * normal);
  float d = length(cameraPosition - w.xyz);
  w.xyz += N * uOutlineW * clamp(d * 0.0016, 0.02, 0.7);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const outlineFrag = /* glsl */ `
precision highp float;
uniform vec3 uOutlineCol;
void main() { gl_FragColor = vec4(uOutlineCol, 1.0); }
`;

// How each part lies. rest: degrees (YXZ) on the model as stored. lay: 'long' turns its longest axis level and rolls it at
// random, 'flat' lays its flattest side down. tilt: random lean in degrees. size in metres, sink as a share of its height.
const PARTS = {
  horse_torso: { rest: [0, 0, 0], size: 34, sink: 0.26, tilt: 4 },
  horse_skull: { rest: [0, 0, -90], size: 11, sink: 0.12, tilt: 8 },
  // the same ribcage on its back, spine sunk and ribs reaching up, leaning over: not a second copy of the one lying in the carcass.
  // Its breastbone and the rib cartilages are left out (see openRibcage), or they'd hang in the air over the ribs' ends.
  horse_ribcage: { made: true, rest: [0, 18, 158], size: 34, sink: 0.3, tilt: 6 },
  horse_neck: { lay: 'long', size: 17, sink: 0.24, tilt: 3 },
  horse_pelvis: { rest: [0, 0, 0], size: 14, sink: 0.2, tilt: 12 },
  deer_sika: { rest: [0, 0, 0], size: 16, sink: 0.1, tilt: 22 },
  deer_tsushima: { rest: [0, 0, 0], size: 13, sink: 0.1, tilt: 26 },
  aurochs: { rest: [0, 0, 0], size: 14, sink: 0.12, tilt: 18 },
};

// local x, z from the group's centre; yaw in degrees. Only what reads as what it is: skulls, ribcages, spines. A limb bone alone is a white lump.
const GROUPS = {
  // a skeleton come apart: ribs in place, the rest along it
  carcass: [
    ['horse_torso', 0, 0, 0],
    ['horse_pelvis', 2, 22, 12],
    ['horse_neck', -6, -22, -24],
    ['horse_skull', -10, -34, 40],
  ],
  stag: [['deer_sika', 0, 0, 0]],
  stag2: [['deer_tsushima', 0, 0, 0]],
  bull: [['aurochs', 0, 0, 0]],
  ribs: [['horse_ribcage', 0, 0, 0]],
  skull: [['horse_skull', 0, 0, 0]],
  neck: [['horse_neck', 0, 0, 0]],
};

// The great spine: the horse's own vertebrae and ribs, which are separate pieces in the scan, strung along a coil.
// nautilus: a logarithmic spiral, growing by `growth` each turn, the body always the same share of how far out it is, as a shell is.
// serpent: long loose bends over the land instead.
const COIL = { outer: 78, inner: 7, growth: 2.9, bodyShare: 0.78, thick: 42, ribs: 0.62, splay: 1.0, head: 30, faceYaw: 0, serpentLength: 330, serpentBends: 4.2, serpentWidth: 62 };

export const BONES_MOST = 2; // the largest size

const COIL_SHAPE = null;

// the separate pieces of a mesh, each its own geometry, by which triangles touch (seams count as touching)
function splitIslands(geo) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const idx = geo.index.array;
  const n = pos.count;
  const seen = new Map();
  const same = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
    if (!seen.has(k)) seen.set(k, i);
    same[i] = seen.get(k);
  }
  const up = new Int32Array(n).map((_, i) => i);
  const root = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
  for (let t = 0; t < idx.length; t += 3) {
    const a = root(same[idx[t]]);
    up[a] = root(same[idx[t + 1]]);
    up[root(same[idx[t + 1]])] = root(same[idx[t + 2]]);
  }
  const tris = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const r = root(same[idx[t]]);
    if (!tris.has(r)) tris.set(r, []);
    tris.get(r).push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const out = [];
  for (const list of tris.values()) {
    const map = new Map();
    const p = [];
    const m = [];
    const ix = [];
    for (const v of list) {
      if (!map.has(v)) {
        map.set(v, p.length / 3);
        p.push(pos.getX(v), pos.getY(v), pos.getZ(v));
        m.push(nor.getX(v), nor.getY(v), nor.getZ(v));
      }
      ix.push(map.get(v));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(m, 3));
    g.setIndex(ix);
    g.computeBoundingBox();
    out.push(g);
  }
  return out;
}

// moves a piece so its origin is the mean of its vertices in part of its height (from 0 at the bottom to 1 at the top)
function originAt(g, from, to) {
  const b = g.boundingBox;
  const lo = b.min.y + (b.max.y - b.min.y) * from;
  const hi = b.min.y + (b.max.y - b.min.y) * to;
  const pos = g.attributes.position;
  const c = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < lo || y > hi) continue;
    c.x += pos.getX(i);
    c.y += y;
    c.z += pos.getZ(i);
    k++;
  }
  c.divideScalar(Math.max(k, 1));
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingBox();
}

// The ribcage without what lies below the ribs' ends: each cartilage and the breastbone is its own piece in the scan, all of them below y = 0
// on the upright model, while every rib and vertebra reaches higher than that.
function openRibcage(torso) {
  const g = mergeGeometries(splitIslands(torso).filter((p) => p.boundingBox.max.y > 0.05));
  bakeOpenness(g);
  return g;
}

function spinePieces(torso) {
  const verts = [];
  const left = [];
  const right = [];
  for (const g of splitIslands(torso)) {
    const b = g.boundingBox;
    const sx = b.max.x - b.min.x;
    const sy = b.max.y - b.min.y;
    const cx = (b.max.x + b.min.x) / 2;
    const cz = (b.max.z + b.min.z) / 2;
    const n = g.attributes.position.count;
    if (n > 500 && Math.abs(cx) < 0.01 && sx > 0.08 && sx < 0.32 && b.min.y > 0) {
      g.userData.z = cz;
      verts.push(g);
    } else if (n > 150 && n < 500 && Math.abs(cx) > 0.08 && sy > 0.25) {
      g.userData.z = cz;
      (cx > 0 ? right : left).push(g);
    }
  }
  const byZ = (a, b) => b.userData.z - a.userData.z; // from the front
  verts.sort(byZ);
  left.sort(byZ);
  right.sort(byZ);
  for (const g of verts) { originAt(g, 0, 0.3); bakeOpenness(g); }
  for (const g of [...left, ...right]) { originAt(g, 0.88, 1); bakeOpenness(g); }
  return { verts, left, right };
}

// Lays the spine out: from the head at the outside of the coil in to the tail at its middle. Returns the one merged mesh's geometry,
// where the grass should lie down and the reeds keep away, and how the head lies.
function layCoil(site, pieces, rnd, shape) {
  const K = tuning.bones.scale;
  const inner = COIL.inner * K;
  const outer = COIL.outer * K;
  const thick = COIL.thick * K;
  const { ribs, splay } = COIL;
  // the curve, as closely spaced points from head to tail, each with the thickness of the body there
  const curve = [];
  const N = 6000;
  const phase = rnd() * 6.283;
  if (shape === 'serpent') {
    for (let i = 0; i <= N; i++) {
      const t = i / N; // 0 at the head
      const a = (t - 0.5) * 2;
      // the bends widen and narrow, so it doesn't read as a sine wave
      const w = COIL.serpentWidth * K * (0.72 + 0.28 * Math.sin(t * 7.3 + 0.8)) * (1 - 0.35 * t);
      const side = w * Math.sin(t * COIL.serpentBends * 6.283 + 0.6 * Math.sin(t * 5.1) + phase);
      const p = new THREE.Vector3(site.x + a * COIL.serpentLength * K * 0.5, 0, site.z + side + 26 * K * Math.sin(t * 2.4 + 1.0));
      p.body = thick * 0.82 * (0.14 + 0.86 * Math.pow(1 - t, 0.75));
      curve.push(p);
    }
  } else {
    const b = Math.log(COIL.growth) / 6.283;
    const whole = Math.log(outer / inner) / b;
    for (let i = 0; i <= N; i++) {
      const phi = (i / N) * whole; // 0 at the head, on the outside
      const r = outer * Math.exp(-b * phi);
      const th = phase + phi;
      const p = new THREE.Vector3(site.x + Math.cos(th) * r, 0, site.z + Math.sin(th) * r);
      p.body = Math.min(thick, r * COIL.bodyShare);
      curve.push(p);
    }
  }
  let total = 0;
  const along = [0];
  for (let i = 1; i <= N; i++) { total += curve[i].distanceTo(curve[i - 1]); along.push(total); }
  const pointAt = (d) => {
    let lo = 0;
    let hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (along[m] < d) lo = m; else hi = m; }
    return curve[lo];
  };
  const ground = (p) => {
    let sum = 0;
    for (let k = 0; k < 5; k++) sum += Math.max(heightAt(p.x + Math.cos(k * 1.26) * 3, p.z + Math.sin(k * 1.26) * 3), -0.3);
    return sum / 5;
  };
  const thickAt = (d, s) => pointAt(d).body * Math.min(1, 0.72 + s * 3.2);

  const parts = []; // { g, M }
  const spots = [];
  const flat = [];
  const M = new THREE.Matrix4();
  const X = new THREE.Vector3();
  const Y = new THREE.Vector3();
  const Z = new THREE.Vector3();
  const Y0 = new THREE.Vector3(0, 1, 0);
  const nV = pieces.verts.length;
  let head = null;
  let k = 0;
  for (let d = 0; d < total - 1;) {
    const s = d / total;
    const S = thickAt(d, s);
    const p = pointAt(d);
    const reach = Math.max(0.5, S * 0.05);
    const q = pointAt(Math.min(total, d + reach));
    const was = pointAt(Math.max(0, d - reach));
    // Worn by time: here and there a few vertebrae are gone
    if (d > 30 && rnd() < 0.012) {
      d += 0.043 * S * (2 + Math.floor(rnd() * 5));
      continue;
    }
    // sunk almost out of sight in long stretches, and clear of the ground in others
    const showing = 0.5 + 0.5 * Math.sin(d * 0.031 + phase) * Math.sin(d * 0.0097 + 1.3);
    const lift = (showing - 0.5) * 0.1 * S + 0.012 * S;
    const y = ground(p) + lift;
    Z.set(was.x - q.x, (ground(was) - ground(q)) * 0.6, was.z - q.z).normalize(); // towards the head
    const roll = Math.sin(d * 0.043 + 2.0) * 0.14 + (rnd() - 0.5) * 0.14;
    Y.copy(Y0).applyAxisAngle(Z, roll);
    X.crossVectors(Y, Z).normalize();
    Y.crossVectors(Z, X);
    const tilt = (rnd() - 0.5) * 0.16;
    // the tall spines come first, behind the head, then the long low back
    const pick = Math.max(0, Math.min(nV - 1, Math.round(Math.min(1, s * 1.5) * (nV - 1) + (rnd() - 0.5) * 3)));
    const g = pieces.verts[pick];
    M.makeBasis(X, Y, Z).multiply(new THREE.Matrix4().makeRotationX(tilt));
    const R = M.clone();
    const own = S * (0.94 + rnd() * 0.12);
    M.scale(new THREE.Vector3(own, own, own)).setPosition(p.x, y, p.z);
    parts.push({ g, M: M.clone(), R });
    if (!head) head = { x: p.x, z: p.z, dir: new THREE.Vector3(Z.x, 0, Z.z).normalize(), S };
    // ribs, thinning out and shrinking towards the tail, some gone
    if (S > 7) {
      const rs = S * ribs * (1 - s * 0.55);
      for (const [list, side] of [[pieces.left, -1], [pieces.right, 1]]) {
        if (rnd() < 0.1 + s * 0.45) continue;
        const rib = list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
        const open = splay + (rnd() - 0.5) * 0.28;
        const RR = new THREE.Matrix4().makeBasis(X, Y, Z).multiply(new THREE.Matrix4().makeRotationZ(side * open));
        const at = new THREE.Vector3(p.x, y, p.z).addScaledVector(X, side * 0.03 * S).addScaledVector(Y, 0.012 * S);
        parts.push({ g: rib, M: RR.clone().scale(new THREE.Vector3(rs, rs, rs)).setPosition(at), R: RR });
      }
    }
    if (k++ % 3 === 0) flat.push({ x: p.x, z: p.z, r: S * 0.26 + 2.5 });
    if (k % 5 === 0) spots.push({ x: p.x, z: p.z, r: S * 0.3 + 3 });
    d += 0.043 * S;
  }

  // one mesh
  let nv = 0;
  let ni = 0;
  for (const { g } of parts) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const open = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  const v = new THREE.Vector3();
  let vAt = 0;
  let iAt = 0;
  for (const { g, M: m, R } of parts) {
    const P = g.attributes.position;
    const Nn = g.attributes.normal;
    const A = g.attributes.aOpen;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      pos[(vAt + i) * 3] = v.x - site.x;
      pos[(vAt + i) * 3 + 1] = v.y;
      pos[(vAt + i) * 3 + 2] = v.z - site.z;
      v.fromBufferAttribute(Nn, i).transformDirection(R);
      nor[(vAt + i) * 3] = v.x;
      nor[(vAt + i) * 3 + 1] = v.y;
      nor[(vAt + i) * 3 + 2] = v.z;
      open[vAt + i] = A.getX(i);
    }
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i++) idx[iAt + i] = ix[i] + vAt;
    vAt += P.count;
    iAt += ix.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aOpen', new THREE.BufferAttribute(open, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return { geo, spots, flat, head, pieces: parts.length, length: total };
}

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// the three axes of a model's spread, longest first
function principalAxes(geo) {
  const p = geo.attributes.position;
  const n = p.count;
  const step = Math.max(1, Math.floor(n / 6000));
  let mx = 0, my = 0, mz = 0, c = 0;
  for (let i = 0; i < n; i += step) { mx += p.getX(i); my += p.getY(i); mz += p.getZ(i); c++; }
  mx /= c; my /= c; mz /= c;
  const m = [0, 0, 0, 0, 0, 0]; // xx xy xz yy yz zz
  for (let i = 0; i < n; i += step) {
    const x = p.getX(i) - mx, y = p.getY(i) - my, z = p.getZ(i) - mz;
    m[0] += x * x; m[1] += x * y; m[2] += x * z; m[3] += y * y; m[4] += y * z; m[5] += z * z;
  }
  const mul = (v) => new THREE.Vector3(m[0] * v.x + m[1] * v.y + m[2] * v.z, m[1] * v.x + m[3] * v.y + m[4] * v.z, m[2] * v.x + m[4] * v.y + m[5] * v.z);
  const power = (v, against) => {
    for (let k = 0; k < 40; k++) {
      v = mul(v);
      for (const a of against) v.addScaledVector(a, -v.dot(a));
      v.normalize();
    }
    return v;
  };
  const a = power(new THREE.Vector3(0.58, 0.6, 0.55), []);
  const b = power(new THREE.Vector3(0.3, -0.7, 0.65), [a]);
  return [a, b, new THREE.Vector3().crossVectors(a, b).normalize()];
}

// each vertex moves towards the average of its neighbours: `attr` is the position or the normal attribute
function relax(attr, idx, iterations, amount) {
  const n = attr.count;
  const cur = attr.array;
  const sum = new Float32Array(n * 3);
  const cnt = new Uint32Array(n);
  for (let it = 0; it < iterations; it++) {
    sum.fill(0);
    cnt.fill(0);
    const add = (a, b) => {
      sum[a * 3] += cur[b * 3]; sum[a * 3 + 1] += cur[b * 3 + 1]; sum[a * 3 + 2] += cur[b * 3 + 2];
      cnt[a]++;
    };
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      add(a, b); add(a, c); add(b, a); add(b, c); add(c, a); add(c, b);
    }
    for (let v = 0; v < n; v++) {
      if (!cnt[v]) continue;
      for (let k = 0; k < 3; k++) cur[v * 3 + k] += (sum[v * 3 + k] / cnt[v] - cur[v * 3 + k]) * amount;
    }
  }
  attr.needsUpdate = true;
}

// the scans' pits and grain go; the shape stays. Dense scans get more passes, since each only reaches one vertex further.
function smoothSurface(geo) {
  const pos = geo.attributes.position;
  if (geo.index) {
    const idx = geo.index.array;
    const passes = Math.round(Math.sqrt(pos.count) / 26);
    if (passes >= 3) {
      relax(pos, idx, Math.min(passes, 9), 0.5);
      geo.computeVertexNormals();
    }
    relax(geo.attributes.normal, idx, Math.max(2, Math.min(passes * 2, 16)), 0.8);
    const nor = geo.attributes.normal;
    for (let i = 0; i < nor.count; i++) {
      const l = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)) || 1;
      nor.setXYZ(i, nor.getX(i) / l, nor.getY(i) / l, nor.getZ(i) / l);
    }
  }
}

// How open each point of the surface is to the light around it, 0..1, kept on the vertices: the inside of a ribcage is dark, the top of
// a skull isn't. This is the big shape only (a coarse grid, rays a fifth of the bone long); the scan's small pits stay smoothed away.
function bakeOpenness(geo) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  geo.computeBoundingBox();
  const lo = geo.boundingBox.min;
  const size = geo.boundingBox.getSize(new THREE.Vector3());
  const cell = Math.max(size.x, size.y, size.z) / 64;
  const pad = 2;
  const nx = Math.ceil(size.x / cell) + pad * 2 + 1;
  const ny = Math.ceil(size.y / cell) + pad * 2 + 1;
  const nz = Math.ceil(size.z / cell) + pad * 2 + 1;
  const grid = new Uint8Array(nx * ny * nz);
  const px = pos.array;
  const stride = pos.itemSize;
  const voxel = (x, y, z) => {
    const i = Math.floor((x - lo.x) / cell) + pad;
    const j = Math.floor((y - lo.y) / cell) + pad;
    const k = Math.floor((z - lo.z) / cell) + pad;
    return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : i + j * nx + k * nx * ny;
  };
  const idx = geo.index ? geo.index.array : null;
  const tris = idx ? idx.length : pos.count;
  for (let t = 0; t < tris; t += 3) {
    const a = (idx ? idx[t] : t) * stride;
    const b = (idx ? idx[t + 1] : t + 1) * stride;
    const c = (idx ? idx[t + 2] : t + 2) * stride;
    const len = Math.max(Math.hypot(px[a] - px[b], px[a + 1] - px[b + 1], px[a + 2] - px[b + 2]), Math.hypot(px[a] - px[c], px[a + 1] - px[c + 1], px[a + 2] - px[c + 2]), Math.hypot(px[b] - px[c], px[b + 1] - px[c + 1], px[b + 2] - px[c + 2]));
    const m = Math.max(1, Math.ceil(len / (cell * 0.7)));
    for (let u = 0; u <= m; u++) {
      for (let v = 0; v <= m - u; v++) {
        const s = u / m;
        const r = v / m;
        const q = 1 - s - r;
        const g = voxel(px[a] * q + px[b] * s + px[c] * r, px[a + 1] * q + px[b + 1] * s + px[c + 1] * r, px[a + 2] * q + px[b + 2] * s + px[c + 2] * r);
        if (g >= 0) grid[g] = 1;
      }
    }
  }
  const dirs = [];
  for (let i = 0; i < 24; i++) {
    const y = 1 - (2 * (i + 0.5)) / 24;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.39996;
    dirs.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  const REACH = 13; // cells
  const open = new Float32Array(pos.count);
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v);
    const y = pos.getY(v);
    const z = pos.getZ(v);
    const ax = nor.getX(v);
    const ay = nor.getY(v);
    const az = nor.getZ(v);
    let sum = 0;
    let got = 0;
    for (const d of dirs) {
      const c = d[0] * ax + d[1] * ay + d[2] * az;
      if (c < 0.3) continue;
      sum += c;
      // from just off the surface
      const ox = x + ax * cell * 1.5;
      const oy = y + ay * cell * 1.5;
      const oz = z + az * cell * 1.5;
      let free = 1;
      for (let t = 1; t <= REACH; t += 1.5) {
        const g = voxel(ox + d[0] * t * cell, oy + d[1] * t * cell, oz + d[2] * t * cell);
        if (g >= 0 && grid[g]) { free = (t - 1) / REACH; break; }
      }
      got += c * free;
    }
    open[v] = sum > 0 ? got / sum : 1;
  }
  // soften along the surface, so it's a shading and not a pattern of the grid
  if (idx) {
    const sum = new Float32Array(pos.count);
    const cnt = new Uint32Array(pos.count);
    for (let it = 0; it < 10; it++) { // a coarse mesh needs many: one low vertex alone shows as a dark diamond around it
      sum.fill(0);
      cnt.fill(0);
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i], b = idx[i + 1], c = idx[i + 2];
        sum[a] += open[b] + open[c]; sum[b] += open[a] + open[c]; sum[c] += open[a] + open[b];
        cnt[a] += 2; cnt[b] += 2; cnt[c] += 2;
      }
      for (let v = 0; v < pos.count; v++) if (cnt[v]) open[v] += (sum[v] / cnt[v] - open[v]) * 0.7;
    }
  }
  geo.setAttribute('aOpen', new THREE.BufferAttribute(open, 1));
}

export async function createBones({ scene, renderer, baked, start }) {
  const loader = new GLTFLoader();
  const names = Object.keys(PARTS).filter((n) => !PARTS[n].made);
  const geos = {};
  const axes = {};
  await Promise.all(names.map(async (n) => {
    const r = await fetch(`assets/models/${n}.glb`, { method: 'HEAD' }).catch(() => null);
    if (!r?.ok) return; // not processed yet
    const g = await loader.loadAsync(`assets/models/${n}.glb`);
    let mesh = null;
    g.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    g.scene.updateMatrixWorld(true);
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    smoothSurface(geo);
    bakeOpenness(geo);
    if (PARTS[n].lay) axes[n] = principalAxes(geo);
    geos[n] = geo;
  }));

  if (geos.horse_torso) geos.horse_ribcage = openRibcage(geos.horse_torso);

  const uniforms = {
    ...U,
    uBoneCastFade: { value: 0 },
    uBoneLit: { value: new THREE.Color() },
    uBoneShade: { value: new THREE.Color() },
    uClipY: { value: -1000 },
    uBoneDepth: { value: 0.6 },
    uBoneForm: { value: new THREE.Vector3() },
    uBoneBand: { value: new THREE.Color() },
    uBoneBounce: { value: new THREE.Color() },
    uBoneGrass: { value: new THREE.Color() },
    uBoneFoot: { value: new THREE.Vector2() },
    uBoneSheen: { value: new THREE.Color() },
    uBoneSpec: { value: 1 },
    uBoneEdge: { value: new THREE.Vector3() },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, side: THREE.DoubleSide });
  const outlineMaterial = new THREE.ShaderMaterial({
    vertexShader: outlineVert,
    fragmentShader: outlineFrag,
    side: THREE.BackSide,
    uniforms: { uOutlineW: { value: 1 }, uOutlineCol: { value: new THREE.Color() } },
  });
  const group = new THREE.Group();
  scene.add(group);
  const placed = [];
  const outlines = [];
  const spots = []; // where the reeds keep away from: x, z, r

  function place(part, x, z, yawDeg, r, over) {
    const P = PARTS[part];
    const geo = geos[part];
    if (!P || !geo) return;
    const size = over?.size ?? P.size * tuning.bones.scale * (0.85 + r() * 0.3);
    const m = new THREE.Mesh(geo, material);
    const restQ = new THREE.Quaternion();
    if (P.lay === 'long') {
      restQ.setFromUnitVectors(axes[part][0], new THREE.Vector3(1, 0, 0));
      restQ.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), r() * Math.PI * 2));
    } else if (P.lay === 'flat') {
      restQ.setFromUnitVectors(axes[part][2], new THREE.Vector3(0, r() < 0.5 ? 1 : -1, 0));
    } else {
      restQ.setFromEuler(new THREE.Euler(...P.rest.map(THREE.MathUtils.degToRad), 'YXZ'));
    }
    const deg = THREE.MathUtils.degToRad;
    const tilt = new THREE.Euler(deg((r() - 0.5) * 2 * P.tilt), deg(yawDeg), deg((r() - 0.5) * 2 * P.tilt), 'YXZ');
    m.quaternion.setFromEuler(tilt).multiply(restQ);
    m.scale.setScalar(size);
    m.updateMatrix();
    // how far it really reaches once turned (a turned box would overstate it)
    const pos = geo.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 4000));
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += step) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrix));
    const h = box.max.y - box.min.y;
    const ground = Math.min(heightAt(x, z), heightAt(x + box.max.x * 0.5, z), heightAt(x + box.min.x * 0.5, z), heightAt(x, z + box.max.z * 0.5), heightAt(x, z + box.min.z * 0.5));
    const y = Math.max(ground, -0.75) - box.min.y - h * P.sink;
    m.position.set(x, y, z);
    m.userData = { x, z };
    group.add(m);
    placed.push(m);
    spots.push({ x, z, r: size * 0.42 + 2 });
    // the 三渲二 line is the same mesh again, with the outline material, kept on it
    const line = new THREE.Mesh(geo, outlineMaterial);
    line.visible = false;
    m.add(line);
    outlines.push(line);
    // lay the grass down under and around it
    const rx = Math.max(box.max.x, -box.min.x) + 1.5;
    const rz = Math.max(box.max.z, -box.min.z) + 1.5;
    const R = Math.max(rx, rz) * 1.25;
    baked.flatten(x, z, R, (dx, dz) => {
      const d = Math.hypot(dx / rx, dz / rz);
      return 1 - THREE.MathUtils.smoothstep(d, 0.55, 1.15);
    });
  }

  function placeGroup(name, cx, cz, yawDeg, r) {
    const c = Math.cos(THREE.MathUtils.degToRad(yawDeg));
    const s = Math.sin(THREE.MathUtils.degToRad(yawDeg));
    for (const [part, lx, lz, partYaw] of GROUPS[name]) {
      place(part, cx + (lx * c + lz * s) * K, cz + (-lx * s + lz * c) * K, yawDeg + partYaw, r);
    }
  }

  // the field: one stag right ahead of you, the others around a centre further on, close together
  const r = rng(90217);
  const sx = Math.sin(start.yaw);
  const sz = Math.cos(start.yaw);
  const px = -sz;
  const pz = sx;
  const K = tuning.bones.scale; // everything grows together, the spaces between too, so they don't crowd each other
  const FIELD = 150 * K; // m, radius of the field
  const SPACING = 46 * K; // m between groups
  const cx = start.x + sx * 120 * K;
  const cz = start.z + sz * 120 * K;
  const sites = [];
  const firstAt = (dist, side) => {
    for (let k = 0; k < 40; k++) {
      const x = start.x + sx * (dist + k * 4) + px * side;
      const z = start.z + sz * (dist + k * 4) + pz * side;
      if (heightAt(x, z) > DRY + 0.1) return [x, z];
    }
    return [start.x + sx * dist + px * side, start.z + sz * dist + pz * side];
  };
  // the dragon first: everything else keeps clear of it
  let coil = null;
  if (DRAGON && geos.horse_torso) {
    coil = layCoil(DRAGON, spinePieces(geos.horse_torso), rng(5501), COIL_SHAPE || tuning.bones.coil);
    const m = new THREE.Mesh(coil.geo, material);
    m.position.set(DRAGON.x, 0, DRAGON.z);
    m.userData = { x: DRAGON.x, z: DRAGON.z };
    group.add(m);
    placed.push(m);
    const line = new THREE.Mesh(coil.geo, outlineMaterial);
    line.visible = false;
    m.add(line);
    outlines.push(line);
    spots.push(...coil.spots);
    for (const f of coil.flat) baked.flatten(f.x, f.z, f.r, (dx, dz) => 1 - THREE.MathUtils.smoothstep(Math.hypot(dx, dz) / f.r, 0.5, 1));
    // the head: a deer's skull, antlers and all (the old saying gives a dragon a stag's horns)
    const h = coil.head;
    const yaw = THREE.MathUtils.radToDeg(Math.atan2(h.dir.x, h.dir.z)) + COIL.faceYaw;
    place('deer_sika', h.x + h.dir.x * COIL.head * K * 0.42, h.z + h.dir.z * COIL.head * K * 0.42, yaw, r, { size: COIL.head * K });
  }
  const a = firstAt(44 * K, 18 * K);
  placeGroup('stag', a[0], a[1], 40, r);
  sites.push(a);
  for (const name of ['carcass', 'stag2', 'bull', 'ribs', 'skull', 'neck', 'stag', 'bull', 'skull']) {
    for (let tries = 0; tries < 800; tries++) {
      const ang = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * FIELD;
      const x = cx + Math.cos(ang) * rad;
      const z = cz + Math.sin(ang) * rad;
      const h = heightAt(x, z);
      if (h < DRY) continue;
      if (Math.hypot(x - start.x, z - start.z) < 34 * K) continue;
      if (coil && coil.spots.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 16)) continue;
      let low = h;
      let high = h;
      for (let k = 0; k < 8; k++) {
        const g = heightAt(x + Math.cos(k * 0.785) * 18 * K, z + Math.sin(k * 0.785) * 18 * K);
        low = Math.min(low, g);
        high = Math.max(high, g);
      }
      if (high - low > BONE_RISE * K) continue;
      if (!sites.every(([ax, az]) => Math.hypot(ax - x, az - z) > (tries < 400 ? SPACING : SPACING * 0.7))) continue;
      placeGroup(name, x, z, r() * 360, r);
      sites.push([x, z]);
      break;
    }
  }

  // the sun's view of the bones around the camera: one map for the whole 200 m, and a sharper one for the bones you can come right up to.
  // A texel of the wide one is 10 cm, and where sun only grazes a bone that's stretched many times over, into steps you can see.
  const RES = 2048;
  const depthMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false });
  function shadowMap(half, every, texU, vpU) {
    const target = new THREE.WebGLRenderTarget(RES, RES, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      depthTexture: new THREE.DepthTexture(RES, RES, THREE.FloatType),
    });
    texU.value = target.depthTexture;
    return { half, every, target, vpU, cam: new THREE.OrthographicCamera(-half, half, half, -half, 1, 700), last: new THREE.Vector2(1e9, 1e9) };
  }
  const maps = [
    shadowMap(100, 16, U.uShadowTex, U.uShadowVP),
    shadowMap(24, 4, U.uShadowNearTex, U.uShadowNearVP),
  ];
  let dirty = true;
  let lineShown = false;
  const showLines = (on) => { for (const l of outlines) l.visible = on; };
  const centre = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();

  function renderShadow(map, x, z) {
    const { cam, half, target, vpU } = map;
    const y = Math.max(heightAt(x, z), 0);
    centre.set(x, y, z);
    const place = () => {
      cam.position.set(centre.x + U.uSun.value.x * 300, centre.y + U.uSun.value.y * 300, centre.z + U.uSun.value.z * 300);
      cam.up.set(0, 1, 0);
      cam.lookAt(centre);
      cam.updateMatrixWorld();
    };
    place();
    // moved by whole texels as the sun sees them, so a shadow's edge doesn't shift each time the map follows you
    const texel = (2 * half) / RES;
    right.setFromMatrixColumn(cam.matrixWorld, 0);
    up.setFromMatrixColumn(cam.matrixWorld, 1);
    const a = centre.dot(right);
    const b = centre.dot(up);
    centre.addScaledVector(right, Math.round(a / texel) * texel - a).addScaledVector(up, Math.round(b / texel) * texel - b);
    place();
    cam.updateProjectionMatrix();
    vpU.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const was = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(was);
  }

  return {
    apply() {
      const b = tuning.bones;
      const t = tuning.toon;
      uniforms.uBoneLit.value.set(b.lit);
      uniforms.uBoneShade.value.set(b.shade);
      uniforms.uBoneDepth.value = b.depth;
      uniforms.uBoneForm.value.set(b.form, b.occlusion, b.bounce);
      uniforms.uBoneBand.value.set(b.bandColor);
      uniforms.uBoneBounce.value.set(b.bounceColor);
      uniforms.uBoneGrass.value.set(b.bounceGrass);
      uniforms.uBoneFoot.value.set(b.bounceMix, 1.8 * b.scale);
      uniforms.uBoneSheen.value.set(b.sheenColor);
      uniforms.uBoneSpec.value = b.sheenAmt;
      uniforms.uBoneEdge.value.set(b.darkShare, b.bandAmt, b.castShadow);
      uniforms.uBoneCastFade.value = b.castFade;
      outlineMaterial.uniforms.uOutlineW.value = t.outline;
      outlineMaterial.uniforms.uOutlineCol.value.set(t.outlineColor);
      lineShown = t.on && t.outline > 0;
      showLines(lineShown);
    },
    sunMoved() { dirty = true; },
    update(cam) {
      // each part at its copy nearest the camera
      for (const m of placed) {
        const { x, z } = m.userData;
        const nx = x + Math.round((cam.x - x) / PERIOD) * PERIOD;
        const nz = z + Math.round((cam.z - z) / PERIOD) * PERIOD;
        if (m.position.x !== nx || m.position.z !== nz) {
          m.position.x = nx;
          m.position.z = nz;
          dirty = true;
        }
      }
      const due = maps.filter((m) => dirty || Math.round(cam.x / m.every) * m.every !== m.last.x || Math.round(cam.z / m.every) * m.every !== m.last.y);
      dirty = false;
      if (!due.length) return;
      showLines(false);
      const hidden = [];
      scene.children.forEach((c) => { if (c !== group && c.visible) { hidden.push(c); c.visible = false; } });
      scene.overrideMaterial = depthMat;
      for (const m of due) {
        m.last.set(Math.round(cam.x / m.every) * m.every, Math.round(cam.z / m.every) * m.every);
        renderShadow(m, m.last.x, m.last.y);
      }
      scene.overrideMaterial = null;
      hidden.forEach((c) => { c.visible = true; });
      showLines(lineShown);
      U.uShadowOn.value = 1;
    },
    forMirror(on) {
      uniforms.uClipY.value = on ? -0.02 : -1000;
      showLines(!on && lineShown);
    },
    placed,
    spots,
    coil: coil && { pieces: coil.pieces, length: coil.length, verts: coil.geo.attributes.position.count, head: coil.head },
    count: placed.length,
  };
}
