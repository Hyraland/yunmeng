import * as THREE from 'three';
import { U, COMMON } from './common.js';
import { tuning } from './tuning.js';

// Real volumetric mist, for 湿雾薄晴 and at night (lit by the moon, which is what the sun's direction is then): a density field in three dimensions, stepped through along each line of sight. Drawn at a fraction of the
// screen's resolution, with the scene's depth so it stops at what it meets, and then laid over the scene.
// At each step: how much mist there is (a tiling 3D noise carried along by the wind, thinning upwards, lying in the low ground, and blown
// thin where a gust is passing), how much of that the sun reaches (the mist towards the sun, the clouds, the bones) and how much light that
// sends this way. So it has light shafts under cloud edges and through the ribs, glows towards the sun, and has actual banks.
// Everything else draws as usual; this only changes where it's drawn to.

const JITTER_SIZE = 64;

const fullVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const marchFrag = /* glsl */ `
${COMMON}
precision highp sampler3D;
uniform sampler2D uDepth;
uniform sampler3D uVol;
uniform sampler2D uJitter;
uniform mat4 uInvVP;
uniform vec4 uFogA; // thickness at the ground (per m), how high it reaches (m), how much of the air is mist (0..1), size of the banks (m)
uniform vec4 uFogB; // how fast it drifts (m/s), light shafts, glow towards the sun, steps
uniform vec3 uFogLit, uFogShade;
uniform vec2 uFogC; // how far round the viewer it's held back (m), how soft a bank's edge is
varying vec2 vUv;

const float REACH = 560.0; // m; beyond this the ordinary distance haze carries on

float fogShape(vec3 p) {
  // squashed: mist lies in sheets
  vec3 q = vec3(p.x, p.y * 5.0, p.z);
  vec3 drift = vec3(uWindDir.x, 0.0, uWindDir.y) * uTime * uFogB.x;
  float big = texture(uVol, (q - drift) / uFogA.w).r;
  float fine = texture(uVol, (q - drift * 1.6) / (uFogA.w * 0.22) + 0.37).g;
  // (the noise's values lie mostly between 0.33 and 0.68)
  float n = (big * 0.68 + fine * 0.32 - 0.3) / 0.42;
  return smoothstep(1.0 - uFogA.z, 1.0 - uFogA.z + uFogC.y, n);
}

float fogAt(vec3 p) {
  // its top isn't level: it heaps up here and thins out there, as the air moves it
  vec2 m = p.xz - uWindDir * uTime * uFogB.x * 0.6;
  float swell = texture2D(uNoiseTex, m / 610.0).r * 0.6 + texture2D(uNoiseTex, m / 190.0 + 0.3).g * 0.4;
  float top = uFogA.y * (0.3 + 2.2 * smoothstep(0.34, 0.68, swell));
  float up = exp(-max(p.y, 0.0) / top);
  if (up < 0.02) return 0.0;
  // it lies on the water and in the wet low ground, following the shores; dry land and hills hold little of it
  float g = texture2D(uHeightTex, p.xz / uPeriod).r;
  float low = 0.06 + 0.94 * (1.0 - smoothstep(-0.05, 1.5, g));
  // and a gust blows it thin
  vec2 bent = windRaw(p.xz).xy;
  float blown = 1.0 - 0.62 * clamp(length(bent), 0.0, 1.0);
  return uFogA.x * up * low * blown * fogShape(p);
}

void main() {
  float depth = texture2D(uDepth, vUv).r;
  vec4 w = uInvVP * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec3 end = w.xyz / w.w;
  vec3 ro = uCam;
  vec3 rd = normalize(end - ro);
  float tEnd = depth < 0.99999 ? length(end - ro) : REACH;
  tEnd = min(tEnd, REACH);
  // the water writes no depth: the mist lies on it, not under it
  if (rd.y < -0.0001 && ro.y > 0.0) tEnd = min(tEnd, ro.y / -rd.y);
  // Nothing lies above its highest top (see fogAt), so the steps are spent on the part of the line that's in it: looking up, most of them were above it
  float ceiling = uFogA.y * 2.5 * 3.92;
  float tStart = 0.0;
  if (ro.y > ceiling) tStart = rd.y < -0.0001 ? (ro.y - ceiling) / -rd.y : tEnd;
  else if (rd.y > 0.0001) tEnd = min(tEnd, (ceiling - ro.y) / rd.y);
  if (tStart >= tEnd) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // a different start in each pixel, so too few steps show as grain to be blurred and not as slices. The grain has to be blue noise: all fine
  // detail, which the blur takes out. A formula in the pixel's position has a period of its own, which the blur doesn't: at night that showed
  // as a grid lying on the mist, fixed to the screen.
  float jit = texture2D(uJitter, gl_FragCoord.xy / ${JITTER_SIZE}.0).r;
  float N = uFogB.w;
  float T = 1.0;
  vec3 L = vec3(0.0);
  float c = dot(rd, uSun);
  // towards the sun the droplets send light on forward (Henyey-Greenstein, g = 0.6, 1 where it's the same in all directions)
  float hg = min(0.64 / pow(1.36 - 1.2 * c, 1.5), 3.5);
  float t0 = tStart;
  for (int i = 0; i < int(N); i++) {
    float a = (float(i) + jit) / N;
    float t1 = tStart + (tEnd - tStart) * a * a * (0.25 + 0.75 * a);
    float dt = t1 - t0;
    float tm = 0.5 * (t0 + t1);
    t0 = t1;
    if (dt <= 0.0) continue;
    vec3 p = ro + rd * tm;
    float rho = fogAt(p);
    if (rho <= 0.0) continue;
    // what's at your feet stays clear, and only that: held back much further than this, a bank fades as you come up to it and you never get in
    rho *= smoothstep(uFogC.x * 0.1, uFogC.x, tm);
    float pass = exp(-rho * dt);
    // the sun's way to here: through the mist above and on, past the clouds, past the bones
    float toSun = exp(-fogAt(p + uSun * 7.0) * 24.0);
    vec2 up = cloudAt(p.xz + uSun.xz / (uSun.y + 0.16) * uMisc.z * 0.2);
    float cover = smoothstep(0.56, 0.68, cloudPattern(up));
    float seen = (1.0 - uFogB.y * cover) * boneShadowAt(p, 0.6);
    float sun = toSun * seen;
    // (white at most: it's light in the air, not a lamp)
    vec3 inscatter = min(mix(uFogShade, uFogLit, sun) + vec3(1.0, 0.98, 0.93) * uFogLit * max(hg - 1.0, 0.0) * uFogB.z * 0.2 * sun, vec3(1.0));
    L += T * (1.0 - pass) * inscatter;
    T *= pass;
    if (T < 0.02) break;
  }
  gl_FragColor = vec4(L, T);
}
`;

