/**
 * Terrain sampling, biomes, spawn search, and tree generation for the main thread.
 * Uses chunk-runtime for height cache and block lookup; no THREE scene dependency.
 */
import * as THREE from 'three'
import { createNoise2D, createNoise3D } from 'simplex-noise'
import type { BlockType, TreeNoiseCaches } from './types'
import type { Biome } from './types'
import {
  CHUNK_SIZE,
  MIN_CAVE_DEPTH_BELOW_SURFACE,
  WATER_LEVEL,
  WORLD_MAX_Y,
  WORLD_MIN_Y,
} from './constants'
import { columnHeightCache, columnCacheKey, getBlockAt } from './chunk-runtime'
import { isSolidBlock as isBlockTypeSolid, getBlockHeight } from './block-registry'
import { createTerrainSampling } from './terrain-sampling'
import { getPoiBiomeOverride, getActivePois } from './world-pois'
import { BIOME_REGISTRY } from './terrain/biomes'
import {
  MOUNTAIN_STONE_SURFACE_HEIGHT,
  SURFACE_STONE_HEIGHT,
} from './terrain/surface-constants'
import { resolveSurfaceBlock } from './terrain/surface-resolver'
import {
  FOREST_DENSITY_SCALE,
  FOREST_DENSITY_THRESHOLD,
  TREE_PLACEMENT_SCALE,
  TREE_MAX_SLOPE,
  TREE_SHAPE_NOISE_SCALE,
  JUNGLE_TREE_SHAPE_OFFSET_X,
  JUNGLE_TREE_SHAPE_OFFSET_Z,
  TREE_PLACEMENT_CONFIG,
  getTreeShapeConfigForBiome,
  type TreeShapeConfig,
} from './terrain/tree-constants'
import { CAVE_THRESHOLD } from './terrain/constants'
import {
  BADLANDS_BAND_SCALE_XZ,
  BADLANDS_BAND_SCALE_Y,
  SURFACE_DITHER_COAST_OFFSET_X,
  SURFACE_DITHER_COAST_OFFSET_Z,
  SURFACE_DITHER_COAST_SCALE,
  SURFACE_DITHER_LAND_OFFSET_X,
  SURFACE_DITHER_LAND_OFFSET_Z,
  SURFACE_DITHER_LAND_SCALE,
  SURFACE_FROZEN_PEAKS_BLOB_OFFSET_X,
  SURFACE_FROZEN_PEAKS_BLOB_OFFSET_Z,
  SURFACE_FROZEN_PEAKS_BLOB_SCALE,
  SURFACE_FROZEN_PEAKS_N_OFFSET_X,
  SURFACE_FROZEN_PEAKS_N_OFFSET_Z,
  SURFACE_FROZEN_PEAKS_N_SCALE,
} from './terrain/surface-constants'
import { makeSeededRandom } from './terrain/utils'

export type { Biome }
export { MOUNTAIN_STONE_SURFACE_HEIGHT, SURFACE_STONE_HEIGHT }

const WORLD_SEED_KEY = 'voxel-world-seed'

/** Reads world seed from localStorage or generates and persists a new one so reloads keep the same terrain. */
function getOrCreateWorldSeed(): number {
  const stored = localStorage.getItem(WORLD_SEED_KEY)
  if (stored != null) {
    const n = parseInt(stored, 10)
    if (Number.isFinite(n)) return n
  }
  const seed = (Date.now() >>> 0) ^ ((Math.random() * 0xffffffff) >>> 0)
  localStorage.setItem(WORLD_SEED_KEY, String(seed))
  return seed
}

/** World seed: persisted so reloads keep same terrain; new session gets new seed. */
export const WORLD_SEED = getOrCreateWorldSeed()

const terrainSampling = createTerrainSampling(WORLD_SEED)

/** Noise for tree generation only (forest density + placement + shape). */
const forestDensityNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 777))
const treePlacementNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 888))
const treeShapeNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 999))
const detailNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 456))

/** 3D cave noise (same seed as terrain pipeline). Used only for debug spawn above cave. */
const caveNoise3D = createNoise3D(makeSeededRandom(WORLD_SEED + 400))

