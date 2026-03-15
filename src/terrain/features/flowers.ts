/**
 * Flower feature for Stage 4: places flowers (dandelion, poppy, tulips, oxeye_daisy, cornflower, etc.) on grass/dirt surface by biome.
 */
import type { Biome, BlockType } from '../../types'
import { CHUNK_SIZE, WATER_LEVEL, WORLD_MIN_Y } from '../../constants'
import { localKey, typeToId, idToType } from '../block-ids'
import { FEATURE_PLACEMENT_NOISE_SCALE } from '../constants'
import { getFeatureDensityForBiome } from './feature-registry'
import type { ChunkContext, FeatureFn } from '../pipeline-types'

/** Seed offset for flower type selection; deterministic per world seed. */
const FLOWER_NOISE_SEED = 919291
/** Seed for "place flower or not" noise; must differ from FLOWER_NOISE_SEED so type and density are independent. */
const FLOWER_PLACE_NOISE_SEED = 717171
/** Fraction of eligible surface blocks that get any flower (0–1). Lower = sparser flowers. */
const FLOWER_DENSITY = 0.02
const SURFACE_BLOCKS_FOR_FLOWERS: BlockType[] = [
  'grass',
  'grass_snow',
  'grass_savanna',
  'dirt',
  'podzol',
  'coarse_dirt',
]

type FlowerEntry = { block: BlockType; minThreshold: number; maxThreshold: number }

const BIOME_FLOWERS: Partial<Record<Biome, FlowerEntry[]>> = {
  plains: [
    { block: 'dandelion', minThreshold: 0.08, maxThreshold: 0.28 },
    { block: 'poppy', minThreshold: 0.28, maxThreshold: 0.48 },
    { block: 'tulip_red', minThreshold: 0.48, maxThreshold: 0.58 },
    { block: 'tulip_orange', minThreshold: 0.58, maxThreshold: 0.68 },
    { block: 'tulip_white', minThreshold: 0.68, maxThreshold: 0.78 },
    { block: 'tulip_pink', minThreshold: 0.78, maxThreshold: 0.84 },
    { block: 'oxeye_daisy', minThreshold: 0.84, maxThreshold: 0.9 },
    { block: 'cornflower', minThreshold: 0.9, maxThreshold: 0.95 },
    { block: 'azure_bluet', minThreshold: 0.95, maxThreshold: 0.98 },
  ],
  meadow: [
    { block: 'dandelion', minThreshold: 0.02, maxThreshold: 0.2 },
    { block: 'poppy', minThreshold: 0.2, maxThreshold: 0.35 },
    { block: 'cornflower', minThreshold: 0.35, maxThreshold: 0.5 },
    { block: 'oxeye_daisy', minThreshold: 0.5, maxThreshold: 0.62 },
    { block: 'allium', minThreshold: 0.62, maxThreshold: 0.74 },
    { block: 'azure_bluet', minThreshold: 0.74, maxThreshold: 0.84 },
    { block: 'tulip_red', minThreshold: 0.84, maxThreshold: 0.89 },
    { block: 'tulip_orange', minThreshold: 0.89, maxThreshold: 0.93 },
    { block: 'tulip_white', minThreshold: 0.93, maxThreshold: 0.97 },
    { block: 'tulip_pink', minThreshold: 0.97, maxThreshold: 0.995 },
  ],
  forest: [
    { block: 'poppy', minThreshold: 0.1, maxThreshold: 0.3 },
    { block: 'dandelion', minThreshold: 0.3, maxThreshold: 0.5 },
    { block: 'tulip_red', minThreshold: 0.5, maxThreshold: 0.62 },
    { block: 'lily_of_the_valley', minThreshold: 0.62, maxThreshold: 0.72 },
    { block: 'oxeye_daisy', minThreshold: 0.72, maxThreshold: 0.82 },
    { block: 'allium', minThreshold: 0.82, maxThreshold: 0.9 },
  ],
  jungle: [
    { block: 'poppy', minThreshold: 0.15, maxThreshold: 0.4 },
    { block: 'blue_orchid', minThreshold: 0.4, maxThreshold: 0.6 },
    { block: 'oxeye_daisy', minThreshold: 0.6, maxThreshold: 0.78 },
    { block: 'tulip_pink', minThreshold: 0.78, maxThreshold: 0.88 },
  ],
  savanna: [
    { block: 'dandelion', minThreshold: 0.1, maxThreshold: 0.4 },
    { block: 'poppy', minThreshold: 0.4, maxThreshold: 0.6 },
    { block: 'tulip_red', minThreshold: 0.6, maxThreshold: 0.72 },
    { block: 'tulip_orange', minThreshold: 0.72, maxThreshold: 0.82 },
  ],
  mountain: [
    { block: 'poppy', minThreshold: 0.18, maxThreshold: 0.45 },
    { block: 'dandelion', minThreshold: 0.45, maxThreshold: 0.68 },
    { block: 'oxeye_daisy', minThreshold: 0.68, maxThreshold: 0.8 },
    { block: 'lily_of_the_valley', minThreshold: 0.8, maxThreshold: 0.9 },
  ],
  windswept_hills: [
    { block: 'dandelion', minThreshold: 0.15, maxThreshold: 0.45 },
    { block: 'tulip_red', minThreshold: 0.45, maxThreshold: 0.6 },
    { block: 'oxeye_daisy', minThreshold: 0.6, maxThreshold: 0.75 },
  ],
  windswept_forest: [
    { block: 'poppy', minThreshold: 0.08, maxThreshold: 0.38 },
    { block: 'dandelion', minThreshold: 0.38, maxThreshold: 0.62 },
    { block: 'oxeye_daisy', minThreshold: 0.62, maxThreshold: 0.78 },
    { block: 'lily_of_the_valley', minThreshold: 0.78, maxThreshold: 0.88 },
  ],
  cherry_grove: [
    { block: 'poppy', minThreshold: 0.12, maxThreshold: 0.4 },
    { block: 'dandelion', minThreshold: 0.4, maxThreshold: 0.62 },
    { block: 'tulip_red', minThreshold: 0.62, maxThreshold: 0.75 },
    { block: 'tulip_pink', minThreshold: 0.75, maxThreshold: 0.86 },
  ],
  grove: [
    { block: 'dandelion', minThreshold: 0.18, maxThreshold: 0.5 },
    { block: 'poppy', minThreshold: 0.5, maxThreshold: 0.7 },
    { block: 'oxeye_daisy', minThreshold: 0.7, maxThreshold: 0.84 },
    { block: 'lily_of_the_valley', minThreshold: 0.84, maxThreshold: 0.92 },
  ],
  /** Vanilla Old Growth Spruce Taiga: sparse dandelion and poppy. */
  old_growth_taiga: [
    { block: 'dandelion', minThreshold: 0.12, maxThreshold: 0.5 },
    { block: 'poppy', minThreshold: 0.5, maxThreshold: 0.88 },
  ],
  snow: [],
  snowy_slopes: [],
  frozen_peaks: [],
  jagged_peaks: [],
  stony_peaks: [],
  ocean: [],
  desert: [],
  windswept_gravelly_hills: [],
}

