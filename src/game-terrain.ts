/**
 * Terrain sampling, biomes, spawn search, and tree generation for the main thread.
 * Uses chunk-runtime for height cache and block lookup; no THREE scene dependency.
 */
import * as THREE from "three";
import { createNoise2D } from "simplex-noise";
import type { BlockType, TreeNoiseCaches } from "./types";
import type { Biome } from "./types";
import { CHUNK_SIZE, WATER_LEVEL, WORLD_HEIGHT } from "./constants";
import {
  columnHeightCache,
  columnCacheKey,
  getBlockAt,
} from "./chunk-runtime";
import { isSolidBlock as isBlockTypeSolid } from "./block-registry";
import { createTerrainSampling } from "./terrain-sampling";

export type { Biome };

/** Seeded RNG for deterministic noise (same seed = same world). */
function makeSeededRandom(seed: number) {
  return function () {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

const WORLD_SEED_KEY = "voxel-world-seed";
function getOrCreateWorldSeed(): number {
  const stored = localStorage.getItem(WORLD_SEED_KEY);
  if (stored != null) {
    const n = parseInt(stored, 10);
    if (Number.isFinite(n)) return n;
  }
  const seed = (Date.now() >>> 0) ^ ((Math.random() * 0xffffffff) >>> 0);
  localStorage.setItem(WORLD_SEED_KEY, String(seed));
  return seed;
}

/** World seed: persisted so reloads keep same terrain; new session gets new seed. */
export const WORLD_SEED = getOrCreateWorldSeed();

const terrainSampling = createTerrainSampling(WORLD_SEED);

/** Noise for tree generation only (forest density + placement). */
const forestDensityNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 777));
const treePlacementNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 888));

/** Biomes that can be chosen for spawn; each has equal probability (deterministic per WORLD_SEED). */
export const SPAWNABLE_BIOMES: Biome[] = [
  "desert",
  "plains",
  "savanna",
  "forest",
  "jungle",
  "mountain",
  "snow",
];
/** Spawn biome for this world: one of SPAWNABLE_BIOMES chosen by seeded RNG. */
export const SPAWN_BIOME: Biome = (() => {
  const rng = makeSeededRandom(WORLD_SEED + 5050);
  const idx = Math.floor(rng() * SPAWNABLE_BIOMES.length);
  return SPAWNABLE_BIOMES[idx];
})();

/**
 * Terrain height at world (x, z). Clamped to integer block Y.
 * Uses columnHeightCache to avoid recomputing noise for the same column.
 */
export function getHeight(x: number, z: number): number {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  const key = columnCacheKey(bx, bz);
  const cached = columnHeightCache.get(key);
  if (cached !== undefined) return cached;

  const h = terrainSampling.getSmoothedHeight(x, z);
  const result = Math.floor(THREE.MathUtils.clamp(h, 0, WORLD_HEIGHT));
  columnHeightCache.set(key, result);
  return result;
}

/** Resolved biome for surface/blocks (delegates to terrain sampler with cached getHeight). */
export function getResolvedBiome(x: number, z: number): Biome {
  return terrainSampling.getResolvedBiome(x, z, getHeight);
}

/** Surface block type at (biome, y, topY). Used by chunk generation and debug overlay. */
export function getBlockTypeAt(biome: Biome, y: number, topY: number): BlockType {
  return terrainSampling.getBlockTypeAt(biome, y, topY);
}

/** Foot half-extent for spawn surface search (matches player AABB in XZ). */
const SPAWN_FOOT_HALF = 0.3;

/**
 * World Y of the top face of solid terrain under the given XZ area (voxel-based).
 * Only for spawn height. Excludes leaves. When getBlockAt returns null, falls back to getHeight.
 */