/** Biomes that can be chosen for spawn; each has equal probability (deterministic per WORLD_SEED). */
export const SPAWNABLE_BIOMES: Biome[] = [
  'desert',
  'plains',
  'savanna',
  'forest',
  'jungle',
  'mountain',
  'snow',
]
/** Spawn biome for this world: one of SPAWNABLE_BIOMES chosen by seeded RNG. */
export const SPAWN_BIOME: Biome = (() => {
  const rng = makeSeededRandom(WORLD_SEED + 5050)
  const idx = Math.floor(rng() * SPAWNABLE_BIOMES.length)
  return SPAWNABLE_BIOMES[idx]
})()

/**
 * Terrain height at world (x, z). Clamped to integer block Y.
 * Uses columnHeightCache to avoid recomputing noise for the same column.
 */
export function getHeight(x: number, z: number): number {
  const bx = Math.floor(x)
  const bz = Math.floor(z)
  const key = columnCacheKey(bx, bz)
  const cached = columnHeightCache.get(key)
  if (cached !== undefined) return cached

  const h = terrainSampling.getSmoothedHeight(x, z)
  const result = Math.floor(THREE.MathUtils.clamp(h, WORLD_MIN_Y, WORLD_MAX_Y))
  columnHeightCache.set(key, result)
  return result
}

/** Resolved biome for surface/blocks. POI area-theme overrides procedural biome when (x,z) is inside a placed POI. */
export function getResolvedBiome(x: number, z: number): Biome {
  const override = getPoiBiomeOverride(getActivePois(), x, z)
  if (override !== null) return override
  return terrainSampling.getResolvedBiome(x, z, getHeight)
}

/** Surface block type at (biome, y, topY). Used by chunk generation and debug overlay. */
export function getBlockTypeAt(biome: Biome, y: number, topY: number): BlockType {
  return terrainSampling.getBlockTypeAt(biome, y, topY)
}

/** Temperature at (x, z) in [0, 1]. Used by debug overlay. */
export function getTemperature(x: number, z: number): number {
  return terrainSampling.getTemperature(x, z)
}

/** Humidity at (x, z) in [0, 1]. Used by debug overlay. */
export function getHumidity(x: number, z: number): number {
  return terrainSampling.getHumidity(x, z)
}

/** Continentalness at (x, z) in [0, 1]. Used by debug overlay. */
export function getContinentalness(x: number, z: number): number {
  return terrainSampling.getContinentalness(x, z)
}

/** Erosion at (x, z). Used by debug overlay. */
export function getErosion(x: number, z: number): number {
  return terrainSampling.getErosion(x, z)
}

/** Foot half-extent for spawn surface search (matches player AABB in XZ). */
const SPAWN_FOOT_HALF = 0.3

/**
 * World Y of the top face of solid terrain under the given XZ area (voxel-based).
 * Only for spawn height. Excludes leaves. When getBlockAt returns null, falls back to getHeight.
 */
function getSurfaceYVoxel(px: number, pz: number, searchMaxY: number): number {
  const minBx = Math.ceil(px - SPAWN_FOOT_HALF - 0.5)
  const maxBx = Math.floor(px + SPAWN_FOOT_HALF + 0.5)
  const minBz = Math.ceil(pz - SPAWN_FOOT_HALF - 0.5)
  const maxBz = Math.floor(pz + SPAWN_FOOT_HALF + 0.5)
  let maxSurfaceY = WORLD_MIN_Y - 0.5
  const top = Math.min(searchMaxY, WORLD_MAX_Y)
  for (let bx = minBx; bx <= maxBx; bx++) {
    for (let bz = minBz; bz <= maxBz; bz++) {
      let columnTop = WORLD_MIN_Y - 0.5
      for (let by = top; by >= WORLD_MIN_Y; by--) {
        const type = getBlockAt(bx, by, bz)
        if (type === null) {
          columnTop = getHeight(bx, bz) + 0.5
          break
        }
        if (type !== 'wood' && isBlockTypeSolid(type as BlockType)) {
          columnTop = by + getBlockHeight(type as BlockType)
          break
        }
      }
      if (columnTop > maxSurfaceY) maxSurfaceY = columnTop
    }
  }
  return maxSurfaceY
}

/**
 * World Y of the top face of solid terrain at (x, z). Uses foot-area expansion for spawn; do not use for physics/grounded/jump.
 */
export function getSurfaceY(x: number, z: number): number {
  return getSurfaceYVoxel(x, z, WORLD_MAX_Y)
}

