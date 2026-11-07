import * as THREE from 'three';
import { U, COMMON } from './common.js';
import { tuning } from './tuning.js';
import { heightAt, PERIOD, fbm } from './terrain.js';
import { plantShadowMaterial } from './plantShadow.js';

// 荻: tall grass by the water, in clumps along part of the shore, with silver plumes. Two layers of the same stems: near ones have
// leaves and a fan of racemes, and are picked out on the CPU as the camera moves; every stem also exists as a simple far form.
// Each stem is on one layer or the other, by a distance that differs from stem to stem, so there is no seam.
// They bend in the same spring field as the grass (wind.js), with their own stiffness.
// Nothing here is pushed sideways: stems, leaves and strands are rods that curve and keep their length, or wind reads as stretching.

// The shader for a stemmed plant. All of a plant but its flowers (part 2) is the same; `flowers` is the colour code for those, `head` what it needs declared.
// (flowers.js has the other plant)
export const plantVert = (head, flowers) => /* glsl */ `
${COMMON}
attribute vec4 aStem; // x, z, ground height, height
attribute vec4 aRand; // yaw, r1, r2, clump's own
attribute vec4 aRib;  // where on the stem it leaves, its length, -, its own phase
attribute vec3 aDir, aEnd; // the way it leaves and the way its end hangs at rest; 0 = it runs along the stem
attribute float aSide, aW, aPart, aS;
uniform float uIsNear, uKeep, uTall, uBend, uFlutterR, uClipY, uDroop, uStreamR, uShadeMix, uTuftR, uTwinkleR, uCull;
uniform vec3 uViewDir;
uniform vec3 uLeaf, uLeaf2, uStalk;
uniform float uFineWide, uNoSheen, uShadowWide;
${head}
varying vec3 vCol;
varying float vY;

vec3 yawed(vec3 v, float c, float s) { return vec3(c * v.x - s * v.z, v.y, s * v.x + c * v.z); }

void main() {
  vec2 b = aStem.xy;
  b += floor((uCam.xz - b) / uPeriod + 0.5) * uPeriod;
  vec2 local = b - uCam.xz;
  float dist = length(local);
  float r1 = aRand.y, r2 = aRand.z;
  float edge = 48.0 + 22.0 * r2;
  float far = smoothstep(130.0, 560.0, dist);
  // far off fewer stems are drawn, wider, so a clump keeps its body without shimmering
  float keep = uKeep * mix(1.0, 0.38, far);
  bool gone = r1 > keep || (uIsNear > 0.5 ? dist >= edge : dist < edge);
  // stems outside the view (with a margin for those leaning in) are skipped before any work is done on them
  bool behind = dist > 14.0 && dot(local / dist, normalize(uViewDir.xz)) < uCull - min(2.0, abs(uViewDir.y) * 2.6);
#ifdef SHADOW
  // (what's behind you can throw a shadow in front of you. plantShadow.js says how far to go)
  gone = r1 > uKeep;
  behind = dist > 74.0;
#endif
  if (gone || behind || dist > 780.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec3(0.0); vY = 1.0; return; }
  // thin things are widened with distance, or they'd fall between the pixels: the plumes' fine strands most of all
  float wide = uIsNear > 0.5 ? 1.0 + dist * (aPart > 1.5 ? uFineWide : 0.012) : (1.0 + dist * 0.009) / sqrt(mix(1.0, 0.38, far));

  float h = aStem.w * uTall;
  float c = cos(aRand.x), s = sin(aRand.x);

  // the wind as the grass beside it feels it: the same tufts, each stem feeling it at a slightly different place, so a gust
  // goes through a clump and the grass around it together
  vec4 tuft = texture2D(uNoiseTex, b / 31.0);
  vec4 raw = windRaw(b + (vec2(r1, r2) - 0.5) * 3.0 + (tuft.rg - 0.5) * 7.0 * uTuftR);
  raw.xy *= 0.65 + 0.7 * tuft.b;
  float stir = length(raw.zw);
  // stiffer than the grass: it takes the same push and leans less. Each stem has its own stiffness, and leans a little its own way at rest
  vec2 perp = vec2(-uWindDir.y, uWindDir.x);
  float shiver = sin(uTime * (2.1 + r2 * 1.5) + r1 * 37.0 + dot(b, uWindDir) * 0.25);
  vec2 push = uWindDir * (0.05 + aRand.w * 0.05) + vec2(c, s) * (0.02 + 0.05 * r2) * (0.4 + uDroop * 1.2)
    + (raw.xy * uBend + perp * shiver * uFlutterR * (0.25 + stir)) * (0.8 + 0.4 * r1);
  // walking through, the stems give way
  float pa = 1.0 - smoothstep(0.3, 1.5, dist);
  if (dist > 0.01) push += local / dist * pa * 0.5;

  // the stem: stiff low down, curving most near the top, its angle going as (along the stem)^2. x, y are that curve, length kept
  float pushLen = length(push);
  vec2 lean = pushLen > 0.0001 ? push / pushLen : vec2(1.0, 0.0);
  float bendA = 1.4 * (1.0 - exp(-pushLen * 2.15)); // the further over, the harder to push further
  vec3 axis = vec3(lean.y, 0.0, -lean.x);

  bool runsAlong = dot(aDir, aDir) < 0.5;
  float root = runsAlong ? aRib.x + aRib.y * aS : aRib.x;
  float rs2 = root * root;
  float A2 = bendA * bendA;
  float cx = root * rs2 * bendA * (1.0 / 3.0 - rs2 * rs2 * A2 * (1.0 / 42.0 - rs2 * rs2 * A2 / 1320.0));
  float cy = root * (1.0 - rs2 * rs2 * A2 * (0.1 - rs2 * rs2 * A2 / 216.0));
  vec3 cp = vec3(lean.x * cx, cy, lean.y * cx);
  float at = bendA * rs2; // how far the stem is over at that point
  float cosAt = cos(at), sinAt = sin(at);
  vec3 T;

  if (runsAlong) {
    T = vec3(lean.x * sinAt, cosAt, lean.y * sinAt);
  } else {
    // a leaf or a strand: a rod leaving the stem as the stem now points, and curving towards where its weight and the wind take its end
    vec3 d0 = yawed(aDir, c, s);
    d0 = d0 * cosAt + cross(axis, d0) * sinAt + axis * dot(axis, d0) * (1.0 - cosAt);
    vec3 rest = normalize(mix(d0, yawed(aEnd, c, s), aPart > 1.5 ? uDroop : 1.0));
    float flick = sin(uTime * (2.4 + r2 * 1.6 + aRib.w * 1.8) + aRib.w * 41.0 + r1 * 37.0 + dot(b, uWindDir) * 0.25);
    // it takes the wind, and being light it lags behind the stem's own swing: as the stem speeds up the strands trail it
    vec2 wind2 = aPart > 1.5
      ? uWindDir * 0.22 + (raw.xy - raw.zw * 0.14) * uStreamR + perp * flick * uFlutterR * (4.0 + stir * 18.0)
      : uWindDir * 0.08 + (raw.xy - raw.zw * 0.08) * uStreamR * 0.5 + perp * flick * uFlutterR * (3.0 + stir * 10.0);
    vec3 e = normalize(rest + vec3(wind2.x, 0.0, wind2.y));
    float along = dot(d0, e);
    float ang = acos(clamp(along, -1.0, 1.0));
    vec3 toE = e - d0 * along;
    float toL = length(toE);
    toE = toL > 0.0001 ? toE / toL : vec3(0.0);
    float a = ang * aS;
    float sinOverA = ang > 0.001 ? sin(a) / ang : aS;
    float coverA = ang > 0.001 ? (1.0 - cos(a)) / ang : 0.0;
    cp += (d0 * sinOverA + toE * coverA) * aRib.y;
    T = d0 * cos(a) + toE * sin(a);
  }

  vec3 wp = vec3(b.x + cp.x * h, aStem.z + cp.y * h, b.y + cp.z * h);
  float t = cp.y; // how high up the plant, for the dark among the stems

#ifdef SHADOW
  // (the sun's the one looking, and fine parts are made wide enough to land on a texel)
  vec3 V = uSun;
  wide = uShadowWide;
#else
  vec3 V = normalize(uCam - wp);
#endif
  vec3 side = cross(T, V);
  side = length(side) > 0.001 ? normalize(side) : vec3(1.0, 0.0, 0.0);
  // the normal the light works on. A stem is round, so the side towards you is what shows. A leaf is flat, and turned its own way,
  // rolling as it moves, as a blade of grass is; it stays turned partly towards you so it never quite goes edge-on.
  vec3 Nb = normalize(cross(side, T));
  if (aPart > 0.5 && aPart < 1.5 && uIsNear > 0.5) {
    vec2 dh = length(T.xz) > 0.01 ? normalize(T.xz) : vec2(1.0, 0.0);
    float roll = (r1 + aRib.w - 1.0) * 1.1 + sin(uTime * (5.5 + r2 * 5.0) + r1 * 60.0 + aRib.w * 9.0) * uTwinkleR * min(stir * 1.2 + 0.06, 1.0);
    vec3 own = normalize(vec3(-dh.y, roll, dh.x));
    Nb = normalize(cross(own, T));
    if (dot(own, side) < 0.0) own = -own;
    side = normalize(mix(side, own, 0.6));
  }
  wp += side * aSide * aW * h * wide;
#ifdef SHADOW
  vCol = vec3(0.0);
  vY = 1.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
#else
  vec3 N = normalize(cross(side, T));
  if (dot(N, V) < 0.0) N = -N;

  vec4 H = texture2D(uHeightTex, b / uPeriod);
  float boneVis = dist < 100.0 ? boneShadowAt(wp, 0.5) : 1.0;
  vec3 base, col;
  if (aPart > 1.5) {
    ${flowers}
  } else {
    // stems and leaves are lit by the same code as the grass, so sun, shadow, a gust's pale wash and the flash off a leaf all fall alike
    base = aPart > 0.5 ? mix(uLeaf, uLeaf2, clamp(r2 * 0.5 + aS * 0.6, 0.0, 1.0)) : uStalk;
    gOwn = 1.0;
    gOwnCol = base;
    gOwnShade = mix(base, uShade, uShadeMix);
    vec3 Nt = vec3(H.g, sqrt(max(1.0 - H.g * H.g - H.b * H.b, 0.0)), H.b);
    if (dot(Nb, V) < 0.0) Nb = -Nb;
    // too far to see one by one: the same average as far blades, or they'd be a different colour from the grass around them
    Nb = normalize(mix(Nb, normalize(vec3(-lean.x * 0.2, 1.0, -lean.y * 0.2)), smoothstep(6.0, 50.0, dist)));
    gNoSheen = uNoSheen;
    vec4 gu = vec4(clamp(dot(raw.xy, uWindDir), 0.0, 1.0), stir, raw.zw);
    float shine = mix(uBandLook.w, uGlossA.y, smoothstep(8.0, 170.0, dist));
    col = furColor(b, Nt, H.a * boneVis, uWindDir, gu, T, Nb, 0.5, V, r2 - 0.5, shine);
    if (uToon < 0.5) col *= 1.0 + (r2 - 0.5) * uMisc.x * 2.0;
  }
  // down among the stems the sun doesn't reach
  if (uToon > 0.5) col = mix(mix(col, uShade, uShadeMix * 0.6), col, step(0.16 + (r1 - 0.5) * 0.1, t));
  else col = mix(mix(col, uShade, uShadeMix * 0.64), col, smoothstep(0.02, 0.36, t));
  vCol = hazedAt(col, wp);
  vY = wp.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
#endif
}
`;
const vert = plantVert('uniform vec3 uPlume, uPlumeBase;', /* glsl */ `
    base = mix(uPlumeBase, uPlume, smoothstep(0.1, 0.65, aS));
    float vis = clamp(H.a, 0.0, 1.0) * cloudShade(b) * boneVis;
    float visBare = clamp(H.a, 0.0, 1.0) * boneVis;
    float nl = dot(N, uSun);
    float toward = max(dot(-normalize(V.xz + vec2(0.0001)), normalize(uSun.xz)), 0.0);
    if (uToon > 0.5) {
      // A cloud's shadow falls on them all alike, as a tone: broken up stem by stem, a pale one turned whole plumes dark at random.
      float lit = step(0.5, visBare + (r2 - 0.5) * uToonA.x * 0.05);
      vec3 inShade = mix(base, uShade, uShadeMix);
      col = mix(inShade, base, lit);
      col = mix(col, vec3(1.0), step(0.55, aS + (r1 - 0.5) * 0.5) * lit * 0.8);
      col = mix(col, inShade, step(uMisc.y * 0.5, 1.0 - cloudShade(b)) * uMisc.y);
    } else {
      // silky hairs scatter the sun: bright from every side, and brightest with the sun behind them
      float facing = clamp((nl + 0.7) / (max(uSun.y, 0.2) + 0.7), 0.6, 1.2);
      vec3 sunlit = base * (0.9 + 0.1 * facing) + vec3(1.0, 0.97, 0.9) * toward * toward * 0.3;
      // far off a plume is only partly plume: the leaves and the grass show through it, or from a hilltop the clumps read as snow
      sunlit = mix(sunlit, uLit, far * 0.4);
      col = mix(mix(base, uShade, uShadeMix * 0.8), sunlit, vis);
    }
`);
export const plantFrag = /* glsl */ `
precision highp float;
uniform float uClipY;
varying vec3 vCol;
varying float vY;
void main() {
  if (vY < uClipY) discard;
  gl_FragColor = vec4(vCol, 1.0);
}
`;

