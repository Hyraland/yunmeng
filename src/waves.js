import * as THREE from 'three';
import { U } from './common.js';

// The water round someone wading, as real water: a height at each point of the surface and how fast that's changing, stepped forward by the
// wave equation. Each point is pulled towards the height of its neighbours, so a push runs outward as a ring. Nothing here draws a ring:
// the water's shader only takes the slope of this surface and lets it tilt the mirror and the light.
//   The speed of the waves comes from the depth (sqrt(g * depth)), so they slow and bunch up over the shallows, and they stop at the shore
//   and come back a little off it.
//   A second term (the fourth derivative, what surface tension does) makes short waves run ahead of long ones, which spreads one push
//   out into a train of finer and finer rings, as on a pond.
// Eighth-metre cells, following the walker, with an absorbing edge so that nothing comes back from where the covered area stops.
//   R the height (m), G how fast it's changing (m/s)

export const WAVE_SIZE = 64;
export const WAVE_RES = 512;
const SOURCES = 8; // a step goes on pushing for about a second, so a run's worth at once
const FIXED_DT = 1 / 120; // it has to be a small fixed step, or the fourth-derivative term blows up

const frag = /* glsl */ `
precision highp float;
uniform sampler2D uPrev, uHeightTex;
uniform vec2 uCenter, uShift;
uniform float uPeriod, uDt;
uniform vec4 uSrc[${SOURCES}]; // x, z, how long ago, how hard
uniform vec4 uBody; // x, z, how hard, its phase
varying vec2 vUv;
const float DX = ${(WAVE_SIZE / WAVE_RES).toFixed(5)};
const float E = ${(1 / WAVE_RES).toFixed(8)};

float at(vec2 uv, float i, float j) { return texture2D(uPrev, uv + vec2(i, j) * E).r; }

void main() {
  vec2 uv = vUv + uShift;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0); return; }
  vec4 s = texture2D(uPrev, uv);
  vec2 p = uCenter + (vUv - 0.5) * ${WAVE_SIZE}.0;
  float depth = -texture2D(uHeightTex, p / uPeriod).r;
  if (depth <= 0.0) { gl_FragColor = vec4(0.0); return; }
  float h = s.r, v = s.g;
  float N4 = at(uv, 1.0, 0.0) + at(uv, -1.0, 0.0) + at(uv, 0.0, 1.0) + at(uv, 0.0, -1.0);
  float D4 = at(uv, 1.0, 1.0) + at(uv, -1.0, 1.0) + at(uv, 1.0, -1.0) + at(uv, -1.0, -1.0);
  float F4 = at(uv, 2.0, 0.0) + at(uv, -2.0, 0.0) + at(uv, 0.0, 2.0) + at(uv, 0.0, -2.0);
  float lap = (N4 - 4.0 * h) / (DX * DX);
  float lap2 = (20.0 * h - 8.0 * N4 + 2.0 * D4 + F4) / (DX * DX * DX * DX);
  // (the wave equation's speed. Not the very shallowest: there the sim's cells are too coarse for it, and it'd draw a standing edge)
  float c = clamp(sqrt(9.81 * depth), 0.75, 1.9);
  float a = c * c * lap - 0.006 * lap2;
  // sources: a step pushes down and the water comes back up, over and over, dying away
  for (int i = 0; i < ${SOURCES}; i++) {
    vec4 q = uSrc[i];
    if (q.w <= 0.0 || q.z > 1.1) continue;
    vec2 d = p - q.xy;
    a += q.w * exp(-dot(d, d) / 0.07) * sin(q.z * 30.0) * exp(-q.z * 2.4) * 16.0;
  }
  if (uBody.z > 0.0) {
    vec2 d = p - uBody.xy;
    a += uBody.z * exp(-dot(d, d) / 0.1) * sin(uBody.w) * 3.0;
  }
  v += a * uDt;
  // what takes the energy out: the water's own drag, much more where it's shallowest (a beach takes waves in), and the edge of what's covered
  vec2 e = abs(vUv - 0.5) * 2.0;
  float damp = 0.22 + 7.0 * (1.0 - smoothstep(0.0, 0.1, depth)) + 14.0 * smoothstep(0.78, 1.0, max(e.x, e.y));
  v *= exp(-damp * uDt);
  h += v * uDt;
  gl_FragColor = vec4(h, v, 0.0, 1.0);
}
`;

export function createWaves(renderer) {
  const opts = {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
  };
  let a = new THREE.WebGLRenderTarget(WAVE_RES, WAVE_RES, opts);
  let b = new THREE.WebGLRenderTarget(WAVE_RES, WAVE_RES, opts);
  const sources = Array.from({ length: SOURCES }, () => new THREE.Vector4(0, 0, 9, 0));
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: frag,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uPrev: { value: null },
      uHeightTex: U.uHeightTex,
      uPeriod: U.uPeriod,
      uCenter: { value: new THREE.Vector2() },
      uShift: { value: new THREE.Vector2() },
      uDt: { value: FIXED_DT },
      uSrc: { value: sources },
      uBody: { value: new THREE.Vector4() },
    },
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);
  const cam = new THREE.Camera();
  const center = new THREE.Vector2();
  let nextSource = 0;
  let quiet = 1e9;
  let owed = 0;
  let phase = 0;
  const CELL = WAVE_SIZE / WAVE_RES;
  U.uWave.value = a.texture;

  function clear() {
    const was = renderer.getRenderTarget();
    for (const t of [a, b]) {
      renderer.setRenderTarget(t);
      renderer.clear();
    }
    renderer.setRenderTarget(was);
  }

  return {
    // a step going in
    step(x, z, strength) {
      sources[nextSource].set(x, z, 0, strength);
      nextSource = (nextSource + 1) % SOURCES;
      if (quiet > 12) clear();
      quiet = 0;
    },
    // Once a frame: where the walker is, and if they're moving through water, where and how hard
    update(dt, x, z, bodyX, bodyZ, bodyAmt) {
      if (bodyAmt > 0) quiet = 0;
      else quiet += dt;
      const nx = Math.round(x / CELL) * CELL;
      const nz = Math.round(z / CELL) * CELL;
      // (it takes a good while to die away. After that, nothing to do)
      if (quiet > 12) {
        U.uWaveAt.value.set(nx, nz, 0);
        center.set(nx, nz);
        return;
      }
      const u = mat.uniforms;
      u.uShift.value.set((nx - center.x) / WAVE_SIZE, (nz - center.y) / WAVE_SIZE);
      center.set(nx, nz);
      u.uCenter.value.copy(center);
      owed = Math.min(owed + dt, FIXED_DT * 5);
      const was = renderer.getRenderTarget();
      while (owed >= FIXED_DT) {
        owed -= FIXED_DT;
        phase += FIXED_DT * 24;
        for (const q of sources) q.z += FIXED_DT;
        u.uBody.value.set(bodyX, bodyZ, bodyAmt, phase);
        u.uPrev.value = a.texture;
        renderer.setRenderTarget(b);
        renderer.render(scene, cam);
        [a, b] = [b, a];
        u.uShift.value.set(0, 0);
      }
      renderer.setRenderTarget(was);
      U.uWave.value = a.texture;
      U.uWaveAt.value.set(center.x, center.y, 1);
    },
  };
}