/** Surface Y for a single block column (no foot-area expansion). Used for entity spawns. */
export function getColumnSurfaceY(wx: number, wz: number): number {
  const bx = Math.floor(wx)
  const bz = Math.floor(wz)
  for (let by = WORLD_MAX_Y; by >= WORLD_MIN_Y; by--) {
    const type = getBlockAt(bx, by, bz)
    if (type === null) return getHeight(bx, bz) + 0.5
    if (type !== 'wood' && type !== 'leaves' && isBlockTypeSolid(type as BlockType)) {
      return by + getBlockHeight(type as BlockType)
    }
  }
  return getHeight(bx, bz) + 0.5
}

const SPAWN_BIOME_MIN_RADIUS = 2 * CHUNK_SIZE
const SPAWN_MAX_HEIGHT = WATER_LEVEL + 38
/** Minimum chunks of land in all directions from spawn; avoids spawning at the coast. */
const SPAWN_OCEAN_BUFFER_CHUNKS = 5

/** Biomes that count as snow for grass → grass_snow neighbor rule. Must match terrain worker. */
const SNOW_BIOMES: Biome[] = [
  'snow',
  'grove',
  'snowy_slopes',
  'frozen_peaks',
  'jagged_peaks',
]

/** Max cardinal height delta for slope (cliff) detection. */
function getMaxSlopeDelta(x: number, z: number): number {
  const h = getHeight(x, z)
  const dN = Math.abs(getHeight(x, z - 1) - h)
  const dS = Math.abs(getHeight(x, z + 1) - h)
  const dW = Math.abs(getHeight(x - 1, z) - h)
  const dE = Math.abs(getHeight(x + 1, z) - h)
  return Math.max(dN, dS, dW, dE)
}

/** Surface block type at (wx, wz) given biome and topY; handles shore, underwater, stone layers, snow/grass variants. */
export function getSurfaceBlockAt(wx: number, wz: number, biome: Biome, topY: number): BlockType {
  const def = BIOME_REGISTRY[biome]
  const surface = def.blocks.surface as BlockType

  const blend = terrainSampling.getBiomeBlend(wx, wz)
  const slope = getMaxSlopeDelta(wx, wz)
  const ditherNoiseCoast =
    (detailNoise2D(
      wx * SURFACE_DITHER_COAST_SCALE + SURFACE_DITHER_COAST_OFFSET_X,
      wz * SURFACE_DITHER_COAST_SCALE + SURFACE_DITHER_COAST_OFFSET_Z,
    ) +
      1) *
    0.5
  const ditherNoiseLand =
    (detailNoise2D(
      wx * SURFACE_DITHER_LAND_SCALE + SURFACE_DITHER_LAND_OFFSET_X,
      wz * SURFACE_DITHER_LAND_SCALE + SURFACE_DITHER_LAND_OFFSET_Z,
    ) +
      1) *
    0.5
  const frozenPeaksNoiseN =
    (detailNoise2D(
      wx * SURFACE_FROZEN_PEAKS_N_SCALE + SURFACE_FROZEN_PEAKS_N_OFFSET_X,
      wz * SURFACE_FROZEN_PEAKS_N_SCALE + SURFACE_FROZEN_PEAKS_N_OFFSET_Z,
    ) +
      1) *
    0.5
  const frozenPeaksNoiseBlob =
    (detailNoise2D(
      wx * SURFACE_FROZEN_PEAKS_BLOB_SCALE + SURFACE_FROZEN_PEAKS_BLOB_OFFSET_X,
      wz * SURFACE_FROZEN_PEAKS_BLOB_SCALE + SURFACE_FROZEN_PEAKS_BLOB_OFFSET_Z,
    ) +
      1) *
    0.5
  let hasSnowNeighbor = false
  if (surface === 'grass') {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue
        if (SNOW_BIOMES.includes(getResolvedBiome(wx + dx, wz + dz))) {
          hasSnowNeighbor = true
          break
        }
      }
    }
  }
  const badlandsBandNoise =
    biome === 'badlands'
      ? (detailNoise2D(
          wx * BADLANDS_BAND_SCALE_XZ + topY * BADLANDS_BAND_SCALE_Y,
          wz * BADLANDS_BAND_SCALE_XZ,
        ) +
          1) *
        0.5
      : undefined
  return resolveSurfaceBlock({
    topY,
    biome,
    blend,
    slope,
    frozenPeaksNoiseN,
    frozenPeaksNoiseBlob,
    hasSnowNeighbor,
    ditherNoiseCoast,
    ditherNoiseLand,
    badlandsBandNoise,
  })
}

