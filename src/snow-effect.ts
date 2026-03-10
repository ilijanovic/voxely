/**
 * Visual snow effect: falling particles only visible in cold biomes and when above water.
 * Particles are in world space so they stay fixed while the player moves.
 */
import * as THREE from "three";
import type { Biome } from "./types";

const PARTICLE_COUNT = 3000;
const BOX_WIDTH = 30;
const BOX_HEIGHT = 20;
const BOX_DEPTH = 30;
const FALL_SPEED = 2.5;
const DRIFT_AMPLITUDE = 0.4;
/** Respawn when particle is this many blocks below player. */
const RESPAWN_BELOW_PLAYER = 5;
/** Respawn when particle is farther than this (XZ) from player. */
const RESPAWN_DISTANCE_SQ = 25 * 25;
const SEED_OFFSET = 12345;

const COLD_BIOMES: Set<Biome> = new Set([
  "snow",
  "grove",
  "snowy_slopes",
  "frozen_peaks",
  "jagged_peaks",
]);

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export interface SnowEffectContext {
  playerPosition: THREE.Vector3;
  waterSurfaceY: number;
  eyeY: number;
  biome?: Biome;
}

export interface SnowEffect {
  update(dt: number, ctx: SnowEffectContext): void;
  /** Override visibility: null = auto (biome/water), true = always on, false = always off. */
  setForced?(value: boolean | null): void;
  /** Current override: null = auto, true = on, false = off. */
  getForced?(): boolean | null;
}

export function createSnowEffect(scene: THREE.Scene): SnowEffect {
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  let seed = SEED_OFFSET;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3] = (seededRandom(++seed) - 0.5) * BOX_WIDTH;
    positions[i * 3 + 1] = seededRandom(++seed) * BOX_HEIGHT;
    positions[i * 3 + 2] = (seededRandom(++seed) - 0.5) * BOX_DEPTH;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xe8f4fc,
    size: 0.1,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: true,
  });

  const mesh = new THREE.Points(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);
  mesh.position.set(0, 0, 0);

  const positionAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
  const posArray = positionAttr.array as Float32Array;
  let driftTime = 0;
  let initialized = false;
  let forced: boolean | null = null;

  function setForced(value: boolean | null): void {
    forced = value;
  }

  function getForced(): boolean | null {
    return forced;
  }

  function update(dt: number, ctx: SnowEffectContext): void {
    if (forced === false) {
      mesh.visible = false;
      return;
    }
    if (forced === null) {
      if (ctx.eyeY < ctx.waterSurfaceY) {
        mesh.visible = false;
        return;
      }
      if (ctx.biome !== undefined && !COLD_BIOMES.has(ctx.biome)) {
        mesh.visible = false;
        return;
      }
    }
    mesh.visible = true;

    const px = ctx.playerPosition.x;
    const py = ctx.playerPosition.y;
    const pz = ctx.playerPosition.z;
    const respawnY = py - RESPAWN_BELOW_PLAYER;

    if (!initialized) {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        posArray[i3] = px + (seededRandom(++seed) - 0.5) * BOX_WIDTH;
        posArray[i3 + 1] = py + seededRandom(++seed) * BOX_HEIGHT;
        posArray[i3 + 2] = pz + (seededRandom(++seed) - 0.5) * BOX_DEPTH;
      }
      initialized = true;
    }

    driftTime += dt;
    const driftX = Math.sin(driftTime * 0.5) * DRIFT_AMPLITUDE * dt;
    const driftZ = Math.cos(driftTime * 0.3) * DRIFT_AMPLITUDE * dt;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      posArray[i3 + 1] -= FALL_SPEED * dt;
      posArray[i3] += driftX;
      posArray[i3 + 2] += driftZ;

      const dx = posArray[i3] - px;
      const dz = posArray[i3 + 2] - pz;
      const distSq = dx * dx + dz * dz;
      if (
        posArray[i3 + 1] < respawnY ||
        distSq > RESPAWN_DISTANCE_SQ
      ) {
        posArray[i3] = px + (seededRandom(++seed) - 0.5) * BOX_WIDTH;
        posArray[i3 + 1] = py + seededRandom(++seed) * BOX_HEIGHT;
        posArray[i3 + 2] = pz + (seededRandom(++seed) - 0.5) * BOX_DEPTH;
      }
    }
    positionAttr.needsUpdate = true;
  }

  return { update, setForced, getForced };
}
