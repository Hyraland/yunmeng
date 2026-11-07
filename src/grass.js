import * as THREE from 'three';
import { U, COMMON } from './common.js';
import { tuning } from './tuning.js';

// Long blades lying over along a combed direction. Three layers follow the camera, each tiling around it, so a blade
// keeps its place in the world and only swaps at the far edge of its tile. Layers cross-fade blade by blade.
// The colour is computed per vertex from the shared fur surface, with a very small difference between blades.

const vert = /* glsl */ `
${COMMON}
attribute vec4 aBlade;
uniform float uSize, uWidth, uLen, uRoot, uTip, uPress, uFollow, uFlutter, uCombAmt, uJitter, uFall, uPart, uTuft, uTwinkle, uHug, uStand;
uniform vec4 uFade;
uniform vec3 uShore;
uniform vec3 uViewDir;
uniform float uCull;
varying vec3 vCol;
varying float vAcross;
#ifdef MIRROR
varying float vY;
#endif

void main() {
  vAcross = position.x / max(0.03, 0.5 * (1.0 - pow(position.y, 2.4)) + 0.015);
  vec2 local = mod(aBlade.xy - uCam.xz + 0.5 * uSize, uSize) - 0.5 * uSize;
  vec2 b = uCam.xz + local;
  float r1 = aBlade.z, r2 = aBlade.w;
  float dist = length(local) + max(uCam.y - 40.0, 0.0); // flown high, blades straight below are far away too

  float w = 1.0 - smoothstep(uFade.z, uFade.w, dist);
  if (uFade.x >= 0.0) w *= smoothstep(uFade.x, uFade.y, dist);
  float thr = fract(r1 * 7.31 + r2 * 3.17);
  float alive = smoothstep(thr - 0.06, thr + 0.02, w);
  bool behind = dist > 7.0 && dot(local / dist, normalize(uViewDir.xz)) < uCull - min(2.0, abs(uViewDir.y) * 2.6);
  if (alive < 0.01 || behind) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec3(0.0); return; }

  vec4 H = texture2D(uHeightTex, b / uPeriod);
  float shore = smoothstep(uShore.x, uShore.y, H.r);
  if (shore < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec3(0.0); return; }
  // how deep grass stands in the water goes by the depth alone, thinning out blade by blade. Whether a blade clears the water can't
  // decide it: that changes as it bends, so gusts would wipe the grass off the water and every lull would bring it back.
  if (H.r < -uStand * (0.25 + 0.75 * fract(r2 * 5.77))) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec3(0.0); return; }
  vec3 N = vec3(H.g, sqrt(max(1.0 - H.g * H.g - H.b * H.b, 0.0)), H.b);

  vec4 C = texture2D(uCombTex, b / uPeriod);
  vec2 local2 = C.rg * 2.0 - 1.0;
  vec2 comb = normalize(rot(uWindDir, atan(local2.y, local2.x) * uCombAmt) + N.xz * uFall * 6.0);

  // tufts: neighbouring blades lean together and bend together, each tuft a little differently from the next
  vec4 tuft = texture2D(uNoiseTex, b / 31.0);
  float own = 0.65 + 0.7 * tuft.b;
  // each blade feels the wind at a slightly different place, so a push arrives strand by strand
  vec2 feel = b + (vec2(r1, r2) - 0.5) * 3.0 + (tuft.rg - 0.5) * 7.0 * uTuft;
  vec4 raw = windRaw(feel);
  vec2 bent = raw.xy * own;
  float stir = length(raw.zw);
  vec4 gu = vec4(clamp(dot(bent, uWindDir), 0.0, 1.0), stir, raw.zw);
  vec2 perp = vec2(-comb.y, comb.x);
  float over = dot(bent, comb);
  // the bend's own direction turns the blade; along its lean it goes further over, or stands up again when it swings back
  vec2 smooth_d = normalize(comb + perp * dot(bent, perp) * uFollow);
  // where someone walked it's been pushed over, along the way they went and out to the sides, and it lies that way until it recovers.
  // (each blade a little differently, or the edge of the path would be drawn with a ruler)
  vec3 trod = trailAt(b + (vec2(r1, r2) - 0.5) * 0.6);
  float flat_ = clamp(trod.z * (0.72 + 0.56 * r1), 0.0, 1.0);
  if (flat_ > 0.01) {
    smooth_d = normalize(mix(smooth_d, trod.xy / max(trod.z, 0.001) + vec2(0.0001), flat_));
    over = max(over, 0.0) + flat_ * 1.25;
    gu.x = max(gu.x, flat_ * 0.75);
  }
  smooth_d = rot(smooth_d, (tuft.r - 0.5) * uTuft * 1.4);
  vec2 d = rot(smooth_d, (r1 - 0.5) * uJitter * 2.0);
  // a blade bends from above: the root stays nearly where it was, the upper part goes over
  float a0 = uRoot + uPress * 0.25 * over;
  float a1 = min(uTip + uPress * 0.8 * over, 2.3) + sin(uTime * (2.3 + r2 * 1.6) + r1 * 40.0 + dot(b, uWindDir) * 0.35) * uFlutter * (0.3 + stir * 1.6);

  // the grass parts around the walker
  vec2 away = b - uCam.xz;
  float ar = length(away);
  float p = 1.0 - smoothstep(uPart * 0.25, uPart, ar);
  if (ar > 0.001 && p > 0.0) {
    d = normalize(mix(d, away / ar, p));
    a0 += p * 0.5;
    a1 += p * 0.3;
  }

  float len = uLen * (C.b * 1.28) * (0.84 + 0.32 * r2) * mix(uShore.z, 1.0, smoothstep(uShore.y, uShore.y + 0.7, H.r));
  len *= 0.35 + 0.65 * alive;
  // the shorter a blade, the narrower: short ones in the shallows are shoots, not paddles
  float slim = 0.3 + 0.7 * smoothstep(0.0, uShore.y + 0.5, H.r - uShore.x);
  float t = position.y;
  float k = a1 - a0;
  if (abs(k) < 0.05) k = 0.05;
  // a blade rooted under the water that hardly clears it would only show as a dot on the surface
  if (H.r < 0.0 && H.r + len * ((a1 >= 1.5708 ? 1.0 : sin(a1)) - sin(a0)) / k < 0.07) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec3(0.0); return; }
  float at = a0 + k * t;
  // the arc of a blade whose angle from vertical grows evenly along it
  float along = len * (cos(a0) - cos(at)) / k;
  float up = len * (sin(at) - sin(a0)) / k;
  // on a slope a lying blade lies along the slope, as fur does on a flank, instead of sticking out level from it or going in
  float climb = clamp(-dot(d, N.xz) / max(N.y, 0.3), -1.2, 1.2) * uHug;
  up += along * climb;
  // a blade rolls on its long axis as it moves; still grass hardly twinkles, grass in a gust does
  float roll = (r1 - 0.5) * 1.1 + sin(uTime * (5.5 + r2 * 5.0) + r1 * 60.0) * uTwinkle * min(stir * 1.2 + 0.06, 1.0);
  vec3 side = normalize(vec3(-d.y, roll, d.x));
  vec3 wp = vec3(b.x + d.x * along, H.r + up, b.y + d.y * along) + side * position.x * uWidth * (0.8 + 0.4 * r2) * (0.5 + 0.5 * alive) * slim;

  // this piece of this blade: its real direction, and its normal, creased a little along the midrib
  vec3 T = normalize(vec3(d.x * sin(at), cos(at) + sin(at) * climb, d.y * sin(at)));
  vec3 Nb = normalize(cross(side, T) + side * sign(position.x) * 0.28);
  // too far to see one by one: the blades' average, or they'd only be noise
  if (dot(Nb, uCam - wp) < 0.0) Nb = -Nb;
  Nb = normalize(mix(Nb, normalize(vec3(-d.x * 0.2, 1.0, -d.y * 0.2)), smoothstep(6.0, 50.0, dist)));
  vec3 V = normalize(uCam - wp);
  float boneVis = dist < 110.0 ? boneShadowAt(wp, 0.25) * plantShadowAt(wp, 0.25) : 1.0;
  // what's too small to see one by one averages out to a broader, weaker reflection (the sum over many small mirrors)
  float shine = mix(uBandLook.w, uGlossA.y, smoothstep(8.0, 170.0, dist));
  gWet = wetAt(H.r);
  vec3 col = furColor(b, N, H.a * boneVis, comb, gu, T, Nb, C.a, V, r2 - 0.5, shine);
  if (uToon < 0.5) col *= 1.0 + (r2 - 0.5) * uMisc.x * 2.0;
  // a little cooler and paler low in the grass rather than darker: the shadows here are all light
  if (uToon > 0.5) {
    // flat tones: one hard step low on the blade, its height differing from blade to blade
    col = mix(mix(col, uShade, 0.32), col, step(0.2 + (r1 - 0.5) * 0.16, t));
  } else {
    col = mix(mix(col, uStem, 0.35), col, smoothstep(0.0, 0.2, t));
    // deeper in the grass the sun doesn't reach: cooler low down, full light at the tips
    col = mix(mix(col, uShade, uSunB.y), col, smoothstep(0.1, 0.62, t));
    col *= 0.96 + 0.07 * t;
  }
  vCol = hazedAt(col, wp);
#ifdef MIRROR
  vY = wp.y;
#endif

  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vCol;
varying float vAcross;
// a blade is a little rounder than a ribbon: its edges a shade deeper than its middle
uniform float uToon;
#ifdef MIRROR
varying float vY;
#endif
void main() {
#ifdef MIRROR
  if (vY < 0.0) discard; // the part of a blade under the water isn't reflected: it would hang in the air below the waterline
#endif
  float a = clamp(vAcross, -1.0, 1.0); // antialiasing can sample a thin blade outside itself
  gl_FragColor = vec4(uToon > 0.5 ? vCol : vCol * (1.0 - 0.07 * a * a), 1.0);
}
`;