/** Check that all 4 cardinal points 1 chunk away are also in the target biome. */
function isBiomeSolid(wx: number, wz: number, biome: Biome): boolean {
  const r = CHUNK_SIZE * 1
  return (
    getResolvedBiome(wx + r, wz) === biome &&
    getResolvedBiome(wx - r, wz) === biome &&
    getResolvedBiome(wx, wz + r) === biome &&
    getResolvedBiome(wx, wz - r) === biome
  )
}

/**
 * Returns true if any column within the given chunk radius of (wx, wz) is ocean.
 * Used to avoid spawning at the coast.
 */
function hasOceanNearby(wx: number, wz: number, bufferChunks: number): boolean {
  for (let dcx = -bufferChunks; dcx <= bufferChunks; dcx++) {
    for (let dcz = -bufferChunks; dcz <= bufferChunks; dcz++) {
      if (getResolvedBiome(wx + dcx * CHUNK_SIZE, wz + dcz * CHUNK_SIZE) === 'ocean')
        return true
    }
  }
  return false
}

/** Max height for spawn so surface is grass (not stone). */
function getSpawnMaxHeightForGrass(biome: Biome): number {
  if (biome === 'mountain' || biome === 'meadow') return MOUNTAIN_STONE_SURFACE_HEIGHT - 1
  if (biome === 'forest' || biome === 'plains' || biome === 'savanna' || biome === 'jungle')
    return SURFACE_STONE_HEIGHT - 1
  return SPAWN_MAX_HEIGHT
}

/**
 * Returns true if the terrain pipeline would carve a cave below (x, z) within the carve range.
 * Uses the same noise and threshold as terrain/index.ts stage2Carve3D.
 */
function hasCaveBelow(x: number, z: number): boolean {
  const surfaceY = getHeight(x, z)
  const carveCeiling = Math.max(WORLD_MIN_Y + 1, surfaceY - MIN_CAVE_DEPTH_BELOW_SURFACE)
  for (let y = WORLD_MIN_Y + 1; y < carveCeiling && y <= WORLD_MAX_Y; y++) {
    if (caveNoise3D(x, y, z) > CAVE_THRESHOLD) return true
  }
  return false
}

/**
 * Finds a spawn position above a cave (for debugging). Spiral from (0,0), first valid land column with cave below.
 */
export function findSpawnAboveCave(): { x: number; z: number } {
  const step = CHUNK_SIZE
  const maxRadius = 80 * CHUNK_SIZE
  for (let radius = SPAWN_BIOME_MIN_RADIUS; radius <= maxRadius; radius += step) {
    const half = radius
    for (let x = -half; x <= half; x += step) {
      for (const z of [-half, half]) {
        if (half === 0 && z === half) continue
        const biome = getResolvedBiome(x, z)
        if (!SPAWNABLE_BIOMES.includes(biome)) continue
        if (!isBiomeSolid(x, z, biome)) continue
        if (hasOceanNearby(x, z, SPAWN_OCEAN_BUFFER_CHUNKS)) continue
        const h = getHeight(x, z)
        if (h < WATER_LEVEL - 1 || h > SPAWN_MAX_HEIGHT) continue
        if (hasCaveBelow(x, z)) return { x, z }
      }
    }
    for (let z = -half + step; z < half; z += step) {
      for (const x of [-half, half]) {
        const biome = getResolvedBiome(x, z)
        if (!SPAWNABLE_BIOMES.includes(biome)) continue
        if (!isBiomeSolid(x, z, biome)) continue
        if (hasOceanNearby(x, z, SPAWN_OCEAN_BUFFER_CHUNKS)) continue
        const h = getHeight(x, z)
        if (h < WATER_LEVEL - 1 || h > SPAWN_MAX_HEIGHT) continue
        if (hasCaveBelow(x, z)) return { x, z }
      }
    }
  }
  return { x: 0, z: 0 }
}

