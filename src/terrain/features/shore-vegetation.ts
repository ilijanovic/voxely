/**
 * Shore and water vegetation for Stage 4: sugar cane on shores, kelp in ocean, lily pad on water in swamp.
 */
import { CHUNK_SIZE, WATER_LEVEL } from '../../constants'
import { localKey, typeToId, AIR_ID, CARVED_ID } from '../block-ids'
import type { ChunkContext, FeatureFn } from '../pipeline-types'

const SUGAR_CANE_NOISE_SEED = 600111
const LILY_PAD_NOISE_SEED = 600311
const SEAGRASS_NOISE_SEED = 600411
const SEA_PICKLE_NOISE_SEED = 600421
const SUGAR_CANE_HEIGHT_SEED = 600112
const KELP_NOISE_SEED = 600211

function noiseKey(seed: number, wx: number, wz: number): string {
  return `${seed},${wx},${wz}`
}

function sampleNoise(cache: Map<string, number>, seed: number, wx: number, wz: number): number {
  let v = cache.get(noiseKey(seed, wx, wz))
  if (v === undefined) {
    let h = wx * 374761393 + wz * 668265263 + seed
    h = (h ^ (h >> 13)) * 1274126177
    h ^= h >> 16
    v = (h >>> 0) / 0xffffffff
    cache.set(noiseKey(seed, wx, wz), v)
  }
  return v
}

/** Default placement threshold (higher = fewer plants). Place when noise >= threshold. */
const SUGAR_CANE_PLACE_THRESHOLD = 0.88
/** Slightly lower in desert so some cane appears at oases. */
const SUGAR_CANE_PLACE_THRESHOLD_DESERT = 0.78
/** Slightly lower in mangrove_swamp. */
const SUGAR_CANE_PLACE_THRESHOLD_SWAMP = 0.82
/** Max height in blocks (vanilla: 1–4). */
const SUGAR_CANE_HEIGHT_MAX = 4

export function createSugarCaneFeature(): FeatureFn {
  return function sugarCaneFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap } = ctx
    const cache = new Map<string, number>()
    const sugarCaneId = typeToId('sugar_cane')

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue

        const surfaceKey = localKey(lx, topY, lz)
        const surfaceId = voxelMap[surfaceKey]
        const isValidSurface =
          surfaceId !== 0 &&
          (surfaceId === typeToId('sand') ||
            surfaceId === typeToId('grass') ||
            surfaceId === typeToId('grass_snow') ||
            surfaceId === typeToId('grass_savanna') ||
            surfaceId === typeToId('dirt') ||
            surfaceId === typeToId('red_sand') ||
            surfaceId === typeToId('podzol') ||
            surfaceId === typeToId('mycelium') ||
            surfaceId === typeToId('mud') ||
            surfaceId === typeToId('coarse_dirt'))
        if (!isValidSurface) continue

        let adjacentWater = false
        const wx = worldX + lx
        const wz = worldZ + lz
        for (const [dx, dz] of [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ] as const) {
          const nx = lx + dx
          const nz = lz + dz
          if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) continue
          const neighborTopY = heightmap[nx][nz]
          if (neighborTopY <= WATER_LEVEL) {
            adjacentWater = true
            break
          }
        }
        if (!adjacentWater) continue

        const keyAbove = localKey(lx, topY + 1, lz)
        if (voxelMap[keyAbove]) continue

        const biome = biomeMap[lx][lz]
        const threshold =
          biome === 'desert'
            ? SUGAR_CANE_PLACE_THRESHOLD_DESERT
            : biome === 'mangrove_swamp'
              ? SUGAR_CANE_PLACE_THRESHOLD_SWAMP
              : SUGAR_CANE_PLACE_THRESHOLD
        if (sampleNoise(cache, SUGAR_CANE_NOISE_SEED, wx, wz) < threshold) continue

        const heightSample = sampleNoise(cache, SUGAR_CANE_HEIGHT_SEED, wx, wz)
        const height =
          1 + Math.min(Math.floor(heightSample * SUGAR_CANE_HEIGHT_MAX), SUGAR_CANE_HEIGHT_MAX - 1)

        for (let h = 1; h <= height; h++) {
          const lk = localKey(lx, topY + h, lz)
          if (!voxelMap[lk]) voxelMap[lk] = sugarCaneId
        }
      }
    }
  }
}

