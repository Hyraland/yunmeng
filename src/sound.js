import { tuning } from './tuning.js';
import { createMusic } from './music.js';

// What the place sounds like, all made here with no recordings, and all of it following what's happening in the scene:
//   the wind in the grass, left and right apart, from the same gusts that are bending it (a gust you see coming you hear coming);
//   a low wind over everything, more of it the higher you are;
//   dry reeds ticking where there are reeds, water lapping where there's water, each from the side it's on;
//   the wind moaning in the big bones, near them and in a gust;
//   your steps, in grass or wading;
//   by day a few far-off birds, at night crickets and frogs by the water. In the mist it's all closer and duller.
// Everything takes explicit times, so the same code can be rendered ahead of time, faster than life, to check what it does.

// how far one step takes you, in metres
export const strideLength = (speed) => 1.25 + 0.2 * speed;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// noise that can loop: the end is faded into the start, or there'd be a click each time round
function noiseBuffer(ctx, seconds, kind, rnd) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const fade = Math.floor(ctx.sampleRate * 0.2);
  const raw = new Float32Array(n + fade);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = rnd() * 2 - 1;
    if (kind === 'white') raw[i] = w;
    else if (kind === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      raw[i] = b0 + b1 + b2 + w * 0.1848;
    } else {
      last = (last + 0.02 * w) / 1.02;
      raw[i] = last;
    }
  }
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const out = buf.getChannelData(0);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    let v = raw[i];
    if (i < fade) v = v * Math.sqrt(i / fade) + raw[n + i] * Math.sqrt(1 - i / fade);
    out[i] = v;
    sum += v * v;
  }
  const k = 0.25 / Math.sqrt(sum / n); // all kinds at the same loudness
  for (let i = 0; i < n; i++) out[i] *= k;
  return buf;
}

// a wide, soft open space: no walls, so no early echoes, only a diffuse tail that loses its top as it goes
function airImpulse(ctx, seconds, rnd) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const a = 0.45 - 0.4 * t; // how much of the top is left
      lp += (rnd() * 2 - 1 - lp) * a;
      d[i] = lp * Math.exp(-t * 6.5) * Math.min(1, i / (ctx.sampleRate * 0.03));
    }
  }
  return buf;
}