/** Find next spawn position in the given biome (spiral from (0,0)). Prefers land and grass surface. */
export function findSpawnInBiome(biome: Biome): { x: number; z: number } {
  const step = CHUNK_SIZE
  const maxRadius = 80 * CHUNK_SIZE
  const maxHeightPreferGrass = getSpawnMaxHeightForGrass(biome)

  const tryFind = (maxHeight: number): { x: number; z: number } | null => {
    for (let radius = SPAWN_BIOME_MIN_RADIUS; radius <= maxRadius; radius += step) {
      const half = radius
      for (let x = -half; x <= half; x += step) {
        const h1 = getHeight(x, -half)
        if (
          getResolvedBiome(x, -half) === biome &&
          isBiomeSolid(x, -half, biome) &&
          h1 >= WATER_LEVEL - 1 &&
          h1 <= maxHeight &&
          !hasOceanNearby(x, -half, SPAWN_OCEAN_BUFFER_CHUNKS)
        )
          return { x, z: -half }
        if (half > 0) {
          const h2 = getHeight(x, half)
          if (
            getResolvedBiome(x, half) === biome &&
            isBiomeSolid(x, half, biome) &&
            h2 >= WATER_LEVEL - 1 &&
            h2 <= maxHeight &&
            !hasOceanNearby(x, half, SPAWN_OCEAN_BUFFER_CHUNKS)
          )
            return { x, z: half }
        }
      }
      for (let z = -half + step; z < half; z += step) {
        const h1 = getHeight(-half, z)
        if (
          getResolvedBiome(-half, z) === biome &&
          isBiomeSolid(-half, z, biome) &&
          h1 >= WATER_LEVEL - 1 &&
          h1 <= maxHeight &&
          !hasOceanNearby(-half, z, SPAWN_OCEAN_BUFFER_CHUNKS)
        )
          return { x: -half, z }
        const h2 = getHeight(half, z)
        if (
          getResolvedBiome(half, z) === biome &&
          isBiomeSolid(half, z, biome) &&
          h2 >= WATER_LEVEL - 1 &&
          h2 <= maxHeight &&
          !hasOceanNearby(half, z, SPAWN_OCEAN_BUFFER_CHUNKS)
        )
          return { x: half, z }
      }
    }
    return null
  }

  const withGrass = tryFind(maxHeightPreferGrass)
  if (withGrass) return withGrass
  const fallback = tryFind(SPAWN_MAX_HEIGHT)
  return fallback ?? { x: 0, z: 0 }
}

// ================= TREE GENERATION =================

/** Higher-frequency noise for per-tree shape (height, leaf size, density). Matches terrain worker. */
function treeShapeSeedValue(x: number, z: number): number {
  const n = treeShapeNoise2D(x * TREE_SHAPE_NOISE_SCALE, z * TREE_SHAPE_NOISE_SCALE)
  return (n + 1) * 0.5
}

/** Forest density at (wx, wz). Exported for generateChunk cache. */
export function getForestDensity(wx: number, wz: number): number {
  return forestDensityNoise2D(wx * FOREST_DENSITY_SCALE, wz * FOREST_DENSITY_SCALE)
}

/** Tree placement value at (wx, wz). Exported for generateChunk cache. */
export function getTreePlacement(wx: number, wz: number): number {
  return treePlacementNoise2D(wx * TREE_PLACEMENT_SCALE, wz * TREE_PLACEMENT_SCALE)
}

function getTreePlacementCached(wx: number, wz: number, cache?: Map<string, number>): number {
  if (cache) {
    const k = `${wx},${wz}`
    let v = cache.get(k)
    if (v === undefined) {
      v = getTreePlacement(wx, wz)
      cache.set(k, v)
    }
    return v
  }
  return getTreePlacement(wx, wz)
}

function getForestDensityCached(wx: number, wz: number, cache?: Map<string, number>): number {
  if (cache) {
    const k = `${wx},${wz}`
    let v = cache.get(k)
    if (v === undefined) {
      v = getForestDensity(wx, wz)
      cache.set(k, v)
    }
    return v
  }
  return getForestDensity(wx, wz)
}

function getTreePlacementPass(
  wx: number,
  wz: number,
  biome: Biome,
  caches?: TreeNoiseCaches,
): boolean {
  const config = TREE_PLACEMENT_CONFIG[biome]
  if (!config) return false
  const placement = getTreePlacementCached(wx, wz, caches?.treePlacement)
  if (config.useForestDensity) {
    const forestDensity = getForestDensityCached(wx, wz, caches?.forestDensity)
    if (forestDensity <= FOREST_DENSITY_THRESHOLD) return false
  }
  return placement > config.threshold
}

function isLocalTreeMax(wx: number, wz: number, treePlacementCache?: Map<string, number>): boolean {
  const center = getTreePlacementCached(wx, wz, treePlacementCache)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (dx === 0 && dz === 0) continue
      if (getTreePlacementCached(wx + dx, wz + dz, treePlacementCache) >= center) return false
    }
  }
  return true
}