export function createFlowersFeature(): FeatureFn {
  return function flowersFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap, getFeatureNoise } = ctx
    if (!getFeatureNoise) return
    const placeNoise = getFeatureNoise(FLOWER_PLACE_NOISE_SEED)
    const typeNoise = getFeatureNoise(FLOWER_NOISE_SEED)
    const scale = FEATURE_PLACEMENT_NOISE_SCALE

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        const biome = biomeMap[lx][lz]
        const entries = BIOME_FLOWERS[biome]
        if (!entries || entries.length === 0) continue

        const surfaceLy = topY - WORLD_MIN_Y
        const surfaceKey = localKey(lx, surfaceLy, lz)
        const surfaceId = voxelMap[surfaceKey]
        const surfaceType = idToType(surfaceId) as BlockType
        if (!SURFACE_BLOCKS_FOR_FLOWERS.includes(surfaceType)) continue

        const keyAbove = localKey(lx, surfaceLy + 1, lz)
        if (voxelMap[keyAbove]) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        const flowerDensity = getFeatureDensityForBiome('flowers', biome) ?? FLOWER_DENSITY
        if (placeNoise(wx * scale, wz * scale) > flowerDensity) continue

        const n = typeNoise(wx * scale, wz * scale)
        for (const entry of entries) {
          if (n >= entry.minThreshold && n < entry.maxThreshold) {
            voxelMap[keyAbove] = typeToId(entry.block)
            break
          }
        }
      }
    }
  }
}