function getSurfaceYVoxel(px: number, pz: number, searchMaxY: number): number {
  const minBx = Math.ceil(px - SPAWN_FOOT_HALF - 0.5);
  const maxBx = Math.floor(px + SPAWN_FOOT_HALF + 0.5);
  const minBz = Math.ceil(pz - SPAWN_FOOT_HALF - 0.5);
  const maxBz = Math.floor(pz + SPAWN_FOOT_HALF + 0.5);
  let maxSurfaceY = -0.5;
  const top = Math.min(searchMaxY, WORLD_HEIGHT - 1);
  for (let bx = minBx; bx <= maxBx; bx++) {
    for (let bz = minBz; bz <= maxBz; bz++) {
      let columnTop = -0.5;
      for (let by = top; by >= 0; by--) {
        const type = getBlockAt(bx, by, bz);
        if (type === null) {
          columnTop = getHeight(bx, bz) + 0.5;
          break;
        }
        if (type !== "wood" && isBlockTypeSolid(type as BlockType)) {
          columnTop = by + 0.5;
          break;
        }
      }
      if (columnTop > maxSurfaceY) maxSurfaceY = columnTop;
    }
  }
  return maxSurfaceY;
}

/**
 * World Y of the top face of solid terrain at (x, z). Only for spawn – do not use for physics/grounded/jump.
 */
export function getSurfaceY(x: number, z: number): number {
  return getSurfaceYVoxel(x, z, WORLD_HEIGHT);
}

/** Surface Y for a single block column (no foot-area expansion). Used for entity spawns. */
export function getColumnSurfaceY(wx: number, wz: number): number {
  const bx = Math.floor(wx);
  const bz = Math.floor(wz);
  for (let by = WORLD_HEIGHT - 1; by >= 0; by--) {
    const type = getBlockAt(bx, by, bz);
    if (type === null) return getHeight(bx, bz) + 0.5;
    if (
      type !== "wood" &&
      type !== "leaves" &&
      isBlockTypeSolid(type as BlockType)
    ) {
      return by + 0.5;
    }
  }
  return getHeight(bx, bz) + 0.5;
}

const SPAWN_BIOME_MIN_RADIUS = 2 * CHUNK_SIZE;
const SPAWN_MAX_HEIGHT = WATER_LEVEL + 38;
export const SURFACE_STONE_HEIGHT = WATER_LEVEL + 26;
export const MOUNTAIN_STONE_SURFACE_HEIGHT = WATER_LEVEL + 16;

/** Check that all 4 cardinal points 1 chunk away are also in the target biome. */
function isBiomeSolid(wx: number, wz: number, biome: Biome): boolean {
  const r = CHUNK_SIZE * 1;
  return (
    getResolvedBiome(wx + r, wz) === biome &&
    getResolvedBiome(wx - r, wz) === biome &&
    getResolvedBiome(wx, wz + r) === biome &&
    getResolvedBiome(wx, wz - r) === biome
  );
}

/** Max height for spawn so surface is grass (not stone). */
function getSpawnMaxHeightForGrass(biome: Biome): number {
  if (biome === "mountain" || biome === "meadow")
    return MOUNTAIN_STONE_SURFACE_HEIGHT - 1;
  if (
    biome === "forest" ||
    biome === "plains" ||
    biome === "savanna" ||
    biome === "jungle"
  )
    return SURFACE_STONE_HEIGHT - 1;
  return SPAWN_MAX_HEIGHT;
}

