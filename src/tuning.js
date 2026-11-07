// All the values the look is made of. tuning.json and tuning_caozhou.json override the defaults below.

const DEFAULTS = {
  wind: {
    az: 62, // where the wind blows towards, degrees
    speed: 9, // how fast the gusts travel, m/s
    size: 460, // how large the gusts are (the patches are about a quarter of this), m
    cover: 0.51, // higher = fewer gusts
    soft: 0.13, // how gradually a gust's edge fades
    small: 0.45, // share of the smaller gusts inside the big ones
    fine: 0.5, // patches a few metres wide inside the gusts
    warp: 70, // how far the gusts wander, m
    turb: 0.5, // the wind's unsteadiness
    spread: 12, // how much the grass turns outwards at a gust's edges
    stiff: 14, // the grass's stiffness: how fast it answers (its sway is about 0.6 per second)
    damp: 3.2, // damping going over: lower = it overshoots further
    dampBack: 5.5, // damping coming back: higher = it comes back more slowly
    couple: 22, // how much neighbouring grass pulls on itself, which carries a push onward
    bend: 0.55, // how far over a push takes the grass (radians)
    follow: 1.1, // how much a push across the grass turns it
    flutter: 0.05, // each blade's own small shiver
  },
  blade: {
    len: 1.55, // m
    width: 1, // multiplies each layer's blade width
    root: 0.72, // how far from vertical a blade leaves the ground (radians)
    tip: 1.7, // ... and how far it has fallen over at its tip (pi/2 = 1.57 is flat)
    comb: 1, // how far the combed direction swings away from the wind
    jitter: 0.1, // each blade's random turn away from the combed direction (small = smooth fur)
    fall: 0.5, // how much the grass also falls downhill
    density: 1, // fraction of all blades drawn
    part: 1.5, // radius the grass parts around the walker, m
    tuft: 0.6, // how much neighbouring blades lean and move together in tufts
    hug: 0, // how far lying blades follow the slope they lie on
  },
  light: {
    az: 215, // where the sun is, degrees
    el: 34, // sun height, degrees
    kd: 1, // the land's slopes facing the sun
    nap: 0.05, // grass combed towards the sun is brighter, like stroked velvet
    bias: -0.42, // shifts everything towards lit
    band: 0.13, // softness of the lit / shadow edge
    backSlope: 0, // how gently slopes turned away from the sun go into shadow (0 = they drop into it past a certain tilt)
    bandAmt: 0.35, // strength of the painted colour on that edge
    vary: 0.07, // blade-to-blade brightness difference (small = smooth fur)
    cloud: 0.8, // how dark the cloud shadows crossing the land are
    cover: 0.34, // how much of the sky is cloud, and of the land under its shadow: a true share, 0 = none, 1 = all of it
    cloudSize: 620,
    cloudSpeed: 9,
    cloudLink: 0, // 1 = the shadows on the land are the shadows of the clouds in the sky, cast from where the sun is
    haze: 0.0011,
    hazeUp: 0, // the mist lies low: how much of it is left below you when you've climbed about 25 m
    stem: 0.2, // how much the pale purple stems show where a crest parts the grass
  },
  color: {
    hueLock: true, // the grass's colours turn together (colorLock.js)
    lit: '#b4cd74',
    lit2: '#d3d884',
    shade: '#bddcf0',
    band: '#e8e096',
    sheen: '#fffbe2',
    gust: '#f2f1c4',
    stem: '#bdb2e6',
    haze: '#e6f3f8',
    bank: '#e4e6d6',
    wet: '#66b254', // the grass where its roots are wet
    skyTop: '#8cc6ef',
    skyLow: '#eef7fa',
    cloud: '#ffffff',
    bed: '#cfe3e2',
    deep: '#b2d9e8',
  },
  // the light on each blade, as it is actually bent at that moment
  gloss: {
    spec: 30, // the sun's reflection off the leaf
    shine: 18, // how tight it is near by: higher = smaller, sharper glints
    shineFar: 9, // ... and far off, where many small glints blur into a sheen
    twinkle: 0.7, // how much moving blades roll, and so flash
    sky: 0.3, // the sky mirrored in blades seen at a low angle
    facing: 0.4, // how much a blade's own turn towards or away from the sun changes its brightness
    press: 0.34, // the paler colour that bending shows
    scatter: 0.12, // light bouncing around inside the grass, in the colour set as 透亮
    gap: 0.6, // the dark where grass lies in the shade of the grass beside it
    gapDist: 2.5, // how far along towards the sun to look for that, m
  },
  // what makes it a clear sunny day, on top of the colours above
  sun: {
    relief: 1.5, // how much the slopes turn to and from the sun
    saturate: 1.25, // sunlit grass colour
    glow: 0.4, // the sun coming through the blades when looking towards it
    glowColor: '#d9ee62',
    contrast: 0.55,
    depth: 0.28, // the blades' lower parts out of the sun
    clear: 0.32, // how much of the haze is left on a clear day
    sky: 0.75, // how far the sky goes to the clear colours below
    zenith: '#2f8fe6',
    horizon: '#b9def5',
    cloudBlue: '#8fbdf5', // the shaded parts of the clouds
    glint: 1.6, // the sun's glitter on water
  },
  // the different grasses: where each grows is baked (terrain.js), and these are their colours in plain day; 湿雾薄晴 and night have their own
  kinds: {
    amount: 0, // how far the grass goes to these colours (草洲 has them; see CAOZHOU)
    straw: 0.04, // what share of blades have died and gone to straw
    dry: '#d4cf88', // high and dry ground, and drifts on the flat
    cool: '#7fab8e', // stands on low damp ground
    rose: '#cbc4a6', // stands here and there
  },
  // the sun through high ice cloud: a ring at 22 degrees, with a mock sun at 12, 3, 6 and 9 o'clock on it (by day, in clear weather and in mist)
  halo: {
    amount: 0, // all of it (草洲 has it; see CAOZHOU)
    radius: 22, // how far out the ring stands from the sun, degrees (22 in nature)
    ring: 0.5, // how strong the ring is
    suns: 1, // how strong the mock suns are
    size: 1, // how big the mock suns are
    color: '#fff0c4', // the ring's inner edge
    pillar: 0.4, // the pillar through the sun
    circle: 0.3, // the flat circle through the sun and the mock suns
    arcs: 0.5, // the wings on the top and bottom of the ring
    bigShare: 0.7, // how bright the big halo is, as a share of the ring
    bigRadius: 46, // degrees (46 in nature)
    zenith: 0.25, // the arc round the zenith
    through: 0.25, // how far it all shows through a cloud in front: heaped cloud is thick
    sun: 1, // how strong the sun itself is
    sunThrough: 0.25, // how far the sun itself shows through a cloud in front
    sunSize: 1, // how big the sun itself looks
  },
  // 三渲二: flat tones with hard edges, and a line around the bones (the T key switches it)
  toon: {
    on: false,
    strand: 0.5, // how far the tone edges break up, blade by blade
    gust: 0.42, // how strong a gust must be to show as a paler tone
    sheen: 0.72, // how bright the silky highlight must be to show as a tone
    waterSoft: 45, // how far off the depth bands in the water are fully hard, m; 0 = hard all the way
    hazeSteps: 6, // distance in this many flat steps; 0 = smooth
    outline: 1, // the line around the bones
    outlineColor: '#5d7fae',
    softClouds: 0, // 1: on a clear day the sky has the soft clouds of the realistic mode, as it does in the mist (mist.softClouds, night.softClouds)
    clouds: 0, // when not: 0 = flat shapes, 1 = heaped clouds with round puffs above and a smooth base
    cloudTall: 0.5, // how much the puffs stand out
  },
  // 荻 by the water, 草洲 only
  reeds: {
    amount: 1, // how much of the shore has them: 1 = as first laid out; more spreads along the shore from where they already are
    density: 1, // fraction of each clump's stems drawn
    height: 1,
    bend: 0.42, // how far the wind takes them over (the grass takes it further)
    flutter: 0.035,
    droop: 0.85, // how far the plumes arch over and hang
    stream: 2.6, // how far the wind carries the plumes and leaves out from the stem
    shade: 0.5, // how far their shaded parts go to the shadow colour (that's where their blue comes from)
    stalk: '#bac773',
    leaf: '#a2bc62',
    leaf2: '#c5cc7a',
    plume: '#f8f3e8',
    plumeBase: '#e3d8d2', // lower in the plume, faintly pink as 荻 flowers are
  },
  // 红蓼, 草洲 only (flowers.js): mostly round the bones, its colour answering the purple-red they take from below
  flowers: {
    amount: 1, // what share of the stands there are
    height: 1,
    bend: 0.5,
    flutter: 0.04,
    droop: 0.92, // how far the spikes hang over
    stream: 1.2, // how far the wind carries the spikes and leaves out from the stem
    shade: 0.45,
    stalk: '#9db568',
    leaf: '#8fa863',
    leaf2: '#adc074',
    spike: '#b83d6e', // the flower spikes
    spikeBase: '#d7789a', // paler where a spike begins
  },
  // the shadows of the reeds and flowers near you (plantShadow.js)
  plantShadow: {
    amount: 1, // how dark, as a share of a full shadow
    wide: 2, // how much wider than themselves the parts are in it, or fine ones fall between the texels
  },
  // far mountains, 草洲 only: part of the sky, so they can't be reached, and they reflect
  hills: {
    height: 1,
    az: 305, // which way the range lies, degrees
    span: 80, // how far round it reaches each way, degrees
    around: 0.06, // how high the far land stays elsewhere, as a share of the range
    mist: 0.85, // how far the feet of each layer dissolve
    distance: 400, // how far off the nearest layer is taken to be, for the air in front of it, m. The furthest is 2.2 times that
    feet: 1, // the reeds and water along the feet of the nearer ones
    flat: 0, // 0 = the land's own surface; 1 = flat in the two colours below
    near: '#a4bfc2',
    far: '#d2e2e8',
  },
  bones: {
    scale: 1, // their size, and the spaces between them with it
    depth: 0.6, // how far the side away from the sun goes towards the shadow colour
    form: 0, // 0 = one flat white with a hard edge; 1 = lit by the grass's own light, rounding off towards the side away from the sun
    occlusion: 0, // the dark in hollows and between ribs
    bounce: 0, // the sky on what faces up, the grass's colour on what faces down and on the foot in the grass
    coil: 'nautilus', // how the great spine lies: 'nautilus' or 'serpent'
    darkShare: 0, // moves the edge of light and dark on them: 0 = where the sun really puts it, above = more dark
    castShadow: 1, // the shadows they throw on each other: 1 = as they really fall
    castFade: 0.45, // where the sun only grazes a bone those shadows fade out, by how square-on it has to be to keep them: 0 = they don't
    bandColor: '#e8e096', // the colour on the edge between light and dark
    bandAmt: 0.33,
    bounceColor: '#b1c280', // the colour in what's out of the sun, a choice rather than what the light would do
    bounceGrass: '#b1c280', // the grass's own colour coming up onto them, near the ground
    bounceMix: 0, // how much of that gets in, in patches
    sheenColor: '#fffbe2', // the sun's reflection off them
    sheenAmt: 1,
    lit: '#fdfaf0',
    shade: '#c3d9ee',
  },
  water: {
    ripple: 0.06, gust: 1.5, mirror: 0.72, shoreAlpha: 0.14,
    clear: 0, // how much of the bed shows through; 0 = none, an opaque mirror
    absorb: 0.8, // how fast the bed fades going deeper
    shallow: 0.2, // down to about this depth (m) the reflection gives way to the bed
    web: 0, // the sun's moving web of light on the bed
    marks: 0, // the ripple marks in the sand
    sand: '#ddd5ae',
    mud: '#a3a78c',
  },
  shore: { from: -0.12, to: 0.14, short: 0.45, wet: 0, wetTo: 1, stand: 1 }, // stand: how deep grass stands in the water, m
  // egrets (white_feather's), 草洲 only
  birds: {
    count: 0, // how many, read on loading
    size: 1.4, // larger than life, so they read at a distance; read on loading
    shy: 1, // how far off they take fright
    lit: '#ffffff',
    shade: '#b6cde6',
    beak: '#e2b23c',
    leg: '#23262c',
  },
  walk: {
    speed: 3.2,
    run: 9,
    fly: 26,
    trail: 40, // how long a path walked through the grass lasts, seconds until it's a third as flat
    trailAmt: 1, // how flat it's trodden
    trailWide: 1.9, // how wide the path is, as a multiple of a walker's own width
    reach: 1, // 1: the grass and the water are disturbed where the bottom of the picture is, so you see it without looking down; 0: at your feet
    ripple: 1, // how hard a step pushes the water
  },
  // 湿雾薄晴 (the M key, 草洲): the sun behind high thin cloud, shadows pale but still with a direction, the far land going into the wet air, mist
  // lying low on the water. The wind's bright parts stay. It keeps its dark in small places (wet mud, the wet grass, the reeds' feet), not overall.
  mist: {
    on: false,
    density: 0.0075, // how thick the low mist is at the ground, per m
    height: 5, // how high it reaches, m
    patch: 0.75, // how much it lies in banks rather than evenly
    soft: 1, // how veiled the sun is
    softClouds: 1, // 1: in 三渲二 the sky has the soft clouds of the realistic mode, so they and the mist are the same kind of thing
    vol: 1, // 1 = real volumetric mist, stepped through; 0 = the plain low mist worked out by formula
    volDensity: 0.11, // how thick at the ground, per m
    volHeight: 4.5, // how high it reaches, m
    volCover: 0.62, // how much of the air is mist, the rest being clear gaps
    volSize: 170, // how big the banks are, m
    volClear: 5, // how far round you it's held back, m. Much further, and a bank fades as you walk up to it, and you never get in
    volEdge: 0.3, // how soft a bank is: small, thick inside with a clear edge; large, thin all through, so that inside one there's little to see
    volDrift: 1.4, // how fast the wind carries it along, m/s
    volShaft: 0.75, // how far the clouds' shadows show in it, as shafts of light
    volGlow: 0.5, // how bright it glows looking towards the sun
    volSteps: 28, // how many steps along each line of sight
    volRes: 0.34, // at what share of the screen's resolution
    volBlur: 2, // how far its grain is blurred away, in its own pixels; 0 = not at all
    volLit: '#f1f1e6',
    volShade: '#a9bcc5',
    look: {
      color: {
        lit: '#8fa56d', lit2: '#aebf7f', shade: '#4f7286', band: '#cfd4a4', sheen: '#f2f3df', gust: '#dfe4bf', haze: '#dbe3df',
        bank: '#6d7f62', wet: '#4d7a58', skyTop: '#9dbccd', skyLow: '#dde5e2', cloud: '#f3f4ee', bed: '#b1c5bf', deep: '#88a4aa',
      },
      sun: { relief: 0.95, saturate: 1, glow: 0.26, contrast: 0.3, depth: 0.26, clear: 1, sky: 0, cloudBlue: '#bfd0da', glint: 0.45 },
      gloss: { spec: 15, shine: 10, shineFar: 6, sky: 0.35 },
      light: { kd: 0.6, bias: -0.08, band: 0.24, bandAmt: 0.2, cloud: 0.22, cover: 0.34, haze: 0.0012, hazeUp: 0.25, backSlope: 2 },
      shore: { wet: 0.55, wetTo: 0.3 },
      reeds: { stalk: '#71875f', leaf: '#7c9068', leaf2: '#a4b284', plume: '#f2f0e8', plumeBase: '#d2d3d6', shade: 0.75 },
      bones: { lit: '#f8f8f3', shade: '#8ea7bd', depth: 0.75, bandColor: '#e6dcc6', bandAmt: 0.18, sheenAmt: 0.3, sheenColor: '#fbfaf0', castShadow: 0.7 },
      birds: { lit: '#fbfbf7', shade: '#bccad4' },
      hills: { mist: 0.95 }, // (the colours are the day's: they're set once, in the 远山 folder)
      kinds: { dry: '#bcbd84', cool: '#7d9d83', rose: '#b5a892' },
      flowers: { stalk: '#71875f', leaf: '#6e8560', leaf2: '#8fa276', spike: '#a3607c', spikeBase: '#bb8a9d' },
      halo: { amount: 0.75, through: 0.85, sun: 1.8, sunThrough: 0.85, sunSize: 1 }, // (the veil the mist's sun is seen through is what makes them: they're in it, not behind it)
      water: { mirror: 0.82, clear: 0.68, absorb: 0.85, ripple: 0.035, gust: 1.5, web: 0, marks: 0.06, sand: '#c5c3a9', mud: '#6c7360' },
    },
  },
  // night (the N key): seven moons in an arch, in the order of their phases, the full one at the top; it is the light
  night: {
    on: false,
    softClouds: 0, // 1: at night the sky has soft clouds, which leave the moons and stars more room
    // the same volumetric mist as 湿雾薄晴's (fog.js), lying on the ground under the moons
    fog: {
      on: 0,
      density: 0.06, // how thick at the ground, per m
      height: 6, // how high it reaches, m
      cover: 0.6, // how much of the air is mist, the rest being clear gaps
      shaft: 0.6, // how far the clouds' shadows show in it
      glow: 0.5, // how bright it glows looking towards the moons
      lit: '#7a8db4', // where the moons reach it
      shade: '#2f3f66', // where they don't
    },
    az: 330, // which way the arch stands, degrees
    // Part of a circle the size of a rainbow's, whose centre is below the horizon: a low arc right across the sky.
    rise: -12, // how high the centre of the circle is, degrees
    radius: 42, // the circle's radius, degrees (a rainbow's is 42)
    span: 134, // how much of the circle the moons stand along, degrees
    even: 0.75, // 0 = evenly spaced on the sky; 1 = evenly spaced on the screen when facing the middle (the far ends then look close from nearby)
    size: 1.25, // a moon's radius, degrees (the real moon's is a quarter of a degree)
    full: 1, // how much larger the full moon is
    stars: 0.9,
    crescent: 1, // how much the thin moons low at the ends are held up against the air's dimming
    moon: '#f7f5ec',
    moonDark: '#26325c', // the side that isn't lit
    glow: '#8ba2d6', // the air around a moon
    fireflies: 0, // how many there are around you at a time, counting those not lit just now (草洲 has them; see CAOZHOU)
    fireflyColor: '#d6f25c',
    fireflySize: 0.7, // how big the light of one looks with its glow, m across
    fireflyBright: 1.6,
    fireflyLight: 0.7, // how much light they lay on what's just under them
    fireflyReach: 1.3, // how far that light goes, m
    // what changes at night, over the day's values in the same places
    look: {
      color: {
        lit: '#54798a', lit2: '#7298a5', shade: '#1b2b52', band: '#7a97b5', sheen: '#e2ecff', gust: '#a7c2d6', stem: '#5c629e', haze: '#1e2d50',
        bank: '#3e5667', wet: '#3b6b73', skyTop: '#0b1433', skyLow: '#2a3b66', cloud: '#6a79a4', bed: '#2b4b68', deep: '#1a2b50',
      },
      sun: { relief: 1, saturate: 1, glow: 0.22, glowColor: '#7cb6b0', contrast: 0.2, depth: 0.3, clear: 0.7, sky: 0, cloudBlue: '#303e6a', glint: 1.3 },
      light: { kd: 0.6, bias: -0.1, nap: 0, cloud: 0.5, cover: 0.34, haze: 0.0024 },
      reeds: { stalk: '#4a697c', leaf: '#4a697c', leaf2: '#6c8c98', plume: '#d3dff2', plumeBase: '#8c9ec2', shade: 1 },
      bones: { lit: '#e2ebfa', shade: '#7591c2', depth: 0.8, bandColor: '#7a97b5', bounceColor: '#638897', bounceGrass: '#4f7a78', sheenColor: '#e2ecff' },
      hills: { near: '#20345a', far: '#2e426c' },
      water: { mirror: 0.86, clear: 0.4, absorb: 0.8, web: 0, marks: 0.05, sand: '#4a6072', mud: '#283a4f' },
      toon: { outlineColor: '#a4bce4' },
      birds: { lit: '#dfe9fa', shade: '#6d8aba', beak: '#8a8066', leg: '#10141f' },
      kinds: { dry: '#86a3a6', cool: '#4c7590', rose: '#7d86ab' },
      flowers: { stalk: '#4a697c', leaf: '#46657a', leaf2: '#638092', spike: '#7a5d96', spikeBase: '#8f82b2' },
    },
  },
  // sound (src/sound.js) and music (src/music.js), each with its own switch: V and B
  sound: {
    on: true, // the sounds of the place
    musicOn: false, // the music
    volume: 0.85, // all of it
    wind: 1,
    water: 1,
    reeds: 1,
    bones: 1,
    steps: 1,
    life: 1, // birds; at night, crickets and frogs
    music: 0.7,
  },
  camera: { fov: 58, eye: 1.62, pixelRatio: 1.5 },
};

