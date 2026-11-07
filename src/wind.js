import * as THREE from 'three';
import { U } from './common.js';
import { tuning } from './tuning.js';

// The grass as a sheet of damped springs. Each cell of the land near the camera holds how far its grass is bent (a vector)
// and how fast that is changing. Gusts push it; the blades' stiffness pulls it back and it overshoots a little; the cells pull
// on their neighbours, which is what lets a push run on through the grass by itself. Nothing here is a formula of time.
//   RG bend (1 = fully over, along the push), BA its velocity per second

const SIZE = 1024; // m of land covered
const RES = 1024; // so one cell is one metre

const frag = /* glsl */ `
precision highp float;
uniform sampler2D uPrev, uNoiseTex;
uniform vec2 uWindDir, uCenter, uShift;
uniform float uTime, uDt, uSize, uTexel;
uniform vec4 uGust;   // speed, size, cover, softness
uniform vec4 uSpring; // stiffness, damping going over, damping coming back, pull between neighbours
uniform vec4 uShape;  // small gusts' share, warp, fine patches, spread at a gust's edge
uniform float uTurb;
uniform sampler2D uTrail;
uniform vec2 uTrailCenter;
uniform float uTrailSize;
varying vec2 vUv;

float gustShape(vec2 p) {
  vec2 W = uWindDir, C = vec2(-W.y, W.x);
  vec2 q = p + (texture2D(uNoiseTex, p / 1300.0).rg - 0.5) * uShape.y * 2.0;
  float a = dot(q, W), c = dot(q, C);
  float v = uGust.x * uTime, S = uGust.y;
  // two layers moving at different speeds, so a gust changes shape as it goes instead of sliding by like a stamp
  // (sheared: each place passes through all of the pattern in turn. Read square-on, a place only ever meets one line of it, however long you
  // wait, and that leaves lanes down the wind where a strong gust never comes. It still moves straight down the wind.)
  float A1 = (a - v) / S, A2 = (a - v * 0.72) / (S * 0.8);
  float n = texture2D(uNoiseTex, vec2(A1, c / (S * 1.7) + A1 * 0.31)).r * 0.6
          + texture2D(uNoiseTex, vec2(A2, c / (S * 1.25) + 0.37 - A2 * 0.23)).g * 0.4;
  float big = smoothstep(uGust.z, uGust.z + uGust.w, n);
  float S2 = S * 0.27;
  float A3 = (a - v * 1.18) / S2;
  float m = texture2D(uNoiseTex, vec2(A3, c / (S2 * 1.5) + 0.61 + A3 * 0.27)).b;
  float small = smoothstep(0.5, 0.7, m);
  float t = big * (1.0 - uShape.x + uShape.x * small) + small * uShape.x * 0.3;
  // patches a few metres wide, whatever size the gusts are set to: the grass is never pushed evenly
  float f = texture2D(uNoiseTex, vec2((a - v * 1.05) / 150.0, c / 210.0 + 0.2)).a;
  t *= 1.0 + (f - 0.5) * uShape.z * 3.0;
  return clamp(t, 0.0, 1.1);
}

void main() {
  vec2 uv = vUv + uShift;
  vec4 s = texture2D(uPrev, uv);
  vec2 D = s.xy, vel = s.zw;
  vec2 p = uCenter + (vUv - 0.5) * uSize;

  // what the wind is asking for here: along it, a turn outwards at a gust's edges, and some unsteadiness
  float t = gustShape(p);
  vec2 g = vec2(gustShape(p + vec2(4.0, 0.0)) - t, gustShape(p + vec2(0.0, 4.0)) - t) / 4.0;
  vec2 tn = (texture2D(uNoiseTex, (p - uWindDir * uGust.x * uTime * 0.8) / 90.0).gb - 0.5) * uTurb * (0.25 + t);
  vec2 want = uWindDir * t - g * uShape.w + tn;
  // someone going through just now shoves what's there: the reeds swing, and it runs on a little through the grass
  vec4 tr = texture2D(uTrail, (p - uTrailCenter) / uTrailSize + 0.5);
  want += tr.xy / max(tr.z, 0.001) * tr.w * 0.8;
  // nothing at the edge of the covered land, so nothing is smeared past it
  vec2 e = abs(vUv - 0.5) * 2.0;
  want *= 1.0 - smoothstep(0.82, 0.98, max(e.x, e.y));

  // neighbours, one metre away on each side
  vec2 lap = texture2D(uPrev, uv + vec2(uTexel, 0.0)).xy + texture2D(uPrev, uv - vec2(uTexel, 0.0)).xy
           + texture2D(uPrev, uv + vec2(0.0, uTexel)).xy + texture2D(uPrev, uv - vec2(0.0, uTexel)).xy - 4.0 * D;

  // a blade is stopped more by its own stiffness coming back than it is going over
  float c = dot(want - D, D) < 0.0 ? uSpring.z : uSpring.y;
  vec2 acc = (want - D) * uSpring.x - vel * c + lap * uSpring.w;
  vel += acc * uDt;
  D += vel * uDt;
  gl_FragColor = vec4(D, vel);
}
`;