/** Find next spawn position in the given biome (spiral from (0,0)). Prefers land and grass surface. */
export function findSpawnInBiome(biome: Biome): { x: number; z: number } {
  const step = CHUNK_SIZE;
  const maxRadius = 80 * CHUNK_SIZE;
  const maxHeightPreferGrass = getSpawnMaxHeightForGrass(biome);

  const tryFind = (maxHeight: number): { x: number; z: number } | null => {
    for (
      let radius = SPAWN_BIOME_MIN_RADIUS;
      radius <= maxRadius;
      radius += step
    ) {
      const half = radius;
      for (let x = -half; x <= half; x += step) {
        const h1 = getHeight(x, -half);
        if (
          getResolvedBiome(x, -half) === biome &&
          isBiomeSolid(x, -half, biome) &&
          h1 >= WATER_LEVEL - 1 &&
          h1 <= maxHeight
        )
          return { x, z: -half };
        if (half > 0) {
          const h2 = getHeight(x, half);
          if (
            getResolvedBiome(x, half) === biome &&
            isBiomeSolid(x, half, biome) &&
            h2 >= WATER_LEVEL - 1 &&
            h2 <= maxHeight
          )
            return { x, z: half };
        }
      }
      for (let z = -half + step; z < half; z += step) {
        const h1 = getHeight(-half, z);
        if (
          getResolvedBiome(-half, z) === biome &&
          isBiomeSolid(-half, z, biome) &&
          h1 >= WATER_LEVEL - 1 &&
          h1 <= maxHeight
        )
          return { x: -half, z };
        const h2 = getHeight(half, z);
        if (
          getResolvedBiome(half, z) === biome &&
          isBiomeSolid(half, z, biome) &&
          h2 >= WATER_LEVEL - 1 &&
          h2 <= maxHeight
        )
          return { x: half, z };
      }
    }
    return null;
  };

  const withGrass = tryFind(maxHeightPreferGrass);
  if (withGrass) return withGrass;
  const fallback = tryFind(SPAWN_MAX_HEIGHT);
  return fallback ?? { x: 0, z: 0 };
}

// ================= TREE GENERATION =================

const FOREST_DENSITY_SCALE = 0.028;
const TREE_PLACEMENT_SCALE = 0.12;
const FOREST_DENSITY_THRESHOLD = 0.0;
const TREE_PLACEMENT_FOREST_THRESHOLD = -0.1;
const TREE_PLACEMENT_JUNGLE_THRESHOLD = -0.45;
const TREE_PLACEMENT_PLAINS_THRESHOLD = 0.93;
const TREE_PLACEMENT_MOUNTAIN_THRESHOLD = 0.97;
const TREE_PLACEMENT_SNOW_THRESHOLD = 0.55;
const TREE_MAX_SLOPE = 2;

const TRUNK_HEIGHT_PLAINS = 4;
const TRUNK_HEIGHT_FOREST = 5;
const TRUNK_HEIGHT_JUNGLE = 7;
const TRUNK_HEIGHT_MOUNTAIN = 4;
const TRUNK_HEIGHT_SNOW = 9;
const LEAF_RADIUS_PLAINS = 2;
const LEAF_RADIUS_FOREST = 2;
const LEAF_RADIUS_JUNGLE = 3;
const LEAF_RADIUS_MOUNTAIN = 1;
const LEAF_RADIUS_SNOW = 1;
const LEAF_HEIGHT_PLAINS = 3;
const LEAF_HEIGHT_FOREST = 4;
const LEAF_HEIGHT_JUNGLE = 5;
const LEAF_HEIGHT_MOUNTAIN = 2;
const LEAF_HEIGHT_SNOW = 6;

function treeSeedValue(x: number, z: number): number {
  const n = treePlacementNoise2D(x * 0.7 + 100, z * 0.7);
  return (n + 1) * 0.5;
}

/** Forest density at (wx, wz). Exported for generateChunk cache. */
export function getForestDensity(wx: number, wz: number): number {
  return forestDensityNoise2D(
    wx * FOREST_DENSITY_SCALE,
    wz * FOREST_DENSITY_SCALE
  );
}

/** Tree placement value at (wx, wz). Exported for generateChunk cache. */
export function getTreePlacement(wx: number, wz: number): number {
  return treePlacementNoise2D(
    wx * TREE_PLACEMENT_SCALE,
    wz * TREE_PLACEMENT_SCALE
  );
}

function getTreePlacementCached(
  wx: number,
  wz: number,
  cache?: Map<string, number>
): number {
  if (cache) {
    const k = `${wx},${wz}`;
    let v = cache.get(k);
    if (v === undefined) {
      v = getTreePlacement(wx, wz);
      cache.set(k, v);
    }
    return v;
  }
  return getTreePlacement(wx, wz);
}

