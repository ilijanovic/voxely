/**
 * Shore and water vegetation for Stage 4: sugar cane on shores, kelp in ocean, lily pad on water in swamp.
 */
import { CHUNK_SIZE, WATER_LEVEL } from '../../constants'
import { localKey, typeToId, AIR_ID, CARVED_ID } from '../block-ids'
import { FEATURE_PLACEMENT_NOISE_SCALE } from '../constants'
import type { ChunkContext, FeatureFn } from '../pipeline-types'

/** Seed offsets for feature noise (placement and height); deterministic per world seed. */
const SUGAR_CANE_NOISE_SEED = 600111
const LILY_PAD_NOISE_SEED = 600311
const SEAGRASS_NOISE_SEED = 600411
const SEA_PICKLE_NOISE_SEED = 600421
const SUGAR_CANE_HEIGHT_SEED = 600112
const KELP_NOISE_SEED = 600211

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
    const { worldX, worldZ, heightmap, biomeMap, voxelMap, getFeatureNoise } = ctx
    if (!getFeatureNoise) return
    const placeNoise = getFeatureNoise(SUGAR_CANE_NOISE_SEED)
    const heightNoise = getFeatureNoise(SUGAR_CANE_HEIGHT_SEED)
    const scale = FEATURE_PLACEMENT_NOISE_SCALE
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
        if (placeNoise(wx * scale, wz * scale) < threshold) continue

        const heightSample = heightNoise(wx * scale, wz * scale)
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
    const { worldX, worldZ, heightmap, biomeMap, voxelMap, getFeatureNoise } = ctx
    if (!getFeatureNoise) return
    const placeNoise = getFeatureNoise(KELP_NOISE_SEED)
    const scale = FEATURE_PLACEMENT_NOISE_SCALE
    const kelpId = typeToId('kelp')

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY >= WATER_LEVEL) continue
        const biome = biomeMap[lx][lz]
        if (biome !== 'ocean') continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (placeNoise(wx * scale, wz * scale) < KELP_PLACE_THRESHOLD) continue

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
    const { worldX, worldZ, heightmap, biomeMap, voxelMap, getFeatureNoise } = ctx
    if (!getFeatureNoise) return
    const placeNoise = getFeatureNoise(LILY_PAD_NOISE_SEED)
    const scale = FEATURE_PLACEMENT_NOISE_SCALE
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
        if (placeNoise(wx * scale, wz * scale) > LILY_PAD_DENSITY) continue

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
    const { worldX, worldZ, heightmap, biomeMap, voxelMap, getFeatureNoise } = ctx
    if (!getFeatureNoise) return
    const placeNoise = getFeatureNoise(SEAGRASS_NOISE_SEED)
    const scale = FEATURE_PLACEMENT_NOISE_SCALE
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
        if (placeNoise(wx * scale, wz * scale) > SEAGRASS_DENSITY) continue

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
    const { worldX, worldZ, heightmap, biomeMap, voxelMap, getFeatureNoise } = ctx
    if (!getFeatureNoise) return
    const placeNoise = getFeatureNoise(SEA_PICKLE_NOISE_SEED)
    const scale = FEATURE_PLACEMENT_NOISE_SCALE
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
        if (placeNoise(wx * scale, wz * scale) > SEA_PICKLE_DENSITY) continue

        voxelMap[keyAbove] = seaPickleId
      }
    }
  }
}