// Where someone has walked. Kept apart from the springs, because grass trodden flat doesn't spring back: it lies as it was pushed and comes up
// again over the better part of a minute. Half-metre cells, following the walker as the wind's sheet does.
//   xy the way it was pushed, times z; z how flat; w how recent (seconds, for the shove the wind's sheet takes from it)
const TRAIL_SIZE = 256;
const TRAIL_RES = 512;
const trailFrag = /* glsl */ `
precision highp float;
uniform sampler2D uPrev, uNoiseTex;
uniform vec2 uCenter, uShift, uFrom, uTo;
uniform float uFade, uFadeQuick, uWidth, uFlat, uOn;
varying vec2 vUv;
void main() {
  vec2 uv = vUv + uShift;
  vec4 s = texture2D(uPrev, uv);
  // (what's scrolled in from past the edge is nothing)
  vec2 e = abs(uv - 0.5) * 2.0;
  s *= step(max(e.x, e.y), 1.0);
  s.xyz *= uFade;
  s.w *= uFadeQuick;
  if (uOn > 0.5) {
    vec2 p = uCenter + (vUv - 0.5) * ${TRAIL_SIZE}.0;
    vec2 seg = uTo - uFrom;
    float len2 = dot(seg, seg);
    float h = len2 > 0.0 ? clamp(dot(p - uFrom, seg) / len2, 0.0, 1.0) : 0.0;
    vec2 off = p - uFrom - seg * h;
    // a walker doesn't draw a clean line: it's wider here and narrower there, trodden harder in some places, with tufts left standing
    float wide = texture2D(uNoiseTex, p / 19.0).r;
    float hard = texture2D(uNoiseTex, p / 2.3 + 0.37).g;
    float dist = length(off) - (wide - 0.5) * uWidth * 1.1;
    float here = (1.0 - smoothstep(uWidth * 0.35, uWidth, dist)) * uFlat * clamp(0.82 + (hard - 0.5) * 1.3, 0.0, 1.0);
    if (here > 0.0) {
      vec2 along = len2 > 0.0 ? seg / sqrt(len2) : vec2(0.0);
      vec2 out_ = dist > 0.01 ? off / dist : vec2(0.0);
      // (only out to the sides: pushed outward at the front too, the end of the path would be a starburst)
      vec2 side = out_ - along * dot(out_, along);
      vec2 dir = normalize(along + side * 1.3 * smoothstep(0.0, uWidth * 0.6, max(dist, 0.0)) + vec2(0.0001));
      float z = max(s.z, here);
      // what's just been trodden lies the way it's just been pushed
      vec2 was = s.z > 0.001 ? s.xy / s.z : dir;
      s.xy = normalize(mix(was, dir, here) + vec2(0.0001)) * z;
      s.z = z;
      s.w = max(s.w, here);
    }
  }
  gl_FragColor = s;
}
`;

