import * as THREE from 'three';
import { U } from './common.js';
import { tuning, loadTuning, withLook } from './tuning.js';
import { createSound, hear, strideLength } from './sound.js';
import { buildLand, setLand, START, heightAt, PERIOD } from './terrain.js';
import { createGrass } from './grass.js';
import { createLand } from './land.js';
import { createWind } from './wind.js';
import { createWaves } from './waves.js';
import { createFireflies } from './fireflies.js';
import { createBones } from './bones.js';
import { createReeds } from './reeds.js';
import { createFlowers } from './flowers.js';
import { createPlantShadow } from './plantShadow.js';
import { createBirds } from './birds.js';
import { createFog } from './fog.js';
import { createMenu } from './menu.js';

THREE.ColorManagement.enabled = false; // all colours are the sRGB values chosen, mixed and shown as they are

const msg = document.getElementById('msg');
setLand('caozhou');
await loadTuning();
// it opens in the mist
tuning.night.on = false;
tuning.mist.on = true;
await new Promise((r) => setTimeout(r, 30)); // let the loading message show before the long bake (a frame may never come in a hidden tab)

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, tuning.camera.pixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.getContext().getExtension('OES_texture_float_linear');
document.body.prepend(renderer.domElement);

const baked = buildLand();
U.uHeightTex.value = baked.heightTex;
U.uCombTex.value = baked.combTex;
U.uKindsTex.value = baked.kindsTex;
U.uNoiseTex.value = baked.noiseTex;
U.uPeriod.value = PERIOD;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(tuning.camera.fov, innerWidth / innerHeight, 0.1, 3200);
const grass = createGrass(scene);
const land = createLand(scene, true);
const wind = createWind(renderer);
const waves = createWaves(renderer);
const fog = createFog(renderer, camera);
let bones = null;
let reeds = null;
let flowers = null;
let plantShadow = null;
let birds = null;

// the water's reflection: the scene seen from under the water, read back at each point of the water
const mirrorCam = new THREE.PerspectiveCamera();
const mirrorVP = new THREE.Matrix4();
const mirrorTarget = new THREE.WebGLRenderTarget(4, 4, { samples: 2, type: THREE.UnsignedByteType });
const drawing = new THREE.Vector2();
function sizeMirror() {
  renderer.getDrawingBufferSize(drawing);
  mirrorTarget.setSize(Math.max(4, drawing.x >> 1), Math.max(4, drawing.y >> 1));
  fog.resize();
}
function renderMirror() {
  mirrorCam.fov = camera.fov;
  mirrorCam.aspect = camera.aspect;
  mirrorCam.near = camera.near;
  mirrorCam.far = camera.far;
  mirrorCam.updateProjectionMatrix();
  mirrorCam.position.set(me.x, -me.y, me.z);
  mirrorCam.up.set(0, 1, 0);
  mirrorCam.lookAt(me.x + forward.x, -me.y - forward.y, me.z + forward.z);
  mirrorCam.updateMatrixWorld();
  mirrorVP.multiplyMatrices(mirrorCam.projectionMatrix, mirrorCam.matrixWorldInverse);
  // (the volumetric mist is laid over the view afterwards: the reflection gets the plain kind, drawn into it)
  const mistHere = U.uMist.value.x;
  if (fog.active) U.uMist.value.x = tuning.mist.density;
  grass.forMirror(true);
  land.forMirror(true);
  bones?.forMirror(true);
  reeds?.forMirror(true);
  flowers?.forMirror(true);
  birds?.forMirror(true);
  renderer.setRenderTarget(mirrorTarget);
  renderer.render(scene, mirrorCam);
  renderer.setRenderTarget(null);
  grass.forMirror(false);
  land.forMirror(false);
  bones?.forMirror(false);
  reeds?.forMirror(false);
  flowers?.forMirror(false);
  birds?.forMirror(false);
  land.setMirror(mirrorTarget.texture, mirrorVP);
  U.uMist.value.x = mistHere;
}

