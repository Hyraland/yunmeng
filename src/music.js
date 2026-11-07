// Music for this place, and for what the 九歌 are: songs to bring down spirits, sung by shamans in the wet south, with "五音纷兮繁会" and "緪瑟兮交鼓".
// No melody of the time survives, and this doesn't pretend to one. It keeps away from what now says "China" on sight: the pentatonic, a plucked
// silk string, a note that bends and sighs. What it's made of instead:
//   It's in F major. The low breath and everything over it stand on the harmonic series of one low note, which is what a body of air does; the
//   tune is in pure intervals over that, brighter and stiller than on any keyboard.
//   One voice, as in overtone singing: a low hum, and over it a whistle. It jumps between its notes, as a whistle or a yodel does. It never slides.
//   At night the whistle would be a bird, and there are none then. So the tune goes to the 瑟 instead, an octave down: the string the 九歌 name
//   themselves ("陈竽瑟兮浩倡", "緪瑟兮交鼓"), found in the tombs of Chu and of 曾侯乙. Only plucked and left to ring: no hand on it, so nothing bends.
//   The wind sings: noise through narrow resonances on the same harmonics, louder as the gusts really passing you are.
//   Wet things: water drops, whose pitch goes up as they close; a soaked log; seeds shaken.
//   Skin drums, in a cycle of 7 against the log's 5, which never quite lands where you expect.
// It still comes and goes over the wind. But when it comes, it's alive.

// The main theme, written out and always the same, so it can be remembered. It was found on a ukulele, on its bottom string (A4), frets
// 10 15 13 10 8 10 3, each held for 3 1 1 3 1 1 3: G5 C6 Bb5 G5 F5 G5 C5. That first line stays as it is, note for note.
// What follows only grows out of that line, and stays away from what would make it a song: four even lines, the same rhythm over and over, a climb
// to a top note, the leading tone falling home. It keeps to five neighbouring notes, F G A Bb C (the A says major, the half step keeps it from being
// the pentatonic). The lines are of no even length, with long breaths between them, and they're free in time. It ends as it began, open.
// In 简谱, 1 = F:
//   2 . .  5  4  2 . .  1  2  5̣ . .     the line itself, strict
//   1  2  5̣ . . . .                     its tail again, further off
//   2  3 . . . . .  2  1 . .             out of that, and it rests on the third
//   5  4  2 . . .  4  5 . . . . . .      its first turn, the other way, and held open
//   2 . .  5  4  2 . .  1  2  5̣ . .     the line again, as it was
// Each pair is a note, in the names below, and a length; a rest is 0. To change the tune, change this.
const NOTE = { C5: 3 / 4, F5: 1, G5: 9 / 8, A5: 5 / 4, Bb5: 4 / 3, C6: 3 / 2 };
const FOUND = [['G5', 3], ['C6', 1], ['Bb5', 1], ['G5', 3], ['F5', 1], ['G5', 1], ['C5', 3]];
const THEME = [
  { notes: [...FOUND, [0, 3]], loose: 0 },
  { notes: [['F5', 1], ['G5', 1], ['C5', 5], [0, 3]], loose: 0.14, v: 0.68 },
  { notes: [['G5', 1], ['A5', 6], ['G5', 1], ['F5', 3], [0, 4]], loose: 0.14, v: 0.85 },
  { notes: [['C6', 1], ['Bb5', 1], ['G5', 4], ['Bb5', 1], ['C6', 7], [0, 3]], loose: 0.14, v: 0.9 },
  { notes: [...FOUND, [0, 2]], loose: 0 },
];

// what happens in turn, over and over, and how long it's quiet after each: only the wind and the place
const FORM = [['breath', 7, 13], ['theme', 6, 11], ['rain', 7, 13], ['dance', 12, 20]];

