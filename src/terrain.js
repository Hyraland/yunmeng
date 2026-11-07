import * as THREE from 'three';

// The land is baked once into tiling textures, so walking in any direction never ends:
//   height texture: R height (m, water level is 0), G/B the terrain normal's x/z, A sun visibility of hills
//   comb texture:   RG the combed direction relative to the wind, B blade length, A colour patch
//   noise texture:  four independent tiling fractal noises

// Two lands. 草原: round hills with lakes set among them. 草洲: as on 洞庭 or 鄱阳 at low water, nearly flat, the water shallow and
// everywhere, in dish-shaped pools joined by winding channels, with only a few low rises.
const LANDS = {
  steppe: { period: 700, start: { x: 470, z: 260, yaw: 2.618 }, dry: 0.7, boneRise: Infinity },
  caozhou: { period: 1000, start: { x: 140, z: 510, yaw: 5.76 }, dry: 0.22, boneRise: 1.6, dragon: { x: 140, z: 840 } }, // dragon: flat, half in the shallows, overlooked from the highest ridge
};
export let PERIOD = LANDS.steppe.period; // m, the land repeats after this
// where you arrive: fixed, so tuning the wind or the sun never moves the land's contents
export let START = LANDS.steppe.start;
export let DRY = LANDS.steppe.dry; // ground higher than this is dry enough to lay bones on
export let DRAGON = null; // where the great spine lies coiled, if this land has it
export let BONE_RISE = LANDS.steppe.boneRise; // m: bones lie where the ground rises less than this across them, or a slope swallows one side
let landName = 'steppe';
export function setLand(name) {
  landName = name;
  PERIOD = LANDS[name].period;
  START = LANDS[name].start;
  DRY = LANDS[name].dry;
  BONE_RISE = LANDS[name].boneRise;
  DRAGON = LANDS[name].dragon || null;
}
const N = 1024;

function lattice(seed, per) {
  let s = seed >>> 0;
  const v = new Float32Array(per * per);
  for (let i = 0; i < v.length; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    v[i] = ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
  }
  return v;
}

// a tiling fractal noise over u, v in [0, 1), roughly in [-1, 1]
export function fbm(seed, per, octaves, gain = 0.5) {
  const tabs = [];
  let amp = 1;
  let sum = 0;
  for (let o = 0; o < octaves; o++) {
    const p = per << o;
    tabs.push({ p, amp, v: lattice(seed + o * 1009, p) });
    sum += amp;
    amp *= gain;
  }
  return (u, v) => {
    let out = 0;
    for (const t of tabs) {
      const x = ((u % 1) + 1) % 1 * t.p;
      const y = ((v % 1) + 1) % 1 * t.p;
      const x0 = x | 0;
      const y0 = y | 0;
      const x1 = x0 + 1 === t.p ? 0 : x0 + 1;
      const y1 = y0 + 1 === t.p ? 0 : y0 + 1;
      const fx = x - x0;
      const fy = y - y0;
      const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
      const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
      const a = t.v[y0 * t.p + x0];
      const b = t.v[y0 * t.p + x1];
      const c = t.v[y1 * t.p + x0];
      const d = t.v[y1 * t.p + x1];
      out += t.amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
    return out / sum;
  };
}

function texture(data, size, type) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, type);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const land = new Float32Array(N * N);

// bilinear, the same as the GPU's reading of the height texture
export function heightAt(x, z) {
  const u = ((x / PERIOD) % 1 + 1) % 1 * N - 0.5;
  const v = ((z / PERIOD) % 1 + 1) % 1 * N - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const at = (i, j) => land[((j + N) % N) * N + ((i + N) % N)];
  const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
  const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
  return a + (b - a) * fy;
}