const mirrorAt = new THREE.Vector3(1e9, 0, 0);
function draw() {
  if (fog.active) fog.render(scene);
  else renderer.render(scene, camera);
}

function needMirror(n) {
  const moved = mirrorAt.distanceToSquared(camera.position) > 1e-6;
  if (!moved && n % 2 !== 0) return false;
  mirrorAt.copy(camera.position);
  return true;
}

function sunVector() {
  const az = THREE.MathUtils.degToRad(tuning.light.az);
  const el = THREE.MathUtils.degToRad(tuning.light.el);
  return [az, el, new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))];
}

function bakeSun() {
  withLook(() => {
    const [az, el] = sunVector();
    baked.bakeSun(az, el);
  });
  bones?.sunMoved();
}

// Seven moons along part of a circle on the sky, its centre below the horizon as a rainbow's is, in the order of the phases, the full one at the top.
// Each has its lit side towards the full one, along the arch, as in the usual row of phases.
const PHASES = [140, 90, 42, 0, 42, 90, 140];
function placeMoons() {
  const n = tuning.night;
  const deg = THREE.MathUtils.degToRad;
  const az = deg(n.az);
  const rise = deg(n.rise);
  const rad = deg(n.radius);
  const F = new THREE.Vector3(Math.sin(az) * Math.cos(rise), Math.sin(rise), Math.cos(az) * Math.cos(rise));
  const R = new THREE.Vector3(-Math.cos(az), 0, Math.sin(az));
  const Up = new THREE.Vector3().crossVectors(R, F);
  const at = (u) => { // u 0..1 along the arc, from the left
    const a = Math.PI / 2 + deg(n.span) * (0.5 - u);
    return F.clone().multiplyScalar(Math.cos(rad)).addScaledVector(R, Math.sin(rad) * Math.cos(a)).addScaledVector(Up, Math.sin(rad) * Math.sin(a));
  };
  // Evenly spaced on the sky they aren't evenly spaced on the screen: a flat picture stretches what's away from its middle. So work out
  // where they'd be even as seen when facing the arc's middle (distances along the arc in that flat picture), and go that share of the way.
  // The ends stay where they are. It can only be right from one direction: facing one end, the moons there are closer together by as much.
  const DENSE = 240;
  const V = new THREE.Vector3();
  for (let i = 0; i <= DENSE; i++) V.add(at(i / DENSE));
  V.normalize();
  const flat = [0];
  let was = null;
  for (let i = 0; i <= DENSE; i++) {
    const m = at(i / DENSE);
    const p = m.divideScalar(m.dot(V));
    if (was) flat.push(flat[flat.length - 1] + p.distanceTo(was));
    was = p;
  }
  const evenAt = (k) => {
    const want = (flat[DENSE] * k) / 6;
    let i = 0;
    while (i < DENSE - 1 && flat[i + 1] < want) i++;
    return (i + (want - flat[i]) / Math.max(flat[i + 1] - flat[i], 1e-6)) / DENSE;
  };
  const moonAt = (k) => at(THREE.MathUtils.lerp(k / 6, evenAt(k), n.even));
  const top = moonAt(3);
  for (let i = 0; i < 7; i++) {
    const m = moonAt(i);
    const size = deg(n.size) * (i === 3 ? n.full : 1);
    U.uMoon.value[i].set(m.x, m.y, m.z, size);
    const lit = i === 3 ? R.clone() : top.clone().addScaledVector(m, -top.dot(m)).normalize();
    U.uMoonLit.value[i].copy(lit);
    U.uMoonPhase.value[i] = deg(PHASES[i]);
  }
  U.uMoonCol.value.set(n.moon);
  U.uMoonDark.value.set(n.moonDark);
  U.uMoonGlow.value.set(n.glow);
  U.uStars.value = n.stars;
  U.uCrescent.value = n.crescent;
  U.uNight.value = n.on ? 1 : 0;
}