// 草洲 starts from whatever 草原 is set to, with these on top. Saving there goes to its own file (tuning_caozhou.json), which from
// then on has the last word, and 草原's file is left alone.
const CAOZHOU = {
  blade: { hug: 0.9 },
  // humid air: bright, but milky; the far land dissolves into the sky
  sun: { sky: 0.35, clear: 0.85, zenith: '#6fb2ea', horizon: '#eaf3f3', cloudBlue: '#a6cdf5', relief: 1, contrast: 0.35 },
  color: { shade: '#9fc0dc', bank: '#a9bd8a', bed: '#c7ddd4', deep: '#a9d3dd', haze: '#eaf3f3', skyLow: '#f0f6f4' },
  // no hills to shape the light on flat land: big soft cloud shadows do that instead
  light: { cloud: 0.42, cloudSize: 900, cloudSpeed: 7, cloudLink: 1, bias: -0.1, hazeUp: 0.6, backSlope: 1.6 },
  // the grass runs on into the shallows, shorter and deeper green the wetter it stands
  shore: { from: -0.32, to: 0.05, short: 0.55, wet: 0.7, wetTo: 0.32, stand: 0.08 },
  // white, but in the same air as the grass
  bones: { form: 1, occlusion: 0.7, bounce: 0.5, bounceMix: 0.75 },
  toon: { clouds: 1, softClouds: 1 },
  halo: { amount: 1 },
  kinds: { amount: 0.75 },
  birds: { count: 72 },
  night: { fireflies: 1400, softClouds: 1, fog: { on: 1 } },
  water: { mirror: 0.8, shoreAlpha: 0.1, clear: 0.95, absorb: 0.5, web: 0.12, marks: 0.12 },
};