// every part is a ribbon, whose shape the shader works out from a few numbers: see vert
export const polar = (az, el) => [Math.cos(az) * Math.sin(el), Math.cos(el), Math.sin(az) * Math.sin(el)];
const ALONG = [0, 0, 0];

export class Ribbons {
  constructor() { this.pos = []; this.rib = []; this.dir = []; this.end = []; this.side = []; this.w = []; this.part = []; this.s = []; this.idx = []; }
  // root, len: where on the stem and how long (a part running along the stem: from where, and how far). width(q) with q 0..1 along it
  add({ part, root, len, dir = ALONG, end = ALONG, phase = 0, at, width }) {
    const first = this.pos.length / 3;
    at.forEach((q, i) => {
      for (const sd of [-1, 1]) {
        this.pos.push(0, q, 0);
        this.rib.push(root, len, 0, phase);
        this.dir.push(...dir);
        this.end.push(...end);
        this.side.push(sd);
        this.w.push(width(q, i));
        this.part.push(part);
        this.s.push(q);
      }
      if (i < at.length - 1) {
        const v = first + i * 2;
        this.idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    });
  }
  geometry(stems) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aRib', new THREE.Float32BufferAttribute(this.rib, 4));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(this.dir, 3));
    g.setAttribute('aEnd', new THREE.Float32BufferAttribute(this.end, 3));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(this.side, 1));
    g.setAttribute('aW', new THREE.Float32BufferAttribute(this.w, 1));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(this.s, 1));
    g.setIndex(this.idx);
    g.setAttribute('aStem', stems.stem);
    g.setAttribute('aRand', stems.rand);
    return g;
  }
}