function setNight(on) {
  tuning.night.on = on;
  apply();
  bakeSun();
}

function setMist(on) {
  tuning.mist.on = on;
  if (on && tuning.night.on) tuning.night.on = false;
  apply();
  bakeSun();
}

let hazeBase = 0;
let hazeRise = 0;
let sound = null;
let fireflies = null;
// The clouds are where a noise pattern passes 0.62. This is the level to pass for a given share of the sky to be cloud, measured off the
// noise texture; what's returned is how much to raise the pattern by instead. (A share of 0.34 is the level itself, so it adds nothing.)
const COVER_LEVELS = [[0, 1.1], [0.01, 0.931], [0.05, 0.862], [0.1, 0.806], [0.25, 0.678], [0.34, 0.62], [0.5, 0.517], [0.75, 0.359], [0.9, 0.241], [0.95, 0.171], [0.99, 0.08], [1, -0.04]];
function cloudOffset(share) {
  let i = 1;
  while (i < COVER_LEVELS.length - 1 && COVER_LEVELS[i][0] < share) i++;
  const [a, la] = COVER_LEVELS[i - 1];
  const [b, lb] = COVER_LEVELS[i];
  return 0.62 - (la + (lb - la) * (share - a) / (b - a));
}
function apply() {
  placeMoons();
  const m = tuning.mist;
  const misty = m.on && !tuning.night.on;
  U.uMist.value.set(misty && !fog.active ? m.density : 0, m.height, m.patch, misty ? m.soft : 0);
  fog.apply();
  withLook(applyLook);
  sound?.apply();
}

function applyLook() {
  const { wind: w, light: l, color: c } = tuning;
  const a = THREE.MathUtils.degToRad(w.az);
  U.uWindDir.value.set(Math.sin(a), Math.cos(a));
  U.uSun.value.copy(sunVector()[2]);
  U.uBladeLook.value.set(l.kd, tuning.gloss.press, l.nap, l.bias);
  U.uBandLook.value.set(l.band, l.bandAmt, l.backSlope, tuning.gloss.shine);
  U.uGlossA.value.set(tuning.gloss.spec, tuning.gloss.shineFar, tuning.gloss.sky, tuning.gloss.facing);
  U.uGlossB.value.set(tuning.gloss.gap, tuning.gloss.gapDist, tuning.gloss.scatter, 0);
  U.uMisc.value.set(l.vary, l.cloud, l.cloudSize, l.cloudSpeed);
  U.uCloudCover.value = cloudOffset(l.cover);
  U.uCloudLink.value = l.cloudLink;
  const sun = tuning.sun;
  hazeBase = l.haze * sun.clear;
  hazeRise = l.hazeUp;
  U.uHaze.value = hazeBase;
  U.uSunA.value.set(sun.relief, sun.saturate, sun.glow, sun.contrast);
  U.uSunB.value.set(1, sun.depth, 0, 0);
  U.uTransCol.value.set(sun.glowColor);
  U.uCloudShadeCol.value.set(sun.cloudBlue);
  U.uStemAmt.value = l.stem;
  U.uWetCol.value.set(c.wet);
  U.uWet.value.set(tuning.shore.wet, tuning.shore.wetTo);
  U.uLit.value.set(c.lit);
  U.uLit2.value.set(c.lit2);
  U.uShade.value.set(c.shade);
  U.uBandCol.value.set(c.band);
  U.uSheenCol.value.set(c.sheen);
  U.uGustCol.value.set(c.gust);
  U.uStem.value.set(c.stem);
  U.uHazeCol.value.set(c.haze);
  U.uSkyTop.value.set(c.skyTop).lerp(new THREE.Color(sun.zenith), sun.sky);
  U.uSkyLow.value.set(c.skyLow).lerp(new THREE.Color(sun.horizon), sun.sky);
  U.uHazeCol.value.lerp(new THREE.Color(sun.horizon), sun.sky);
  U.uCloudCol.value.set(c.cloud);
  const kinds = tuning.kinds;
  U.uKinds.value.set(kinds.amount, kinds.straw);
  U.uKindDry.value.set(kinds.dry);
  U.uKindCool.value.set(kinds.cool);
  U.uKindRose.value.set(kinds.rose);
  const halo = tuning.halo;
  U.uHalo.value.set(halo.ring * halo.amount, THREE.MathUtils.degToRad(halo.radius), halo.suns * halo.amount, halo.size);
  U.uHaloB.value.set(halo.pillar * halo.amount, halo.circle * halo.amount, halo.arcs * halo.amount, halo.bigShare * halo.ring * halo.amount);
  U.uHaloC.value.set(halo.zenith * halo.amount, halo.through, THREE.MathUtils.degToRad(halo.bigRadius), 0);
  // The zenith arc: light in through the flat top of a plate and out through its side. Above a sun 32 degrees high that no longer gets out at all; it's held at the last of it.
  U.uHaloD.value = Math.asin(Math.min(0.985, Math.sqrt(Math.max(1.716 - (1 - U.uSun.value.y * U.uSun.value.y), 0))));
  U.uHaloCol.value.set(halo.color);
  U.uSunShow.value.set(halo.sun, halo.sunThrough, halo.sunSize);
  grass.apply();
  land.apply();
  wind.apply();
  fireflies?.apply();
  U.uToon.value = tuning.toon.on ? 1 : 0;
  U.uToonA.value.set(tuning.toon.strand, tuning.toon.gust, tuning.toon.sheen, tuning.toon.hazeSteps);
  U.uCloudForm.value.set(tuning.toon.clouds, tuning.toon.cloudTall, tuning.night.on ? tuning.night.softClouds : tuning.mist.on ? tuning.mist.softClouds : tuning.toon.softClouds);
  bones?.apply();
  reeds?.apply();
  flowers?.apply();
  plantShadow?.apply();
  birds?.apply();
  camera.fov = tuning.camera.fov;
  camera.updateProjectionMatrix();
}
apply();
bakeSun();