const compFrag = /* glsl */ `
precision highp float;
uniform sampler2D uScene, uFog, uDepth;
uniform vec2 uFogRes;
uniform vec3 uNearFar;
uniform float uToon, uSteps;
varying vec2 vUv;

float viewZ(float d) { return uNearFar.x * uNearFar.y / (uNearFar.y - d * (uNearFar.y - uNearFar.x)); }

void main() {
  vec3 scene = texture2D(uScene, vUv).rgb;
  // the low-resolution mist joined to the full-resolution scene: neighbours count by how near they are in depth, so it stays behind
  // what's in front of it and doesn't fringe the edges of things. A little wider than the four nearest, which takes the grain out.
  float z0 = viewZ(texture2D(uDepth, vUv).r);
  vec2 t = vUv * uFogRes - 0.5;
  vec2 b = floor(t);
  vec2 f = t - b;
  vec4 sum = vec4(0.0);
  float weight = 0.0;
  // A thin thing in front of far mist has no low-resolution neighbour at its own depth. Then the nearest in depth stands in, with its mist
  // cut down to the shorter way to this thing, or its far-off mist would be laid over something close (or, with nothing counted, black).
  vec4 best = vec4(0.0, 0.0, 0.0, 1.0);
  float bestZ = 1e9;
  float bestGap = 1e9;
  for (int j = -1; j <= 2; j++) {
    for (int i = -1; i <= 2; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 uv = (b + o + 0.5) / uFogRes;
      vec2 r = o - f;
      float w = exp(-dot(r, r) * 0.5);
      float z = viewZ(texture2D(uDepth, uv).r);
      vec4 s = texture2D(uFog, uv);
      float gap = abs(z - z0);
      if (gap < bestGap) { bestGap = gap; best = s; bestZ = z; }
      w *= exp(-gap / (z0 * 0.05 + 0.3));
      sum += s * w;
      weight += w;
    }
  }
  vec4 fog = sum / max(weight, 0.0001);
  if (weight < 0.05) {
    float k = clamp(z0 / max(bestZ, 0.01), 0.0, 1.0);
    float T = pow(max(best.a, 0.001), k);
    fog = vec4(best.rgb * (1.0 - T) / max(1.0 - best.a, 0.001), T);
  }
  vec3 col = scene * fog.a + fog.rgb;
  // (half a step of the screen's 256, or a long soft gradient over a dark night shows as contour lines)
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

// The grain is what's left of too few steps, and it stays where it is on the screen while the view moves, where the eye finds it at once. Mist
// has no fine detail to lose, so it's blurred away in the mist's own small picture: across, then up, and not over a jump in depth, so what stands in
// front keeps its edge.
const blurFrag = /* glsl */ `
precision highp float;
uniform sampler2D uFog, uDepth;
uniform vec2 uStep; // one step of the blur, on the picture
uniform vec2 uNearFar;
uniform float uSigma; // in texels
varying vec2 vUv;