function nearForm() {
  const r = new Ribbons();
  r.add({ part: 0, root: 0, len: 0.86, at: [0, 0.23, 0.46, 0.7, 0.84, 1], width: (q) => 0.0042 - 0.0016 * q });
  // long leaves, leaving the stem low down, rising and then hanging over
  [0.14, 0.24, 0.33, 0.42, 0.5, 0.58, 0.66].forEach((t0, i) => {
    const a = i * 2.4;
    r.add({
      part: 1,
      root: t0,
      len: 0.56 - 0.34 * (t0 - 0.14),
      dir: polar(a, 0.5),
      end: polar(a + 0.15, 2.2),
      phase: (i * 0.37) % 1,
      at: [0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.85, 1],
      width: (q) => 0.0062 * (1 - q ** 2.6) + 0.0005,
    });
  });
  // the plume: a fan of racemes off the stem's top, rising a little and arching over like a fountain, the outer ones hanging furthest;
  // each is a few fine silky strands. They're thin here; the shader widens them with distance, so from afar they add up to a plume.
  const RACEMES = 9;
  const STRANDS = 4;
  for (let k = 0; k < RACEMES; k++) {
    const out0 = 0.25 + 0.75 * ((k * 0.618) % 1);
    for (let j = 0; j < STRANDS; j++) {
      const a = k * 2.39996 + (j - (STRANDS - 1) / 2) * 0.17;
      const out = Math.min(1, out0 * (0.82 + 0.3 * ((j * 0.73 + k * 0.31) % 1)));
      r.add({
        part: 2,
        root: 0.8 + 0.06 * (k / RACEMES),
        len: (0.22 + 0.1 * ((k * 0.382) % 1)) * (0.8 + 0.3 * ((j * 0.57 + k * 0.13) % 1)),
        dir: polar(a, 0.2 + out * 0.75),
        end: polar(a, 1.9 + out * 1.1),
        phase: (k * 0.37 + j * 0.09) % 1,
        at: [0, 0.2, 0.4, 0.6, 0.8, 1],
        width: (q) => 0.0021 * (0.45 + Math.sin(Math.PI * Math.min(1, q * 0.92 + 0.08))),
      });
    }
  }
  return r;
}