const sstep = (x, a, b) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function shapeSteppe() {
  // hills and shallow basins: one noise, with the part under a chosen level squeezed into a shallow floor
  const warpX = fbm(31, 5, 3);
  const warpY = fbm(47, 5, 3);
  const base = fbm(11, 7, 5, 0.46);
  const hummock = fbm(23, 20, 3);
  const raw = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const v = j / N;
      raw[j * N + i] = base(u + warpX(u, v) * 0.05, v + warpY(u, v) * 0.05);
    }
  }
  const sorted = Float32Array.from(raw).sort();
  const level = sorted[Math.floor(N * N * 0.3)]; // about 30% of the land is water
  const top = sorted[Math.floor(N * N * 0.998)];
  const HILL = 14;
  const DEPTH = 0.6;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = (raw[j * N + i] - level) / (top - level);
      land[j * N + i] = x > 0
        ? HILL * Math.pow(x, 1.3) + 0.7 * hummock(i / N, j / N) * Math.min(1, x * 6)
        : -DEPTH * (1 - Math.exp(x * 9));
    }
  }
}

// a few long hills to look out from: where in the land, half length and half width (m), which way the long side runs, height (m).
// The steep side is the one the long axis's normal points to. Placed by hand, so that one stands in view of where you arrive,
// with its sunlit face towards you.
const HILLS = [
  { x: 285, z: 735, a: 170, b: 118, turn: 0.5, h: 30 },
  { x: 720, z: 300, a: 150, b: 95, turn: 2.1, h: 21 },
  { x: 590, z: 870, a: 115, b: 85, turn: 1.2, h: 15 },
  { x: 905, z: 660, a: 175, b: 110, turn: 2.8, h: 26 },
  { x: 95, z: 130, a: 105, b: 75, turn: 0.2, h: 12 },
];
const BANK_SLOPE = 0.72; // nothing is steeper than this (about 36 degrees): a height cell is a metre wide, and grass needs a surface to stand on

// the smaller of a and b, rounded where they meet
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

// Only ever lowers ground, so the water stays as it was: any point may stand at most `slope` above any point near it. Rough on its
// own (it leaves a crease at the top of each bank), so a light blur follows.
function limitSlope(h, slope, cell) {
  const s1 = slope * cell;
  const s2 = s1 * Math.SQRT2;
  const relax = (k, o, s) => {
    if (h[k] > h[o] + s) h[k] = h[o] + s;
  };
  for (let pass = 0; pass < 3; pass++) {
    for (let j = 0; j < N; j++) {
      const jm = (j + N - 1) % N;
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const im = (i + N - 1) % N;
        const ip = (i + 1) % N;
        relax(k, j * N + im, s1);
        relax(k, jm * N + i, s1);
        relax(k, jm * N + im, s2);
        relax(k, jm * N + ip, s2);
      }
    }
    for (let j = N - 1; j >= 0; j--) {
      const jp = (j + 1) % N;
      for (let i = N - 1; i >= 0; i--) {
        const k = j * N + i;
        const im = (i + N - 1) % N;
        const ip = (i + 1) % N;
        relax(k, j * N + ip, s1);
        relax(k, jp * N + i, s1);
        relax(k, jp * N + ip, s2);
        relax(k, jp * N + im, s2);
      }
    }
  }
}

function blur(h, radius, passes) {
  const tmp = new Float32Array(N * N);
  const norm = 1 / (2 * radius + 1);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < N; j++) {
      let sum = 0;
      for (let d = -radius; d <= radius; d++) sum += h[j * N + ((d + N) % N)];
      for (let i = 0; i < N; i++) {
        tmp[j * N + i] = sum * norm;
        sum += h[j * N + ((i + radius + 1) % N)] - h[j * N + ((i - radius + N) % N)];
      }
    }
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let d = -radius; d <= radius; d++) sum += tmp[((d + N) % N) * N + i];
      for (let j = 0; j < N; j++) {
        h[j * N + i] = sum * norm;
        sum += tmp[((j + radius + 1) % N) * N + i] - tmp[((j - radius + N) % N) * N + i];
      }
    }
  }
}