function bladeShape(segments) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = 0.5 * (1 - Math.pow(t, 2.4)) + 0.015;
    pos.push(-w, t, 0, w, t, 0);
    if (i < segments) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function bladeGeometry(segments, count, size, seed) {
  const g = bladeShape(segments);
  // a low-discrepancy sequence: even coverage without a grid, and any first part of it is still even
  const a = new Float32Array(count * 4);
  const spacing = size / Math.sqrt(count);
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = 0; i < count; i++) {
    // nudged off the sequence by about a blade's spacing, or from above it shows as a lattice
    const jx = (rnd() - 0.5) * spacing * 1.6;
    const jy = (rnd() - 0.5) * spacing * 1.6;
    a[i * 4] = ((0.5 + (i + 1) * 0.7548776662466927) % 1) * size + jx;
    a[i * 4 + 1] = ((0.5 + (i + 1) * 0.5698402909980532) % 1) * size + jy;
    a[i * 4 + 2] = rnd();
    a[i * 4 + 3] = rnd();
  }
  g.setAttribute('aBlade', new THREE.InstancedBufferAttribute(a, 4));
  g.instanceCount = count;
  return g;
}

const LAYERS = [
  { segments: 7, count: 210000, size: 38, width: 0.024, fade: [-1, 0, 13, 18.5] },
  { segments: 4, count: 430000, size: 124, width: 0.062, fade: [10, 17, 42, 61] },
  { segments: 2, count: 640000, size: 380, width: 0.2, fade: [38, 58, 125, 188] },
  { segments: 1, count: 440000, size: 860, width: 0.62, fade: [125, 188, 300, 425] },
];