// what stands for the near form in the reflection: half the resolution there, so much less of it, each piece wider
function mirrorForm() {
  const r = new Ribbons();
  r.add({ part: 0, root: 0, len: 0.86, at: [0, 0.5, 0.8, 1], width: () => 0.004 });
  [0.2, 0.36, 0.5, 0.64].forEach((t0, i) => {
    const a = i * 2.4;
    r.add({
      part: 1,
      root: t0,
      len: 0.54 - 0.34 * (t0 - 0.14),
      dir: polar(a, 0.5),
      end: polar(a + 0.15, 2.2),
      phase: (i * 0.37) % 1,
      at: [0, 0.3, 0.6, 1],
      width: (q) => 0.009 * (1 - q ** 2.6) + 0.001,
    });
  });
  for (let k = 0; k < 7; k++) {
    const a = k * 2.39996;
    const out = 0.25 + 0.75 * ((k * 0.618) % 1);
    r.add({
      part: 2,
      root: 0.8 + 0.06 * (k / 7),
      len: 0.22 + 0.1 * ((k * 0.382) % 1),
      dir: polar(a, 0.2 + out * 0.75),
      end: polar(a, 1.9 + out * 1.1),
      phase: (k * 0.37) % 1,
      at: [0, 0.35, 0.7, 1],
      width: (q) => 0.012 * (0.35 + Math.sin(Math.PI * Math.min(1, q * 0.92 + 0.08))),
    });
  }
  return r;
}

