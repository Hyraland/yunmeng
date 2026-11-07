import * as THREE from 'three';

// The uniforms and GLSL shared by everything. One wind field and one "fur surface" colour: the blades, the ground far
// away and the water all ask the same functions, which is why the grass reads as one smooth pelt.

export const U = {
  uHeightTex: { value: null },
  uCombTex: { value: null },
  uKindsTex: { value: null }, // which grass grows where (terrain.js)
  uKinds: { value: new THREE.Vector2() }, // how far it goes to those colours, what share of blades are straw
  uKindDry: { value: new THREE.Color() },
  uKindCool: { value: new THREE.Color() },
  uKindRose: { value: new THREE.Color() },
  uNoiseTex: { value: null },
  uField: { value: null },
  uFieldCenter: { value: new THREE.Vector2() },
  uFieldSize: { value: 1 },
  uTrail: { value: null },
  uTrailCenter: { value: new THREE.Vector2() },
  uTrailSize: { value: 1 },
  uWave: { value: null }, // the water's surface round a wader (waves.js)
  uWaveAt: { value: new THREE.Vector3() }, // where it's centred, and whether there's anything on it
  uGlow: { value: null }, // the light of the fireflies on what's under them (fireflies.js)
  uGlowAt: { value: new THREE.Vector3(0, 0, 1) }, // where that's centred, how much land it covers
  uGlowAmt: { value: 0 },
  uFireflyCol: { value: new THREE.Color() },
  uHalo: { value: new THREE.Vector4() }, // the ring's strength, its radius, the mock suns' strength, their size
  uHaloB: { value: new THREE.Vector4() }, // the pillar, the flat circle, the tangent arcs, the big halo
  uHaloC: { value: new THREE.Vector4() }, // the zenith arc, how far they show through cloud, the big halo's radius
  uHaloD: { value: 1.3 }, // how high the zenith arc stands
  uHaloCol: { value: new THREE.Color() },
  uSunShow: { value: new THREE.Vector3(1, 0, 1) },
  uPeriod: { value: 1400 },
  uTime: { value: 0 },
  uCam: { value: new THREE.Vector3() },
  uSun: { value: new THREE.Vector3(0, 1, 0) },
  uWindDir: { value: new THREE.Vector2(1, 0) },
  uBladeLook: { value: new THREE.Vector4() }, // kd, pressed tint, nap, bias
  uBandLook: { value: new THREE.Vector4() }, // band, bandAmt, how gently slopes turned away go to shadow, gloss exponent near
  uGlossA: { value: new THREE.Vector4() }, // sun highlight, gloss exponent far, sky reflection, how much a blade's own turn matters
  uGlossB: { value: new THREE.Vector4() }, // dark in the gaps, distance to look for what shades it, -, -
  uMisc: { value: new THREE.Vector4() }, // vary, cloud, cloudSize, cloudSpeed
  uHaze: { value: 0 },
  uStemAmt: { value: 0 },
  uWetCol: { value: new THREE.Color() },
  uWet: { value: new THREE.Vector2() }, // how much, and up to how high above the water
  uLit: { value: new THREE.Color() },
  uLit2: { value: new THREE.Color() },
  uShade: { value: new THREE.Color() },
  uBandCol: { value: new THREE.Color() },
  uSheenCol: { value: new THREE.Color() },
  uGustCol: { value: new THREE.Color() },
  uStem: { value: new THREE.Color() },
  uHazeCol: { value: new THREE.Color() },
  uSkyTop: { value: new THREE.Color() },
  uSkyLow: { value: new THREE.Color() },
  uCloudCol: { value: new THREE.Color() },
  uCloudShadeCol: { value: new THREE.Color() },
  uTransCol: { value: new THREE.Color() },
  uSunA: { value: new THREE.Vector4() }, // relief, saturation, glow through the blades, contrast
  uSunB: { value: new THREE.Vector4() }, // tighter sheen, depth in the grass, -, -
  uShadowTex: { value: null },
  uShadowVP: { value: new THREE.Matrix4() },
  uShadowNearTex: { value: null }, // the same at about 2 cm a texel, for the bones right around you (bones.js)
  uShadowNearVP: { value: new THREE.Matrix4() },
  uPlantTex: { value: null }, // the sun's view of the reeds and flowers near you (plantShadow.js)
  uPlantVP: { value: new THREE.Matrix4() },
  uPlantShadow: { value: new THREE.Vector2() }, // how dark, how far from you
  uShadowOn: { value: 0 },
  uToon: { value: 0 },
  uToonA: { value: new THREE.Vector4() }, // strand-by-strand edge, gust threshold, sheen threshold, haze steps
  uMist: { value: new THREE.Vector4() }, // low mist: thickness at the ground (per m), how high it reaches (m), patchiness; how veiled the sun is
  uCloudCover: { value: 0 }, // added to the cloud pattern everywhere it's read, in the sky and in the shadows alike: more of it clears the threshold
  uCloudLink: { value: 0 }, // 1: the shadows on the land are the shadows of the clouds in the sky
  uNight: { value: 0 },
  uMoon: { value: Array.from({ length: 7 }, () => new THREE.Vector4()) }, // direction, angular radius
  uMoonLit: { value: Array.from({ length: 7 }, () => new THREE.Vector3()) }, // which way on the sky its lit side faces
  uMoonPhase: { value: new Array(7).fill(0) }, // radians between full (0) and new (pi)
  uMoonCol: { value: new THREE.Color() },
  uMoonDark: { value: new THREE.Color() },
  uMoonGlow: { value: new THREE.Color() },
  uCrescent: { value: 0 },
  uStars: { value: 0 },
  uPuffTex: { value: null },
  uCloudForm: { value: new THREE.Vector3() }, // heaped clouds or not, how tall, soft painted clouds in 三渲二 (each weather has its own switch)
};