const MIRROR_SHARE = [0.5, 0.45, 0.25, 0.4];
const MIRROR_SEGMENTS = [4, 2, 1, 1]; // the reflection is half the resolution and drawn every frame while walking: its blades can be plainer

export function createGrass(scene, lite) {
  const shared = {
    uLen: { value: 1 }, uRoot: { value: 0 }, uTip: { value: 0 }, uPress: { value: 0 }, uFollow: { value: 0 }, uTuft: { value: 0 }, uTwinkle: { value: 0 }, uHug: { value: 0 }, uStand: { value: 1 },
    uFlutter: { value: 0 }, uCombAmt: { value: 0 }, uJitter: { value: 0 }, uFall: { value: 0 }, uPart: { value: 0 },
    uShore: { value: new THREE.Vector3() }, uViewDir: { value: new THREE.Vector3() }, uCull: { value: 0.1 },
  };
  const meshes = LAYERS.map((L, i) => {
    const g = bladeGeometry(L.segments, L.count, L.size, 1234 + i * 77);
    const m = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.DoubleSide,
      uniforms: {
        ...U,
        ...shared,
        uSize: { value: L.size },
        uWidth: { value: L.width },
        uFade: { value: new THREE.Vector4(...L.fade) },
      },
    });
    // the reflection's own copy, kept apart because a discard would cost the main view its early depth test
    const mirror = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide, uniforms: m.uniforms, defines: { MIRROR: 1 } });
    const plainer = bladeShape(MIRROR_SEGMENTS[i]);
    plainer.setAttribute('aBlade', g.getAttribute('aBlade'));
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, L, plain: m, mirror, full: g, plainer };
  });
  const scale = lite ? 0.35 : 1;
  return {
    apply() {
      const b = tuning.blade;
      const w = tuning.wind;
      const s = tuning.shore;
      shared.uLen.value = b.len;
      shared.uRoot.value = b.root;
      shared.uTip.value = b.tip;
      shared.uPress.value = w.bend;
      shared.uFollow.value = w.follow;
      shared.uTuft.value = b.tuft;
      shared.uHug.value = b.hug;
      shared.uTwinkle.value = tuning.gloss.twinkle;
      shared.uFlutter.value = w.flutter;
      shared.uCombAmt.value = b.comb;
      shared.uJitter.value = b.jitter;
      shared.uFall.value = b.fall;
      shared.uPart.value = b.part;
      shared.uShore.value.set(s.from, s.to, s.short);
      shared.uStand.value = s.stand;
      for (const { mesh, L } of meshes) {
        mesh.geometry.instanceCount = Math.round(L.count * b.density * scale);
        // fewer blades are drawn wider, so the cover stays closed
        mesh.material.uniforms.uWidth.value = L.width * b.width / Math.sqrt(Math.min(1, b.density * scale));
      }
    },
    // The reflection shows the same blades as the view, at the same distances, or what stands at the waterline wouldn't meet its image.
    // It can do with fewer of them (each layer's blades are an even sequence, so the first part of it is a subset), drawn wider.
    forMirror(on) {
      const b = tuning.blade;
      meshes.forEach(({ mesh, L, plain, mirror, full, plainer }, i) => {
        const k = on ? MIRROR_SHARE[i] : 1;
        mesh.material = on ? mirror : plain;
        mesh.geometry = on ? plainer : full;
        const part = Math.max(0.05, b.density * scale * k);
        mesh.geometry.instanceCount = Math.round(L.count * part);
        mesh.material.uniforms.uWidth.value = L.width * b.width / Math.sqrt(Math.min(1, part));
      });
    },
    update(dir, camera) {
      shared.uViewDir.value.copy(dir);
      // blades outside the view (with a margin for those leaning in) are skipped before any work is done on them
      const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
      shared.uCull.value = Math.cos(Math.min(Math.PI * 0.49, half + 0.2));
    },
    triangles() {
      return meshes.reduce((n, { mesh, L }) => n + mesh.geometry.instanceCount * L.segments * 2, 0);
    },
  };
}