function isTerrainFlatEnough(wx: number, wz: number): boolean {
  const h = getHeight(wx, wz)
  for (const [dx, dz] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    if (Math.abs(getHeight(wx + dx, wz + dz) - h) > TREE_MAX_SLOPE) return false
  }
  return true
}

/** Whether a tree should be placed at (wx, wz): grass above water, biome, two-layer noise, spacing, no cliffs. */
export function shouldPlaceTree(wx: number, wz: number, caches?: TreeNoiseCaches): boolean {
  const biome = getResolvedBiome(wx, wz)
  if (biome === 'desert') return false
  if (biome === 'snow' || biome === 'grove') return false
  const topY = getHeight(wx, wz)
  if (topY < WATER_LEVEL) return false
  if (biome === 'mountain' && topY >= WATER_LEVEL + 18) return false
  if (
    biome === 'snowy_slopes' ||
    biome === 'stony_peaks' ||
    biome === 'frozen_peaks' ||
    biome === 'jagged_peaks' ||
    biome === 'windswept_hills' ||
    biome === 'windswept_gravelly_hills'
  )
    return false
  const surfaceType = getSurfaceBlockAt(wx, wz, biome, topY)
  if (
    surfaceType !== 'grass' &&
    surfaceType !== 'grass_snow' &&
    surfaceType !== 'grass_savanna' &&
    surfaceType !== 'dirt'
  )
    return false
  if (!isTerrainFlatEnough(wx, wz)) return false
  if (!getTreePlacementPass(wx, wz, biome, caches)) return false
  if (!isLocalTreeMax(wx, wz, caches?.treePlacement)) return false
  return true
}

function shouldPlaceLeafAtCorner(
  wx: number,
  wz: number,
  lx: number,
  lz: number,
  shapeOffsetX = 0,
  shapeOffsetZ = 0,
): boolean {
  const v = treeShapeSeedValue(wx + lx + shapeOffsetX, wz + lz + shapeOffsetZ)
  return v >= 0.5
}

function getTreeShapeConfig(biome: Biome): TreeShapeConfig {
  return getTreeShapeConfigForBiome(biome)
}

function getIntInRange(min: number, max: number, sample: number): number {
  const rangeMin = Math.min(min, max)
  const rangeMax = Math.max(min, max)
  const span = rangeMax - rangeMin + 1
  const index = Math.min(span - 1, Math.floor(sample * span))
  return rangeMin + index
}

