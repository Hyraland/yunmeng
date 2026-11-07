import * as THREE from 'three';
import { U, COMMON } from './common.js';
import { WAVE_SIZE } from './waves.js';
import { tuning } from './tuning.js';

// The ground past the blades wears the same fur surface, so distant hills continue the grass without a seam.
// The water is the same camera-following grid, flat at level 0.

function warpedGrid(n, radius) {
  const pos = new Float32Array((n + 1) * (n + 1) * 3);
  const idx = new Uint32Array(n * n * 6);
  const warp = (i) => {
    const u = (i / n) * 2 - 1;
    return Math.sign(u) * Math.pow(Math.abs(u), 2.6) * radius;
  };
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const k = (j * (n + 1) + i) * 3;
      pos[k] = warp(i);
      pos[k + 2] = warp(j);
    }
  }
  let m = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const c = a + n + 1;
      const d = c + 1;
      idx[m++] = a; idx[m++] = c; idx[m++] = b;
      idx[m++] = b; idx[m++] = c; idx[m++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// Round puffs, for the heaped clouds: in each cell of a grid a dome of its own size; red large, green small. It tiles.
function puffTexture() {
  const S = 512;
  const px = new Uint8Array(S * S * 4);
  [[11, 0], [29, 1]].forEach(([G, ch], seedOff) => {
    let seed = 9901 + seedOff * 77;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const pts = [];
    for (let i = 0; i < G * G; i++) pts.push([rnd(), rnd(), 0.62 + 0.62 * rnd()]);
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const u = (i / S) * G;
        const v = (j / S) * G;
        const cu = Math.floor(u);
        const cv = Math.floor(v);
        let best = 0;
        for (let b = -2; b <= 2; b++) {
          for (let a = -2; a <= 2; a++) {
            const p = pts[((cv + b + G) % G) * G + ((cu + a + G) % G)];
            const dx = cu + a + p[0] - u;
            const dy = cv + b + p[1] - v;
            const r = p[2];
            const h = 1 - (dx * dx + dy * dy) / (r * r);
            if (h > 0) best = Math.max(best, Math.sqrt(h) * (0.55 + 0.45 * r));
          }
        }
        px[(j * S + i) * 4 + ch] = Math.min(1, best) * 255;
      }
    }
  });
  const t = new THREE.DataTexture(px, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter; // (no mipmaps: it's read by angle, whose derivative jumps where the circle closes)
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

const groundVert = /* glsl */ `
${COMMON}
uniform vec2 uSnap;
varying vec2 vP;
varying vec3 vW;
void main() {
  vec2 p = uSnap + position.xz;
  float h = texture2D(uHeightTex, p / uPeriod).r;
  vW = vec3(p.x, h - 0.05, p.y);
  vP = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}
`;

const groundFrag = /* glsl */ `
${COMMON}
uniform vec3 uBank;
uniform vec3 uShore;
uniform float uClipY, uCombAmt;
uniform vec4 uClear; // how clear the water is (0 = not at all), how fast light is lost going down, how shallow counts as shallow, the bed's light web
uniform vec3 uSand, uMud;
uniform float uMarks;
varying vec2 vP;
varying vec3 vW;

// The bed, seen through the water. What says "you could wade this": a lake bed of soft silt, washed to paler sand only along the margin
// where small waves reach, with ripple marks there, the shadows of clouds lying on it, and the sun's web moving over it.
// Silt has no hard edges: a sharp patch on the bed reads as the shadow of something that isn't there.
vec3 bedColor(vec2 p, float depth, float vis, float seen) {
  vec2 perp = vec2(-uWindDir.y, uWindDir.x);
  float along = dot(p, uWindDir);
  float big = texture2D(uNoiseTex, p / 190.0).r * 0.55 + texture2D(uNoiseTex, p / 43.0 + 0.3).g * 0.45;
  float mud = uToon > 0.5 ? step(0.5, big + depth * 1.1) : smoothstep(0.28, 0.72, big * 0.7 + depth * 1.6);
  vec3 c = mix(uSand, uMud, mud);
  // ripple marks run across the wind that made them, in patches, on the sand more than the mud
  float wander = (texture2D(uNoiseTex, p / 27.0).b - 0.5) * 34.0 + (texture2D(uNoiseTex, p / 8.0).g - 0.5) * 6.0;
  float marks = sin(along * 8.5 + wander);
  float where = smoothstep(0.44, 0.6, texture2D(uNoiseTex, p / 91.0 + 0.6).g) * (1.0 - mud * 0.7) * (1.0 - smoothstep(10.0, 30.0, seen));
  c *= 1.0 + (uToon > 0.5 ? step(0.45, marks) * 1.2 : marks) * where * uMarks;
  float lit = clamp(vis, 0.0, 1.0) * cloudShade(p);
  if (uToon > 0.5) lit = step(0.5, lit);
  c = mix(mix(c, uShade, 0.5), c, lit);
  float t = uTime;
  float n1 = texture2D(uNoiseTex, p / 21.0 + uWindDir * t * 0.016).r;
  float n2 = texture2D(uNoiseTex, rot(p, 1.1) / 16.0 - uWindDir * t * 0.021).g;
  float web = 1.0 - min(1.0, abs(n1 - n2) * 10.0);
  web = uToon > 0.5 ? step(0.86, web) : web * web * web;
  c += vec3(1.0, 0.98, 0.86) * web * uClear.w * lit * exp(-depth * 1.5) * (1.0 - smoothstep(9.0, 36.0, seen));
  return c;
}

void main() {
  if (vW.y < uClipY) discard; // the reflection sees nothing under the water
  vec4 H = texture2D(uHeightTex, vP / uPeriod);
  vec3 N = vec3(H.g, sqrt(max(1.0 - H.g * H.g - H.b * H.b, 0.0)), H.b);
  vec4 C = texture2D(uCombTex, vP / uPeriod);
  vec2 lc = C.rg * 2.0 - 1.0;
  vec2 comb = rot(uWindDir, atan(lc.y, lc.x) * uCombAmt);
  vec4 w = gustAt(vP);
  // where the grass has been walked flat, seen from far off (the blades do this for themselves up close)
  w.x = max(w.x, trailAt(vP).z * 0.8);
  vec2 d = normalize(comb + uWindDir * w.x);
  // far off, the blades as a whole: flatter the further over they are
  vec3 T = normalize(vec3(d.x, 0.2 - 0.14 * w.x, d.y));
  vec3 Nb = normalize(vec3(0.0, 1.0, 0.0) - T * T.y);
  vec3 V = normalize(uCam - vW);
  float boneVis = length(uCam - vW) < 110.0 ? boneShadowSoft(vW, 0.25) * plantShadowSoft(vW, 0.25) : 1.0;
  // far off the ground stands in for the blades; its tone edges break up along the grain, as theirs do blade by blade
  vec2 grain = vec2(dot(vP, uWindDir), dot(vP, vec2(-uWindDir.y, uWindDir.x)));
  float jit = texture2D(uNoiseTex, grain * vec2(0.01, 0.06)).b - 0.5;
  gWet = wetAt(H.r);
  // (a blade is one hair, so its break-up only speckles; this noise runs in patches tens of metres long, and at full strength it drew
  // dark bands along the wind over whole hillsides: on a slope turned from the sun, and its extremes even on ground in full light)
  gLandBreak = 0.12;
  vec3 col = furColor(vP, N, H.a * boneVis, comb, w, T, Nb, C.a, V, jit * 1.4, uGlossA.y);
  // the nap of the fur seen from far: faint streaks along the combed direction
  vec2 sp = vec2(dot(vP, uWindDir), dot(vP, vec2(-uWindDir.y, uWindDir.x)));
  float streak = texture2D(uNoiseTex, sp * vec2(0.0016, 0.012)).b * 0.6 + texture2D(uNoiseTex, sp * vec2(0.006, 0.05)).g * 0.4;
  if (uToon < 0.5) col *= 1.0 + (streak - 0.5) * 0.14;
  col = mix(uBank, col, smoothstep(uShore.x, uShore.y, H.r));
  if (uClear.x > 0.0 && H.r < 0.14) {
    float seen = length(uCam - vW);
    // the bank is dark with wet just above the water, then it's the bed
    col = mix(col, mix(uMud, uBank, 0.35), 1.0 - smoothstep(0.02, 0.14, H.r));
    col = mix(col, bedColor(vP, max(-H.r, 0.0), H.a * boneVis, seen), 1.0 - smoothstep(-0.03, 0.03, H.r));
  }
  gl_FragColor = vec4(hazedAt(col, vW), 1.0);
}
`;

const waterVert = /* glsl */ `
${COMMON}
uniform vec2 uSnap;
varying vec3 vW;
void main() {
  vec2 p = uSnap + position.xz;
  vW = vec3(p.x, 0.0, p.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}
`;

const waterFrag = /* glsl */ `
${COMMON}
uniform sampler2D uMirrorTex;
uniform mat4 uMirrorVP;
uniform vec3 uBed, uDeep;
uniform vec4 uWater; // ripple, gust, mirror, shoreAlpha
uniform vec4 uClear; // how clear (0 = not at all), how fast light is lost going down, how shallow counts as shallow, -
uniform float uBandNear; // how far off 三渲二's depth bands are fully hard
uniform float uGlint;
uniform sampler2D uWave;
uniform vec3 uWaveAt;
varying vec3 vW;

// The slope of the water's real surface round someone wading (waves.js), in m per m.
vec2 waveSlope(vec2 p) {
  if (uWaveAt.z < 0.5) return vec2(0.0);
  vec2 q = (p - uWaveAt.xy) / ${WAVE_SIZE}.0 + 0.5;
  if (q.x < 0.01 || q.x > 0.99 || q.y < 0.01 || q.y > 0.99) return vec2(0.0);
  float e = ${(1 / 512).toFixed(8)};
  return vec2(texture2D(uWave, q + vec2(e, 0.0)).r - texture2D(uWave, q - vec2(e, 0.0)).r,
              texture2D(uWave, q + vec2(0.0, e)).r - texture2D(uWave, q - vec2(0.0, e)).r) / (2.0 * ${(64/512).toFixed(5)});
}

void main() {
  vec2 p = vW.xz;
  float depth = -texture2D(uHeightTex, p / uPeriod).r;
  if (depth <= 0.0) discard;
  vec4 gu = gustAt(p);
  float seen = length(uCam - vW);
  float t = uTime;
  vec4 a = texture2D(uNoiseTex, p / 53.0 + uWindDir * t * 0.012);
  vec4 b = texture2D(uNoiseTex, p / 19.0 - uWindDir * t * 0.022);
  vec2 rip = (a.rg - 0.5) * 2.0 + (b.gr - 0.5) * 1.4;
  // still water is a mirror; a gust breaks it up, the same gust that is pressing the grass
  float rough = uWater.x + gu.x * uWater.y;
  vec4 clip = uMirrorVP * vec4(vW, 1.0);
  vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
  uv += rip * vec2(0.3, 1.0) * rough * 0.016 / (1.0 + seen * 0.012);
  vec3 V = normalize(uCam - vW);
  // The surface as someone wading has left it. There's no drawing of rings here: it's a tilted mirror, so the line of sight comes off it at a
  // different angle and meets something else (followed out about 30 m, and seen in the reflection as what lies there).
  vec2 slope = waveSlope(p);
  vec3 Nw = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 R0 = reflect(-V, vec3(0.0, 1.0, 0.0));
  vec3 Rw = reflect(-V, Nw);
  Rw.y = max(Rw.y, 0.005);
  vec2 slopeSq = slope * slope;
  if (slopeSq.x + slopeSq.y > 1e-7) {
    vec4 c1 = uMirrorVP * vec4(vW + normalize(Rw) * 30.0, 1.0);
    vec4 c0 = uMirrorVP * vec4(vW + R0 * 30.0, 1.0);
    if (c1.w > 0.0 && c0.w > 0.0) uv += clamp((c1.xy / c1.w - c0.xy / c0.w) * 0.5, -0.2, 0.2);
  }
  vec4 mirrored = texture2D(uMirrorTex, clamp(uv, 0.002, 0.998));
  vec3 refl = mirrored.rgb;

  vec3 N = normalize(vec3(rip.x * rough - slope.x, 1.0, rip.y * rough - slope.y));
  float F = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 under = mix(uBed, uDeep, smoothstep(0.05, 0.8, depth));
  // What says shallow is seeing the bottom. Real water is a mirror only at a low angle: a setting holds the reflection up over the
  // deeper water, and it lets go where it's shallow or where you look down into it. What the water lets through is the real thing
  // behind it, drawn already: the bed (the ground's shader), and the stems and bones standing in it.
  float shallow = exp(-depth / uClear.z);
  float lookDown = smoothstep(0.1, 0.5, dot(Nw, V)); // (tilted towards you, it's more window; tilted away, more mirror)
  F = max(F, uWater.z * (1.0 - uClear.x * max(shallow, lookDown * 0.85)));
  float edge = smoothstep(0.0, uWater.w, depth);
  float through = mix(1.0, uClear.x * exp(-depth * uClear.y / max(V.y, 0.2)), edge);
  float alpha = 1.0 - (1.0 - F) * through;
  vec3 col = (F * refl + (1.0 - F) * (1.0 - through) * under) / max(alpha, 0.001);
  if (uToon > 0.5) {
    // 三渲二: the reflection stays, in flat tones, and the depth is in flat bands. A gust is a paler shape on the water; the glitter is hard white flecks.
    // Up close a band's edge is only a few metres of depth contour, nearly straight, with the share of reflection jumping across it: it reads as the edge of a pane of
    // glass. So near you the same change goes gradually, and it comes to its flat bands further off.
    float band = step(depth, 0.1) * 0.5 + step(depth, 0.24) * 0.5;
    band = mix(1.0 - smoothstep(0.04, 0.34, depth), band, smoothstep(uBandNear * 0.3, max(uBandNear, 0.001), seen));
    // (only the depth has hard edges: a hard step in the viewing angle would draw a ring round the viewer)
    float Ft = max(F, 0.82 * (1.0 - uClear.x * max(band, lookDown * 0.85)));
    float th = mix(1.0, uClear.x * mix(0.25, 0.85, band), step(0.02, depth));
    float at = 1.0 - (1.0 - Ft) * th;
    // steps of lightness, not of each channel: those would turn parts of a blue sky teal and its pale horizon grey
    float lum = dot(refl, vec3(0.3, 0.59, 0.11));
    // (only what stands in the world. The sky has its flat shapes already, and what's soft in it, the glow round a moon or the sun, the long
    // gradient, is cut into rings and discs by steps. The mirror's alpha says which is which: the sky writes 0 there.)
    vec3 stepped = mix(refl, refl * (floor(lum * 9.0 + 0.5) / 9.0) / max(lum, 0.01), mirrored.a);
    vec3 flat_ = (Ft * stepped + (1.0 - Ft) * (1.0 - th) * under) / max(at, 0.001);
    flat_ = mix(flat_, mix(uSkyLow, vec3(1.0), 0.35), step(0.46, gu.x + (rip.x * 0.12)) * 0.7);
    // (small: on open water, larger flecks read as white slabs lying on it. Where two noises at unrelated angles and sizes both run
    // high, wandering as they go: one noise stretched this much repeats every few metres, in rows anyone can see.)
    vec2 wander = (texture2D(uNoiseTex, p / 61.0).rg - 0.5) * 16.0;
    float fl = texture2D(uNoiseTex, rot(p + wander, 0.83) / vec2(23.0, 3.7) - uWindDir * t * 0.05).r;
    float fl2 = texture2D(uNoiseTex, rot(p - wander, 2.27) / vec2(13.0, 5.3) + uWindDir * t * 0.031).g;
    float flick = step(0.66, fl) * step(0.6, fl2) * step(0.56, texture2D(uNoiseTex, p / 240.0 + uWindDir * t * 0.003).g) * step(seen, 260.0);
    flat_ = mix(flat_, vec3(1.0), flick * min(1.0, uGlint) * (1.0 - uNight)); // (at night, big white slabs on dark water)
    if (seen < 110.0) flat_ = mix(mix(flat_, uShade, 0.42), flat_, smoothstep(0.35, 0.65, boneShadowSoft(vW, 0.25) * plantShadowSoft(vW, 0.25)));
    // The same tilted light, in flat tones. A slope that sends the eye higher up the sky is a step paler, one that sends it down to the
    // horizon a step darker. (The sun and the moons are in the reflection already, and the tilt breaks them up as it does anything else.)
    float lifted = Rw.y - R0.y;
    float tilt = step(0.05, lifted) * 0.42 + step(0.14, lifted) * 0.28;
    flat_ = mix(flat_, mix(uSkyTop, vec3(1.0), 0.62), tilt);
    flat_ = mix(flat_, flat_ * 0.86, step(lifted, -0.05));
    at = max(at, tilt);
    gl_FragColor = vec4(hazedAt(flat_, vW), at);
    return;
  }
  // what stands in the water lays a thin shadow on it
  if (seen < 110.0) col = mix(mix(col, uShade, 0.42), col, boneShadowSoft(vW, 0.25) * plantShadowSoft(vW, 0.25));
  // the sun's glitter: tiny facets, more of them where the water is stirred
  // (long texture periods: with short ones the same few peaks would come up in rows)
  vec4 fa = texture2D(uNoiseTex, p / 29.0 + uWindDir * t * 0.016);
  vec4 fb = texture2D(uNoiseTex, rot(p, 0.83) / 11.3 - uWindDir * t * 0.04);
  vec3 Nf = normalize(vec3((fa.r + fb.g - 1.0) * (0.06 + rough * 0.28), 1.0, (fa.g + fb.r - 1.0) * (0.06 + rough * 0.28)));
  float glit = pow(max(dot(reflect(-V, Nf), uSun), 0.0), 240.0);
  // in passing drifts of sparkle, not an even spread
  float drift = smoothstep(0.42, 0.62, texture2D(uNoiseTex, rot(p, 0.31) / 190.0 + uWindDir * t * 0.003).g);
  col += vec3(1.0, 0.98, 0.9) * glit * drift * uGlint * cloudShade(p) / (1.0 + seen * 0.006) / max(alpha, 0.2);
  // the sun's own reflection off a wave's facet, wherever one happens to face just right
  col += vec3(1.0, 0.98, 0.9) * pow(max(dot(normalize(Rw), uSun), 0.0), 2400.0) * smoothstep(0.004, 0.03, length(slope)) * 1.2 * uGlint * cloudShade(p) / max(alpha, 0.2);
  // ruffled water no longer shows one thing: it averages the sky over it
  float ruffle = clamp(gu.x * uWater.y * 0.22, 0.0, 0.6);
  col = mix(col, mix(uSkyLow, uSkyTop, 0.55), ruffle);
  alpha = mix(alpha, edge, ruffle);
  gl_FragColor = vec4(hazedAt(col, vW), alpha);
}
`;

const skyVert = /* glsl */ `
varying vec3 vD;
void main() {
  vD = position;
  vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;
const skyFrag = /* glsl */ `
${COMMON}
uniform vec4 uHill; // height (or 0 for none), centre, half span (radians), how much of the old flat colours instead of the land's surface
uniform vec3 uHillB; // elsewhere, mist, what lies along their feet
uniform vec3 uHillNear, uHillFar, uHillReed;
uniform float uHillC; // how far off the nearest layer is taken to be for the air in front of it (m)
const float HILL_SLOPE = 0.3;
uniform float uSkyAlpha;
varying vec3 vD;

// the skyline of one layer, in elevation: smooth waves at whole numbers of cycles round the circle, so it has no kinks and no join.
// Old, worn, rounded hills. The waves' sizes grow where they coincide, which makes the summits.
float skyline(float a, float seed, float env) {
  float p = seed * 37.0;
  float w = 0.5 * sin(a * 3.0 + p) + 0.42 * sin(a * 5.0 + p * 1.7) + 0.3 * sin(a * 8.0 + p * 2.3);
  float m = 0.26 * sin(a * 13.0 + p * 3.1) + 0.17 * sin(a * 21.0 + p * 0.7) + 0.09 * sin(a * 34.0 + p * 4.3);
  float big = smoothstep(-1.2, 1.2, w);
  return env * (0.14 + 0.62 * big * big + 0.26 * (0.5 + 0.5 * m / 0.52) * (0.35 + big));
}

// The land's own surface, on a hill that isn't there. Each layer is taken for a real hillside at the distance D, facing you, and p is where on the
// ground a point of it would be: so what's painted on it is furColor, the very grass of the land, with its patches at their real size, foreshortened
// as a slope far off is, in the light of the moment and under the shadows of the clouds.
vec3 hillSurface(vec3 d, vec2 ring, float a, float seed, float scale, float env, float D, vec2 p) {
  // which way the slope faces: towards you; along the ridge, as the skyline rises and falls; and with lumps of its own
  const float E = 0.012;
  float lean = (skyline(a + E, seed, env) - skyline(a - E, seed, env)) / (2.0 * E) * scale;
  vec2 q = p + seed * 913.0;
  // (gentle: this noise is steep in places, and a slope it turns from the sun comes out as rows of dark marks)
  float b0 = texture2D(uNoiseTex, q / 830.0).r;
  float bx = texture2D(uNoiseTex, (q + vec2(90.0, 0.0)) / 830.0).r;
  float bz = texture2D(uNoiseTex, (q + vec2(0.0, 90.0)) / 830.0).r;
  vec2 right = vec2(ring.y, -ring.x);
  vec3 N = vec3(0.0, 1.0, 0.0);
  N.xz -= ring * HILL_SLOPE;
  N.xz -= right * lean * 1.5;
  N.xz -= vec2(bx - b0, bz - b0) * 0.8;
  N = normalize(N);
  vec3 T = normalize(vec3(uWindDir.x, 0.2, uWindDir.y));
  vec3 Nb = normalize(vec3(0.0, 1.0, 0.0) - T * T.y);
  vec2 grain = vec2(dot(p, uWindDir), dot(p, vec2(-uWindDir.y, uWindDir.x)));
  float jit = texture2D(uNoiseTex, grain * vec2(0.01, 0.06)).b - 0.5;
  float patchv = texture2D(uCombTex, q / uPeriod).a;
  gWet = 0.0;
  gLandBreak = 0.12;
  return furColor(q, N, 1.0, uWindDir, vec4(0.0), T, Nb, patchv, -d, jit * 1.4, uGlossA.y);
}

vec3 withHills(vec3 c, vec3 d) {
  if (uHill.x <= 0.0) return c;
  float a = atan(d.x, d.z);
  float off = abs(mod(a - uHill.y + 3.14159265, TAU) - 3.14159265);
  float env = mix(uHillB.x, 1.0, smoothstep(uHill.z, uHill.z * 0.42, off));
  float y = d.y;
  vec2 ring = normalize(d.xz + vec2(0.00001));
  float aa = max(fwidth(y), 0.0002);
  // furthest first: tallest and palest; each nearer layer lower and a little deeper. A pixel only works out the layers it can see.
  float hs[4];
  int first = 0;
  for (int i = 0; i < 4; i++) {
    float f = float(i) / 3.0;
    float D = mix(2600.0, 1100.0, f);
    float h = uHill.x * mix(1.0, 0.42, f) * skyline(a, 0.11 + f * 0.67, env);
    // the ridge's edge isn't drawn with a ruler: it's grass, and what stands on it
    vec2 r = ring * D + float(i) * 37.0;
    h += ((texture2D(uNoiseTex, r / 46.0).r - 0.5) * 7.0 + (texture2D(uNoiseTex, r / 11.0).g - 0.5) * 2.2) / D * smoothstep(0.0, 0.25, env);
    hs[i] = h;
    if (y < h - aa) first = i;
  }
  for (int i = first; i < 4; i++) {
    float f = float(i) / 3.0;
    float seed = 0.11 + f * 0.67;
    float scale = uHill.x * mix(1.0, 0.42, f);
    float h = hs[i];
    float D = mix(2600.0, 1100.0, f);
    float cover = uToon > 0.5 ? step(y, h) : smoothstep(-aa, aa, h - y);
    if (cover <= 0.0) continue;
    float t = clamp((h - y) / max(h + 0.008, 0.001), 0.0, 1.0);
    // where this would be on the ground: outwards from its foot as it climbs (below the horizon too, seen from a height)
    vec2 p = ring * (D + y * D / HILL_SLOPE);
    vec3 col = hillSurface(d, ring, a, seed, scale, env, D, p);
    // what lies along the foot of the nearer ones: the white of the reeds and bits of open water
    float feet = uHillB.z * (1.0 - f * 0.5) * step(0.34, f);
    if (feet > 0.0) {
      float along = texture2D(uNoiseTex, p / 300.0 + seed).r * 0.65 + texture2D(uNoiseTex, p / 90.0).g * 0.35;
      float where = t + (texture2D(uNoiseTex, p / 170.0 + 0.4).b - 0.5) * 0.5;
      col = mix(col, mix(uSkyLow, uSkyTop, 0.25), step(0.74, where) * step(0.6, along) * feet);
      col = mix(col, uHillReed, step(0.52, where) * step(where, 0.84) * step(0.56, along) * feet);
    }
    col = mix(col, mix(uHillFar, uHillNear, f), uHill.w);
    // the same air as the land's, by how far off it's taken to be
    float air = exp(-uHillC * mix(2.2, 1.0, f) * uHaze);
    if (uToon > 0.5 && uToonA.w > 0.5) air = floor(air * uToonA.w + 0.5) / uToonA.w;
    col = mix(uHazeCol, col, air);
    col = mix(uHazeCol, col, smoothstep(0.08, 0.4, env)); // where the range gives out it's only haze, or from a height it draws a line round the horizon
    // its foot goes into the wet air, and not along a line
    float rise = t + (texture2D(uNoiseTex, p / 240.0).g - 0.5) * 0.3;
    if (uToon > 0.5) col = mix(col, uHazeCol, (step(0.62, rise) * 0.5 + step(0.86, rise) * 0.5) * uHillB.y * 0.8);
    else col = mix(col, uHazeCol, smoothstep(0.3, 1.0, rise) * uHillB.y);
    c = mix(c, col, cover);
  }
  return c;
}

void main() {
  vec3 d = normalize(vD);
  // (a long soft gradient has to be dithered or the 256 steps of a screen show as rings round the sun)
  // (in the mirror, alpha 0: that's how the water tells the sky from the things in its reflection. On the screen it would show as a hole.)
  gl_FragColor = vec4(withHills(skyColor(d), d) + (hash31(vec3(gl_FragCoord.xy, 1.0)) - 0.5) / 255.0, uSkyAlpha);
}
`;

export function createLand(scene, withRange) {
  U.uPuffTex.value = puffTexture();
  const hillU = { value: new THREE.Vector4() };
  const hillB = { value: new THREE.Vector3() };
  const hillC = { value: 400 };
  const hillReed = { value: new THREE.Color() };
  const hillNear = { value: new THREE.Color() };
  const hillFar = { value: new THREE.Color() };
  const snap = { value: new THREE.Vector2() };
  const bank = { value: new THREE.Color() };
  const shoreU = { value: new THREE.Vector3() };
  const bed = { value: new THREE.Color() };
  const deep = { value: new THREE.Color() };
  const waterU = { value: new THREE.Vector4() };
  const clipY = { value: -1000 };
  const skyAlpha = { value: 1 };
  const glint = { value: 0 };
  const combAmt = { value: 1 };
  const clear = { value: new THREE.Vector4() };
  const bandNear = { value: 45 };
  const sand = { value: new THREE.Color() };
  const mud = { value: new THREE.Color() };
  const marks = { value: 0 };
  const mirrorTex = { value: null };
  const mirrorVP = { value: new THREE.Matrix4() };
  const grid = warpedGrid(400, 1500);

  const ground = new THREE.Mesh(grid, new THREE.ShaderMaterial({
    vertexShader: groundVert,
    fragmentShader: groundFrag,
    uniforms: { ...U, uSnap: snap, uBank: bank, uShore: shoreU, uClipY: clipY, uCombAmt: combAmt, uClear: clear, uSand: sand, uMud: mud, uMarks: marks },
  }));
  ground.frustumCulled = false;
  scene.add(ground);

  // the water is flat, so it needs none of the ground's fine grid
  const water = new THREE.Mesh(warpedGrid(64, 1500), new THREE.ShaderMaterial({
    vertexShader: waterVert,
    fragmentShader: waterFrag,
    transparent: true,
    depthWrite: false,
    uniforms: { ...U, uSnap: snap, uBed: bed, uDeep: deep, uWater: waterU, uClear: clear, uBandNear: bandNear, uGlint: glint, uMirrorTex: mirrorTex, uMirrorVP: mirrorVP },
  }));
  water.frustumCulled = false;
  water.renderOrder = 2;
  scene.add(water);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    side: THREE.BackSide,
    depthWrite: false,
    defines: { SKY: 1 },
    uniforms: { ...U, uHill: hillU, uHillB: hillB, uHillC: hillC, uHillReed: hillReed, uHillNear: hillNear, uHillFar: hillFar, uSkyAlpha: skyAlpha },
  }));
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  return {
    apply() {
      const c = tuning.color;
      const w = tuning.water;
      combAmt.value = tuning.blade.comb;
      glint.value = tuning.sun.glint;
      const hl = tuning.hills;
      const deg = THREE.MathUtils.degToRad;
      hillU.value.set(withRange ? hl.height * 0.1 : 0, deg(hl.az), deg(hl.span), hl.flat);
      hillB.value.set(hl.around, hl.mist, hl.feet);
      hillC.value = hl.distance;
      hillReed.value.set(tuning.reeds.plume);
      hillNear.value.set(hl.near);
      hillFar.value.set(hl.far);
      bank.value.set(c.bank);
      bed.value.set(c.bed);
      deep.value.set(c.deep);
      shoreU.value.set(tuning.shore.from, tuning.shore.to, tuning.shore.short);
      waterU.value.set(w.ripple, w.gust, w.mirror, w.shoreAlpha);
      clear.value.set(w.clear, w.absorb, w.shallow, w.web);
      bandNear.value = tuning.toon.waterSoft;
      sand.value.set(w.sand);
      mud.value.set(w.mud);
      marks.value = w.marks;
    },
    update(cam) {
      snap.value.set(Math.round(cam.x / 12) * 12, Math.round(cam.z / 12) * 12);
    },
    forMirror(on) {
      water.visible = !on;
      clipY.value = on ? 0 : -1000;
      skyAlpha.value = on ? 0 : 1;
    },
    setMirror(texture, viewProjection) {
      mirrorTex.value = texture;
      mirrorVP.value.copy(viewProjection);
    },
  };
}