function shapeCaozhou() {
  const warpX = fbm(131, 4, 3);
  const warpY = fbm(147, 4, 3);
  const base = fbm(111, 8, 5, 0.55); // the pools, from a hundred metres across down to puddles
  const edge = fbm(129, 26, 3, 0.6); // breaks up their shores
  const fine = fbm(137, 90, 2); // islets and inlets a few metres wide
  const chan = fbm(153, 5, 4, 0.45); // the streams run along this one's zero line, and wander as it does
  const chan2 = fbm(159, 9, 3, 0.4); // and thinner ones along this one's
  const chan3 = fbm(223, 14, 3, 0.4); // and short side-runs along this one's
  const wideN = fbm(167, 6, 2); // how wide a stream is there
  const whereN = fbm(179, 5, 2); // the thin ones run for a stretch and give out
  const rise = fbm(161, 4, 3); // where the land lifts a little
  const hummock = fbm(173, 60, 2);
  const shoal = fbm(181, 34, 3, 0.55); // pool floors aren't level: they come up in bars, and some break the surface
  const floorN = fbm(191, 9, 2); // and some pools are shallower than others
  const lobe = fbm(199, 10, 3); // breaks up the hills' outline
  const rough = fbm(211, 32, 3); // the hills' own small relief

  const raw = new Float32Array(N * N);
  const c1 = new Float32Array(N * N);
  const c2 = new Float32Array(N * N);
  const c3 = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const v = j / N;
      const uu = u + warpX(u, v) * 0.06;
      const vv = v + warpY(u, v) * 0.06;
      const k = j * N + i;
      c1[k] = chan(uu, vv);
      c2[k] = chan2(uu, vv);
      c3[k] = chan3(uu, vv);
      raw[k] = base(uu, vv) + 0.16 * edge(u, v) + 0.05 * fine(u, v);
    }
  }
  const sorted = Float32Array.from(raw).sort();
  const level = sorted[Math.floor(N * N * 0.37)];
  const span = sorted[Math.floor(N * N * 0.97)] - level;
  const cell = PERIOD / N;

  // how far a point is from a noise's zero line, in metres: the value over its slope. So a stream's width doesn't depend on how fast
  // the noise happens to cross zero there. (Where it crosses slowly it spreads out, up to a limit: a stream opens into a backwater.)
  const metresFrom = (f, i, j) => {
    const gx = (f[j * N + ((i + 1) % N)] - f[j * N + ((i + N - 1) % N)]) / (2 * cell);
    const gz = (f[((j + 1) % N) * N + i] - f[((j + N - 1) % N) * N + i]) / (2 * cell);
    return Math.abs(f[j * N + i]) / Math.max(Math.hypot(gx, gz), 0.0016);
  };

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const u = i / N;
      const v = j / N;
      const x0 = (raw[k] - level) / span;

      // the hills: a bell over a warped ellipse, steeper on one side. T is how far up one we are, 0 to 1.
      let hill = 0;
      let T = 0;
      const wob = 0.28 * lobe(u, v);
      for (const H of HILLS) {
        let dx = i * cell - H.x;
        let dz = j * cell - H.z;
        dx -= Math.round(dx / PERIOD) * PERIOD;
        dz -= Math.round(dz / PERIOD) * PERIOD;
        if (Math.abs(dx) > 320 || Math.abs(dz) > 320) continue;
        const c = Math.cos(H.turn);
        const s = Math.sin(H.turn);
        const al = (dx * c + dz * s) / H.a;
        let ac = (-dx * s + dz * c) / H.b;
        if (ac > 0) ac *= 1.55; // the steep side
        // a long ridge rather than a dome: the ground falls away from the crest at once, so from up there you see down onto the land,
        // and not your own hilltop. The flanks ease out towards the foot.
        const r = Math.sqrt(al * al * al * al + ac * ac + 0.012) * (1 + wob);
        if (r >= 1) continue;
        const bell = Math.pow((1 - r) / 0.89, 1.5);
        hill += H.h * bell;
        T = Math.max(T, bell);
      }
      const onHill = sstep(T, 0, 0.32);

      // low rises, as before: a bluff or a swell of a few metres where a pool meets them
      const lift = sstep(rise(u, v), 0.24, 0.5);
      const x = x0 + 1.6 * onHill; // pools don't climb hills

      // pool floors between a hand's depth and the thigh, in bars
      const floorD = 0.34 + 0.2 * floorN(u, v);
      const under = Math.min(1, -x * 7);
      let h = x > 0
        ? 0.95 * (1 - Math.exp(-x * 6)) + 0.12 * hummock(u, v) * Math.min(1, x * 8)
        : -floorD * (1 - Math.exp(x * 11)) + 0.2 * shoal(u, v) * under;
      // added on both sides of the shore, or it would be a step: 3 m straight up out of the water
      h += 3.6 * lift * lift * sstep(x, 0, 0.05);
      h += hill + 1.4 * rough(u, v) * T;

      // the streams: a shallow trough along each line. They dry up as the land rises.
      const up = hill + 6 * onHill + 5 * lift;
      const wide1 = 2.8 + 7.5 * sstep(wideN(u, v), -0.3, 0.45);
      const s1 = metresFrom(c1, i, j) / wide1;
      if (s1 < 3.5) h = smin(h, (0.26 + 0.14 * floorN(u, v)) * (s1 * s1 - 1) + up, 0.3);
      const wide2 = (1.6 + 2.2 * sstep(wideN(u + 0.37, v), -0.3, 0.4)) * sstep(whereN(u, v), -0.34, -0.12);
      if (wide2 > 0.9) {
        const s2 = metresFrom(c2, i, j) / wide2;
        if (s2 < 4) h = smin(h, 0.26 * (s2 * s2 - 1) + up, 0.2);
      }
      const wide3 = (1.3 + 1.6 * sstep(wideN(u, v + 0.61), -0.3, 0.4)) * sstep(whereN(u + 0.43, v + 0.19), -0.05, 0.14);
      if (wide3 > 0.9) {
        const s3 = metresFrom(c3, i, j) / wide3;
        if (s3 < 4.5) h = smin(h, 0.22 * (s3 * s3 - 1) + up, 0.2);
      }
      land[k] = h;
    }
  }
  limitSlope(land, BANK_SLOPE, cell);
  blur(land, 1, 2);
}