// walking
const start = START;
const me = {
  x: start.x,
  z: start.z,
  y: 0,
  yaw: start.yaw,
  pitch: -0.1,
  speed: 0,
  stride: 0.8, // how far through a step
  aimX: 0, // where the walker's passage disturbs the grass and water, from where they are
  aimZ: 0,
  steps: 0, // how many so far: what the sound goes by
};
me.y = heightAt(me.x, me.z) + tuning.camera.eye;
const keys = new Set();
// W twice quickly, and hold: running, for as long as it's held
const DOUBLE_TAP = 0.3;
let lastForward = -1;
let sprint = false;
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if ((e.code === 'KeyW' || e.code === 'ArrowUp') && !e.repeat) {
    const now = performance.now() / 1000;
    sprint = now - lastForward < DOUBLE_TAP;
    lastForward = now;
  }
  if (e.code === 'KeyN') setNight(!tuning.night.on);
  if (e.code === 'KeyM') setMist(!tuning.mist.on);
  if (e.code === 'KeyV') {
    tuning.sound.on = !tuning.sound.on;
    sound?.apply();
  }
  if (e.code === 'KeyB') {
    tuning.sound.musicOn = !tuning.sound.musicOn;
    sound?.apply();
  }
  menu.refresh();
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'KeyW' || e.code === 'ArrowUp') sprint = false;
});
addEventListener('blur', () => {
  keys.clear();
  sprint = false;
});
let dragging = false;
let px = 0;
let py = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true;
  px = e.clientX;
  py = e.clientY;
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointerup', () => { dragging = false; });
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  me.yaw -= (e.clientX - px) * 0.0032;
  me.pitch = THREE.MathUtils.clamp(me.pitch - (e.clientY - py) * 0.0032, -1.45, 1.2);
  px = e.clientX;
  py = e.clientY;
});