export const tuning = structuredClone(DEFAULTS);

function merge(into, from) {
  for (const [k, v] of Object.entries(from || {})) {
    if (!(k in into)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) merge(into[k], v);
    else into[k] = v;
  }
}

async function readFile(name) {
  try {
    const r = await fetch(name, { cache: 'no-store' });
    if (r.ok) merge(tuning, await r.json());
  } catch { /* the defaults */ }
}

export async function loadTuning() {
  await readFile('./tuning.json');
  merge(tuning, CAOZHOU);
  await readFile('./tuning_caozhou.json');
}

// The full moon's height over the horizon, in degrees: it's at the top of the arch.
export function moonHeight() {
  const { rise, radius } = tuning.night;
  const d = Math.PI / 180;
  return Math.asin(Math.cos(radius * d) * Math.sin(rise * d) + Math.sin(radius * d) * Math.cos(rise * d)) / d;
}

// Runs fn with the values of the time of day standing in for the plain day's: night, or if not then 湿雾薄晴. They're put back at once:
// tuning holds what's saved.
export function withLook(fn) {
  if (!tuning.night.on && !tuning.mist.on) return fn();
  const was = [];
  const put = (into, from) => {
    for (const [k, v] of Object.entries(from)) {
      if (v && typeof v === 'object') put(into[k], v);
      else { was.push([into, k, into[k]]); into[k] = v; }
    }
  };
  if (tuning.night.on) {
    put(tuning, tuning.night.look);
    put(tuning, { light: { az: tuning.night.az, el: moonHeight() } });
  } else {
    put(tuning, tuning.mist.look);
  }
  try {
    return fn();
  } finally {
    for (const [into, k, v] of was.reverse()) into[k] = v;
  }
}