const KELP_PLACE_THRESHOLD = 0.65

export function createKelpFeature(): FeatureFn {
  return function kelpFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap } = ctx
    const cache = new Map<string, number>()
    const kelpId = typeToId('kelp')

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY >= WATER_LEVEL) continue
        const biome = biomeMap[lx][lz]
        if (biome !== 'ocean') continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (sampleNoise(cache, KELP_NOISE_SEED, wx, wz) < KELP_PLACE_THRESHOLD) continue

        const kelpTop = WATER_LEVEL - 1
        const baseY = topY + 1
        for (let y = baseY; y <= kelpTop; y++) {
          const ly = y
          const lk = localKey(lx, ly, lz)
          if (!voxelMap[lk]) voxelMap[lk] = kelpId
        }
      }
    }
  }
}

/** Fraction of water surface blocks in swamp that get a lily pad. */
const LILY_PAD_DENSITY = 0.04

/**
 * Places lily pads on water surface (y = WATER_LEVEL + 1) in mangrove_swamp where the column is underwater.
 */
export function createLilyPadFeature(): FeatureFn {
  return function lilyPadFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap } = ctx
    const cache = new Map<string, number>()
    const lilyPadId = typeToId('lily_pad')

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY >= WATER_LEVEL) continue
        const biome = biomeMap[lx][lz]
        if (biome !== 'mangrove_swamp') continue

        const keyAboveWater = localKey(lx, WATER_LEVEL + 1, lz)
        const current = voxelMap[keyAboveWater]
        if (current && current !== AIR_ID && current !== CARVED_ID) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (sampleNoise(cache, LILY_PAD_NOISE_SEED, wx, wz) > LILY_PAD_DENSITY) continue

        voxelMap[keyAboveWater] = lilyPadId
      }
    }
  }
}

/** Fraction of ocean floor blocks that get seagrass (single block). */
const SEAGRASS_DENSITY = 0.12

/**
 * Places seagrass on ocean floor (one block above sea floor) in ocean biome.
 */
export function createSeagrassFeature(): FeatureFn {
  return function seagrassFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap } = ctx
    const cache = new Map<string, number>()
    const seagrassId = typeToId('seagrass')

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY >= WATER_LEVEL) continue
        const biome = biomeMap[lx][lz]
        if (biome !== 'ocean') continue

        const keyAbove = localKey(lx, topY + 1, lz)
        if (voxelMap[keyAbove]) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (sampleNoise(cache, SEAGRASS_NOISE_SEED, wx, wz) > SEAGRASS_DENSITY) continue

        voxelMap[keyAbove] = seagrassId
      }
    }
  }
}

/** Fraction of ocean floor blocks that get sea pickle (single block). */
const SEA_PICKLE_DENSITY = 0.03

/**
 * Places sea pickle on ocean floor in ocean biome.
 */
export function createSeaPickleFeature(): FeatureFn {
  return function seaPickleFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap } = ctx
    const cache = new Map<string, number>()
    const seaPickleId = typeToId('sea_pickle')

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY >= WATER_LEVEL) continue
        const biome = biomeMap[lx][lz]
        if (biome !== 'ocean') continue

        const keyAbove = localKey(lx, topY + 1, lz)
        if (voxelMap[keyAbove]) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (sampleNoise(cache, SEA_PICKLE_NOISE_SEED, wx, wz) > SEA_PICKLE_DENSITY) continue

        voxelMap[keyAbove] = seaPickleId
      }
    }
  }
}