// the F everything stands on, two octaves and a third of the way down from the tune's; and how far the whole of it moves down, in mist and at night
const KEY = 87.31;
const TUNE_F = 698.46; // F5
const MOVE = { day: 1, mist: 8 / 9, night: 3 / 4 };
// how fast: a beat, in seconds, for the drums; and one of the lengths in the tune
const BEAT = { day: 0.8, mist: 0.95, night: 1.15 };
const STEP = { day: 0.56, mist: 0.66, night: 0.8 };
// how much of the drums and the shaking there is: the day's is the one with the most blood in it
const HEAT = { day: 1, mist: 0.6, night: 0.42 };

// what a free line walks on: the same five notes as the tune's, and the low C
const WALK = [3 / 4, 1, 9 / 8, 5 / 4, 4 / 3, 3 / 2];
// the harmonics of the low note that the drops fall on and the wind sings: all of them in the key
const DROPS = [16, 18, 20, 24, 32, 36, 40];
const CHOIR = [4, 5, 6, 8, 9, 10, 12];
const LOG = [4, 6, 5, 8, 6]; // a 5 that goes round against the drum's 7

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

export function createMusic(ctx, { master, air, seed = 1 }) {
  const rnd = makeRandom(seed);
  const bus = ctx.createGain();
  bus.gain.value = 0;
  const level = ctx.createGain();
  level.gain.value = 0.7;
  bus.connect(level);
  level.connect(master);
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  bus.connect(wet);
  const wetLevel = ctx.createGain();
  wet.connect(wetLevel);
  wetLevel.connect(air);
  // Everything a scene lays down goes through a stage of its own, and most of it is laid down ahead of time, so a change of weather lets go of
  // the whole stage and starts on a new one. On it: the 瑟's body, and the sung wind's way in, which the gusts open.
  let stage = null;
  let seBody = null;
  let windy = null;
  function newStage() {
    stage = ctx.createGain();
    stage.connect(bus);
    windy = ctx.createGain();
    windy.gain.value = 0.7;
    windy.connect(stage);
    seBody = filter('peaking', 240, 0.8);
    seBody.gain.value = 5;
    const top = filter('lowpass', 2600, 0.7);
    seBody.connect(top);
    top.connect(stage);
  }

  const live = new Set();
  const keep = (node, until) => {
    live.add(node);
    node.onended = () => live.delete(node);
    node.stop(until);
  };
  const panned = (pan) => {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    return p;
  };
  const noiseBuf = (() => {
    const n = ctx.sampleRate * 4;
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
    return b;
  })();
  const noise = (t, until) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.start(t, rnd() * 3.9);
    keep(s, until);
    return s;
  };
  const filter = (type, f, q = 1) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  };

  // a breath with all its harmonics about as strong, for the mouth to shape
  const breathWave = (() => {
    const N = 40;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    for (let k = 1; k < N; k++) im[k] = 1 / Math.pow(k, 0.35);
    return ctx.createPeriodicWave(re, im);
  })();

  // 瑟: a long soft silk string, plucked. Made once per pitch, ahead of use: a delay line that loses its top a little each time round.
  const strings = new Map();
  function stringBuffer(f) {
    const key = Math.round(f * 10);
    if (strings.has(key)) return strings.get(key);
    const sr = ctx.sampleRate;
    const N = Math.max(2, Math.round(sr / f));
    const seconds = Math.min(7.5, 1400 / f);
    const n = Math.floor(sr * seconds);
    const out = new Float32Array(n);
    const line = new Float32Array(N);
    // plucked with a finger, near the middle: a soft-edged shape with no high noise
    let lp = 0;
    const at0 = Math.floor(N * 0.27);
    for (let i = 0; i < N; i++) {
      lp += (rnd() * 2 - 1 - lp) * 0.35;
      line[i] = lp;
    }
    for (let i = N - 1; i >= at0; i--) line[i] -= line[i - at0] * 0.85;
    // the higher, the fewer times round it can lose as much
    const hold = Math.pow(10, -3.2 / (seconds * f));
    let prev = 0;
    let at = 0;
    for (let i = 0; i < n; i++) {
      const v = line[at];
      out[i] = v;
      line[at] = hold * (0.58 * v + 0.42 * prev);
      prev = v;
      at = at + 1 === N ? 0 : at + 1;
    }
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
    for (let i = 0; i < n; i++) out[i] *= (0.8 / peak) * Math.min(1, (n - i) / (sr * 0.1)) * Math.min(1, i / 40);
    const buf = ctx.createBuffer(1, n, sr);
    buf.copyToChannel(out, 0);
    const made = { buf, rate: f / (sr / N) };
    strings.set(key, made);
    return made;
  }
  function se(t, f, v, pan) {
    const { buf, rate } = stringBuffer(f);
    const n = ctx.createBufferSource();
    n.buffer = buf;
    n.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = v;
    const p = panned(pan);
    n.connect(g);
    g.connect(p);
    p.connect(seBody);
    n.start(t);
    keep(n, t + buf.duration / rate);
  }

  // The one voice, for a stretch of time: returns note(), to sing a note, and it's gone by the end
  function singer(t, seconds, f0, { body = 0.05, pan = 0, plucked = false } = {}) {
    const end = t + seconds;
    const out = panned(pan);
    out.connect(stage);
    const breath = ctx.createGain();
    breath.gain.value = 1.5;
    // two, a hair apart, so it's alive even when it holds still. Not as strong as each other: equal, they cancel each harmonic outright once
    // in every second or so, and a note that falls on that isn't heard.
    for (const [d, a] of [[-0.8, 1], [1.2, 0.22]]) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(breathWave);
      o.frequency.value = f0;
      o.detune.value = d;
      const g = ctx.createGain();
      g.gain.value = a;
      o.connect(g);
      g.connect(breath);
      o.start(t);
      keep(o, end + 0.1);
    }
    // the low hum of it, through a mouth that's slowly moving
    const mouth = filter('bandpass', 420, 2.2);
    let at = t;
    while (at < end) {
      at += 1.6 + rnd() * 2.6;
      mouth.frequency.linearRampToValueAtTime(240 + rnd() * 520, at);
    }
    const low = filter('lowpass', 900, 0.5);
    const hum = ctx.createGain();
    hum.gain.setValueAtTime(0, t);
    hum.gain.linearRampToValueAtTime(body, t + Math.min(2.2, seconds * 0.2));
    hum.gain.setValueAtTime(body, end - Math.min(2.5, seconds * 0.25));
    hum.gain.linearRampToValueAtTime(0, end);
    breath.connect(mouth);
    mouth.connect(low);
    low.connect(hum);
    hum.connect(out);
    // at night, the 瑟 over it and no whistle; a held note gets its octave too, as a 瑟 is played
    if (plucked) {
      return {
        note(when, f, d, v = 1) {
          se(when, f / 2, 0.32 * v, pan - 0.08 + rnd() * 0.16);
          if (d > 1.2) se(when + 0.012, f, 0.1 * v, pan + 0.2);
        },
      };
    }
    // the whistle over it: nearly a pure tone, and a little of the breath it's made of, on whatever note it's given
    const sing = ctx.createGain();
    sing.gain.value = 0;
    const tones = [[1, 1], [2, 0.11], [3, 0.035]].map(([r, a]) => {
      const o = ctx.createOscillator();
      o.frequency.value = TUNE_F;
      const g = ctx.createGain();
      g.gain.value = a * 0.115;
      o.connect(g);
      g.connect(sing);
      o.start(t);
      keep(o, end + 0.1);
      return [o, r];
    });
    const air_ = filter('bandpass', TUNE_F, 16);
    const hiss = ctx.createGain();
    hiss.gain.value = 0.15;
    noise(t, end + 0.1).connect(air_);
    air_.connect(hiss);
    hiss.connect(sing);
    // and a flutter of the throat on what's held (not a wavering of the pitch)
    const flutter = ctx.createGain();
    flutter.gain.value = 1;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.4;
    const depth = ctx.createGain();
    depth.gain.value = 0;
    lfo.connect(depth);
    depth.connect(flutter.gain);
    lfo.start(t);
    keep(lfo, end + 0.1);
    sing.connect(flutter);
    flutter.connect(out);
    const jump = (when, f) => {
      for (const [o, r] of tones) o.frequency.setTargetAtTime(f * r, when, 0.006);
      air_.frequency.setTargetAtTime(f, when, 0.006);
    };
    return {
      // f: the frequency. A held one flutters, and may flick down onto it from the next note up
      note(when, f, d, v = 1) {
        const held = d > 0.8;
        if (held && rnd() < 0.55) {
          jump(when - 0.05, f * (rnd() < 0.5 ? 9 / 8 : 5 / 4));
          sing.gain.setTargetAtTime(v * 0.5, when - 0.05, 0.006);
        }
        jump(when, f);
        sing.gain.setTargetAtTime(v, when, 0.008);
        sing.gain.setTargetAtTime(v * 0.78, when + 0.05, Math.max(d * 0.5, 0.05));
        // the mouth closes a moment before the next: a real stop, or it would be one long smear
        sing.gain.setTargetAtTime(0, when + d - 0.035, 0.012);
        depth.gain.setTargetAtTime(0, when, 0.01);
        if (held) {
          depth.gain.setTargetAtTime(0.28, when + d * 0.3, 0.25);
          depth.gain.setTargetAtTime(0, when + d - 0.06, 0.012);
        }
      },
    };
  }

  // The wind, singing: noise through narrow openings on the harmonics, each coming and going in its own time
  function windSong(t, seconds, f0, v = 1) {
    const end = t + seconds;
    const out = ctx.createGain();
    out.gain.value = v;
    out.connect(windy);
    const n = noise(t, end + 0.1);
    for (const k of CHOIR) {
      const b = filter('bandpass', f0 * k, 48 + k * 5);
      // more than one rise and fall in a long one
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      let at = t + rnd() * Math.min(3, seconds * 0.2);
      g.gain.setValueAtTime(0, at);
      while (at < end - 3) {
        const up = 2 + rnd() * 3.5;
        const top = (0.5 + rnd() * 0.5) * 11;
        g.gain.linearRampToValueAtTime(top, Math.min(at + up, end - 1.5));
        at = Math.min(at + up, end - 1.5);
        const fall = 1.5 + rnd() * 3.5;
        g.gain.linearRampToValueAtTime(top * rnd() * 0.3, Math.min(at + fall, end - 0.5));
        at = Math.min(at + fall, end - 0.5);
      }
      g.gain.linearRampToValueAtTime(0, end);
      const p = panned((rnd() * 2 - 1) * 0.8);
      n.connect(b);
      b.connect(g);
      g.connect(p);
      p.connect(out);
    }
  }

  // A drop into still water: as the little cavity under it closes, its note goes up
  function drop(t, f, v, pan, rise = 1.25 + rnd() * 0.5) {
    const dur = 0.05 + rnd() * 0.07;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * rise, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0003, t + dur + 0.05);
    const p = panned(pan);
    o.connect(g);
    g.connect(p);
    p.connect(stage);
    o.start(t);
    keep(o, t + dur + 0.08);
  }

  // A soaked log: dull, short, and its partials aren't whole multiples
  function log_(t, f, v, pan) {
    const p = panned(pan);
    p.connect(stage);
    for (const [r, a, d] of [[1, 1, 0.2], [2.74, 0.34, 0.09], [5.2, 0.1, 0.035]]) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f * r * 1.03, t);
      o.frequency.exponentialRampToValueAtTime(f * r, t + 0.02);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * a, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0003, t + d);
      o.connect(g);
      g.connect(p);
      o.start(t);
      keep(o, t + d + 0.02);
    }
  }

  // Skin. The big one is felt more than heard
  function lowDrum(t, v, pan = -0.1) {
    const p = panned(pan);
    p.connect(stage);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(92, t);
    o.frequency.exponentialRampToValueAtTime(54, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 0.62);
    o.connect(g);
    g.connect(p);
    o.start(t);
    keep(o, t + 0.66);
    // the hand meeting it
    const n = noise(t, t + 0.04);
    const f = filter('lowpass', 1400, 0.5);
    const c = ctx.createGain();
    c.gain.setValueAtTime(v * 0.5, t);
    c.gain.exponentialRampToValueAtTime(0.0004, t + 0.03);
    n.connect(f);
    f.connect(c);
    c.connect(p);
  }
  function handDrum(t, v, pan = 0.25) {
    const p = panned(pan);
    p.connect(stage);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(250, t);
    o.frequency.exponentialRampToValueAtTime(175, t + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 0.16);
    o.connect(g);
    g.connect(p);
    o.start(t);
    keep(o, t + 0.18);
    const n = noise(t, t + 0.07);
    const f = filter('bandpass', 1100, 1.1);
    const c = ctx.createGain();
    c.gain.setValueAtTime(v * 0.75, t);
    c.gain.exponentialRampToValueAtTime(0.0004, t + 0.055);
    n.connect(f);
    f.connect(c);
    c.connect(p);
  }
  // Seeds in a dry pod, shaken
  function shake(t, v, pan) {
    const n = noise(t, t + 0.07);
    const f = filter('highpass', 5200, 0.7);
    const p = panned(pan);
    const c = ctx.createGain();
    c.gain.setValueAtTime(0, t);
    c.gain.linearRampToValueAtTime(v, t + 0.006);
    c.gain.exponentialRampToValueAtTime(0.0004, t + 0.055);
    n.connect(f);
    f.connect(c);
    c.connect(p);
    p.connect(stage);
  }

  let on = false;
  let nextAt = 0;
  let inForm = 1; // (switched on, it starts with the theme)
  let playing = null; // the weather what's laid down is for
  let verse = 0;
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const moodOf = (s) => (s?.night ? 'night' : s?.mist ? 'mist' : 'day');

  // lines of the theme on a singer. Returns when they end
  function sing(voice, t, lines, step, move, v = 1) {
    let at = t;
    for (const line of lines) {
      // Free in time where it's loose, but each line still takes as long as it should, so what's under it stays with it
      const stretch = line.notes.map(() => 1 + (rnd() * 2 - 1) * line.loose);
      const was = line.notes.reduce((a, [, d]) => a + d, 0);
      const now = line.notes.reduce((a, [, d], i) => a + d * stretch[i], 0);
      line.notes.forEach(([name, d], i) => {
        const len = d * step * stretch[i] * (was / now) * (0.99 + rnd() * 0.02);
        if (name) voice.note(at, TUNE_F * NOTE[name] * move, len, v * (line.v ?? 1));
        at += len;
      });
    }
    return at;
  }
  const lengthOf = (lines) => lines.reduce((sum, line) => sum + line.notes.reduce((a, [, d]) => a + d, 0), 0);

  // the drums, from one time to another. heat: how many of them, and how hard. Each comes in only after a while, so it builds
  function drums(t, end, beat, heat, { build = 0 } = {}) {
    const u = beat / 2; // the smallest step; 7 of them go round
    const LOW = { 0: 1, 3: 0.72, 5: 0.5 };
    const HAND = { 2: 0.62, 4: 0.34, 6: 0.8 };
    let n = 0;
    for (let at = t; at < end - 0.05; at += u, n++) {
      const step = n % 7;
      const cycle = Math.floor(n / 7);
      const time = at + (rnd() - 0.5) * 0.014;
      // the swell of it
      const grow = build > 0 ? Math.min(1, 0.55 + (at - t) / build * 0.45) : 1;
      if (LOW[step]) lowDrum(time, 0.3 * heat * grow * LOW[step] * (0.9 + rnd() * 0.2));
      // the rest come in one by one
      if (heat > 0.5 && at - t > build * 0.25 && HAND[step] && rnd() < 0.92) handDrum(time, 0.2 * heat * grow * HAND[step] * (0.85 + rnd() * 0.3), step === 6 ? 0.34 : 0.14);
      // and now and then one that's not in the pattern, at the end of a cycle
      if (heat > 0.5 && step === 6 && cycle % 3 === 2) handDrum(time + u * 0.5, 0.12 * heat * grow, -0.28);
      if (heat > 0.3 && at - t > build * 0.5) shake(time, 0.055 * heat * grow * (step % 2 ? 0.55 : 1) * (0.7 + rnd() * 0.5), 0.46);
    }
    return n;
  }
  // the log, going round in 5
  function logs(t, end, beat, f0, v, pan = -0.34) {
    const u = beat / 2;
    let n = 0;
    for (let at = t; at < end - 0.05; at += u, n++) {
      const step = n % 5;
      if (step === 3) continue;
      log_(at + (rnd() - 0.5) * 0.01, f0 * LOG[step], v * (step === 0 ? 1 : 0.68), pan);
    }
  }
  // a shower: drops in bursts, thick and then thin
  // (at night, lower and with almost no rise: high and rising, in a run, a drop is a chirp, and no bird sings now)
  function rain(t, end, f0, v, thick, still = false) {
    let at = t;
    let n = 0;
    while (at < end) {
      // a burst, quickening or slowing
      const count = 2 + Math.floor(rnd() * thick);
      const gap = 0.05 + rnd() * 0.12;
      const speed = rnd() < 0.5 ? 0.86 : 1.1;
      const pan = (rnd() * 2 - 1) * 0.75;
      let g = gap;
      for (let i = 0; i < count && at < end; i++) {
        drop(at, f0 * pick(DROPS) * (still ? 0.5 : rnd() < 0.2 ? 2 : 1), v * (0.5 + rnd() * 0.5), pan + (rnd() - 0.5) * 0.25, still ? 1.04 : undefined);
        at += g;
        g *= speed;
        n++;
      }
      at += 0.3 + rnd() * rnd() * 2.4;
    }
    return n;
  }

  const scenes = {
    // only the wind and the low breath, and a few words said into it
    breath(t, mood) {
      const f0 = KEY * MOVE[mood];
      const seconds = 24 + rnd() * 12;
      windSong(t, seconds, f0, 1);
      const voice = singer(t, seconds, f0, { body: 0.07, plucked: mood === 'night' });
      let at = t + 3.5 + rnd() * 2;
      let k = pick([1, 3 / 2]);
      const said = [];
      while (at < t + seconds - 4) {
        const n = 2 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const d = (i === n - 1 ? 2.2 + rnd() * 2 : 0.5 + rnd() * 0.6) * (mood === 'night' ? 1.25 : 1);
          voice.note(at, TUNE_F * k * MOVE[mood], d, 0.55);
          said.push(+k.toFixed(3));
          at += d;
          k = pick(WALK.filter((x) => x !== k && x / k < 1.6 && k / x < 1.6));
        }
        at += 2.4 + rnd() * 3.5;
      }
      return t + seconds;
    },
    // the call and its answer, a drum under it, and a little water
    theme(t, mood) {
      const f0 = KEY * MOVE[mood];
      const beat = BEAT[mood];
      const lines = [THEME[0], THEME[1], THEME[2]];
      const start = t + beat * 3;
      const end = start + lengthOf(lines) * STEP[mood];
      const voice = singer(t, end - t + 2.5, f0, { body: 0.04, plucked: mood === 'night' });
      drums(t + beat * 2, end, beat, HEAT[mood] * 0.55);
      rain(start, end + 1.5, f0, 0.09, 3, mood === 'night');
      sing(voice, start, lines, STEP[mood], MOVE[mood]);
      return end + 2.5;
    },
    // water everywhere, and something like a bird in it: the theme's opening, up high and in pieces, on the singer
    rain(t, mood) {
      const f0 = KEY * MOVE[mood];
      const seconds = 20 + rnd() * 9;
      const drops = rain(t, t + seconds, f0, 0.15, mood === 'night' ? 3 : 7, mood === 'night');
      logs(t + seconds * 0.3, t + seconds * 0.8, BEAT[mood], f0, 0.11 * (mood === 'night' ? 0.6 : 1));
      windSong(t, seconds, f0 * 2, 0.09);
      const voice = singer(t, seconds, f0, { body: 0.02, pan: 0.2, plucked: mood === 'night' });
      const beat = BEAT[mood] * 0.5;
      let at = t + 2.5 + rnd() * 2;
      // (the opening of the tune up an octave, in pieces)
      const pieces = [['G5', 'C6', 'Bb5'], ['C6', 'Bb5', 'G5'], ['G5', 'F5', 'G5'], ['G5', 'A5', 'G5']];
      while (at < t + seconds - 3) {
        for (const k of pick(pieces)) {
          voice.note(at, TUNE_F * NOTE[k] * (mood === 'night' ? 1 : 2) * MOVE[mood], beat, 0.55);
          at += beat;
        }
        at += 2.6 + rnd() * 4;
      }
      return t + seconds;
    },
    // all of it: the drums come in and build under the whole theme, and it stops dead
    dance(t, mood) {
      const f0 = KEY * MOVE[mood];
      const beat = BEAT[mood];
      const heat = HEAT[mood];
      const lines = THEME;
      const lead = beat * 7;
      const length = lengthOf(lines) * STEP[mood];
      const end = t + lead + length;
      const voice = singer(t, end - t + 0.6, f0, { body: 0.05, plucked: mood === 'night' });
      drums(t, end, beat, heat, { build: lead + length * 0.45 });
      logs(t + lead * 0.5, end, beat, f0, 0.15 * heat);
      windSong(t + lead, length, f0, 0.2);
      rain(t + lead, end, f0, 0.08, 4, mood === 'night');
      sing(voice, t + lead, lines, STEP[mood], MOVE[mood], 1.05);
      // and out: a last run on the drums, faster and faster, and one blow
      if (heat > 0.5) {
        let at = end - beat * 2;
        let g = beat * 0.38;
        while (at < end - 0.02) {
          handDrum(at, 0.24 * heat, at < end - beat ? 0.2 : -0.2);
          at += g;
          g *= 0.82;
        }
      }
      lowDrum(end, 0.45 * heat);
      return end + 1.4;
    },
  };

  function playNext(t, s) {
    const [kind, quietA, quietB] = FORM[inForm];
    inForm = (inForm + 1) % FORM.length;
    playing = moodOf(s);
    if (!stage) newStage();
    const end = scenes[kind](t, playing);
    return end + quietA + rnd() * (quietB - quietA);
  }

  return {
    setLevel(v, t) { level.gain.setTargetAtTime(v, t, 0.1); wetLevel.gain.setTargetAtTime(v, t, 0.1); },
    setOn(v, t) {
      if (v === on) return;
      on = v;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setTargetAtTime(v ? 1 : 0, t, v ? 0.3 : 0.5);
      if (v) {
        nextAt = t + 1.2;
        inForm = 1;
      }
      else {
        // what's already been laid down stops once it's faded
        for (const n of live) { try { n.stop(t + 2.5); } catch { /* it had a stop time already and that's fine */ } }
        stage = null;
        playing = null;
      }
    },
    update(t, s) {
      // the wind that's passing now is the wind that sings
      const gust = Math.max(0, ((s?.gustL ?? 0) + (s?.gustR ?? 0)) * 0.5);
      windy?.gain.setTargetAtTime(0.45 + Math.min(gust, 1) * 1.1, t, 0.6);
      // the weather's changed: what's playing lets go, and the tune comes in again in the new one
      if (on && playing && moodOf(s) !== playing) {
        stage.gain.setTargetAtTime(0, t, 0.45);
        for (const n of live) { try { n.stop(t + 2.2); } catch { /* it had a stop time already and that's fine */ } }
        stage = null;
        inForm = 1;
        nextAt = t + 1.1;
        playing = moodOf(s);
      }
      if (on && t >= nextAt) nextAt = playNext(t + 0.2, s);
    },
  };
}