export function buildLand() {
  if (landName === 'caozhou') shapeCaozhou();
  else shapeSteppe();

  const heights = new Float32Array(N * N * 4);
  const cell = PERIOD / N;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = (j * N + i) * 4;
      const dx = land[j * N + ((i + 1) % N)] - land[j * N + ((i + N - 1) % N)];
      const dz = land[((j + 1) % N) * N + i] - land[((j + N - 1) % N) * N + i];
      const ny = 2 * cell;
      const len = Math.hypot(dx, ny, dz);
      heights[k] = land[j * N + i];
      heights[k + 1] = -dx / len;
      heights[k + 2] = -dz / len;
      heights[k + 3] = 1;
    }
  }
  const heightTex = texture(heights, N, THREE.FloatType);

  const angleA = fbm(61, 8, 3);
  const angleB = fbm(73, 26, 3);
  const lenN = fbm(83, 14, 3);
  const patch = fbm(97, 6, 4);
  const CN = 1024;
  const comb = new Uint8Array(CN * CN * 4);
  for (let j = 0; j < CN; j++) {
    for (let i = 0; i < CN; i++) {
      const u = i / CN;
      const v = j / CN;
      // a small swing away from the wind's direction, so the grass lies roughly the way the gusts run
      const a = 0.75 * angleA(u, v) + 0.3 * angleB(u, v);
      const k = (j * CN + i) * 4;
      comb[k] = (Math.cos(a) * 0.5 + 0.5) * 255;
      comb[k + 1] = (Math.sin(a) * 0.5 + 0.5) * 255;
      // blade length: 1 here is 1.28 x the set length; bones.js lowers it around what lies in the grass
      comb[k + 2] = ((0.72 + 0.56 * Math.min(1, Math.max(0, 0.5 + lenN(u, v) * 1.4))) / 1.28) * 255;
      comb[k + 3] = Math.min(1, Math.max(0, 0.5 + patch(u, v) * 1.8)) * 255;
    }
  }
  const combTex = texture(comb, CN, THREE.UnsignedByteType);

  // Which grass grows where: R the straw-coloured, on what's high and dry and in drifts on the flat; G the cool green, in stands on the low damp ground (in
  // stands, not all along the water, or it draws a strip round every pool); B the russet, in stands here and there. All the colours are the look's.
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const rising = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const dryN = fbm(601, 5, 4);
  const coolN = fbm(607, 7, 4);
  const roseN = fbm(613, 13, 4, 0.55);
  const heightAtUv = (u, v) => land[Math.floor(v * N) * N + Math.floor(u * N)];
  const dryField = (u, v, h) => dryN(u, v) + 0.16 * rising(1, 7, h);
  const coolField = (u, v, h) => coolN(u, v) - 0.3 * rising(0.4, 2.5, h);
  const roseField = (u, v, h) => roseN(u, v) - 0.3 * rising(4, 10, h);
  // Set by what share of the land each should have, not by a level in the noise: most of the grass stays the plain two greens.
  const SHARES = [[dryField, 0.22], [coolField, 0.2], [roseField, 0.07]];
  const cuts = SHARES.map(([field, share]) => {
    const seen = [];
    for (let j = 0; j < 96; j++) {
      for (let i = 0; i < 96; i++) {
        const h = heightAtUv(i / 96, j / 96);
        if (h > 0.05) seen.push(field(i / 96, j / 96, h));
      }
    }
    seen.sort((x, y) => x - y);
    return seen[Math.floor(seen.length * (1 - share))] ?? 0;
  });
  const KN = 512;
  const kinds = new Uint8Array(KN * KN * 4);
  for (let j = 0; j < KN; j++) {
    for (let i = 0; i < KN; i++) {
      const u = i / KN;
      const v = j / KN;
      const h = heightAtUv(u, v);
      const k = (j * KN + i) * 4;
      SHARES.forEach(([field], c) => { kinds[k + c] = rising(cuts[c] - 0.035, cuts[c] + 0.035, field(u, v, h)) * 255; });
      kinds[k + 3] = 255;
    }
  }
  const kindsTex = texture(kinds, KN, THREE.UnsignedByteType);

  const NN = 512;
  const noise = new Uint8Array(NN * NN * 4);
  const ch = [fbm(101, 4, 6), fbm(211, 4, 6), fbm(307, 4, 6), fbm(401, 8, 4)];
  for (let j = 0; j < NN; j++) {
    for (let i = 0; i < NN; i++) {
      for (let c = 0; c < 4; c++) {
        noise[(j * NN + i) * 4 + c] = Math.min(1, Math.max(0, 0.5 + ch[c](i / NN, j / NN) * 1.3)) * 255;
      }
    }
  }
  const noiseTex = texture(noise, NN, THREE.UnsignedByteType);
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;

  // where hills block the sun: march over the height field towards it
  function bakeSun(az, el) {
    const dx = Math.sin(az) / cell;
    const dz = Math.cos(az) / cell;
    const rise = Math.tan(el);
    const STEPS = 36;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const h0 = land[j * N + i];
        let vis = 1;
        let dist = 3;
        for (let s = 0; s < STEPS; s++) {
          const x = (i + Math.round(dx * dist) + N * 64) % N;
          const y = (j + Math.round(dz * dist) + N * 64) % N;
          vis = Math.min(vis, (h0 + 0.3 + dist * rise - land[y * N + x]) / (dist * 0.05 + 0.35) + 0.5);
          dist *= 1.17;
        }
        heights[(j * N + i) * 4 + 3] = Math.max(0, vis);
      }
    }
    heightTex.needsUpdate = true;
  }

  // lay grass down around something lying at x, z: f(dx, dz) gives 0 (no change) to 1 (flat)
  function flatten(x, z, radius, f) {
    const cell2 = PERIOD / CN;
    const r = Math.ceil(radius / cell2);
    const ci = Math.round(x / cell2);
    const cj = Math.round(z / cell2);
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const v = f(i * cell2, j * cell2);
        if (v <= 0) continue;
        const k = ((((cj + j) % CN + CN) % CN) * CN + (((ci + i) % CN + CN) % CN)) * 4 + 2;
        comb[k] = Math.round(comb[k] * (1 - v * 0.45));
      }
    }
    combTex.needsUpdate = true;
  }

  // what's been laid flat so far can be kept and gone back to, for what comes and goes while the page runs
  let kept = null;
  const keepFlattened = () => { kept = comb.slice(); };
  const backToKept = () => { comb.set(kept); combTex.needsUpdate = true; };

  return { heightTex, combTex, kindsTex, noiseTex, bakeSun, flatten, keepFlattened, backToKept };
}