export function createSound(ctx, { seed = (Math.random() * 1e9) | 0 } = {}) {
  const rnd = makeRandom(seed);
  const white = noiseBuffer(ctx, 7, 'white', rnd);
  const pink = noiseBuffer(ctx, 9, 'pink', rnd);
  const brown = noiseBuffer(ctx, 11, 'brown', rnd);

  const gain = (v = 0) => {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  };
  const filter = (type, f, q = 0.7) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  };
  const panner = (p) => {
    const s = ctx.createStereoPanner();
    s.pan.value = p;
    return s;
  };
  const loop = (buf, ...chain) => {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(0, rnd() * buf.duration);
    let at = s;
    for (const n of chain) {
      at.connect(n);
      at = n;
    }
    return at;
  };
  const link = (...chain) => {
    for (let i = 0; i + 1 < chain.length; i++) chain[i].connect(chain[i + 1]);
  };

  // what comes out: ambience and music on their own buses, then a soft ceiling so nothing can clip
  const ceiling = ctx.createDynamicsCompressor();
  ceiling.threshold.value = -9;
  ceiling.knee.value = 12;
  ceiling.ratio.value = 6;
  ceiling.attack.value = 0.01;
  ceiling.release.value = 0.25;
  const master = gain(0);
  link(master, ceiling, ctx.destination);
  const air = ctx.createConvolver();
  air.buffer = airImpulse(ctx, 3.2, rnd);
  const airAmb = gain(0.9);
  const airGate = gain(0); // what the place sends into the air, off with it
  link(air, master);
  link(airAmb, airGate, air);
  const ambTone = filter('lowpass', 16000, 0.5); // mist and night close the air in
  const ambBus = gain(0);
  link(ambBus, ambTone, master);
  const ambAir = gain(1);
  link(ambAir, ambTone);
  link(ambAir, airAmb);

  // the wind in the grass, a stream for each side
  const side = (pan) => {
    const body = filter('bandpass', 1400, 0.55);
    const hiss = filter('bandpass', 5200, 0.8);
    const gBody = gain(0);
    const gHiss = gain(0);
    const out = panner(pan);
    loop(pink, body, gBody, out);
    loop(white, hiss, gHiss, out);
    out.connect(ambBus);
    return { body, gBody, gHiss };
  };
  const grassL = side(-0.75);
  const grassR = side(0.75);
  // a gust further off, as a wider, lower rush
  const far = (pan) => {
    const f = filter('bandpass', 520, 0.5);
    const g = gain(0);
    const p = panner(pan);
    loop(pink, f, g, p);
    p.connect(ambBus);
    return { f, g };
  };
  const farL = far(-0.9);
  const farR = far(0.9);
  // the low wind over everything
  const lowF = filter('lowpass', 220, 0.5);
  const lowG = gain(0);
  loop(brown, lowF, lowG, ambBus);

  // water, a low steady wash under the laps
  const washF = filter('lowpass', 480, 0.6);
  const washG = gain(0);
  const washP = panner(0);
  loop(brown, washF, washG, washP);
  washP.connect(ambBus);

  // reeds: a thin steady hiss under the ticks
  const reedF = filter('bandpass', 6400, 1.1);
  const reedG = gain(0);
  const reedP = panner(0);
  loop(white, reedF, reedG, reedP);
  reedP.connect(ambBus);

  // the bones: the wind across hollow things, narrow resonances that wander a little and aren't in tune with each other or the music
  const boneP = panner(0);
  const boneG = gain(0);
  link(boneG, boneP);
  boneP.connect(ambAir);
  [[132, 26, 1], [198.5, 30, 0.8], [287, 38, 0.5], [421, 44, 0.3]].forEach(([f, q, level]) => {
    const b = filter('bandpass', f, q);
    const g = gain(level * 3.2);
    loop(pink, b, g, boneG);
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 0.05 + rnd() * 0.09;
    const depth = gain(f * 0.012);
    link(wobble, depth, b.frequency);
    wobble.start(0);
  });

  // crickets: a tone, gated fast by one wave and in chirps by a slower one
  const nightG = gain(0);
  nightG.connect(ambAir);
  const shaper = ctx.createWaveShaper();
  shaper.curve = new Float32Array(257).map((_, i) => (i > 128 ? 1 : 0));
  [[4380, 27, 1.21, -0.6, 0.5], [4790, 31, 0.87, 0.55, 0.4], [5250, 24, 1.63, 0.1, 0.28]].forEach(([f, fast, slow, pan, level]) => {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const a = gain(0);
    const b = gain(0);
    const p = panner(pan);
    const out = gain(level * 0.05);
    link(o, a, b, p, out, nightG);
    const gate = (hz, target) => {
      const l = ctx.createOscillator();
      l.frequency.value = hz;
      const s = ctx.createWaveShaper();
      s.curve = shaper.curve;
      link(l, s, target);
      l.start(0);
    };
    gate(fast, a.gain);
    gate(slow, b.gain);
    o.start(0);
  });

  // ---- single sounds

  function burst(t, { buf = pink, dur, f0, f1 = f0, q = 1, level, pan = 0, attack = 0.005, type = 'bandpass', wet = 0, to = ambBus }) {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const b = filter(type, f0, q);
    b.frequency.setValueAtTime(f0, t);
    b.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const g = gain(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(level, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = panner(pan);
    link(s, b, g, p, to);
    if (wet > 0) {
      const w = gain(wet);
      p.connect(w);
      w.connect(airGate);
    }
    s.start(t, rnd() * (buf.duration - dur - 0.1));
    s.stop(t + dur + 0.05);
  }

  function tone(t, { f0, f1 = f0, dur, level, pan = 0, type = 'sine', attack = 0.01, tail = 0.4, to = ambAir }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.setValueAtTime(level, t + dur * (1 - tail));
    g.gain.linearRampToValueAtTime(0, t + dur);
    const p = panner(pan);
    link(o, g, p, to);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // a far-off bird: heard through the air, so soft and with little top
  const birdTone = filter('lowpass', 3800, 0.5);
  const birdG = gain(0.5);
  link(birdTone, birdG, ambAir);
  function warbler(t, pan, level) {
    const n = 4 + Math.floor(rnd() * 7);
    let at = t;
    const base = 2100 + rnd() * 1300;
    for (let i = 0; i < n; i++) {
      const f = base * (0.8 + rnd() * 0.75);
      const d = 0.05 + rnd() * 0.07;
      tone(at, { f0: f, f1: f * (0.85 + rnd() * 0.35), dur: d, level: level * (0.6 + rnd() * 0.4), pan, to: birdTone });
      at += d + 0.015 + rnd() * rnd() * 0.12;
    }
  }
  function wader(t, pan, level) {
    // the long falling double note of a wading bird a long way across the water
    const f = 1500 + rnd() * 500;
    for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) {
      tone(t + i * 0.62, { f0: f * 1.06, f1: f * 0.8, dur: 0.46, level, pan, attack: 0.06, tail: 0.6, to: birdTone });
    }
  }
  function frog(t, pan, level) {
    const n = 5 + Math.floor(rnd() * 6);
    const f = 620 + rnd() * 380;
    for (let i = 0; i < n; i++) {
      tone(t + i * 0.045, { f0: f, f1: f * 0.94, dur: 0.028, level, pan, type: 'sawtooth', attack: 0.004, tail: 0.7, to: frogBus });
    }
  }
  const frogBus = filter('bandpass', 900, 1.6);
  const frogG = gain(0.5);
  link(frogBus, frogG, ambAir);

  function footstep(t, s, odd) {
    const pan = odd ? 0.1 : -0.1;
    const run = smooth(4, 8, s.speed);
    const v = tuning.sound.steps * (0.7 + 0.6 * run) * (0.85 + rnd() * 0.3);
    if (s.depth > 0.02) {
      // wading: the leg comes out, and goes in. More water, lower and slower
      const deep = smooth(0.05, 0.5, s.depth);
      burst(t, { buf: white, dur: 0.22 + deep * 0.25, f0: 2600 - deep * 1200, f1: 700, q: 0.7, level: 0.11 * v, pan, wet: 0.15 });
      burst(t + 0.02, { dur: 0.3 + deep * 0.3, f0: 240, f1: 520, q: 2.2, level: 0.3 * v * (0.5 + deep), pan, attack: 0.03, wet: 0.2 });
      for (let i = 0; i < 3; i++) {
        const d = 0.12 + rnd() * 0.3;
        burst(t + d, { dur: 0.05 + rnd() * 0.05, f0: 900 + rnd() * 1400, f1: 1800 + rnd() * 1400, q: 7, level: 0.06 * v, pan: pan + (rnd() - 0.5) * 0.3, wet: 0.2 });
      }
    } else {
      // grass against the legs, and the soft ground
      burst(t, { buf: white, dur: 0.17, f0: 4300, f1: 2500, q: 0.7, level: 0.05 * v, pan, attack: 0.03 });
      burst(t + 0.03, { buf: pink, dur: 0.11, f0: 1300, f1: 800, q: 0.7, level: 0.07 * v, pan, attack: 0.012 });
      burst(t, { buf: brown, dur: 0.1, f0: 150, f1: 90, q: 0.7, type: 'lowpass', level: 0.35 * v, pan, attack: 0.006 });
    }
  }

  const music = createMusic(ctx, { master, air, seed: seed + 1 });

  // ---- following the scene

  const say = (param, v, t, tc = 0.35) => {
    if (Math.abs((param._last ?? -1) - v) < Math.max(Math.abs(v) * 0.01, 1e-4)) return;
    param._last = v;
    param.setTargetAtTime(v, t, tc);
  };
  let stepsDone = null;
  let oddStep = false;
  let nextBird = 3;
  let nextLap = 0;
  let nextTick = 0;
  let nextFrog = 2;

  return {
    music,
    context: ctx,
    // switches and levels: fades, so nothing clicks
    apply(t = ctx.currentTime) {
      const s = tuning.sound;
      master.gain.setTargetAtTime(s.volume, t, 0.05);
      ambBus.gain.setTargetAtTime(s.on ? 1 : 0, t, 0.5);
      ambAir.gain.setTargetAtTime(s.on ? 1 : 0, t, 0.5);
      airGate.gain.setTargetAtTime(s.on ? 1 : 0, t, 0.5);
      music.setLevel(s.music, t);
      music.setOn(s.musicOn, t);
    },
    // s: what hear() below found. t: the time this applies at, on the audio clock
    update(s, t) {
      const c = tuning.sound;
      const ground = smooth(45, 3, s.height); // how much of what's on the ground reaches you up here
      const up = smooth(6, 60, s.height);

      // the wind in the grass
      const each = (g, x) => {
        const gust = Math.pow(clamp01(x), 1.5);
        const v = (0.012 + gust * 0.62) * s.land * ground * c.wind;
        // (a gust comes on over a second or so and goes off slower, like the grass)
        const rising = v > (g.gBody.gain._last ?? 0);
        say(g.gBody.gain, v, t, rising ? 0.5 : 1.1);
        say(g.gHiss.gain, v * 0.42, t, rising ? 0.45 : 0.9);
        say(g.body.frequency, 1000 + 1700 * clamp01(x), t, 0.4);
      };
      each(grassL, s.gustL);
      each(grassR, s.gustR);
      say(farL.g.gain, Math.pow(clamp01(s.farL), 1.6) * 0.5 * c.wind * (0.5 + 0.5 * ground), t, 0.6);
      say(farR.g.gain, Math.pow(clamp01(s.farR), 1.6) * 0.5 * c.wind * (0.5 + 0.5 * ground), t, 0.6);
      say(farL.f.frequency, 380 + 340 * clamp01(s.farL), t, 0.8);
      say(farR.f.frequency, 380 + 340 * clamp01(s.farR), t, 0.8);
      const low = 0.28 + 0.75 * s.gust + 0.9 * up;
      say(lowG.gain, low * 0.17 * c.wind, t, 0.9);
      say(lowF.frequency, 150 + 260 * s.gust + 260 * up, t, 0.8);

      // water
      const near = s.water * ground;
      say(washG.gain, near * 0.2 * c.water, t, 0.5);
      say(washP.pan, s.waterPan, t, 0.5);
      if (t >= nextLap && near > 0.03 && c.water > 0) {
        const pan = clamp01((s.waterPan + 1) / 2) * 2 - 1 + (rnd() - 0.5) * 0.5;
        const v = c.water * near * (0.5 + 0.8 * s.gust);
        burst(t, { dur: 0.22 + rnd() * 0.3, f0: 180 + rnd() * 160, f1: 420 + rnd() * 500, q: 3 + rnd() * 3, level: 0.5 * v, pan, attack: 0.05, wet: 0.2 });
        if (rnd() < 0.5) burst(t + 0.1 + rnd() * 0.15, { buf: white, dur: 0.14, f0: 1900 + rnd() * 1500, f1: 1100, q: 1.2, level: 0.05 * v, pan, attack: 0.02, wet: 0.15 });
        nextLap = t + (0.35 + rnd() * rnd() * 2.6) / (0.5 + 0.6 * s.gust + near);
      }

      // reeds
      const reeds = s.reeds * ground;
      const stir = 0.12 + 0.88 * clamp01(s.gust);
      say(reedG.gain, reeds * stir * 0.16 * c.reeds, t, 0.3);
      say(reedP.pan, s.reedPan, t, 0.5);
      if (reeds > 0.02 && c.reeds > 0) {
        const rate = 3 + 38 * reeds * stir;
        if (t >= nextTick) nextTick = t;
        for (let i = 0; i < 8 && nextTick < t + 0.12; i++) {
          burst(nextTick, { buf: white, dur: 0.012 + rnd() * 0.05, f0: 2800 + rnd() * 4700, f1: 2400 + rnd() * 4000, q: 2 + rnd() * 3, level: 0.16 * reeds * c.reeds * (0.3 + rnd() * 0.9), pan: s.reedPan * 0.7 + (rnd() - 0.5) * 0.9, attack: 0.002 });
          nextTick += (-Math.log(1 - rnd() * 0.999) / rate);
        }
      }

      // the bones
      const breath = Math.pow(clamp01(s.gust * 1.25), 2.2);
      say(boneG.gain, s.bones * (0.03 + breath) * c.bones * (0.35 + 0.65 * ground), t, 0.7);
      say(boneP.pan, s.bonePan, t, 0.6);

      // steps: whenever the walker has taken one
      if (s.steps !== stepsDone) {
        if (stepsDone !== null && c.steps > 0) {
          oddStep = !oddStep;
          footstep(t, s, oddStep);
        }
        stepsDone = s.steps;
      }

      // the rest of what lives here
      const n = s.night ? 1 : 0;
      say(nightG.gain, n * c.life * (0.35 + 0.65 * ground) * (1 - 0.6 * s.gust), t, 1.2);
      if (c.life > 0) {
        if (!s.night && t >= nextBird) {
          const pan = (rnd() * 2 - 1) * 0.85;
          const v = 0.05 * c.life * (s.mist ? 0.6 : 1) * (0.3 + 0.7 * ground);
          if (rnd() < (s.mist ? 0.35 : 0.72)) warbler(t, pan, v);
          else wader(t, pan, v * 1.1);
          nextBird = t + (s.mist ? 14 : 5) + rnd() * (s.mist ? 26 : 16);
        }
        if (s.night && t >= nextFrog) {
          const v = 0.1 * c.life * clamp01(s.water * 1.5 + 0.12) * ground;
          if (v > 0.002) frog(t, (rnd() * 2 - 1) * 0.8, v);
          nextFrog = t + 0.6 + rnd() * rnd() * 6;
        }
      }

      // how open the air is
      const top = s.mist ? 5200 : s.night ? 12000 : 17000;
      say(ambTone.frequency, top, t, 1.5);
      say(airAmb.gain, s.mist ? 1.5 : s.night ? 1.15 : 0.8, t, 1.5);

      music.update(t, s);
    },
    suspend() { if (ctx.state === 'running') ctx.suspend?.(); },
    resume() { if (ctx.state === 'suspended') return ctx.resume(); },
  };
}

// What the listener's ears are getting: read off the scene, nothing on the graphics card.
export function hear({ me, wind, heightAt, reeds, bones, time, period, night, mist }) {
  const sy = Math.sin(me.yaw);
  const cy = Math.cos(me.yaw);
  // (to the right is what the D key walks towards)
  const Rx = -cy;
  const Rz = sy;
  const ask = (right, ahead) => wind.askAt(me.x + Rx * right + sy * ahead, me.z + Rz * right + cy * ahead, time);
  const gustL = ask(-24, 0) * 0.5 + (ask(-13, 15) + ask(-13, -15)) * 0.25;
  const gustR = ask(24, 0) * 0.5 + (ask(13, 15) + ask(13, -15)) * 0.25;
  const farL = ask(-115, 30) * 0.5 + ask(-105, -40) * 0.5;
  const farR = ask(115, 30) * 0.5 + ask(105, -40) * 0.5;
  const groundHere = heightAt(me.x, me.z);
  const height = Math.max(0, me.y - Math.max(groundHere, -0.6) - 1.62);

  // the land round about, in rings: how much is water, and on which side
  let wet = 0, dry = 0, wetPan = 0;
  for (let r = 0; r < 3; r++) {
    const radius = [5, 13, 30][r];
    const w = [1, 0.6, 0.3][r];
    for (let a = 0; a < 12; a++) {
      const an = (a / 12) * Math.PI * 2 + r * 0.26;
      const rx = Math.cos(an);
      const fw = Math.sin(an);
      const h = heightAt(me.x + (Rx * rx + sy * fw) * radius, me.z + (Rz * rx + cy * fw) * radius);
      if (h < -0.03) {
        wet += w;
        wetPan += w * rx;
      } else dry += w;
    }
  }
  const water = wet > 0 ? Math.min(1, (wet / 12) * 0.9) : 0;

  const wrap = (d) => d - Math.round(d / period) * period;
  const gather = (list, reach, weigh) => {
    let sum = 0, pan = 0;
    for (const it of list) {
      const dx = wrap(it.x - me.x);
      const dz = wrap(it.z - me.z);
      if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
      const d = Math.hypot(dx, dz);
      if (d > reach) continue;
      const fall = (1 - d / reach) * (1 - d / reach) * weigh(it);
      sum += fall;
      pan += (fall * (dx * Rx + dz * Rz)) / Math.max(d, 4);
    }
    return { sum, pan: sum > 0 ? Math.max(-1, Math.min(1, pan / sum)) : 0 };
  };
  const r = reeds ? gather(reeds.heard(), 46, (c) => Math.min(c.stems, 400) / 400) : { sum: 0, pan: 0 };
  const b = bones ? gather(bones.spots, 90, (c) => Math.min(1, c.r / 14)) : { sum: 0, pan: 0 };

  return {
    gustL, gustR, farL, farR,
    gust: Math.min(1, (gustL + gustR) * 0.5),
    height,
    land: Math.min(1, dry / 22.8 + 0.08),
    water,
    waterPan: wet > 0 ? Math.max(-1, Math.min(1, wetPan / wet)) : 0,
    depth: Math.max(0, -groundHere),
    reeds: 1 - Math.exp(-r.sum * 0.9),
    reedPan: r.pan,
    bones: 1 - Math.exp(-b.sum * 0.8),
    bonePan: b.pan,
    speed: me.speed,
    steps: me.steps,
    night,
    mist,
  };
}
