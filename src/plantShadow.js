import * as THREE from 'three';
import { U } from './common.js';
import { tuning } from './tuning.js';
import { heightAt } from './terrain.js';

// The shadows of the reeds and flowers near you. The bones' shadow map (bones.js) is drawn once for each place, since they don't move; these sway in the wind, and so does what
// they throw, so they have a map of their own that's drawn again every other frame, from the plants' light form. It lands on the grass, the ground and the water.
// The plants themselves don't read it: a leaf's shadow moving on a leaf moving in the same wind twinkles.

const RES = 2048;
const HALF = 64; // m each way, so about 6 cm a texel
const DRAW_EVERY = 2;

export function plantShadowMaterial(vertexShader, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
    side: THREE.DoubleSide,
    colorWrite: false,
    defines: { SHADOW: 1 },
    uniforms,
  });
}

export function createPlantShadow({ renderer, casters }) {
  const target = new THREE.WebGLRenderTarget(RES, RES, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    depthTexture: new THREE.DepthTexture(RES, RES, THREE.FloatType),
  });
  const cam = new THREE.OrthographicCamera(-HALF, HALF, HALF, -HALF, 1, 700);
  const scene = new THREE.Scene();
  for (const m of casters) scene.add(m);
  U.uPlantTex.value = target.depthTexture;
  const at = new THREE.Vector2(1e9, 1e9);
  let frame = 0;
  let on = false;

  function draw() {
    const y = Math.max(heightAt(at.x, at.y), 0);
    const sun = U.uSun.value;
    cam.position.set(at.x + sun.x * 300, y + sun.y * 300, at.y + sun.z * 300);
    cam.up.set(0, 1, 0);
    cam.lookAt(at.x, y, at.y);
    cam.updateMatrixWorld();
    U.uPlantVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const was = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(was);
  }

  return {
    apply() {
      const t = tuning.plantShadow;
      on = t.amount > 0;
      U.uPlantShadow.value.set(t.amount, HALF);
      if (on) at.set(1e9, 1e9); // (drawn afresh: the sun may have moved)
    },
    update(camPos) {
      if (!on) return;
      const x = Math.round(camPos.x / 8) * 8;
      const z = Math.round(camPos.z / 8) * 8;
      const moved = x !== at.x || z !== at.y;
      if (!moved && frame++ % DRAW_EVERY) return;
      at.set(x, z);
      draw();
    },
  };
}