function farForm() {
  const r = new Ribbons();
  r.add({ part: 0, root: 0, len: 0.84, at: [0, 0.5, 1], width: () => 0.005 });
  r.add({ part: 1, root: 0.06, len: 0.68, at: [0, 0.35, 0.68, 1], width: (q, i) => [0.012, 0.038, 0.032, 0.006][i] });
  r.add({ part: 2, root: 0.8, len: 0.27, dir: polar(0, 0.3), end: polar(0, 2.4), at: [0, 0.33, 0.66, 1], width: (q, i) => [0.01, 0.03, 0.026, 0.005][i] });
  return r;
}

export const REEDS_MOST = 3; // the most, as a multiple of the first layout

// Where the stems stand, clump after clump: x, z, ground, height + yaw, r1, r2, clump's own. The first ones are the layout at amount 1;
// after them come more, those on the stretches of shore that have reeds first, so raising the amount spreads them from where they are.
function plant({ start, bones }) {
  let seed = 74113;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const mask = fbm(217, 7, 3); // long stretches of the shore have them, others none
  const fwd = [Math.sin(start.yaw), Math.cos(start.yaw)];
  let out = [];
  const blocked = (x, z) => {
    // right around where you arrive, and the near water in front of you, stay open
    const dx = x - start.x;
    const dz = z - start.z;
    const d = Math.hypot(dx, dz);
    if (d < 22) return true;
    if (d < 62 && (dx * fwd[0] + dz * fwd[1]) / d > 0.8) return true;
    return false;
  };
  const bonesAt = bones?.spots || [];
  const nearBone = (x, z) => bonesAt.some((b) => Math.hypot(b.x - x, b.z - z) < b.r);
  const clump = (x, z, R) => {
    const dzh = heightAt(x, z + 3) - heightAt(x, z - 3);
    const dxh = heightAt(x + 3, z) - heightAt(x - 3, z);
    const l = Math.hypot(dxh, dzh) || 1;
    const along = [-dzh / l, dxh / l]; // along the shore
    const across = [dxh / l, dzh / l];
    const n = Math.round(R * R * 2.4 * (0.75 + rnd() * 0.5)) + 24;
    const tall = 2.6 + rnd() * 1.3;
    const own = rnd();
    const from = out.length;
    for (let i = 0; i < n; i++) {
      const u = Math.sqrt(-2 * Math.log(rnd() + 1e-6)) * Math.cos(6.283 * rnd());
      const v = Math.sqrt(-2 * Math.log(rnd() + 1e-6)) * Math.cos(6.283 * rnd());
      const sx = x + along[0] * u * R * 0.8 + across[0] * v * R * 0.32;
      const sz = z + along[1] * u * R * 0.8 + across[1] * v * R * 0.32;
      const g = heightAt(sx, sz);
      if (g < -0.34 || g > 0.62 || blocked(sx, sz) || nearBone(sx, sz)) continue;
      // tallest in the wet, and lower at a clump's edges
      const edge = Math.min(1, Math.hypot(u, v) / 2.4);
      const height = tall * (0.66 + 0.44 * rnd()) * (1 - 0.3 * edge) * (1 - 0.3 * THREE.MathUtils.smoothstep(g, 0.1, 0.6));
      out.push(sx, sz, g, height, rnd() * 6.283, rnd(), rnd(), own);
    }
    return { x, z, rr: R * 1.3, stems: (out.length - from) / 8, from };
  };
  const shore = (x, z) => {
    const h = heightAt(x, z);
    return h > -0.18 && h < 0.3 && !blocked(x, z) && !nearBone(x, z);
  };
  // first a few good ones that you see on arriving
  const clumps = [];
  const hero = [];
  for (let t = 0; t < 8000 && hero.length < 7; t++) {
    const a = start.yaw + (rnd() - 0.5) * 1.5;
    const d = 45 + rnd() * 165;
    const x = start.x + Math.sin(a) * d;
    const z = start.z + Math.cos(a) * d;
    if (!shore(x, z) || hero.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < 30)) continue;
    hero.push([x, z]);
    clumps.push(clump(x, z, 5 + rnd() * 7));
  }
  // then the rest, along long stretches of the shore and missing from others
  for (let tries = 0, n = 0; tries < 80000 && n < 640 && out.length < 8 * 130000; tries++) {
    const x = rnd() * PERIOD;
    const z = rnd() * PERIOD;
    if (!shore(x, z) || mask(x / PERIOD, z / PERIOD) < -0.02) continue;
    n++;
    clumps.push(clump(x, z, 3 + rnd() * rnd() * 16));
  }
  const first = out.length / 8;
  // the rest of what can be asked for, wherever there's shore
  const more = [];
  const firstOut = out;
  out = [];
  for (let tries = 0, stems = 0; tries < 300000 && stems < first * (REEDS_MOST - 1) * 1.3; tries++) {
    const x = rnd() * PERIOD;
    const z = rnd() * PERIOD;
    if (!shore(x, z)) continue;
    const c = clump(x, z, 3 + rnd() * rnd() * 16);
    c.mask = mask(x / PERIOD, z / PERIOD);
    more.push(c);
    stems += c.stems;
  }
  more.sort((a, b) => b.mask - a.mask);
  const moreOut = out;
  let n = first;
  const kept = [];
  for (const c of more) {
    if (n >= first * REEDS_MOST) break;
    kept.push(c);
    n += c.stems;
  }
  const data = new Float32Array(n * 8);
  data.set(firstOut);
  let at = first;
  for (const c of kept) {
    data.set(moreOut.slice(c.from, c.from + c.stems * 8), at * 8);
    at += c.stems;
    clumps.push(c);
  }
  return { data, clumps, first };
}

