import * as THREE from 'three';
import { U } from './common.js';
import { tuning } from './tuning.js';
import { heightAt, PERIOD, fbm } from './terrain.js';
import { plantVert, plantFrag, polar, Ribbons } from './reeds.js';
import { plantShadowMaterial } from './plantShadow.js';

// 红蓼 (the 游龙 of the 诗经, as it's usually read): a plant of damp ground, as tall as a person's chest, its long spikes of small purple-red flowers hanging over at the
// top. It's here for its colour, which answers the purple-red the bones take from below, so there's little of it and it stands mostly round the bones:
// where you see red, there's something big lying near. Elsewhere only a stand now and then, on the wet ground.
// Stems, wind and distance go as the reeds' do (reeds.js), with the same near and far forms.

const vert = plantVert('uniform vec3 uSpike, uSpikeBase;', /* glsl */ `
    // the bare stalk it hangs from is green; then the flowers, paler where they begin
    base = mix(uStalk, mix(uSpikeBase, uSpike, smoothstep(0.3, 0.8, aS)), smoothstep(0.2, 0.3, aS));
    float visBare = clamp(H.a, 0.0, 1.0) * boneVis;
    if (uToon > 0.5) {
      // (a cloud's shadow as one tone on the lot, as on the plumes)
      float lit = step(0.5, visBare + (r2 - 0.5) * uToonA.x * 0.05);
      vec3 inShade = mix(base, uShade, uShadeMix);
      col = mix(inShade, base, lit);
      col = mix(col, inShade, step(uMisc.y * 0.5, 1.0 - cloudShade(b)) * uMisc.y);
    } else {
      float facing = clamp((dot(N, uSun) + 0.7) / (max(uSun.y, 0.2) + 0.7), 0.6, 1.2);
      // far off it's only partly flower: the leaves and the grass show through it
      vec3 sunlit = mix(base * (0.86 + 0.14 * facing), uLit, far * 0.25);
      col = mix(mix(base, uShade, uShadeMix * 0.8), sunlit, visBare * cloudShade(b));
    }
`);

// A spike: bare for a little, then beads of flower, which is what breaks its outline close to.
const BEADS = [0, 0.14, 0.26, 0.34, 0.42, 0.5, 0.58, 0.66, 0.74, 0.82, 0.9, 1];
const beaded = (w) => (q, i) => {
  if (q < 0.26) return w * 0.2;
  return w * (i % 2 ? 1.25 : 0.82) * (q > 0.95 ? 0.5 : 1);
};

function nearForm() {
  const r = new Ribbons();
  r.add({ part: 0, root: 0, len: 0.9, at: [0, 0.3, 0.6, 0.85, 1], width: (q) => 0.0075 - 0.0035 * q });
  // broad leaves, narrowing to a point
  [0.16, 0.26, 0.35, 0.44, 0.53, 0.62, 0.7].forEach((t0, i) => {
    const a = i * 2.4;
    r.add({
      part: 1,
      root: t0,
      len: 0.27 - 0.2 * (t0 - 0.16),
      dir: polar(a, 0.75),
      end: polar(a + 0.2, 1.75),
      phase: (i * 0.37) % 1,
      at: [0, 0.1, 0.25, 0.45, 0.65, 0.85, 1],
      width: (q) => 0.042 * Math.sin(Math.PI * q ** 0.62) + 0.0006,
    });
  });
  // the spikes, off the top of the stem: up and out, and over
  const SPIKES = 7;
  for (let k = 0; k < SPIKES; k++) {
    const out = 0.2 + 0.8 * ((k * 0.618) % 1);
    const a = k * 2.39996;
    r.add({
      part: 2,
      root: 0.62 + 0.28 * (k / SPIKES),
      len: 0.2 + 0.1 * ((k * 0.382) % 1),
      dir: polar(a, 0.2 + out * 0.7),
      end: polar(a + 0.3, 2.2 + out * 0.7),
      phase: (k * 0.37) % 1,
      at: BEADS,
      width: beaded(0.0062),
    });
  }
  return r;
}

// half the resolution in the reflection: much less of it, each piece wider
function mirrorForm() {
  const r = new Ribbons();
  r.add({ part: 0, root: 0, len: 0.9, at: [0, 0.5, 1], width: () => 0.007 });
  [0.26, 0.44, 0.62].forEach((t0, i) => {
    r.add({ part: 1, root: t0, len: 0.25, dir: polar(i * 2.4, 0.75), end: polar(i * 2.4, 1.75), at: [0, 0.4, 1], width: (q) => 0.05 * Math.sin(Math.PI * q ** 0.62) + 0.001 });
  });
  for (let k = 0; k < 5; k++) {
    const a = k * 2.39996;
    r.add({ part: 2, root: 0.75 + 0.03 * k, len: 0.26, dir: polar(a, 0.6), end: polar(a, 2.6), phase: k * 0.2, at: [0, 0.3, 0.65, 1], width: (q, i) => [0.004, 0.012, 0.014, 0.006][i] });
  }
  return r;
}

function farForm() {
  const r = new Ribbons();
  r.add({ part: 0, root: 0, len: 0.86, at: [0, 0.5, 1], width: () => 0.009 });
  r.add({ part: 1, root: 0.1, len: 0.64, at: [0, 0.35, 0.7, 1], width: (q, i) => [0.012, 0.055, 0.045, 0.008][i] });
  r.add({ part: 2, root: 0.74, len: 0.3, dir: polar(0, 0.4), end: polar(0, 2.5), at: [0, 0.3, 0.65, 1], width: (q, i) => [0.012, 0.04, 0.045, 0.012][i] });
  return r;
}

