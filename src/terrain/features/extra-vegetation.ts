/**
 * Extra vegetation for Stage 4: bamboo (jungle), vine (jungle), sweet_berry_bush (taiga),
 * pumpkin and melon (plains/forest), pink_petals (cherry_grove).
 */
import type { Biome, BlockType } from '../../types'
import { CHUNK_SIZE, WATER_LEVEL, WORLD_MIN_Y } from '../../constants'
import { localKey, typeToId, idToType, isAirOrCarved } from '../block-ids'
import { FEATURE_PLACEMENT_NOISE_SCALE } from '../constants'
import type { ChunkContext, FeatureFn } from '../pipeline-types'

/** Seed offsets for feature noise; deterministic per world seed. */
const BAMBOO_NOISE_SEED = 700111
const BAMBOO_HEIGHT_SEED = 700112
const VINE_NOISE_SEED = 700211
const SWEET_BERRY_NOISE_SEED = 700311
const PUMPKIN_NOISE_SEED = 700411
const MELON_NOISE_SEED = 700421
const PINK_PETALS_NOISE_SEED = 700511

const SURFACE_GRASS_DIRT: BlockType[] = ['grass', 'grass_snow', 'grass_savanna', 'dirt']

/** Surfaces for sweet_berry_bush in taiga (includes podzol/coarse_dirt for old_growth_taiga). */
const SURFACE_BLOCKS_FOR_SWEET_BERRY: BlockType[] = [
  'grass',
  'grass_snow',
  'grass_savanna',
  'dirt',
  'podzol',
  'coarse_dirt',
]

const BAMBOO_PLACE_THRESHOLD = 0.88
const BAMBOO_HEIGHT_MAX = 4
const VINE_DENSITY = 0.015
const SWEET_BERRY_DENSITY = 0.025
/** Fraction of eligible surface blocks that get a pumpkin; keep low so they appear every ~200–400 blocks, not every 50–100. */
const PUMPKIN_DENSITY = 0.0002
/** Fraction of eligible surface blocks that get a melon; keep low to match vanilla patch_melon. */
const MELON_DENSITY = 0.001
const PINK_PETALS_DENSITY = 0.03

/**
 * Places bamboo (1–4 blocks tall) on grass/dirt in jungle.
 */
export function createBambooFeature(): FeatureFn {
  return function bambooFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap, getFeatureNoise } = ctx
    if (!getFeatureNoise) return
    const placeNoise = getFeatureNoise(BAMBOO_NOISE_SEED)
    const heightNoise = getFeatureNoise(BAMBOO_HEIGHT_SEED)
    const scale = FEATURE_PLACEMENT_NOISE_SCALE
    const bambooId = typeToId('bamboo')

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        if (biomeMap[lx][lz] !== 'jungle') continue

        const surfaceLy = topY - WORLD_MIN_Y
        const surfaceKey = localKey(lx, surfaceLy, lz)
        const surfaceType = idToType(voxelMap[surfaceKey]) as BlockType
        if (!SURFACE_GRASS_DIRT.includes(surfaceType)) continue

        const keyAbove = localKey(lx, surfaceLy + 1, lz)
        if (!isAirOrCarved(voxelMap[keyAbove])) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (placeNoise(wx * scale, wz * scale) < BAMBOO_PLACE_THRESHOLD) continue

        const height =
          1 +
          Math.min(
            Math.floor(heightNoise(wx * scale, wz * scale) * BAMBOO_HEIGHT_MAX),
            BAMBOO_HEIGHT_MAX - 1,
          )
        for (let h = 1; h <= height; h++) {
          const lk = localKey(lx, surfaceLy + h, lz)
          if (isAirOrCarved(voxelMap[lk])) voxelMap[lk] = bambooId
        }
      }
    }
  }
}

/**
 * Places single-block vine on grass/dirt in jungle (simplified; vanilla attaches to sides).
 */
export function createVineFeature(): FeatureFn {
  return function vineFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap, getFeatureNoise } = ctx
    if (!getFeatureNoise) return
    const placeNoise = getFeatureNoise(VINE_NOISE_SEED)
    const scale = FEATURE_PLACEMENT_NOISE_SCALE
    const vineId = typeToId('vine')

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        if (biomeMap[lx][lz] !== 'jungle') continue

        const surfaceLy = topY - WORLD_MIN_Y
        const surfaceKey = localKey(lx, surfaceLy, lz)
        const surfaceType = idToType(voxelMap[surfaceKey]) as BlockType
        if (!SURFACE_GRASS_DIRT.includes(surfaceType)) continue

        const keyAbove = localKey(lx, surfaceLy + 1, lz)
        if (!isAirOrCarved(voxelMap[keyAbove])) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (placeNoise(wx * scale, wz * scale) > VINE_DENSITY) continue

        voxelMap[keyAbove] = vineId
      }
    }
  }
}