// A browser lets a page make sound only once someone has clicked or pressed something on it, so it's made then.
function wakeSound() {
  if (!sound) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    sound = createSound(new Ctx({ latencyHint: 'balanced' }));
    sound.apply();
  }
  sound.resume();
}
addEventListener('pointerdown', wakeSound);
addEventListener('keydown', wakeSound);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sound?.suspend();
  else sound?.resume();
});
const listening = () => ({ me, wind, heightAt, reeds, bones, time, period: PERIOD, night: tuning.night.on, mist: tuning.mist.on && !tuning.night.on });
let heardAt = 0;
function updateSound(now) {
  if (!sound || now - heardAt < 90) return;
  heardAt = now;
  sound.update(hear(listening()), sound.context.currentTime + 0.05);
}

const forward = new THREE.Vector3();
function placeCamera() {
  forward.set(Math.sin(me.yaw) * Math.cos(me.pitch), Math.sin(me.pitch), Math.cos(me.yaw) * Math.cos(me.pitch));
  camera.position.set(me.x, me.y, me.z);
  camera.lookAt(me.x + forward.x, me.y + forward.y, me.z + forward.z);
  camera.updateMatrixWorld();
  U.uCam.value.copy(camera.position);
  player.pos.copy(camera.position);
  fireflies?.update(camera.position);
  // the mist lies low over the wet ground: climb, and it's beneath you
  U.uHaze.value = hazeBase * (1 - hazeRise * THREE.MathUtils.smoothstep(me.y, 4, 26));
  bones?.update(camera.position);
  reeds?.update(camera.position, forward, camera);
  flowers?.update(camera.position, forward, camera);
  plantShadow?.update(camera.position);
  grass.update(forward, camera);
  land.update(camera.position);
}

// which way the keys are taking you
const sign = (f, s, yaw) => ({ x: Math.sin(yaw) * f - Math.cos(yaw) * s, z: Math.cos(yaw) * f + Math.sin(yaw) * s });

// a step: in the water, it makes a ring a little way ahead, and the sound goes with it
function stride(dt) {
  me.stride += (me.speed * dt) / strideLength(me.speed);
  if (me.stride < 1) return;
  me.stride -= 1;
  me.steps++;
  // (it goes in where the walker's reach is, below)
  const rx = me.x + me.aimX;
  const rz = me.z + me.aimZ;
  const depth = -heightAt(rx, rz);
  if (depth > 0.01 && tuning.walk.ripple > 0) {
    const v = THREE.MathUtils.smoothstep(depth, 0.01, 0.2) * (me.speed > 6 ? 1.3 : 1) * tuning.walk.ripple;
    waves.step(rx, rz, v);
  }
}

function move(dt) {
  const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const run = sprint || keys.has('ShiftLeft') || keys.has('ShiftRight');
  const want = run ? tuning.walk.run : tuning.walk.speed;
  const n = Math.hypot(f, s);
  me.speed += (want * (n > 0 ? 1 : 0) - me.speed) * (1 - Math.exp(-dt * 6));
  if (n > 0) {
    const sy = Math.sin(me.yaw);
    const cy = Math.cos(me.yaw);
    const step = (me.speed * dt) / n;
    me.x += (sy * f - cy * s) * step;
    me.z += (cy * f + sy * s) * step;
  }
  if (n > 0 && me.speed > 0.5) stride(dt);
  else if (n === 0) me.stride = 0.8;
  // Where the walker's passage disturbs things: that's at the feet, but what's at your feet is below the bottom of the picture, and walking, you
  // outpace the water's waves and leave it all behind you. So it's put where the ground comes into the picture, a little further on, however
  // far you're looking down. (Eased: a nod of the head doesn't throw it about.)
  const lean = n > 0 ? THREE.MathUtils.smoothstep(me.speed, 0.4, 2.6) : 0;
  const lookAngle = Math.max((tuning.camera.fov * Math.PI) / 360 - me.pitch, 0.25);
  const bottom = THREE.MathUtils.clamp(tuning.camera.eye / Math.tan(lookAngle) + 0.9, 0.8, 6) * tuning.walk.reach * lean;
  if (n > 0) {
    const way = sign(f, s, me.yaw);
    const ease = 1 - Math.exp(-dt * 5);
    me.aimX += ((way.x / n) * bottom - me.aimX) * ease;
    me.aimZ += ((way.z / n) * bottom - me.aimZ) * ease;
  } else {
    const ease = 1 - Math.exp(-dt * 3);
    me.aimX -= me.aimX * ease;
    me.aimZ -= me.aimZ * ease;
  }
  const ground = Math.max(heightAt(me.x, me.z), -0.6);
  me.y += (ground + tuning.camera.eye - me.y) * (1 - Math.exp(-dt * 8));
}