function getForestDensityCached(
  wx: number,
  wz: number,
  cache?: Map<string, number>
): number {
  if (cache) {
    const k = `${wx},${wz}`;
    let v = cache.get(k);
    if (v === undefined) {
      v = getForestDensity(wx, wz);
      cache.set(k, v);
    }
    return v;
  }
  return getForestDensity(wx, wz);
}

function getTreePlacementPass(
  wx: number,
  wz: number,
  biome: Biome,
  caches?: TreeNoiseCaches
): boolean {
  const placement = getTreePlacementCached(wx, wz, caches?.treePlacement);
  if (biome === "forest") {
    const forestDensity = getForestDensityCached(wx, wz, caches?.forestDensity);
    if (forestDensity <= FOREST_DENSITY_THRESHOLD) return false;
    return placement > TREE_PLACEMENT_FOREST_THRESHOLD;
  }
  if (biome === "jungle") {
    const forestDensity = getForestDensityCached(wx, wz, caches?.forestDensity);
    if (forestDensity <= FOREST_DENSITY_THRESHOLD) return false;
    return placement > TREE_PLACEMENT_JUNGLE_THRESHOLD;
  }
  if (biome === "mountain")
    return placement > TREE_PLACEMENT_MOUNTAIN_THRESHOLD;
  if (
    biome === "plains" ||
    biome === "meadow" ||
    biome === "savanna" ||
    biome === "cherry_grove"
  )
    return placement > TREE_PLACEMENT_PLAINS_THRESHOLD;
  if (biome === "windswept_forest") {
    const forestDensity = getForestDensityCached(wx, wz, caches?.forestDensity);
    if (forestDensity <= FOREST_DENSITY_THRESHOLD) return false;
    return placement > TREE_PLACEMENT_FOREST_THRESHOLD;
  }
  if (biome === "snow" || biome === "grove")
    return placement > TREE_PLACEMENT_SNOW_THRESHOLD;
  return false;
}

function isLocalTreeMax(
  wx: number,
  wz: number,
  treePlacementCache?: Map<string, number>
): boolean {
  const center = getTreePlacementCached(wx, wz, treePlacementCache);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (dx === 0 && dz === 0) continue;
      if (
        getTreePlacementCached(wx + dx, wz + dz, treePlacementCache) >= center
      )
        return false;
    }
  }
  return true;
}

function isTerrainFlatEnough(wx: number, wz: number): boolean {
  const h = getHeight(wx, wz);
  for (const [dx, dz] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    if (Math.abs(getHeight(wx + dx, wz + dz) - h) > TREE_MAX_SLOPE)
      return false;
  }
  return true;
}

/** Whether a tree should be placed at (wx, wz): grass above water, biome, two-layer noise, spacing, no cliffs. */
export function shouldPlaceTree(
  wx: number,
  wz: number,
  caches?: TreeNoiseCaches
): boolean {
  const biome = getResolvedBiome(wx, wz);
  if (biome === "desert") return false;
  const topY = getHeight(wx, wz);
  if (topY < WATER_LEVEL) return false;
  if (biome === "mountain" && topY >= WATER_LEVEL + 18) return false;
  if (
    biome === "snowy_slopes" ||
    biome === "stony_peaks" ||
    biome === "frozen_peaks" ||
    biome === "jagged_peaks" ||
    biome === "windswept_hills" ||
    biome === "windswept_gravelly_hills"
  )
    return false;
  const surfaceType = terrainSampling.getBlockTypeAt(biome, topY, topY);
  if (surfaceType !== "grass" && surfaceType !== "grass_snow" && surfaceType !== "grass_savanna")
    return false;
  if (!isTerrainFlatEnough(wx, wz)) return false;
  if (!getTreePlacementPass(wx, wz, biome, caches)) return false;
  if (!isLocalTreeMax(wx, wz, caches?.treePlacement)) return false;
  return true;
}