// Where they stand: x, z, ground, height + yaw, r1, r2, the stand's own. Stand after stand, in no order, so a lower amount thins them evenly.
function plant({ start, bones }) {
  let seed = 51749;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const spots = bones?.spots || [];
  const inBone = (x, z) => spots.some((b) => Math.hypot(b.x - x, b.z - z) < b.r * 0.75);
  const stands = [];
  const stand = (x, z, R) => {
    const n = Math.round(R * R * 3.2 * (0.7 + rnd() * 0.6)) + 5;
    const tall = 1.15 + rnd() * 0.55;
    const own = rnd();
    const stems = [];
    for (let i = 0; i < n; i++) {
      const u = Math.sqrt(-2 * Math.log(rnd() + 1e-6)) * Math.cos(6.283 * rnd());
      const v = Math.sqrt(-2 * Math.log(rnd() + 1e-6)) * Math.cos(6.283 * rnd());
      const sx = x + u * R * 0.55;
      const sz = z + v * R * 0.55;
      const g = heightAt(sx, sz);
      if (g < 0.02 || g > 9 || inBone(sx, sz) || Math.hypot(sx - start.x, sz - start.z) < 7) continue;
      // lower at a stand's edges
      const edge = Math.min(1, Math.hypot(u, v) / 2.4);
      stems.push(sx, sz, g, tall * (0.68 + 0.42 * rnd()) * (1 - 0.32 * edge), rnd() * 6.283, rnd(), rnd(), own);
    }
    if (stems.length) stands.push({ x, z, R, stems });
  };
  // Round the bones, the dragon's among them
  for (const b of spots) {
    if (rnd() > 0.95) continue;
    const many = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < many; i++) {
      const a = rnd() * 6.283;
      const d = b.r * (0.95 + rnd() * 1.0) + 1;
      stand(b.x + Math.cos(a) * d, b.z + Math.sin(a) * d, 1.4 + rnd() * 2.4);
    }
  }
  // and here and there on the wet ground
  const mask = fbm(229, 6, 3);
  for (let tries = 0, n = 0; tries < 20000 && n < 70; tries++) {
    const x = rnd() * PERIOD;
    const z = rnd() * PERIOD;
    const h = heightAt(x, z);
    if (h < 0.04 || h > 0.8 || mask(x / PERIOD, z / PERIOD) < 0.05) continue;
    n++;
    stand(x, z, 1 + rnd() * 2.2);
  }
  for (let i = stands.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [stands[i], stands[j]] = [stands[j], stands[i]];
  }
  return stands;
}

export function createFlowers({ scene, baked, start, bones }) {
  const stands = plant({ start, bones });
  const count = stands.reduce((sum, s) => sum + s.stems.length / 8, 0);
  const stemAll = new Float32Array(count * 4);
  const randAll = new Float32Array(count * 4);
  let at = 0;
  for (const s of stands) {
    // the grass around them lies low, or it hides what's under the spikes
    baked.flatten(s.x, s.z, s.R * 1.3, (dx, dz) => (1 - THREE.MathUtils.smoothstep(Math.hypot(dx, dz) / (s.R * 1.3), 0.4, 1)) * 0.7);
    for (let i = 0; i < s.stems.length; i += 8) {
      stemAll.set(s.stems.slice(i, i + 4), at * 4);
      randAll.set(s.stems.slice(i + 4, i + 8), at * 4);
      at++;
    }
  }
  const NEAR_MAX = 3000;
  const stemNear = new THREE.InstancedBufferAttribute(new Float32Array(NEAR_MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const randNear = new THREE.InstancedBufferAttribute(new Float32Array(NEAR_MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);

  const shared = {
    uKeep: { value: 1 }, uTall: { value: 1 }, uBend: { value: 0.5 }, uFlutterR: { value: 0.03 }, uClipY: { value: -1000 },
    uDroop: { value: 1 }, uStreamR: { value: 1 }, uShadeMix: { value: 0.5 }, uTuftR: { value: 0 }, uTwinkleR: { value: 0 }, uFineWide: { value: 0.035 }, uNoSheen: { value: 1 }, uShadowWide: { value: 1.5 },
   
    uCull: { value: 0.1 }, uViewDir: { value: new THREE.Vector3() },
    uLeaf: { value: new THREE.Color() }, uLeaf2: { value: new THREE.Color() }, uStalk: { value: new THREE.Color() }, uSpike: { value: new THREE.Color() }, uSpikeBase: { value: new THREE.Color() },
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
  const shadowMesh = new THREE.Mesh(mirrorForm().geometry({ stem: stemNear, rand: randNear }), plantShadowMaterial(vert, { ...U, ...shared, uIsNear: { value: 1 } }));
  shadowMesh.frustumCulled = false;

  const last = new THREE.Vector2(1e9, 1e9);
  const R = 76;
  let drawn = 0;
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
  }

  return {
    count,
    shadowMesh,
    stands: stands.length,
    get drawn() { return drawn; },
    get nearCount() { return near.geometry.instanceCount; },
    apply() {
      const t = tuning.flowers;
      const want = Math.round(count * Math.min(t.amount, 1));
      let n = 0;
      for (const s of stands) {
        if (n >= want) break;
        n += s.stems.length / 8;
      }
      if (n !== drawn) {
        drawn = n;
        far.geometry.instanceCount = n;
        last.set(1e9, 1e9); // the near ones are picked again
      }
      const keep = t.amount > 0;
      far.visible = keep;
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
      shared.uSpike.value.set(t.spike);
      shared.uSpikeBase.value.set(t.spikeBase);
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
    forMirror(on) {
      near.visible = !on;
      mirrored.visible = on;
      shared.uClipY.value = on ? 0 : -1000;
    },
  };
}