export function createWind(renderer) {
  const opts = {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
  };
  let a = new THREE.WebGLRenderTarget(RES, RES, opts);
  let b = new THREE.WebGLRenderTarget(RES, RES, opts);
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: frag,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uPrev: { value: null },
      uNoiseTex: U.uNoiseTex,
      uWindDir: U.uWindDir,
      uCenter: { value: new THREE.Vector2() },
      uShift: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uDt: { value: 0 },
      uSize: { value: SIZE },
      uTexel: { value: 1 / RES },
      uGust: { value: new THREE.Vector4() },
      uSpring: { value: new THREE.Vector4() },
      uShape: { value: new THREE.Vector4() },
      uTurb: { value: 0 },
      uTrail: U.uTrail,
      uTrailCenter: U.uTrailCenter,
      uTrailSize: U.uTrailSize,
    },
  });
  const trailOpts = { ...opts, depthBuffer: false };
  let ta = new THREE.WebGLRenderTarget(TRAIL_RES, TRAIL_RES, trailOpts);
  let tb = new THREE.WebGLRenderTarget(TRAIL_RES, TRAIL_RES, trailOpts);
  const trailMat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: trailFrag,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uPrev: { value: null },
      uCenter: { value: new THREE.Vector2() },
      uShift: { value: new THREE.Vector2() },
      uFrom: { value: new THREE.Vector2() },
      uTo: { value: new THREE.Vector2() },
      uFade: { value: 1 },
      uFadeQuick: { value: 1 },
      uWidth: { value: 1 },
      uFlat: { value: 1 },
      uOn: { value: 0 },
      uNoiseTex: U.uNoiseTex,
    },
  });
  U.uTrail.value = ta.texture;
  U.uTrailSize.value = TRAIL_SIZE;
  const trailCenter = new THREE.Vector2();
  const trailFrom = new THREE.Vector2();
  let hasFrom = false;
  let trailQuiet = 1e9; // how long since anything was trodden
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);
  const cam = new THREE.Camera();
  const center = new THREE.Vector2();
  const metre = SIZE / RES;
  U.uFieldSize.value = SIZE;

  function step(dt, time, camPos) {
    const u = mat.uniforms;
    // the field follows the camera by whole cells, so the grass's motion stays put in the world
    const nx = Math.round(camPos.x / metre) * metre;
    const nz = Math.round(camPos.z / metre) * metre;
    u.uShift.value.set((nx - center.x) / SIZE, (nz - center.y) / SIZE);
    center.set(nx, nz);
    u.uCenter.value.copy(center);
    u.uTime.value = time;
    u.uDt.value = Math.min(dt, 0.05); // beyond this the springs would no longer be stable
    u.uPrev.value = a.texture;
    const was = renderer.getRenderTarget();
    renderer.setRenderTarget(b);
    renderer.render(scene, cam);
    renderer.setRenderTarget(was);
    [a, b] = [b, a];
    U.uField.value = a.texture;
    U.uFieldCenter.value.copy(center);
  }

  // Someone at x, z, moving at this speed, on the ground or not. Called once a frame.
  function tread(dt, x, z, speed, onGround) {
    const c = TRAIL_SIZE / TRAIL_RES;
    const nx = Math.round(x / c) * c;
    const nz = Math.round(z / c) * c;
    const t = tuning.walk;
    // (a jump isn't a walk: nothing is drawn across it)
    const jumped = Math.hypot(x - trailFrom.x, z - trailFrom.y) > 14;
    const treading = onGround && speed > 0.4 && t.trail > 0 && hasFrom && !jumped;
    if (treading) trailQuiet = 0;
    else trailQuiet += dt;
    const shift = Math.hypot(nx - trailCenter.x, nz - trailCenter.y);
    // with nothing on it nothing needs doing; it only has to keep up with the walker
    if (trailQuiet > t.trail * 12 && !treading) {
      trailCenter.set(nx, nz);
      U.uTrailCenter.value.copy(trailCenter);
      trailFrom.set(x, z);
      hasFrom = true;
      return;
    }
    const u = trailMat.uniforms;
    u.uShift.value.set((nx - trailCenter.x) / TRAIL_SIZE, (nz - trailCenter.y) / TRAIL_SIZE);
    trailCenter.set(nx, nz);
    u.uCenter.value.copy(trailCenter);
    u.uFade.value = t.trail > 0 ? Math.exp(-dt / t.trail) : 0;
    u.uFadeQuick.value = Math.exp(-dt / 0.9);
    u.uFrom.value.copy(trailFrom);
    u.uTo.value.set(x, z);
    u.uWidth.value = (0.7 + speed * 0.09) * t.trailWide;
    u.uFlat.value = t.trailAmt;
    u.uOn.value = treading ? 1 : 0;
    u.uPrev.value = ta.texture;
    quad.material = trailMat;
    const was = renderer.getRenderTarget();
    renderer.setRenderTarget(tb);
    renderer.render(scene, cam);
    renderer.setRenderTarget(was);
    quad.material = mat;
    [ta, tb] = [tb, ta];
    U.uTrail.value = ta.texture;
    U.uTrailCenter.value.copy(trailCenter);
    trailFrom.set(x, z);
    hasFrom = true;
  }

  return {
    step,
    tread,
    apply() {
      const w = tuning.wind;
      mat.uniforms.uGust.value.set(w.speed, w.size, w.cover, w.soft);
      mat.uniforms.uSpring.value.set(w.stiff, w.damp, w.dampBack, w.couple);
      mat.uniforms.uShape.value.set(w.small, w.warp, w.fine, w.spread);
      mat.uniforms.uTurb.value = w.turb;
    },
    // settle the grass as it would be at a moment, having already been in the wind for a while
    warm(time, camPos) {
      center.set(Math.round(camPos.x / metre) * metre, Math.round(camPos.z / metre) * metre);
      for (let i = 0; i < 110; i++) step(0.045, time - (109 - i) * 0.045, camPos);
    },
    // How hard the wind is asking at a place, by the same shape the shader works out (no springs, so about a second ahead of the grass; the
    // gust noise read on the CPU). Nothing is read back from the graphics card, which would stall the frame. For the sound.
    askAt(x, z, time) {
      const w = tuning.wind;
      const tex = U.uNoiseTex.value;
      if (!tex?.image?.data) return 0;
      const { data, width: N } = tex.image;
      const read = (u, v, ch) => {
        const fx = (u - Math.floor(u)) * N - 0.5;
        const fy = (v - Math.floor(v)) * N - 0.5;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const ax = fx - x0, ay = fy - y0;
        const at = (i, j) => data[(((j % N) + N) % N) * N * 4 + (((i % N) + N) % N) * 4 + ch] / 255;
        return (at(x0, y0) * (1 - ax) + at(x0 + 1, y0) * ax) * (1 - ay) + (at(x0, y0 + 1) * (1 - ax) + at(x0 + 1, y0 + 1) * ax) * ay;
      };
      const smooth = (a, b, v) => {
        const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
        return t * t * (3 - 2 * t);
      };
      const W = U.uWindDir.value;
      const qx = x + (read(x / 1300, z / 1300, 0) - 0.5) * w.warp * 2;
      const qz = z + (read(x / 1300, z / 1300, 1) - 0.5) * w.warp * 2;
      const a = qx * W.x + qz * W.y;
      const c = -qx * W.y + qz * W.x;
      const v = w.speed * time;
      const S = w.size;
      const A1 = (a - v) / S;
      const A2 = (a - v * 0.72) / (S * 0.8);
      const n = read(A1, c / (S * 1.7) + A1 * 0.31, 0) * 0.6 + read(A2, c / (S * 1.25) + 0.37 - A2 * 0.23, 1) * 0.4;
      const big = smooth(w.cover, w.cover + w.soft, n);
      const S2 = S * 0.27;
      const A3 = (a - v * 1.18) / S2;
      const small = smooth(0.5, 0.7, read(A3, c / (S2 * 1.5) + 0.61 + A3 * 0.27, 2));
      let t = big * (1 - w.small + w.small * small) + small * w.small * 0.3;
      const f = read((a - v * 1.05) / 150, c / 210 + 0.2, 3);
      t *= 1 + (f - 0.5) * w.fine * 3;
      return Math.min(1.1, Math.max(0, t));
    },
  };
}