const SWEET_BERRY_BIOMES: Partial<Record<Biome, boolean>> = {
  old_growth_taiga: true,
  grove: true,
  forest: true,
}

/**
 * Places sweet_berry_bush on grass/dirt in taiga-like biomes.
 */
export function createSweetBerryBushFeature(): FeatureFn {
  return function sweetBerryBushFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap, getFeatureNoise } = ctx
    if (!getFeatureNoise) return
    const placeNoise = getFeatureNoise(SWEET_BERRY_NOISE_SEED)
    const scale = FEATURE_PLACEMENT_NOISE_SCALE
    const bushId = typeToId('sweet_berry_bush')

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        if (!SWEET_BERRY_BIOMES[biomeMap[lx][lz]]) continue

        const surfaceLy = topY - WORLD_MIN_Y
        const surfaceKey = localKey(lx, surfaceLy, lz)
        const surfaceType = idToType(voxelMap[surfaceKey]) as BlockType
        if (!SURFACE_BLOCKS_FOR_SWEET_BERRY.includes(surfaceType)) continue

        const keyAbove = localKey(lx, surfaceLy + 1, lz)
        if (!isAirOrCarved(voxelMap[keyAbove])) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (placeNoise(wx * scale, wz * scale) > SWEET_BERRY_DENSITY) continue

        voxelMap[keyAbove] = bushId
      }
    }
  }
}

const PUMPKIN_MELON_BIOMES: Partial<Record<Biome, boolean>> = {
  plains: true,
  forest: true,
  savanna: true,
  meadow: true,
}

/**
 * Places pumpkin on grass/dirt in plains/forest/savanna/meadow.
 */
export function createPumpkinFeature(): FeatureFn {
  return function pumpkinFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap, getFeatureNoise } = ctx
    if (!getFeatureNoise) return
    const placeNoise = getFeatureNoise(PUMPKIN_NOISE_SEED)
    const scale = FEATURE_PLACEMENT_NOISE_SCALE
    const pumpkinId = typeToId('pumpkin')

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        if (!PUMPKIN_MELON_BIOMES[biomeMap[lx][lz]]) continue

        const surfaceLy = topY - WORLD_MIN_Y
        const surfaceKey = localKey(lx, surfaceLy, lz)
        const surfaceType = idToType(voxelMap[surfaceKey]) as BlockType
        if (!SURFACE_GRASS_DIRT.includes(surfaceType)) continue

        const keyAbove = localKey(lx, surfaceLy + 1, lz)
        if (!isAirOrCarved(voxelMap[keyAbove])) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (placeNoise(wx * scale, wz * scale) > PUMPKIN_DENSITY) continue

        voxelMap[keyAbove] = pumpkinId
      }
    }
  }
}

/**
 * Places melon on grass/dirt in plains/forest/savanna/meadow.
 */
export function createMelonFeature(): FeatureFn {
  return function melonFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap, getFeatureNoise } = ctx
    if (!getFeatureNoise) return
    const placeNoise = getFeatureNoise(MELON_NOISE_SEED)
    const scale = FEATURE_PLACEMENT_NOISE_SCALE
    const melonId = typeToId('melon')

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        if (!PUMPKIN_MELON_BIOMES[biomeMap[lx][lz]]) continue

        const surfaceLy = topY - WORLD_MIN_Y
        const surfaceKey = localKey(lx, surfaceLy, lz)
        const surfaceType = idToType(voxelMap[surfaceKey]) as BlockType
        if (!SURFACE_GRASS_DIRT.includes(surfaceType)) continue

        const keyAbove = localKey(lx, surfaceLy + 1, lz)
        if (!isAirOrCarved(voxelMap[keyAbove])) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (placeNoise(wx * scale, wz * scale) > MELON_DENSITY) continue

        voxelMap[keyAbove] = melonId
      }
    }
  }
}

/**
 * Places pink_petals on grass/dirt in cherry_grove.
 */
export function createPinkPetalsFeature(): FeatureFn {
  return function pinkPetalsFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap, getFeatureNoise } = ctx
    if (!getFeatureNoise) return
    const placeNoise = getFeatureNoise(PINK_PETALS_NOISE_SEED)
    const scale = FEATURE_PLACEMENT_NOISE_SCALE
    const pinkPetalsId = typeToId('pink_petals')

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        if (biomeMap[lx][lz] !== 'cherry_grove') continue

        const surfaceLy = topY - WORLD_MIN_Y
        const surfaceKey = localKey(lx, surfaceLy, lz)
        const surfaceType = idToType(voxelMap[surfaceKey]) as BlockType
        if (!SURFACE_GRASS_DIRT.includes(surfaceType)) continue

        const keyAbove = localKey(lx, surfaceLy + 1, lz)
        if (!isAirOrCarved(voxelMap[keyAbove])) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (placeNoise(wx * scale, wz * scale) > PINK_PETALS_DENSITY) continue

        voxelMap[keyAbove] = pinkPetalsId
      }
    }
  }
}
