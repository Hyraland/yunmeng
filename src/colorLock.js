// Colours whose hues keep fixed differences. Each keeps its own lightness and chroma; only the hue turns, measured in OKLCH
// so that turning it doesn't change how light it looks. The wanted colour is kept apart from the hex shown, so a hue that
// leaves the sRGB gamut for a moment loses some chroma only while it's out, and comes back whole.

function toLinear(c) { return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
function toSrgb(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; }

export function hexToLch(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = toLinear(((n >> 16) & 255) / 255);
  const g = toLinear(((n >> 8) & 255) / 255);
  const b = toLinear((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: (Math.atan2(B, A) * 180) / Math.PI };
}

function lchToLinear({ L, C, h }) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function lchToHex(c) {
  // out of gamut: lower chroma until it fits, keeping lightness and hue
  let lo = 0;
  let hi = c.C;
  let rgb = lchToLinear(c);
  const inside = (v) => v.every((x) => x >= -0.0005 && x <= 1.0005);
  if (!inside(rgb)) {
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (inside(lchToLinear({ ...c, C: mid }))) lo = mid;
      else hi = mid;
    }
    rgb = lchToLinear({ ...c, C: lo });
  }
  const byte = (x) => Math.round(Math.min(1, Math.max(0, toSrgb(Math.max(0, x)))) * 255);
  return `#${rgb.map((x) => byte(x).toString(16).padStart(2, '0')).join('')}`;
}

const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

// members: [{ obj, key }]: where each colour lives, as a hex string
export function createHueLock(members) {
  const wanted = new Map(members.map((m) => [m, hexToLch(m.obj[m.key])]));
  const turnOthers = (d, except) => {
    for (const m of members) {
      if (m === except) continue;
      const c = wanted.get(m);
      c.h += d;
      m.obj[m.key] = lchToHex(c);
    }
  };
  return {
    // one colour was edited. With locked on, the others turn with it.
    edited(member, locked) {
      const before = wanted.get(member);
      const now = hexToLch(member.obj[member.key]);
      // a colour with almost no chroma has no meaningful hue: keep the relation it had
      if (now.C < 0.012) {
        now.h = before.h;
      } else if (locked) {
        turnOthers(wrap(now.h - before.h), member);
      }
      wanted.set(member, now);
    },
    // turn them all together
    rotate(d) {
      turnOthers(d, null);
    },
    // all together: chroma by a factor, lightness by an amount. As with the hue, what's wanted is kept apart from what's shown,
    // so anything clipped on the way comes back whole on the way back.
    scaleChroma(f) {
      for (const m of members) {
        const c = wanted.get(m);
        c.C *= f;
        m.obj[m.key] = lchToHex(c);
      }
    },
    shiftLightness(d) {
      for (const m of members) {
        const c = wanted.get(m);
        c.L += d;
        m.obj[m.key] = lchToHex({ ...c, L: Math.min(1, Math.max(0, c.L)) });
      }
    },
    hueDifference(a, b) {
      return wrap(wanted.get(b).h - wanted.get(a).h);
    },
    members,
  };
}
