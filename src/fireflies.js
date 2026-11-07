import * as THREE from 'three';
import { U } from './common.js';
import { tuning } from './tuning.js';

// Fireflies, on summer nights. Their light is a point, and most of what you see of them is the timing: each flies its own slow wandering line
// low over the grass and the shallows, and lights for about a second every few seconds, so that what's there is a scatter of soft pulses and
// you follow one only by guessing where it'll light next.
//   All of it is worked out on the graphics card from the time alone, the same way in two places: on screen, and looking straight down onto a
//   small texture, as the little light each lays on what's right under it (`glowAt` in common.js).
//   They live in boxes that follow the walker (a firefly going out of one side comes in at the other, faded out at the edge): half in a small
//   one, since the near ones are what you see, and half in a big one for the sparks further off. So that they gather in places, which stay where
//   they are as you walk, each one only shows where a noise fixed to the land says there are enough of them there.

const NEAR_BOX = 70; // m, the boxes they live in
const FAR_BOX = 180;
const GLOW_SIZE = 64; // m of land the light texture covers. Only what's near needs it: each lights a patch a metre or so across
const GLOW_RES = 256;
const MOST = 2400;

const fly = /* glsl */ `
attribute vec4 aBase; // x, z in the box, how far up it flies, its own phase
attribute vec4 aRand; // w: the size of its box
uniform float uTime, uPeriod;
uniform vec3 uCam;
uniform sampler2D uHeightTex, uNoiseTex;
varying float vLight;
float pulse(float s) {
  // lights quickly, goes out slowly
  return smoothstep(0.0, 0.16, s) * exp(-max(s - 0.16, 0.0) * 2.1);
}
vec3 flyPos(out float above) {
  float t = uTime;
  vec3 r = aRand.xyz;
  float box = aRand.w;
  vec2 q = aBase.xy;
  // a slow wander, a shorter one on top of it, and the small unsteadiness of something that size in the air
  q.x += sin(t * (0.07 + 0.05 * r.x) + r.y * 40.0) * 3.2 + sin(t * (0.31 + 0.2 * r.z) + r.x * 40.0) * 0.9 + sin(t * (1.3 + r.y) + r.z * 40.0) * 0.1;
  q.y += sin(t * (0.06 + 0.05 * r.z) + r.x * 40.0) * 3.2 + sin(t * (0.27 + 0.2 * r.y) + r.z * 40.0) * 0.9 + sin(t * (1.1 + r.x) + r.y * 40.0) * 0.1;
  // the copy of it nearest the viewer
  q += floor((uCam.xz - q) / box + 0.5) * box;
  float ground = texture2D(uHeightTex, q / uPeriod).r;

  float T = 2.2 + r.x * 3.2;
  float s = fract(t / T + aBase.w) * T;
  float lit = pulse(s);
  if (r.z > 0.65) lit = max(lit, pulse(s - 0.95) * 0.8); // some flash twice
  // (going up a little as it lights, as many kinds do)
  above = aBase.z + sin(t * (0.3 + r.y * 0.4) + r.x * 60.0) * 0.28 + lit * 0.12;
  vec3 p = vec3(q.x, max(ground, 0.0) + max(above, 0.12), q.y);

  // Where they are. In the damp, then: few over deep water or high dry ground.
  float n = texture2D(uNoiseTex, q / 97.0).r * 0.6 + texture2D(uNoiseTex, q / 41.0 + 0.37).g * 0.4;
  float many = (0.1 + 0.9 * smoothstep(0.44, 0.6, n)) * (1.0 - smoothstep(1.8, 4.5, -ground)) * (1.0 - smoothstep(4.0, 10.0, ground));
  float here = smoothstep(r.y - 0.04, r.y + 0.04, many);
  float edge = 1.0 - smoothstep(box * 0.36, box * 0.5, length(q - uCam.xz));
  vLight = lit * here * edge;
  return p;
}
`;

const viewVert = /* glsl */ `
${fly}
uniform float uScale, uSize, uMinPx;
varying float vCore;
void main() {
  float above;
  vec3 p = flyPos(above);
  vec4 v = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * v;
  float px = clamp(uSize * uScale / max(-v.z, 0.3), uMinPx, 300.0);
  gl_PointSize = px;
  // The light itself is a few centimetres across, in a sprite that's mostly glow. Far off it stays a pixel or two, however small that makes the sprite.
  vCore = clamp(uMinPx * 0.7 / px, 0.08, 0.8);
  // (dimmer far off, in air that isn't quite clear)
  vLight *= 1.0 - 0.3 * smoothstep(15.0, 90.0, -v.z);
  if (vLight <= 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;
const viewFrag = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uToon, uBright;
varying float vLight;
varying float vCore;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  // the air round it: no edge to it, as the moons' glow has none
  float air = (1.0 - r) * (1.0 - r) * exp(-r * 4.0) * 0.55;
  float x = r / vCore;
  float core = uToon > 0.5 ? 1.0 - smoothstep(0.82, 1.1, x) : exp(-x * x * 1.3);
  float hot = uToon > 0.5 ? 1.0 - smoothstep(0.38, 0.55, x) : exp(-x * x * 4.5);
  // Its glow is light added to what's there. The light itself covers what's behind it, or against pale grass its colour goes to white: so alpha here
  // is how much is covered, with the colour already scaled by it (see the blending below).
  float cover = core * min(vLight * uBright * 1.6, 1.0);
  vec3 col = uColor * air * vLight * uBright + mix(uColor, vec3(1.0, 1.0, 0.72), hot * 0.75) * cover;
  gl_FragColor = vec4(col, cover);
}
`;