function shouldPlaceLeafAtCorner(
  wx: number,
  wz: number,
  lx: number,
  lz: number
): boolean {
  const v = treeSeedValue(wx + lx, wz + lz);
  return v >= 0.5;
}

function leafDistSq(dx: number, dy: number, dz: number): number {
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Generate trunk + leaf block positions for a single tree. Deterministic from (wx, baseY, wz, biome).
 */
export function getTreeBlocks(
  wx: number,
  baseY: number,
  wz: number,
  biome: Biome
): {
  wood: Array<{ x: number; y: number; z: number }>;
  leaves: Array<{ x: number; y: number; z: number }>;
} {
  const wood: Array<{ x: number; y: number; z: number }> = [];
  const leaves: Array<{ x: number; y: number; z: number }> = [];
  const t = treeSeedValue(wx, wz);
  const trunkHeight =
    biome === "snow" || biome === "grove"
      ? TRUNK_HEIGHT_SNOW + Math.floor(t * 2)
      : biome === "forest"
      ? TRUNK_HEIGHT_FOREST + Math.floor(t * 2)
      : biome === "jungle"
      ? TRUNK_HEIGHT_JUNGLE + Math.floor(t * 3)
      : biome === "mountain"
      ? TRUNK_HEIGHT_MOUNTAIN + Math.floor(t * 1)
      : TRUNK_HEIGHT_PLAINS + Math.floor(t * 1);
  const leafRadius =
    biome === "snow" || biome === "grove"
      ? LEAF_RADIUS_SNOW
      : biome === "forest"
      ? LEAF_RADIUS_FOREST
      : biome === "jungle"
      ? LEAF_RADIUS_JUNGLE
      : biome === "mountain"
      ? LEAF_RADIUS_MOUNTAIN
      : LEAF_RADIUS_PLAINS;
  const leafHeight =
    biome === "snow" || biome === "grove"
      ? LEAF_HEIGHT_SNOW
      : biome === "forest"
      ? LEAF_HEIGHT_FOREST
      : biome === "jungle"
      ? LEAF_HEIGHT_JUNGLE
      : biome === "mountain"
      ? LEAF_HEIGHT_MOUNTAIN
      : LEAF_HEIGHT_PLAINS;
  const topY = baseY + trunkHeight;
  const canopyCenterY = topY + Math.floor(leafHeight * 0.5);
  const maxLeafDistSq = (leafRadius + 0.5) * (leafRadius + 0.5);

  for (let h = 1; h <= trunkHeight; h++) {
    wood.push({ x: wx, y: baseY + h, z: wz });
  }
  for (let dy = 0; dy < leafHeight; dy++) {
    const y = topY + dy;
    const r = dy === leafHeight - 1 ? Math.max(0, leafRadius - 1) : leafRadius;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx === 0 && dz === 0 && dy === 0) continue;
        if (r > 0 && Math.abs(dx) === r && Math.abs(dz) === r) {
          if (!shouldPlaceLeafAtCorner(wx, wz, dx, dz)) continue;
        }
        if (
          (biome === "forest" || biome === "jungle") &&
          leafDistSq(dx, y - canopyCenterY, dz) > maxLeafDistSq
        )
          continue;
        leaves.push({ x: wx + dx, y, z: wz + dz });
      }
    }
  }
  return { wood, leaves };
}

/**
 * Generate a single tree at world position (ground block top = worldY). Returns wood and leaf positions.
 */
export function generateTree(
  worldX: number,
  worldY: number,
  worldZ: number
): {
  wood: Array<{ x: number; y: number; z: number }>;
  leaves: Array<{ x: number; y: number; z: number }>;
} {
  const biome = getResolvedBiome(worldX, worldZ);
  return getTreeBlocks(worldX, worldY, worldZ, biome);
}