export const COMMON = /* glsl */ `
precision highp float;
#define TAU 6.28318530718
uniform sampler2D uHeightTex, uCombTex, uKindsTex, uNoiseTex, uField, uTrail, uGlow;
uniform vec2 uKinds;
uniform vec3 uKindDry, uKindCool, uKindRose;
uniform vec2 uFieldCenter, uTrailCenter;
uniform float uFieldSize, uTrailSize, uGlowAmt;
uniform vec3 uGlowAt, uFireflyCol;
uniform float uPeriod, uTime, uHaze, uStemAmt;
uniform vec3 uCam, uSun;
uniform vec2 uWindDir;
uniform vec4 uBladeLook, uBandLook, uMisc;
uniform vec3 uLit, uLit2, uShade, uBandCol, uSheenCol, uGustCol, uStem, uHazeCol, uSkyTop, uSkyLow, uCloudCol, uCloudShadeCol, uTransCol;
uniform vec4 uSunA, uSunB, uGlossA, uGlossB;
uniform vec3 uWetCol;
uniform vec2 uWet;
// set before furColor by what's seen from afar as a whole, not blade by blade: how far its noise may move the edge of the land's own light
float gLandBreak = 1.0;
// set before furColor: how wet this grass's roots are, from its height above the water
float gWet = 0.0;
float gNoSheen = 0.0; // 1: no flash of the sun off this (a broad leaf, turned just so, would go white all over)
float wetAt(float h) { return uWet.x * (1.0 - smoothstep(0.05, uWet.y, h)); }
// set before furColor by something else lit the same way as the grass: its own colour, and what that goes to in shadow.
// 1 is another plant; 2 is something the sun doesn't shine through.
float gOwn = 0.0;
vec3 gOwnCol = vec3(0.0);
vec3 gOwnShade = vec3(0.0);
// (for gOwn 2) the colour and strength of the sun's reflection off it
vec3 gOwnSheen = vec3(1.0);
float gOwnSpec = 1.0;
uniform sampler2D uShadowTex, uShadowNearTex;
uniform mat4 uShadowVP, uShadowNearVP;
uniform float uShadowOn, uToon, uCloudLink, uCloudCover, uNight;
uniform sampler2D uPlantTex;
uniform mat4 uPlantVP;
uniform vec2 uPlantShadow;
uniform vec4 uMist;
uniform vec4 uToonA;

// whether a point of a shadow map lies inside it, far enough from the edge for what's read around it to be there too
bool inShadowMap(vec3 q) { return q.x > 0.004 && q.x < 0.996 && q.y > 0.004 && q.y < 0.996 && q.z < 1.0; }

// 1 lit, 0 in the shadow of a bone; only the land near the camera is covered
float boneShadowAt(vec3 wp, float bias) {
  if (uShadowOn < 0.5) return 1.0;
  vec3 n = (uShadowNearVP * vec4(wp, 1.0)).xyz * 0.5 + 0.5;
  if (inShadowMap(n)) return texture2D(uShadowNearTex, n.xy).r < n.z - bias / 699.0 ? 0.0 : 1.0;
  vec4 c = uShadowVP * vec4(wp, 1.0);
  vec3 q = c.xyz * 0.5 + 0.5;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0 || q.z > 1.0) return 1.0;
  // bias is in metres; the depth runs 0..1 over the shadow camera's 700 m range (bones.js)
  return texture2D(uShadowTex, q.xy).r < q.z - bias / 699.0 ? 0.0 : 1.0;
}

// The same, for surfaces you can come right up to (one texel of the shadow map is about 10 cm, and nearly twice that along the sun's
// way, which from a metre or two up is a stair you can see). Each of a few samples is a bilinear blend of the four texels around it,
// because what's blended has to be the comparison, not the depths: the map holds distances, and a mean of those means nothing at an edge.
float shadowMapSoft(sampler2D map, vec3 q, float bias) {
  const float RES = 2048.0;
  float z = q.z - bias / 699.0;
  float sum = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 off = vec2(i < 2 ? -1.0 : 1.0, (i == 0 || i == 2) ? -0.4 : 0.4);
    if (i == 1 || i == 2) off = off.yx;
    vec2 t = q.xy * RES + off * 1.4 - 0.5;
    vec2 f = fract(t);
    vec2 b = (floor(t) + 0.5) / RES;
    float a00 = texture2D(map, b).r < z ? 0.0 : 1.0;
    float a10 = texture2D(map, b + vec2(1.0, 0.0) / RES).r < z ? 0.0 : 1.0;
    float a01 = texture2D(map, b + vec2(0.0, 1.0) / RES).r < z ? 0.0 : 1.0;
    float a11 = texture2D(map, b + vec2(1.0, 1.0) / RES).r < z ? 0.0 : 1.0;
    sum += mix(mix(a00, a10, f.x), mix(a01, a11, f.x), f.y);
  }
  return sum * 0.25;
}
float boneShadowSoft(vec3 wp, float bias) {
  if (uShadowOn < 0.5) return 1.0;
  vec3 n = (uShadowNearVP * vec4(wp, 1.0)).xyz * 0.5 + 0.5;
  if (inShadowMap(n)) return shadowMapSoft(uShadowNearTex, n, bias);
  vec3 q = (uShadowVP * vec4(wp, 1.0)).xyz * 0.5 + 0.5;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0 || q.z > 1.0) return 1.0;
  return shadowMapSoft(uShadowTex, q, bias);
}

vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

// how much light the fireflies are laying here (fireflies.js), 0 and upward
float glowAt(vec2 p) {
  if (uGlowAmt <= 0.0) return 0.0;
  vec2 q = (p - uGlowAt.xy) / uGlowAt.z + 0.5;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return 0.0;
  return dot(texture2D(uGlow, q).rgb, vec3(0.3, 0.59, 0.11)) / max(dot(uFireflyCol, vec3(0.3, 0.59, 0.11)), 0.1) * uGlowAmt;
}

// 1 lit, 0 in the shadow of the reeds and flowers near you (plantShadow.js). It goes off towards the edge of what's covered, and how dark it is
// comes out as a share of the blades in 三渲二, where a tone is either there or not.
float plantShade(vec2 p, float dark) {
  float fade = 1.0 - smoothstep(0.62, 0.92, length(p - uCam.xz) / uPlantShadow.y);
  float amt = min(uPlantShadow.x, 1.0) * fade;
  if (uToon > 0.5) amt = step(fract(sin(dot(floor(p * 7.0), vec2(127.1, 311.7))) * 43758.5453), amt);
  return 1.0 - dark * amt;
}
float plantShadowAt(vec3 wp, float bias) {
  if (uPlantShadow.x <= 0.0) return 1.0;
  vec3 q = (uPlantVP * vec4(wp, 1.0)).xyz * 0.5 + 0.5;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0 || q.z > 1.0) return 1.0;
  return plantShade(wp.xz, texture2D(uPlantTex, q.xy).r < q.z - bias / 699.0 ? 1.0 : 0.0);
}
// (for surfaces seen close to: the comparison blended over a few neighbouring texels, so a shadow has no stairs)
float plantShadowSoft(vec3 wp, float bias) {
  if (uPlantShadow.x <= 0.0) return 1.0;
  vec3 q = (uPlantVP * vec4(wp, 1.0)).xyz * 0.5 + 0.5;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0 || q.z > 1.0) return 1.0;
  float z = q.z - bias / 699.0;
  float dark = 0.0;
  // (two bilinear looks: what's blended has to be the comparison, not the depths)
  for (int i = 0; i < 2; i++) {
    vec2 t = q.xy * 2048.0 + (i == 0 ? vec2(-0.9, -0.5) : vec2(0.9, 0.5)) - 0.5;
    vec2 f = fract(t);
    vec2 c = (floor(t) + 0.5) / 2048.0;
    float e = 1.0 / 2048.0;
    dark += mix(mix(step(texture2D(uPlantTex, c).r, z), step(texture2D(uPlantTex, c + vec2(e, 0.0)).r, z), f.x),
                mix(step(texture2D(uPlantTex, c + vec2(0.0, e)).r, z), step(texture2D(uPlantTex, c + vec2(e, e)).r, z), f.x), f.y);
  }
  dark *= 0.5;
  float fade = 1.0 - smoothstep(0.62, 0.92, length(wp.xz - uCam.xz) / uPlantShadow.y);
  return 1.0 - dark * min(uPlantShadow.x, 1.0) * fade;
}

// where someone has walked (wind.js): xy the way the grass was pushed, z how flat it still is
vec3 trailAt(vec2 p) {
  return texture2D(uTrail, (p - uTrailCenter) / uTrailSize + 0.5).rgb;
}

// the raw state of the grass there (wind.js): xy its bend, zw how fast that is changing
vec4 windRaw(vec2 p) {
  return texture2D(uField, (p - uFieldCenter) / uFieldSize + 0.5);
}

// x: how far the grass is over, along the wind; y: how fast it is moving; zw: its velocity
vec4 gustAt(vec2 p) {
  vec4 s = windRaw(p);
  return vec4(clamp(dot(s.xy, uWindDir), 0.0, 1.0), length(s.zw), s.zw);
}

// The clouds are a layer over the land, at a height of a fifth of the size of its pattern (that's what makes one pattern fit both the
// sky's view of it and the shadows' scale). This is the pattern at a point of that layer.
vec2 cloudAt(vec2 X) { return (X - uWindDir * uTime * uMisc.w) / uMisc.z; }
// How much cloud there is at a point of the pattern, past 0.62 being cloud. The one pattern for the sky, the shadows and the light in the mist:
// each with its own version of it, the sun stood behind a cloud with the ground under it still bright, along the clouds' edges.
// (fewer clouds at night: there are moons to see)
float cloudPattern(vec2 q) {
  return texture2D(uNoiseTex, q).r * 0.6 + texture2D(uNoiseTex, q * 2.6).g * 0.28 + texture2D(uNoiseTex, q * 7.0).b * 0.12 - uNight * 0.05 + uCloudCover;
}

float cloudShade(vec2 p) {
  if (uCloudLink > 0.5) {
    // what stands between this point and the sun: the point of the layer on the way to it
    vec2 up = cloudAt(p + uSun.xz / (uSun.y + 0.16) * uMisc.z * 0.2);
    return 1.0 - uMisc.y * smoothstep(0.56, 0.68, cloudPattern(up));
  }
  vec2 q = (p - uWindDir * uTime * uMisc.w) / uMisc.z;
  float n = texture2D(uNoiseTex, q).r * 0.72 + texture2D(uNoiseTex, q * 2.7 + 0.3).g * 0.28 + uCloudCover;
  return 1.0 - uMisc.y * smoothstep(0.59, 0.67, n);
}

// Mist lying on the wet ground, thinning upwards as exp(-y / height). The amount along a straight line through that has an exact answer, so
// this needs no stepping. From a hilltop you look down through it; a hill stands up out of it. It lies in banks that the wind carries off.
float mistOn(vec3 wp, float dist) {
  if (uMist.x <= 0.0) return 0.0;
  float h = uMist.y;
  float y0 = max(uCam.y, 0.0);
  float y1 = max(wp.y, 0.0);
  float dy = y1 - y0;
  float along = abs(dy) > 0.02 ? (exp(-y0 / h) - exp(-y1 / h)) * h / dy : exp(-y0 / h);
  vec2 mid = (wp.xz + uCam.xz) * 0.5;
  float n = texture2D(uNoiseTex, mid / 520.0 - uWindDir * uTime * 0.0035).r * 0.65 + texture2D(uNoiseTex, mid / 170.0 - uWindDir * uTime * 0.0075).g * 0.35;
  // (what's at your feet stays clear: mist is what's between you and things further off)
  return uMist.x * max(dist - 14.0, 0.0) * along * mix(1.0, smoothstep(0.32, 0.68, n) * 1.9, uMist.z);
}

vec3 hazedAt(vec3 col, vec3 wp) {
  float dist = length(uCam - wp);
  float a = exp(-dist * uHaze - mistOn(wp, dist));
  if (uToon > 0.5 && uToonA.w > 0.5) a = floor(a * uToonA.w + 0.5) / uToonA.w; // distance in flat steps
  return mix(uHazeCol, col, a);
}

// The colours of the different grasses that grow here, over the two the patches give. In 三渲二 a stand of one kind is a flat tone with an edge of hair;
// otherwise it fades into the next. And here and there, all over, a blade that's died and gone to straw.
vec3 grassKinds(vec3 c, vec2 p, float jit) {
  if (uKinds.x <= 0.0) return c;
  vec3 w = texture2D(uKindsTex, p / uPeriod).rgb;
  if (uToon > 0.5) w = step(vec3(0.5), w + jit * uToonA.x * 0.35 * gLandBreak);
  float a = min(uKinds.x, 1.0);
  c = mix(c, uKindCool, w.g * a);
  c = mix(c, uKindRose, w.b * a);
  c = mix(c, uKindDry, w.r * a);
  // (a blade is a blade only close to: far off the ground stands in for many)
  return mix(c, uKindDry, step(1.0 - uKinds.y, abs(jit) * 2.0) * step(uKinds.y, 0.999) * step(1.0, gLandBreak));
}

// The fur surface at a point. N: terrain normal, vis: hill shadow, dir: combed direction there, g: gustAt,
// T: the grass's direction there, Nb: the blade's own normal, patchv: colour patch, V: towards the eye,
// jit: this blade's own -0.5..0.5, shine: gloss exponent here
vec3 furColor(vec2 p, vec3 N, float vis, vec2 dir, vec4 g, vec3 T, vec3 Nb, float patchv, vec3 V, float jit, float shine) {
  // only the land, the clouds and the bones cast the pale blue shadow; the wind does not.
  // Relief works around a flat field's light, so steepening the hills leaves the level ground as it was tuned.
  // (a slope turned away eases towards shadow instead of dropping into it, or the pockets on a hill's far side read as dark blots)
  float slopeLight = dot(N, uSun) - uSun.y;
  if (slopeLight < 0.0) slopeLight /= 1.0 - slopeLight * uBandLook.z;
  float l = slopeLight * uBladeLook.x * uSunA.x + uSun.y * uBladeLook.x
    + dot(dir, normalize(uSun.xz)) * uBladeLook.z + uBladeLook.w;
  if (uToon > 0.5) {
    // 三渲二: every step is a hard one, and it falls blade by blade, so the edges of the flat tones are edges of hair
    float e = uToonA.x;
    float je = jit * e * gLandBreak;
    // A pale cloud shadow shows on grass as a share of the blades going dark, which reads as shade because there are so many. A plant is
    // too big for that: whole stems would go dark at random. So a plant takes the shadow all alike, as a tone, and barely breaks up.
    bool plant = gOwn > 0.5 && gOwn < 1.5;
    if (plant) je *= 0.12;
    // The far ground stands in for many blades, and takes the shadow as a flat tone too. Thresholded, a shadow whose value lies at the
    // threshold (night's cloud strength 0.5 puts it exactly there) is lit or dark by the break-up noise alone: dark stripes along the grain.
    bool ground = gLandBreak < 1.0;
    float sunlit = step(0.0, l + je * 0.5) * step(0.5, vis + je) * (plant || ground ? 1.0 : step(0.5, cloudShade(p) + je * 0.4));
    vec3 alb = gOwn > 0.5 ? gOwnCol : grassKinds(mix(uLit, uLit2, step(0.5, patchv + jit * e * 0.35)), p, jit);
    // where the edge lies goes by the height above the water only; a setting says how far that grass goes to the colour
    float wetShape = gWet / max(uWet.x, 0.001);
    alb = mix(alb, uWetCol, step(0.714, wetShape + jit * e * 0.714) * step(0.01, gWet) * min(uWet.x / 0.7, 1.0));
    alb = mix(vec3(dot(alb, vec3(0.3, 0.59, 0.11))), alb, uSunA.y);
    float ag = dot(normalize(-V.xz + vec2(0.0001)), uWindDir);
    float pressed = step(uToonA.y, g.x * (0.72 + 0.4 * ag) + je * 0.5);
    vec3 shadeC = gOwn > 0.5 ? gOwnShade : uShade;
    vec3 c = mix(shadeC, alb, sunlit);
    c = mix(c, sunlit > 0.5 ? mix(alb, uGustCol, 0.62) : mix(shadeC, vec3(1.0), 0.2), pressed);
    // the same light as the painted version, reduced to hard tones: each blade is in or out of each of them, as it is turned now
    float vb = dot(Nb, V);
    vec3 Nt = vb < 0.0 ? -Nb : Nb;
    float nlb = dot(Nt, uSun);
    c = mix(c, c * 0.9, step(nlb, uSun.y * 0.55) * sunlit * uGlossA.w * 1.6); // turned away from the sun
    if (gOwn < 1.5) c = mix(c, uTransCol, step(0.2, -nlb) * sunlit * uSunA.z * 1.5); // sun through the leaf
    c = mix(c, mix(uSkyLow, uSkyTop, 0.3), step(0.8, 1.0 - abs(vb)) * step(uToonA.y, g.x + jit * e * 0.3) * uGlossA.z); // flattened, mirroring the sky
    vec3 hv = normalize(uSun + V);
    // As in the painted version, it's the wind that gathers the reflection: grass laid over all one way. Without that, looking towards the
    // sun the whole field crosses the threshold at once, and still grass shows a pale band whose sides are straight lines from the eye.
    // (a bone isn't grass: nothing lays it over, its reflection is its own)
    float alignedT = gOwn > 1.5 ? 1.0 : smoothstep(0.02, 0.6, g.x + g.y * 0.35);
    float shT = gOwn > 1.5 ? shine : shine * (0.55 + 1.3 * alignedT);
    float toonSpec = (shT + 8.0) * 0.125 * pow(max(dot(Nt, hv), 0.0), shT) * (0.04 + 0.96 * pow(1.0 - max(dot(V, hv), 0.0), 5.0)) * max(nlb, 0.0) * (0.1 + 0.9 * alignedT);
    c = mix(c, gOwn > 1.5 ? gOwnSheen : uSheenCol, step(0.9 / max(uToonA.z, 0.05) * (1.0 + je * 1.6), toonSpec * uGlossA.x * (gOwn > 1.5 ? gOwnSpec : 1.0)) * sunlit * (1.0 - gNoSheen)); // a flash on this blade
    if (plant) c = mix(c, shadeC, step(uMisc.y * 0.5, 1.0 - cloudShade(p)) * uMisc.y);
    // a firefly's light, as one flat tone, its edge broken blade by blade as every other tone's is
    float flyLight = glowAt(p);
    if (flyLight > 0.0) c = mix(c, c * 0.72 + uFireflyCol * 0.34, step(0.3, flyLight + jit * e * 0.16));
    // the shadow of a cloud as one flat tone, as strong as its setting says. On the grass too: a blade's own broken edge above only
    // shows a shadow deeper than a half, so a pale one would lie on the ground between blades that stay in the sun.
    if (ground || gOwn < 0.5) c = mix(c, shadeC, step(uMisc.y * 0.5, 1.0 - cloudShade(p)) * uMisc.y);
    return c;
  }
  float form = smoothstep(-uBandLook.x, uBandLook.x, l);
  float lit = form * clamp(vis, 0.0, 1.0) * cloudShade(p);
  vec3 albedo = gOwn > 0.5 ? gOwnCol : grassKinds(mix(uLit, uLit2, smoothstep(0.3, 0.7, patchv)), p, jit);
  albedo = mix(albedo, uWetCol, gWet);
  albedo = mix(vec3(dot(albedo, vec3(0.3, 0.59, 0.11))), albedo, uSunA.y);
  albedo = mix(albedo, uBandCol, 4.0 * form * (1.0 - form) * uBandLook.y);

  // From here on the light is worked out on the blade itself, turned the way the wind has turned it.
  float nv = dot(Nb, V);
  vec3 Nf = nv < 0.0 ? -Nb : Nb;
  nv = abs(nv);
  float nl = dot(Nf, uSun);
  // the side facing the sun takes it (level with the ground = as the colour was chosen); turned away, the blade dims
  // (a leaf is translucent, so turning away only dims it: this is what stops far blades going to black dots)
  float facing = clamp((nl + 0.45) / (max(uSun.y, 0.2) + 0.45), 0.25, 1.5);
  vec3 sunlit = albedo * mix(1.0, facing, uGlossA.w);
  // light bouncing around inside the grass comes out through the leaves, picking up their colour each time: the saturated
  // yellow-green of a sunny meadow. On top of that, a blade with the sun directly behind it glows.
  if (gOwn < 1.5) sunlit += uTransCol * uSunA.z * (uGlossB.z + max(-nl, 0.0));
  // what bending shows of the paler sheaths and undersides
  sunlit = mix(sunlit, uGustCol, clamp(g.x * uBladeLook.y, 0.0, 1.0));
  vec3 col = mix(gOwn > 0.5 ? gOwnShade : uShade, sunlit, lit);
  // where the grass is further over than the grass on the sun's side of it, it lies in that grass's shade, and you see down
  float over = g.x - gustAt(p + normalize(uSun.xz) * uGlossB.y).x;
  col *= 1.0 - smoothstep(0.03, 0.4, over) * uGlossB.x * vec3(0.3, 0.26, 0.42);
  // a blade seen at a low angle mirrors the sky. Flattened grass is seen at a low angle: this is why it goes pale.
  vec3 Rv = reflect(-V, Nf);
  float Fv = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
  col = mix(col, mix(uSkyLow, uSkyTop, smoothstep(0.1, 0.9, Rv.y)), min(Fv, 0.55) * uGlossA.z);
  // the sun's own reflection, off the wax on the leaf: only where this blade happens to be turned just so
  vec3 Hv = normalize(uSun + V);
  float nh = max(dot(Nf, Hv), 0.0);
  float Fh = 0.04 + 0.96 * pow(1.0 - max(dot(V, Hv), 0.0), 5.0);
  // Grass left alone points every way, so its reflection is scattered and faint. Grass the wind has laid over all points one
  // way, like so many small mirrors aligned, and the reflection gathers: the wind is what makes the bright parts bright.
  float aligned = smoothstep(0.02, 0.6, g.x + g.y * 0.35);
  float sh = shine * (0.55 + 1.3 * aligned);
  float spec = (sh + 8.0) * 0.125 * pow(nh, sh) * Fh * max(nl, 0.0) * lit * (0.1 + 0.9 * aligned);
  col = mix(col, gOwn > 1.5 ? gOwnSheen : uSheenCol, (1.0 - exp(-spec * uGlossA.x * (gOwn > 1.5 ? gOwnSpec : 1.0))) * (1.0 - gNoSheen));
  // the pale purple stems, where the grass is moving fastest
  col = mix(col, uStem, clamp(g.y * 0.9, 0.0, 1.0) * uStemAmt);
  // direct sun: the lights open up and the darks hold
  col = mix(col, col * col * (3.0 - 2.0 * col), uSunA.w);
  // a firefly's light falls on it as colour: what it picks up is the firefly's, times how pale the thing is
  float flyLight = glowAt(p);
  if (flyLight > 0.0) col += uFireflyCol * (0.35 + dot(albedo, vec3(0.3, 0.59, 0.11)) * 1.2) * min(flyLight, 2.0) * 0.5;
  return col;
}

#ifdef SKY
uniform float uStars;
uniform sampler2D uPuffTex;
uniform vec3 uCloudForm;
uniform vec4 uMoon[7];
uniform vec3 uMoonLit[7];
uniform float uMoonPhase[7];
uniform vec3 uMoonCol, uMoonDark, uMoonGlow;
uniform float uCrescent;
uniform vec4 uHalo, uHaloB, uHaloC;
uniform vec3 uHaloCol;
uniform float uHaloD;
uniform vec3 uSunShow; // how strong the sun is, how far it shows through a cloud in front, how big it is

// What ice crystals high up do to the sun's light. Flat crystals and columns, each falling in its own way, bend it to their own places on the sky:
//   the ring at 22 degrees, with a sharp inner edge the colour of the sun's light, fading away outward, and the sky just inside it a little darker;
//   the mock suns on it: the ring itself swelling and brightening, with no edge or point to it anywhere. Those at the sides stand where the
//     parhelic circle crosses the ring, at the sun's own height, so they ride up above 3 and 9 o'clock as the sun climbs;
//   the sun pillar, straight up and down through the sun; the parhelic circle, flat all the way round the sky at the sun's height, brightest out of the mock suns;
//   the tangent arcs, wings lifting off the top and bottom of the ring; the big halo at 46 degrees, the same as the ring but fainter;
//   and the circumzenithal arc, a piece of rainbow round the zenith.
// A cloud in front hides them (veil 0), as far as uHaloC.y says. (Through thin high cloud they're all softer: uMist.w)
vec3 haloSpectrum(float t) { // 0 red, on the sun's side, to 1 blue, away from it
  return vec3(1.0 - smoothstep(0.3, 0.62, t), smoothstep(0.0, 0.38, t) * (1.0 - smoothstep(0.62, 0.95, t)), smoothstep(0.48, 0.85, t));
}
vec3 withHalo(vec3 c, vec3 d, float veil) {
  if (uHalo.x + uHalo.z + uHaloB.x + uHaloB.y + uHaloB.z + uHaloB.w + uHaloC.x <= 0.0) return c;
  float s = uMist.w;
  float see = mix(veil, 1.0, uHaloC.y);
  float along = dot(d, uSun);
  float ang = acos(clamp(along, -1.0, 1.0));
  float R = uHalo.y;
  float x = ang - R; // how far outside the ring, radians
  float inner = mix(0.008, 0.028, s);
  float outer = mix(0.045, 0.06, s);
  float soft = mix(1.0, 1.5, s);
  float cosSun = max(length(uSun.xz), 0.05);
  vec3 up = normalize(vec3(0.0, 1.0, 0.0) - uSun * uSun.y + vec3(0.0001, 0.0, 0.0));
  vec3 side = cross(up, uSun);
  vec3 v = d - uSun * along;
  float round = abs(atan(dot(v, side), dot(v, up))); // round the ring, 0 at the top, pi at the bottom, either way
  float sr = sin(R);
  vec3 white = mix(vec3(1.0), vec3(0.97, 0.98, 1.0), s);

  // the big halo: the ring over again, further out and fainter by a set share (the share is in uHaloB.w)
  float x2 = ang - uHaloC.z;
  float big = x2 < 0.0 ? exp(-x2 * x2 / (inner * inner)) : exp(-x2 / outer);
  c = mix(c, mix(uHaloCol, white, smoothstep(-inner, outer * 0.7, x2)), 1.0 - exp(-big * uHaloB.w * see * 1.25));
  // and the arc round the zenith
  float cosAz = dot(normalize(d.xz + vec2(0.0001)), normalize(uSun.xz + vec2(0.0001)));
  float e2 = asin(clamp(d.y, -1.0, 1.0)) - uHaloD;
  float across3 = e2 / (0.032 * soft);
  c = mix(c, mix(haloSpectrum(smoothstep(-0.03, 0.03, e2)), white, 0.4 + 0.2 * s), 1.0 - exp(-exp(-across3 * across3) * smoothstep(-0.2, 0.65, cosAz) * uHaloC.x * see));

  // less light just inside the ring
  c *= 1.0 - min(uHalo.x, 2.0) * mix(0.07, 0.1, s) * smoothstep(R * 0.3, R, ang) * smoothstep(0.0, -inner, x) * see;

  // the flat circle: thin, thickening out of the mock suns, and fainter round the far side of the sky
  float e = (d.y - uSun.y) / cosSun;
  float flatAcross = e / ((0.009 + 0.024 * exp(-abs(x) / 0.1)) * soft);
  float flatLevel = (0.1 + 0.9 * exp(-abs(x) / 0.34) + 0.4 * exp(-ang / 0.09)) * (0.5 + 0.5 * cosAz);
  c = mix(c, white, 1.0 - exp(-exp(-flatAcross * flatAcross) * flatLevel * uHaloB.y * see));

  // the pillar: narrowing away from the sun
  float pillarAcross = dot(d, side) / ((0.013 + 0.03 * exp(-ang / 0.1)) * soft);
  c = mix(c, mix(uHaloCol, white, 0.5), 1.0 - exp(-exp(-pillarAcross * pillarAcross) * exp(-ang / (R * 0.55)) * uHaloB.x * step(0.0, along) * see));

  // the tangent arcs: leaving the ring, sharp on the side towards the sun
  float nTop = round * sr;
  float nBottom = (3.14159265 - round) * sr;
  float oTop = x - 1.15 * nTop * nTop;
  float oBottom = x - 1.15 * nBottom * nBottom;
  float wing = exp(-pow(oTop / ((oTop < 0.0 ? 0.01 : 0.032) * soft), 2.0)) * exp(-nTop / 0.24) + exp(-pow(oBottom / ((oBottom < 0.0 ? 0.01 : 0.032) * soft), 2.0)) * exp(-nBottom / 0.24);
  c = mix(c, mix(uHaloCol, white, 0.4), 1.0 - exp(-wing * uHaloB.z * see));

  // the ring
  float ring = x < 0.0 ? exp(-x * x / (inner * inner)) : exp(-x / outer);
  c = mix(c, mix(uHaloCol, white, smoothstep(-inner, outer * 0.7, x)), 1.0 - exp(-ring * uHalo.x * see * 1.25));

  // the mock suns: how far along the ring from the nearest
  float dogs = acos(clamp(uSun.y / cosSun * tan(R * 0.5), -1.0, 1.0));
  float near = min(min(nTop, nBottom), abs(round - dogs) * sr);
  float w = uHalo.w * mix(1.0, 1.15, s);
  float nw = near / w;
  // (no term here with a corner at its top, or the mock sun comes to a point)
  float swell = 0.6 * exp(-nw * nw / 0.0036) + 0.4 / (1.0 + nw * nw / 0.012);
  // across the ring there: thicker, and mostly outward, so that the inner edge stays near enough a circle (pushed in further, it dents the ring like a heart; not at all, and the mock sun is cut off flat on that side)
  float across = x < 0.0 ? x / (inner + 0.018 * w * swell) : x / (0.018 + 0.05 * w * swell);
  float bright = exp(-across * across) * swell;
  // and the light it throws into the air around it
  float air = 0.16 * exp(-near * near / (0.04 * w * w) - x * x / (0.022 * w * w));
  vec3 sunCol = mix(uHaloCol, vec3(1.0), smoothstep(0.1, 0.7, bright) * 0.9 + 0.1);
  // (it nears white and never quite gets there: cut off at 1, a strong one has a flat top with an edge round it)
  return mix(c, sunCol, 1.0 - exp(-(bright * mix(1.0, 0.85, s) * see + air * mix(0.4, 1.0, see)) * uHalo.z * 1.7));
}

// The sun as an eye meets it: too bright to have an edge. The middle is blown out to pure white, and from there the glare falls off without
// a step, fast and then slowly, a long way across the sky. A cloud in front (veil 0) hides the middle; the glare comes round it anyway.
// (uMist.w: seen through high thin cloud, the same light spread out: a soft pale blur with a faint warmth, and a wide brightening of the sky)
vec3 withSun(vec3 c, vec3 d, float veil) {
  c = withHalo(c, d, veil);
  float sd = length(d - uSun);
  float s = uMist.w;
  float see = mix(veil, 1.0, uSunShow.y);
  // a cloud between you and the sun is lit from behind, so it's darker there than the rest of it, and that's what lets the sun show through it: white on white wouldn't
  c = mix(c, uCloudShadeCol, (1.0 - veil) * uSunShow.y * exp(-sd / mix(0.3, 0.42, s)) * 0.75);
  // Strength doesn't change how big the sun looks. The middle has the same shape whatever it is, and only gets as far as white; what grows with it is the
  // light in the air further out. (Multiplied through, more of the slope goes over 1 and the white part spreads.)
  float strong = uSunShow.x;
  float big = uSunShow.z;
  float peak = mix(6.7, 1.3, s);
  float middle = min(1.0, peak * exp(-pow(sd / (mix(0.036, 0.11, s) * big), mix(1.0, 1.5, s)))) * min(strong, 1.0);
  float close = mix(0.6, 0.24, s) * exp(-sd / (mix(0.09, 0.19, s) * big)) * min(strong, 1.0);
  float far = mix(0.26, 0.24, s) * exp(-sd / mix(0.24, 0.55, s)) + mix(0.1, 0.14, s) * exp(-sd / 0.8);
  // (a pale sky hasn't far to go before it's white all round the sun, and then the sun looks bigger after all: so in mist the air takes less of it)
  float airStrong = mix(strong, min(strong, 1.0) + max(strong - 1.0, 0.0) * 0.3, s);
  float light = 1.0 - (1.0 - middle * see) * exp(-(close + far * airStrong) * mix(0.55, 1.0, see) * 1.15);
  // (white where it's strong, the colour of the ring's inner edge where it thins out: the same as the mock suns)
  return mix(c, mix(uHaloCol, vec3(1.0), smoothstep(0.1, 0.7, light) * 0.9 + 0.1), light);
}

// 三渲二's heaped clouds, worked out on the sky as you see it. The big shapes are the same pattern the shadows on the land come from, so a
// cloud stands where its shadow says. On the edge that faces up they take round puffs, whose size is measured in angle so they stay round
// down to the horizon; on the edge that faces down they stay smooth, which is the flat base. Zero is the cloud's edge.
vec2 skyLayerAt(float az, float el) {
  vec3 dd = vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el));
  return uCam.xz + dd.xz / (max(dd.y, 0.0) + 0.16) * uMisc.z * 0.2;
}
float bigCloud(vec2 X) {
  return cloudPattern(cloudAt(X));
}
vec2 puffAt(float az, float el, vec2 X) {
  const float TILES = 4.0; // a whole number of times round, or there's a seam
  vec2 p = texture2D(uPuffTex, vec2(az, el) / TAU * TILES + vec2(uTime * 0.0006, 0.0)).rg;
  // straight overhead every direction meets: there the puffs lie on the layer itself
  return mix(p, texture2D(uPuffTex, cloudAt(X)).rg, smoothstep(0.85, 1.15, el));
}
float heapedEdge(float az, float el) {
  vec2 X = skyLayerAt(az, el);
  float up = smoothstep(-0.02, 0.03, bigCloud(skyLayerAt(az, el - 0.04)) - bigCloud(skyLayerAt(az, el + 0.04)));
  vec2 p = puffAt(az, el, X);
  return bigCloud(X) - 0.62 + (p.r * 0.66 + p.g * 0.34 - 0.42) * mix(0.015, 0.05 + 0.3 * uCloudForm.y, up);
}
// how much of a cloud is here, and its tone: 0 in the light, 0.5, 1 on the side away from the sun along the lower edge. The shadow's own
// edge is scalloped by the same puffs, as a painted cloud's is.
vec2 heapedClouds(vec3 d) {
  float az = atan(d.x, d.z);
  float el = asin(clamp(d.y, -1.0, 1.0));
  float m = heapedEdge(az, el);
  float w = max(fwidth(m) * 0.75, 0.0004);
  float cover = smoothstep(-w, w, m);
  float sunAz = atan(uSun.x, uSun.z);
  float away = clamp(sin(sunAz - az) * 2.5, -1.0, 1.0); // which way along the sky the sun lies from here (gradually: a sudden flip draws a seam)
  vec2 p = texture2D(uPuffTex, vec2(az, el) / TAU * 7.0).rg;
  float reach = 0.6 + 1.0 * (p.r * 0.6 + p.g * 0.4);
  float dc = max(cos(el), 0.25);
  float near = heapedEdge(az - away * 0.012 * reach / dc, el - 0.02 * reach);
  float far = heapedEdge(az - away * 0.028 * reach / dc, el - 0.05 * reach);
  float wn = max(fwidth(near) * 0.75, 0.0006);
  float wf = max(fwidth(far) * 0.75, 0.0006);
  float tone = 0.5 * (1.0 - smoothstep(-wf, wf, far)) + 0.5 * (1.0 - smoothstep(-wn, wn, near));
  return vec2(cover, tone);
}

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 starsAt(vec3 d) {
  vec3 g = d * 170.0;
  vec3 id = floor(g);
  float h = hash31(id);
  if (h < 0.982) return vec3(0.0);
  vec3 at = vec3(hash31(id + 1.0), hash31(id + 2.0), hash31(id + 3.0)) * 0.7 + 0.15;
  float r = length(fract(g) - at);
  float size = 0.1 + 0.14 * hash31(id + 4.0);
  float bright = pow(hash31(id + 5.0), 2.2);
  if (uToon > 0.5) return vec3(step(r, size)) * step(0.4, bright);
  float twinkle = 0.78 + 0.22 * sin(uTime * (0.7 + 2.2 * h) + h * 300.0);
  return vec3(0.9, 0.95, 1.0) * smoothstep(size, size * 0.3, r) * (0.25 + bright) * twinkle;
}

// Seven moons, each a lit ball whose phase is how far the light has gone round behind it. What makes them read as far away: they're
// small, what isn't lit can't be seen against the sky, they all show the same face, and they're seen through the air, which dims and
// warms them low down.
vec3 withMoons(vec3 c, vec3 d) {
  float pixel = length(fwidth(d));
  float glow = 0.0;
  vec3 discs = c;
  float anyDisc = 0.0;
  for (int i = 0; i < 7; i++) {
    vec3 m = uMoon[i].xyz;
    float r = uMoon[i].w;
    float cd = dot(d, m);
    float phi = uMoonPhase[i];
    vec3 u = uMoonLit[i];
    vec2 a = vec2(dot(d, u), dot(d, cross(m, u))) / sin(r);
    float rho = length(a);
    float share = 0.5 + 0.5 * cos(phi); // how much of it shows lit
    // the glow in the air round it, as much as it has light to give: no edge to it, falling off fast and then slowly, a long way out, as
    // the sun's does. It's added up moon by moon, so where they're close together the sky between them is lit by both.
    float out_ = max(acos(clamp(cd, -1.0, 1.0)) - r, 0.0);
    float light = max(share * share, 0.2 * uCrescent); // (a thin moon isn't left to almost nothing)
    glow += light * (0.55 * exp(-out_ / 0.03) + 0.26 * exp(-out_ / 0.11) + 0.1 * exp(-out_ / 0.38));
    float aa = pixel / sin(r);
    float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, rho);
    if (disc <= 0.0) continue;
    float zc = sqrt(max(1.0 - rho * rho, 0.0));
    float nl = dot(vec3(a, zc), vec3(sin(phi), 0.0, cos(phi)));
    // the same few dark seas seen on each, turned a little differently
    // the same dark seas on each: a moon keeps one face
    float maria = texture2D(uNoiseTex, a * 0.11 + 0.31).r * 0.65 + texture2D(uNoiseTex, a * 0.3 + 0.13).g * 0.35;
    // the air: nearer the horizon there's more of it to see through
    float air = smoothstep(0.03, 0.42, m.y);
    vec3 surf;
    float lit;
    if (uToon > 0.5) {
      surf = mix(uMoonCol, mix(uMoonCol, uMoonDark, 0.22), step(0.6, maria));
      lit = smoothstep(-aa, aa, nl);
    } else {
      surf = uMoonCol * mix(1.0, 0.8, smoothstep(0.5, 0.64, maria));
      lit = smoothstep(-0.04 - aa, 0.04 + aa, nl);
    }
    // (the low thin ones would be lost in it: uCrescent holds them up)
    surf = mix(uHazeCol, surf * mix(vec3(1.0, 0.84, 0.66), vec3(1.0), max(air, uCrescent * 0.75)), mix(mix(0.5, 1.0, air), 1.0, uCrescent));
    // Bright enough to wash out its own seas towards the middle of what's lit: bright, but the phase has to stay readable
    surf = mix(surf, vec3(1.0), light * 0.6 * lit);
    // the unlit part only hides the stars behind it, with the faintest light from the land on it
    discs = mix(discs, mix(mix(c - starsAt(d) * uStars, uMoonDark, 0.14), surf, lit), disc);
    anyDisc = max(anyDisc, disc * lit);
  }
  // the glow lies over the sky and over the unlit parts, and the lit parts are brighter than it
  vec3 aired = 1.0 - (1.0 - discs) * exp(-glow * 3.0 * uMoonGlow);
  return mix(aired, discs, anyDisc);
}

vec3 skyColor(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 c = mix(uSkyLow, uSkyTop, pow(smoothstep(0.0, 0.62, y), 0.8));
  if (uNight > 0.5) {
    c = mix(uSkyLow, c, smoothstep(0.0, 0.17, y));
    c += starsAt(d) * uStars;
    c = withMoons(c, d);
  }
  // with the clouds a real layer they pass over as you walk, and shadow what they stand between the sun and
  vec2 q = uCloudLink > 0.5 ? cloudAt(uCam.xz + d.xz / (y + 0.16) * uMisc.z * 0.2) : d.xz / (y + 0.16) * 0.2 - uWindDir * uTime * 0.0016;
  float n = cloudPattern(q);
  if (uToon > 0.5 && uCloudForm.z < 0.5) {
    float heapedOn = uCloudForm.x * uCloudLink;
    vec2 hc = heapedOn > 0.5 ? heapedClouds(d) : vec2(0.0);
    // 三渲二: clouds as shapes with a clean edge and one flat shadow; the sun a plain disc
    // (the edge is as wide as a pixel wherever it is: a fixed width in the noise is sharp in some places and blurred in others)
    float edge = max(fwidth(n) * 0.75, 0.0005);
    float cy = (heapedOn > 0.5 ? hc.x : smoothstep(0.6 - edge, 0.6 + edge, n)) * step(0.03, y);
    // the shadow is worked out from the broad shape only, or it breaks into patches
    vec2 qt = q + normalize(uSun.xz + vec2(0.0001)) * 0.05;
    float broad = texture2D(uNoiseTex, q).r;
    float lowN = min(texture2D(uNoiseTex, qt).r - broad - 0.022, broad + uCloudCover - 0.56);
    float lowE = max(fwidth(lowN) * 0.75, 0.0005);
    float low = heapedOn > 0.5 ? hc.y : smoothstep(-lowE, lowE, lowN);
    c = mix(c, mix(uCloudCol, uCloudShadeCol, low), cy);
    if (uNight < 0.5) c = withSun(c, d, 1.0 - cy * uCloudLink);
    return c;
  }
  float cl = smoothstep(0.56, 0.68, n) * smoothstep(0.02, 0.16, y) * (1.0 - uNight * 0.25); // a moon shows through thin cloud
  // cumulus lit from the sun's side, with cool undersides where it is thickest away from the sun
  vec2 qs = q + normalize(uSun.xz + vec2(0.0001)) * 0.018;
  float ns = texture2D(uNoiseTex, qs).r * 0.6 + texture2D(uNoiseTex, qs * 2.6).g * 0.28 + texture2D(uNoiseTex, qs * 7.0).b * 0.12 + uCloudCover;
  float under = smoothstep(-0.03, 0.13, ns - n) * smoothstep(0.56, 0.78, n);
  c = mix(c, mix(uCloudCol, uCloudShadeCol, under * 0.75), cl * 0.96);
  if (uNight > 0.5) return c;
  return withSun(c, d, 1.0 - cl * 0.94 * uCloudLink);
}
#endif
`;