const lightVert = /* glsl */ `
${fly}
uniform vec3 uGlowAt;
uniform float uSpan;
void main() {
  float above;
  vec3 p = flyPos(above);
  gl_Position = vec4((p.xz - uGlowAt.xy) / uGlowAt.z * 2.0, 0.0, 1.0);
  gl_PointSize = uSpan;
  // high up it lights nothing to speak of; and it fades out before the texture ends
  vLight *= 1.0 / (1.0 + above * above * 1.1) * (1.0 - smoothstep(${(GLOW_SIZE * 0.34).toFixed(1)}, ${(GLOW_SIZE * 0.46).toFixed(1)}, length(p.xz - uGlowAt.xy)));
  if (vLight <= 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;
const lightFrag = /* glsl */ `
precision highp float;
uniform vec3 uColor;
varying float vLight;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float l = (1.0 / (1.0 + r * r * 6.0)) * (1.0 - r * r);
  gl_FragColor = vec4(uColor * l * vLight, 1.0);
}
`;

export function createFireflies({ scene, renderer, camera }) {
  // (a seed of its own, so they're the same from one visit to the next)
  let seed = 90317;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const base = new Float32Array(MOST * 4);
  const rand = new Float32Array(MOST * 4);
  for (let i = 0; i < MOST; i++) {
    // Most at the height of the grass tops, some up around your face, and a few high against the sky
    const up = rnd();
    const above = 0.65 + up * up * 1.9 + (rnd() < 0.06 ? 1.6 * rnd() : 0);
    const box = i % 2 ? FAR_BOX : NEAR_BOX;
    base.set([rnd() * box, rnd() * box, above, rnd()], i * 4);
    rand.set([rnd(), rnd(), rnd(), box], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOST * 3), 3));
  geo.setAttribute('aBase', new THREE.BufferAttribute(base, 4));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);

  const color = { value: new THREE.Color() };
  const shared = { uTime: U.uTime, uPeriod: U.uPeriod, uCam: U.uCam, uHeightTex: U.uHeightTex, uNoiseTex: U.uNoiseTex, uColor: color };
  const view = new THREE.ShaderMaterial({
    vertexShader: viewVert,
    fragmentShader: viewFrag,
    transparent: true,
    depthWrite: false,
    // (premultiplied: added to what's there where alpha is 0, covering it where alpha is 1. The alpha left alone: in the reflection, that's what tells sky from things: see land.js)
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    uniforms: { ...shared, uScale: { value: 1 }, uSize: { value: 0.4 }, uMinPx: { value: 3 }, uBright: { value: 1 }, uToon: U.uToon },
  });
  const points = new THREE.Points(geo, view);
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.visible = false;
  // A point's size is in pixels of whatever it's being drawn into, and the reflection is drawn smaller than the screen.
  const drawing = new THREE.Vector2();
  points.onBeforeRender = () => {
    renderer.getDrawingBufferSize(drawing);
    const target = renderer.getRenderTarget();
    const h = target ? target.height : drawing.y;
    view.uniforms.uScale.value = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    view.uniforms.uMinPx.value = Math.max(2, (2 * h) / 1000);
    view.uniformsNeedUpdate = true;
  };
  scene.add(points);

  // the light on the ground
  const glowRT = new THREE.WebGLRenderTarget(GLOW_RES, GLOW_RES, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  const lightMat = new THREE.ShaderMaterial({
    vertexShader: lightVert,
    fragmentShader: lightFrag,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    uniforms: { ...shared, uGlowAt: U.uGlowAt, uSpan: { value: 8 } },
  });
  const lightScene = new THREE.Scene();
  const lightPoints = new THREE.Points(geo, lightMat);
  lightPoints.frustumCulled = false;
  lightScene.add(lightPoints);
  const lightCam = new THREE.Camera();
  const clearColor = new THREE.Color();
  U.uGlow.value = glowRT.texture;

  return {
    rand,
    apply() {
      const n = tuning.night;
      color.value.set(n.fireflyColor);
      U.uFireflyCol.value.set(n.fireflyColor);
      const count = Math.min(MOST, Math.round(n.fireflies));
      geo.setDrawRange(0, count);
      view.uniforms.uSize.value = n.fireflySize;
      view.uniforms.uBright.value = n.fireflyBright;
      lightMat.uniforms.uSpan.value = (n.fireflyReach * 2 * GLOW_RES) / GLOW_SIZE;
      U.uGlowAmt.value = n.on && count > 0 ? n.fireflyLight : 0;
      points.visible = n.on && count > 0;
    },
    // once a frame, before the scene is drawn
    update(cam) {
      if (!points.visible) return;
      U.uGlowAt.value.set(cam.x, cam.z, GLOW_SIZE);
      const was = renderer.getRenderTarget();
      const alpha = renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      renderer.setRenderTarget(glowRT);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(lightScene, lightCam);
      renderer.setRenderTarget(was);
      renderer.setClearColor(clearColor, alpha);
    },
  };
}