float viewZ(float d) { return uNearFar.x * uNearFar.y / (uNearFar.y - d * (uNearFar.y - uNearFar.x)); }

void main() {
  float z0 = viewZ(texture2D(uDepth, vUv).r);
  vec4 sum = texture2D(uFog, vUv);
  float weight = 1.0;
  for (int i = 1; i <= 6; i++) {
    float r = float(i);
    float w0 = exp(-r * r / (2.0 * uSigma * uSigma));
    for (int s = -1; s <= 1; s += 2) {
      vec2 uv = vUv + uStep * r * float(s);
      float gap = abs(viewZ(texture2D(uDepth, uv).r) - z0);
      float w = w0 * exp(-gap / (z0 * 0.05 + 0.3));
      sum += texture2D(uFog, uv) * w;
      weight += w;
    }
  }
  gl_FragColor = sum / weight;
}
`;

// Blue noise, by void and cluster: each value in turn goes in the emptiest place left, so like values stay apart and it has no lumps and no period
// but its own size. (A short step for each of a few thousand places: about a frame's time, once.)
function bakeJitter() {
  const S = JITTER_SIZE;
  const R = 6;
  const stamp = [];
  for (let b = -R; b <= R; b++) for (let a = -R; a <= R; a++) stamp.push([a, b, Math.exp(-(a * a + b * b) / (2 * 1.3 * 1.3))]);
  let seed = 4243;
  const energy = new Float32Array(S * S);
  for (let i = 0; i < energy.length; i++) {
    seed = (seed * 16807) % 2147483647;
    energy[i] = seed / 2147483647 * 0.001; // (or the first ones all fall in a row)
  }
  const data = new Uint8Array(S * S);
  const used = new Uint8Array(S * S);
  for (let n = 0; n < S * S; n++) {
    let at = 0;
    let least = Infinity;
    for (let i = 0; i < energy.length; i++) {
      if (!used[i] && energy[i] < least) {
        least = energy[i];
        at = i;
      }
    }
    used[at] = 1;
    data[at] = Math.floor((n / (S * S)) * 256);
    const x = at % S;
    const y = (at - x) / S;
    for (const [a, b, w] of stamp) energy[((y + b + S) % S) * S + ((x + a + S) % S)] += w;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RedFormat, THREE.UnsignedByteType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// A 3D noise that tiles: red, soft billows (inverted cells over smooth noise); green, finer detail.
function bakeVolume() {
  const S = 64;
  const data = new Uint8Array(S * S * S * 4);
  let seed = 7731;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const lattice = (n) => {
    const a = new Float32Array(n * n * n);
    for (let i = 0; i < a.length; i++) a[i] = rnd();
    return a;
  };
  const smooth = (x) => x * x * (3 - 2 * x);
  const valueNoise = (lat, n, x, y, z) => {
    const xf = x * n;
    const yf = y * n;
    const zf = z * n;
    const x0 = Math.floor(xf);
    const y0 = Math.floor(yf);
    const z0 = Math.floor(zf);
    const u = smooth(xf - x0);
    const v = smooth(yf - y0);
    const w = smooth(zf - z0);
    const at = (i, j, k) => lat[(((k % n) + n) % n) * n * n + (((j % n) + n) % n) * n + (((i % n) + n) % n)];
    const l = (a, b, s) => a + (b - a) * s;
    return l(
      l(l(at(x0, y0, z0), at(x0 + 1, y0, z0), u), l(at(x0, y0 + 1, z0), at(x0 + 1, y0 + 1, z0), u), v),
      l(l(at(x0, y0, z0 + 1), at(x0 + 1, y0, z0 + 1), u), l(at(x0, y0 + 1, z0 + 1), at(x0 + 1, y0 + 1, z0 + 1), u), v),
      w,
    );
  };
  // points for the cells, one in each of a coarse grid
  const CELLS = 5;
  const pts = new Float32Array(CELLS * CELLS * CELLS * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = rnd();
  const cells = (x, y, z) => {
    const xf = x * CELLS;
    const yf = y * CELLS;
    const zf = z * CELLS;
    const xi = Math.floor(xf);
    const yi = Math.floor(yf);
    const zi = Math.floor(zf);
    let best = 9;
    for (let k = -1; k <= 1; k++) {
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const a = (((xi + i) % CELLS) + CELLS) % CELLS;
          const b = (((yi + j) % CELLS) + CELLS) % CELLS;
          const c = (((zi + k) % CELLS) + CELLS) % CELLS;
          const o = (c * CELLS * CELLS + b * CELLS + a) * 3;
          const dx = xi + i + pts[o] - xf;
          const dy = yi + j + pts[o + 1] - yf;
          const dz = zi + k + pts[o + 2] - zf;
          best = Math.min(best, dx * dx + dy * dy + dz * dz);
        }
      }
    }
    return Math.sqrt(best);
  };
  const n4 = lattice(4);
  const n8 = lattice(8);
  const n16 = lattice(16);
  const n32 = lattice(32);
  for (let k = 0; k < S; k++) {
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const x = i / S;
        const y = j / S;
        const z = k / S;
        const a = valueNoise(n4, 4, x, y, z);
        const b = valueNoise(n8, 8, x, y, z);
        const c = valueNoise(n16, 16, x, y, z);
        const d = valueNoise(n32, 32, x, y, z);
        const billow = 1 - Math.min(1, cells(x, y, z) / 0.9);
        const o = (k * S * S + j * S + i) * 4;
        data[o] = Math.min(1, Math.max(0, 0.55 * (a * 0.6 + b * 0.3 + c * 0.1) + 0.55 * billow)) * 255;
        data[o + 1] = Math.min(1, Math.max(0, b * 0.25 + c * 0.45 + d * 0.3)) * 255;
        data[o + 3] = 255;
      }
    }
  }
  const t = new THREE.Data3DTexture(data, S, S, S);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

export function createFog(renderer, camera) {
  const cam = new THREE.Camera();
  const plane = new THREE.PlaneGeometry(2, 2);
  const size = new THREE.Vector2();
  let sceneRT = null;
  let fogRT = null;
  let blurRT = null;
  const march = new THREE.ShaderMaterial({
    vertexShader: fullVert,
    fragmentShader: marchFrag,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      ...U,
      uDepth: { value: null },
      uVol: { value: null },
      uJitter: { value: null },
      uInvVP: { value: new THREE.Matrix4() },
      uFogA: { value: new THREE.Vector4() },
      uFogB: { value: new THREE.Vector4() },
      uFogLit: { value: new THREE.Color() },
      uFogShade: { value: new THREE.Color() },
      uFogC: { value: new THREE.Vector2() },
    },
  });
  const comp = new THREE.ShaderMaterial({
    vertexShader: fullVert,
    fragmentShader: compFrag,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uScene: { value: null },
      uFog: { value: null },
      uDepth: { value: null },
      uFogRes: { value: new THREE.Vector2() },
      uNearFar: { value: new THREE.Vector3() },
      uToon: U.uToon,
      uSteps: { value: 0 },
    },
  });
  const blur = new THREE.ShaderMaterial({
    vertexShader: fullVert,
    fragmentShader: blurFrag,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uFog: { value: null },
      uDepth: { value: null },
      uStep: { value: new THREE.Vector2() },
      uNearFar: { value: new THREE.Vector2() },
      uSigma: { value: 2 },
    },
  });
  const quad = new THREE.Mesh(plane, march);
  quad.frustumCulled = false;
  const pass = new THREE.Scene();
  pass.add(quad);

  function allocate() {
    renderer.getDrawingBufferSize(size);
    const w = Math.max(4, size.x);
    const h = Math.max(4, size.y);
    if (!sceneRT) {
      sceneRT = new THREE.WebGLRenderTarget(w, h, {
        samples: 4,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        depthTexture: new THREE.DepthTexture(w, h, THREE.FloatType),
      });
      fogRT = new THREE.WebGLRenderTarget(4, 4, {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
      });
    } else if (sceneRT.width !== w || sceneRT.height !== h) {
      sceneRT.setSize(w, h);
    }
    const k = tuning.mist.volRes;
    const fw = Math.max(4, Math.round(w * k));
    const fh = Math.max(4, Math.round(h * k));
    if (fogRT.width !== fw || fogRT.height !== fh) fogRT.setSize(fw, fh);
    if (!blurRT) blurRT = fogRT.clone();
    if (blurRT.width !== fw || blurRT.height !== fh) blurRT.setSize(fw, fh);
    comp.uniforms.uFogRes.value.set(fw, fh);
  }

  return {
    get active() { return tuning.mist.vol > 0 && (tuning.night.on ? tuning.night.fog.on > 0 : tuning.mist.on); },
    resize() { if (sceneRT) allocate(); },
    apply() {
      const m = tuning.mist;
      // (the shape's size, softness and drift are the same mist's, by day and by night)
      const n = tuning.night.on ? tuning.night.fog : null;
      march.uniforms.uFogA.value.set(n ? n.density : m.volDensity, n ? n.height : m.volHeight, n ? n.cover : m.volCover, m.volSize);
      march.uniforms.uFogB.value.set(m.volDrift, n ? n.shaft : m.volShaft, n ? n.glow : m.volGlow, Math.round(m.volSteps));
      march.uniforms.uFogLit.value.set(n ? n.lit : m.volLit);
      march.uniforms.uFogShade.value.set(n ? n.shade : m.volShade);
      march.uniforms.uFogC.value.set(m.volClear, m.volEdge);
      if (sceneRT) allocate();
    },
    render(scene) {
      if (!march.uniforms.uVol.value) march.uniforms.uVol.value = bakeVolume();
      if (!march.uniforms.uJitter.value) march.uniforms.uJitter.value = bakeJitter();
      allocate();
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
      const depth = sceneRT.depthTexture;
      march.uniforms.uDepth.value = depth;
      march.uniforms.uInvVP.value.copy(camera.matrixWorld).multiply(camera.projectionMatrixInverse);
      quad.material = march;
      renderer.setRenderTarget(fogRT);
      renderer.render(pass, cam);
      const sigma = tuning.mist.volBlur;
      if (sigma > 0) {
        quad.material = blur;
        const u = blur.uniforms;
        u.uDepth.value = depth;
        u.uNearFar.value.set(camera.near, camera.far);
        u.uSigma.value = sigma;
        u.uFog.value = fogRT.texture;
        u.uStep.value.set(1 / fogRT.width, 0);
        renderer.setRenderTarget(blurRT);
        renderer.render(pass, cam);
        u.uFog.value = blurRT.texture;
        u.uStep.value.set(0, 1 / fogRT.height);
        renderer.setRenderTarget(fogRT);
        renderer.render(pass, cam);
      }
      comp.uniforms.uScene.value = sceneRT.texture;
      comp.uniforms.uFog.value = fogRT.texture;
      comp.uniforms.uDepth.value = depth;
      comp.uniforms.uNearFar.value.set(camera.near, camera.far, 0);
      quad.material = comp;
      renderer.setRenderTarget(null);
      renderer.render(pass, cam);
    },
  };
}