function getFloatInRange(min: number, max: number, sample: number): number {
  const rangeMin = Math.min(min, max)
  const rangeMax = Math.max(min, max)
  return rangeMin + sample * (rangeMax - rangeMin)
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function leafNoiseValue(wx: number, wz: number, dx: number, dy: number, dz: number): number {
  const sampleX = wx + dx * 17 + dy * 31
  const sampleZ = wz + dz * 17 - dy * 19
  return treeShapeSeedValue(sampleX, sampleZ)
}

function leafDistSq(dx: number, dy: number, dz: number): number {
  return dx * dx + dy * dy + dz * dz
}

/**
 * Generate trunk + leaf block positions for a single tree. Deterministic from (wx, baseY, wz, biome).
 */
export function getTreeBlocks(
  wx: number,
  baseY: number,
  wz: number,
  biome: Biome,
): {
  wood: Array<{ x: number; y: number; z: number }>
  leaves: Array<{ x: number; y: number; z: number }>
} {
  const wood: Array<{ x: number; y: number; z: number }> = []
  const leaves: Array<{ x: number; y: number; z: number }> = []
  const shape = getTreeShapeConfig(biome)
  const shapeOx = biome === 'jungle' ? JUNGLE_TREE_SHAPE_OFFSET_X : 0
  const shapeOz = biome === 'jungle' ? JUNGLE_TREE_SHAPE_OFFSET_Z : 0
  const treeSeed = (dx: number, dz: number) =>
    treeShapeSeedValue(wx + dx + shapeOx, wz + dz + shapeOz)
  const giantRoll = treeSeed(83, -79)
  const isGiant = giantRoll < shape.giantChance
  const trunkHeight =
    getIntInRange(shape.trunkMin, shape.trunkMax, treeSeed(19, -23)) +
    (isGiant ? getIntInRange(1, shape.giantTrunkBonusMax, treeSeed(-97, 101)) : 0)
  const leafRadius =
    getIntInRange(shape.leafRadiusMin, shape.leafRadiusMax, treeSeed(-31, 13)) +
    (isGiant ? getIntInRange(1, shape.giantLeafRadiusBonusMax, treeSeed(61, 67)) : 0)
  const leafHeight =
    getIntInRange(shape.leafHeightMin, shape.leafHeightMax, treeSeed(7, 37)) +
    (isGiant ? getIntInRange(1, shape.giantLeafHeightBonusMax, treeSeed(-73, -89)) : 0)
  const leafDensity =
    getFloatInRange(shape.leafDensityMin, shape.leafDensityMax, treeSeed(-41, -29)) +
    (isGiant ? getFloatInRange(0, shape.giantDensityBonusMax, treeSeed(109, -113)) : 0)
  const canopyStyleSample = treeSeed(59, -47)
  const topY = baseY + trunkHeight
  const canopyCenterY = topY + Math.floor(leafHeight * 0.5)
  const maxLeafDistSq = (leafRadius + 0.5) * (leafRadius + 0.5)

  for (let h = 1; h <= trunkHeight; h++) {
    wood.push({ x: wx, y: baseY + h, z: wz })
  }
  for (let dy = 0; dy < leafHeight; dy++) {
    const y = topY + dy
    const layerT = leafHeight <= 1 ? 1 : dy / (leafHeight - 1)
    let isCone: boolean
    let isWide: boolean
    let isFlatTop: boolean
    let isUmbrella: boolean
    if (biome === 'jungle') {
      const j = canopyStyleSample
      isCone = j < 0.2
      isWide = j >= 0.4 && j < 0.6
      isFlatTop = j >= 0.6 && j < 0.8
      isUmbrella = j >= 0.8
    } else {
      isCone = canopyStyleSample < 0.33
      isWide = canopyStyleSample >= 0.66
      isFlatTop = false
      isUmbrella = false
    }
    let r = leafRadius
    if (isCone) {
      r = Math.max(0, leafRadius - Math.floor(layerT * (leafRadius + 1)))
    } else if (isFlatTop) {
      const mid = leafHeight * 0.5
      r =
        dy < mid
          ? leafRadius
          : Math.max(0, leafRadius - 1 - Math.floor(((dy - mid) / (leafHeight - mid)) * leafRadius))
    } else if (isUmbrella) {
      r = layerT >= 0.5 ? leafRadius : Math.max(0, Math.floor(leafRadius * layerT * 2))
    } else if (isWide) {
      const extra = dy < Math.ceil(leafHeight * 0.5) ? 1 : 0
      r = leafRadius + extra - (dy === leafHeight - 1 ? 1 : 0)
    } else {
      r = leafRadius - (layerT > 0.8 ? 1 : 0)
    }
    r = Math.max(0, r)
    const densityBias = isCone
      ? -0.12 * layerT
      : isWide
        ? 0.08 * (1 - layerT)
        : isFlatTop
          ? 0.05 * (1 - layerT)
          : isUmbrella
            ? -0.05 * (1 - layerT)
            : 0
    const effectiveLeafDensity = clampValue(leafDensity + densityBias, 0.35, 0.98)
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx === 0 && dz === 0 && dy === 0) continue
        if (r > 0 && Math.abs(dx) === r && Math.abs(dz) === r) {
          if (!shouldPlaceLeafAtCorner(wx, wz, dx, dz, shapeOx, shapeOz)) continue
        }
        if (
          (biome === 'forest' || biome === 'jungle') &&
          leafDistSq(dx, y - canopyCenterY, dz) > maxLeafDistSq
        )
          continue
        if (!(dx === 0 && dz === 0) && leafNoiseValue(wx + shapeOx, wz + shapeOz, dx, dy, dz) > effectiveLeafDensity) {
          continue
        }
        leaves.push({ x: wx + dx, y, z: wz + dz })
      }
    }
  }
  return { wood, leaves }
}

/**
 * Generate a single tree at world position (ground block top = worldY). Returns wood and leaf positions.
 */
export function generateTree(
  worldX: number,
  worldY: number,
  worldZ: number,
): {
  wood: Array<{ x: number; y: number; z: number }>
  leaves: Array<{ x: number; y: number; z: number }>
} {
  const biome = getResolvedBiome(worldX, worldZ)
  return getTreeBlocks(worldX, worldY, worldZ, biome)
}
