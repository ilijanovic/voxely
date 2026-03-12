import type { Biome, BlockType } from '../../types'
import { CHUNK_SIZE, WATER_LEVEL, WORLD_MIN_Y } from '../../constants'
import { localKey, typeToId, idToType } from '../block-ids'
import { FEATURE_PLACEMENT_NOISE_SCALE } from '../constants'
import { getFeatureDensityForBiome } from './feature-registry'
import type { ChunkContext, FeatureFn } from '../pipeline-types'

/** Seed offset for ground feature noise (tall_grass, grass_path, hay_block); deterministic per world seed. */
const GROUND_NOISE_SEED = 800111

/** Ground features (tall_grass, grass_path, hay_block) only on these surface blocks. */
const SURFACE_BLOCKS_FOR_GROUND: BlockType[] = [
  'grass',
  'grass_snow',
  'grass_savanna',
  'dirt',
  'podzol',
  'coarse_dirt',
]

type GroundFeatureConfig = {
  block: BlockType
  minThreshold: number
  maxThreshold: number
}

const BIOME_GROUND_FEATURES: Partial<Record<Biome, GroundFeatureConfig[]>> = {
  plains: [
    { block: 'tall_grass', minThreshold: 0.4, maxThreshold: 0.92 },
    { block: 'grass_path', minThreshold: 0.92, maxThreshold: 0.98 },
  ],
  meadow: [
    { block: 'tall_grass', minThreshold: 0.3, maxThreshold: 0.9 },
    { block: 'hay_block', minThreshold: 0.9, maxThreshold: 0.96 },
  ],
  forest: [{ block: 'tall_grass', minThreshold: 0.25, maxThreshold: 0.8 }],
  jungle: [
    { block: 'tall_grass', minThreshold: 0.08, maxThreshold: 0.92 },
    { block: 'hay_block', minThreshold: 0.92, maxThreshold: 0.98 },
  ],
  savanna: [{ block: 'tall_grass', minThreshold: 0.3, maxThreshold: 0.75 }],
  mountain: [{ block: 'tall_grass', minThreshold: 0.4, maxThreshold: 0.78 }],
  windswept_hills: [{ block: 'tall_grass', minThreshold: 0.35, maxThreshold: 0.8 }],
  windswept_forest: [{ block: 'tall_grass', minThreshold: 0.3, maxThreshold: 0.8 }],
  cherry_grove: [{ block: 'tall_grass', minThreshold: 0.35, maxThreshold: 0.9 }],
  grove: [{ block: 'tall_grass', minThreshold: 0.35, maxThreshold: 0.8 }],
  /** Vanilla Old Growth Spruce Taiga: short grass on podzol. */
  old_growth_taiga: [{ block: 'tall_grass', minThreshold: 0.3, maxThreshold: 0.8 }],
  snow: [],
  snowy_slopes: [],
  frozen_peaks: [],
  jagged_peaks: [],
  stony_peaks: [],
  ocean: [],
  desert: [],
  windswept_gravelly_hills: [],
}

export function createGroundFeature(): FeatureFn {
  return function groundFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap, getFeatureNoise } = ctx
    if (!getFeatureNoise) return
    const placeNoise = getFeatureNoise(GROUND_NOISE_SEED)
    const scale = FEATURE_PLACEMENT_NOISE_SCALE

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        const surfaceLy = topY - WORLD_MIN_Y
        const surfaceKey = localKey(lx, surfaceLy, lz)
        const surfaceType = idToType(voxelMap[surfaceKey]) as BlockType
        if (!SURFACE_BLOCKS_FOR_GROUND.includes(surfaceType)) continue

        const biome = biomeMap[lx][lz]
        const configs = BIOME_GROUND_FEATURES[biome]
        if (!configs || configs.length === 0) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        const n = placeNoise(wx * scale, wz * scale)
        const groundDensity = getFeatureDensityForBiome('ground', biome)
        if (groundDensity !== undefined && n >= groundDensity) continue

        for (const cfg of configs) {
          if (n >= cfg.minThreshold && n < cfg.maxThreshold) {
            const key = localKey(lx, surfaceLy + 1, lz)
            // Only place if air currently (air is encoded as 0 in voxelMap by convention).
            if (!voxelMap[key]) {
              voxelMap[key] = typeToId(cfg.block)
            }
            break
          }
        }
      }
    }
  }
}