// what the birds keep an eye on
const player = {
  pos: new THREE.Vector3(),
  get speed() { return me.speed; },
};

// what the walker's passage does to the grass and the water, once a frame
function stirred(dt) {
  const x = me.x + me.aimX;
  const z = me.z + me.aimZ;
  wind.tread(dt, x, z, me.speed, true);
  // and in the water, a low steady push from whatever's moving through it, under the steps
  const depth = -heightAt(x, z);
  const moving = me.speed > 0.5 && depth > 0.01;
  waves.update(dt, me.x, me.z, x, z, moving ? THREE.MathUtils.smoothstep(depth, 0.01, 0.2) * tuning.walk.ripple : 0);
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  sizeMirror();
}
addEventListener('resize', resize);

const toggle = (key) => ({
  get: () => tuning.sound[key],
  set: (v) => {
    tuning.sound[key] = v;
    sound?.apply();
  },
});
const menu = createMenu({
  weathers: [['晴', 'day'], ['雾', 'mist'], ['夜', 'night']],
  weather: {
    get: () => (tuning.night.on ? 'night' : tuning.mist.on ? 'mist' : 'day'),
    set: (w) => {
      tuning.night.on = w === 'night';
      tuning.mist.on = w === 'mist';
      apply();
      bakeSun();
    },
  },
  music: toggle('musicOn'),
  sound: toggle('on'),
});

placeCamera();
sizeMirror();
bones = await createBones({ scene, renderer, baked, start });
withLook(() => bones.apply());
bones.update(camera.position);
// (before the reeds: they keep what's been laid flat so far as what they go back to)
flowers = createFlowers({ scene, baked, start, bones });
withLook(() => flowers.apply());
flowers.update(camera.position, forward, camera);
reeds = createReeds({ scene, baked, start, bones });
withLook(() => reeds.apply());
reeds.update(camera.position, forward, camera);
plantShadow = createPlantShadow({ renderer, casters: [reeds.shadowMesh, flowers.shadowMesh] });
withLook(() => plantShadow.apply());
plantShadow.update(camera.position);
fireflies = createFireflies({ scene, renderer, camera });
fireflies.apply();
if (tuning.birds.count > 0) {
  birds = createBirds({ scene, bones, reeds, startView: start });
  withLook(() => birds.apply());
  birds.sync(camera.position);
}
wind.warm(0, camera.position);
renderMirror();
draw();
msg.remove();

let time = 0;
let last = performance.now();
let frameNo = 0;
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  move(dt);
  U.uTime.value = time;
  placeCamera();
  stirred(dt);
  wind.step(dt, time, camera.position);
  birds?.update(dt, player);
  // The reflection is costly. Standing still, every other frame will do: each frame reads it with the camera it was drawn from, and
  // turning the head changes nothing in it. Walking, it must be every frame: read from where the camera was, it stands still for a
  // frame and then jumps two steps, and the water judders while all the rest moves smoothly.
  if (needMirror(frameNo++)) renderMirror();
  draw();
  updateSound(now);
}
requestAnimationFrame(tick);