export function createReeds({ scene, baked, start, bones }) {
  const { data, clumps, first } = plant({ start, bones });
  const count = data.length / 8;
  const stemAll = new Float32Array(count * 4);
  const randAll = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    stemAll.set(data.subarray(i * 8, i * 8 + 4), i * 4);
    randAll.set(data.subarray(i * 8 + 4, i * 8 + 8), i * 4);
  }
  const NEAR_MAX = 32000; // at the most, the thickest stand has about 26000 within reach. Past this, stems go missing
  const stemNear = new THREE.InstancedBufferAttribute(new Float32Array(NEAR_MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const randNear = new THREE.InstancedBufferAttribute(new Float32Array(NEAR_MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);

  const shared = {
    uKeep: { value: 1 }, uTall: { value: 1 }, uBend: { value: 0.5 }, uFlutterR: { value: 0.03 }, uClipY: { value: -1000 },
    uDroop: { value: 1 }, uStreamR: { value: 1 }, uShadeMix: { value: 0.5 }, uTuftR: { value: 0 }, uTwinkleR: { value: 0 }, uFineWide: { value: 0.075 }, uNoSheen: { value: 0 }, uShadowWide: { value: 1.5 },
    uCull: { value: 0.1 }, uViewDir: { value: new THREE.Vector3() },
    uLeaf: { value: new THREE.Color() }, uLeaf2: { value: new THREE.Color() }, uPlume: { value: new THREE.Color() }, uPlumeBase: { value: new THREE.Color() }, uStalk: { value: new THREE.Color() },
  };
  const make = (geo, isNear) => {
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: plantFrag,
      side: THREE.DoubleSide,
      uniforms: { ...U, ...shared, uIsNear: { value: isNear ? 1 : 0 } },
    }));
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  const far = make(farForm().geometry({
    stem: new THREE.InstancedBufferAttribute(stemAll, 4),
    rand: new THREE.InstancedBufferAttribute(randAll, 4),
  }), false);
  const near = make(nearForm().geometry({ stem: stemNear, rand: randNear }), true);
  near.geometry.instanceCount = 0;
  const mirrored = make(mirrorForm().geometry({ stem: stemNear, rand: randNear }), true);
  mirrored.visible = false;
  // the near ones again in the same light form, as the sun sees them (plantShadow.js)
  const shadowMesh = new THREE.Mesh(mirrorForm().geometry({ stem: stemNear, rand: randNear }), plantShadowMaterial(vert, { ...U, ...shared, uIsNear: { value: 1 } }));
  shadowMesh.frustumCulled = false;

  const last = new THREE.Vector2(1e9, 1e9);
  const R = 76;
  let drawn = -1; // how many of the stems, a whole number of clumps
  // for what wants open water: is it thick with stems here? Cells of 5 m, worked out when asked after the amount has changed
  const CROWD = Math.ceil(PERIOD / 5);
  let crowdFor = -2;
  const crowd = new Uint8Array(CROWD * CROWD);
  function crowded(x, z) {
    if (crowdFor !== drawn) {
      crowdFor = drawn;
      crowd.fill(0);
      for (let i = 0; i < drawn; i++) {
        const a = Math.floor((((stemAll[i * 4] % PERIOD) + PERIOD) % PERIOD) / 5);
        const b = Math.floor((((stemAll[i * 4 + 1] % PERIOD) + PERIOD) % PERIOD) / 5);
        const k = b * CROWD + a;
        if (crowd[k] < 255) crowd[k]++;
      }
    }
    const a = Math.floor((((x % PERIOD) + PERIOD) % PERIOD) / 5);
    const b = Math.floor((((z % PERIOD) + PERIOD) % PERIOD) / 5);
    return crowd[b * CROWD + a] >= 2;
  }
  function pickNear(cam) {
    let n = 0;
    for (let i = 0; i < drawn && n < NEAR_MAX; i++) {
      let dx = stemAll[i * 4] - cam.x;
      let dz = stemAll[i * 4 + 1] - cam.z;
      dx -= Math.round(dx / PERIOD) * PERIOD; // (you may be any number of periods from home)
      dz -= Math.round(dz / PERIOD) * PERIOD;
      if (dx * dx + dz * dz > R * R) continue;
      stemNear.array.set(stemAll.subarray(i * 4, i * 4 + 4), n * 4);
      randNear.array.set(randAll.subarray(i * 4, i * 4 + 4), n * 4);
      n++;
    }
    stemNear.needsUpdate = true;
    randNear.needsUpdate = true;
    near.geometry.instanceCount = n;
    mirrored.geometry.instanceCount = n;
    shadowMesh.geometry.instanceCount = n;
    return n;
  }

  // the grass under them stays low: under the ones there are, so this is done again when the amount changes
  baked.keepFlattened();
  function layGrass(upTo) {
    baked.backToKept();
    for (let i = 0, n = 0; i < clumps.length && n < upTo; i++) {
      const c = clumps[i];
      n += c.stems;
      if (c.stems > 8) baked.flatten(c.x, c.z, c.rr * 1.2, (dx, dz) => 1 - THREE.MathUtils.smoothstep(Math.hypot(dx, dz) / c.rr, 0.4, 1));
    }
  }
  let layTimer = 0;
  function setAmount(a) {
    let n = 0;
    const want = first * a;
    for (let i = 0; i < clumps.length && n < want; i++) n += clumps[i].stems;
    if (n === drawn) return;
    const firstTime = drawn < 0;
    drawn = n;
    far.geometry.instanceCount = n;
    last.set(1e9, 1e9); // the near ones are picked again
    if (firstTime) layGrass(n);
    else {
      clearTimeout(layTimer);
      layTimer = setTimeout(() => layGrass(drawn), 250);
    }
  }

  return {
    count,
    crowded,
    shadowMesh,
    get drawn() { return drawn; },
    get nearCount() { return near.geometry.instanceCount; },
    // the clumps now standing, for the sound
    heard() {
      const list = [];
      for (let i = 0, n = 0; i < clumps.length && n < drawn; i++) {
        list.push(clumps[i]);
        n += clumps[i].stems;
      }
      return list;
    },
    apply() {
      const t = tuning.reeds;
      setAmount(t.amount);
      shared.uKeep.value = t.density;
      shared.uTall.value = t.height;
      shared.uBend.value = t.bend;
      shared.uFlutterR.value = t.flutter;
      shared.uDroop.value = t.droop;
      shared.uStreamR.value = t.stream;
      shared.uShadeMix.value = t.shade;
      shared.uTuftR.value = tuning.blade.tuft;
      shared.uTwinkleR.value = tuning.gloss.twinkle;
      shared.uShadowWide.value = tuning.plantShadow.wide;
      shared.uStalk.value.set(t.stalk);
      shared.uLeaf.value.set(t.leaf);
      shared.uLeaf2.value.set(t.leaf2);
      shared.uPlume.value.set(t.plume);
      shared.uPlumeBase.value.set(t.plumeBase);
    },
    update(cam, dir, camera) {
      shared.uViewDir.value.copy(dir);
      const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
      shared.uCull.value = Math.cos(Math.min(Math.PI * 0.49, half + 0.2));
      if (Math.hypot(cam.x - last.x, cam.z - last.y) > 5) {
        last.set(cam.x, cam.z);
        pickNear(cam);
      }
    },
    // the same stems at the same distances as in the view, near ones in a lighter form
    forMirror(on) {
      near.visible = !on;
      mirrored.visible = on;
      shared.uClipY.value = on ? 0 : -1000;
    },
  };
}
