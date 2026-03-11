/**
 * Flower feature for Stage 4: places dandelion, poppy, blue_orchid on grass/dirt surface by biome.
 */
import type { Biome, BlockType } from '../../types'
import { CHUNK_SIZE, WATER_LEVEL } from '../../constants'
import { localKey, typeToId, idToType } from '../block-ids'
import type { ChunkContext, FeatureFn } from '../pipeline-types'

const FLOWER_NOISE_SEED = 919291
/** Seed for "place flower or not" noise; must differ from FLOWER_NOISE_SEED so type and density are independent. */
const FLOWER_PLACE_NOISE_SEED = 717171
/** Fraction of eligible surface blocks that get any flower (0–1). Lower = sparser flowers. */
const FLOWER_DENSITY = 0.02
const SURFACE_BLOCKS_FOR_FLOWERS: BlockType[] = ['grass', 'grass_snow', 'grass_savanna', 'dirt']

function flowerNoiseKey(wx: number, wz: number): string {
  return `${wx},${wz}`
}

function sampleFlowerNoise(cache: Map<string, number>, wx: number, wz: number): number {
  const k = flowerNoiseKey(wx, wz)
  let v = cache.get(k)
  if (v === undefined) {
    let h = wx * 374761393 + wz * 668265263 + FLOWER_NOISE_SEED
    h = (h ^ (h >> 13)) * 1274126177
    h ^= h >> 16
    v = (h >>> 0) / 0xffffffff
    cache.set(k, v)
  }
  return v
}

/** Deterministic noise in [0,1] for "place a flower here or not". Used with FLOWER_DENSITY. */
function sampleFlowerPlaceNoise(cache: Map<string, number>, wx: number, wz: number): number {
  const k = `place_${flowerNoiseKey(wx, wz)}`
  let v = cache.get(k)
  if (v === undefined) {
    let h = wx * 374761393 + wz * 668265263 + FLOWER_PLACE_NOISE_SEED
    h = (h ^ (h >> 13)) * 1274126177
    h ^= h >> 16
    v = (h >>> 0) / 0xffffffff
    cache.set(k, v)
  }
  return v
}

type FlowerEntry = { block: BlockType; minThreshold: number; maxThreshold: number }

const BIOME_FLOWERS: Partial<Record<Biome, FlowerEntry[]>> = {
  plains: [
    { block: 'dandelion', minThreshold: 0.1, maxThreshold: 0.5 },
    { block: 'poppy', minThreshold: 0.5, maxThreshold: 0.72 },
    { block: 'tulip_red', minThreshold: 0.72, maxThreshold: 0.82 },
    { block: 'oxeye_daisy', minThreshold: 0.82, maxThreshold: 0.92 },
  ],
  meadow: [
    { block: 'dandelion', minThreshold: 0.08, maxThreshold: 0.45 },
    { block: 'poppy', minThreshold: 0.45, maxThreshold: 0.7 },
    { block: 'blue_orchid', minThreshold: 0.7, maxThreshold: 0.82 },
    { block: 'oxeye_daisy', minThreshold: 0.82, maxThreshold: 0.9 },
    { block: 'tulip_red', minThreshold: 0.9, maxThreshold: 0.96 },
  ],
  forest: [
    { block: 'poppy', minThreshold: 0.15, maxThreshold: 0.4 },
    { block: 'dandelion', minThreshold: 0.4, maxThreshold: 0.62 },
    { block: 'tulip_red', minThreshold: 0.62, maxThreshold: 0.75 },
  ],
  jungle: [
    { block: 'poppy', minThreshold: 0.2, maxThreshold: 0.55 },
    { block: 'blue_orchid', minThreshold: 0.55, maxThreshold: 0.75 },
    { block: 'oxeye_daisy', minThreshold: 0.75, maxThreshold: 0.88 },
  ],
  savanna: [
    { block: 'dandelion', minThreshold: 0.12, maxThreshold: 0.5 },
    { block: 'poppy', minThreshold: 0.5, maxThreshold: 0.68 },
    { block: 'tulip_red', minThreshold: 0.68, maxThreshold: 0.78 },
  ],
  mountain: [
    { block: 'poppy', minThreshold: 0.2, maxThreshold: 0.55 },
    { block: 'dandelion', minThreshold: 0.55, maxThreshold: 0.78 },
    { block: 'oxeye_daisy', minThreshold: 0.78, maxThreshold: 0.88 },
  ],
  windswept_hills: [
    { block: 'dandelion', minThreshold: 0.18, maxThreshold: 0.52 },
    { block: 'tulip_red', minThreshold: 0.52, maxThreshold: 0.65 },
  ],
  windswept_forest: [
    { block: 'poppy', minThreshold: 0.1, maxThreshold: 0.45 },
    { block: 'dandelion', minThreshold: 0.45, maxThreshold: 0.7 },
    { block: 'oxeye_daisy', minThreshold: 0.7, maxThreshold: 0.82 },
  ],
  cherry_grove: [
    { block: 'poppy', minThreshold: 0.15, maxThreshold: 0.5 },
    { block: 'dandelion', minThreshold: 0.5, maxThreshold: 0.75 },
    { block: 'tulip_red', minThreshold: 0.75, maxThreshold: 0.85 },
  ],
  grove: [
    { block: 'dandelion', minThreshold: 0.2, maxThreshold: 0.58 },
    { block: 'poppy', minThreshold: 0.58, maxThreshold: 0.8 },
    { block: 'oxeye_daisy', minThreshold: 0.8, maxThreshold: 0.9 },
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
    const { worldX, worldZ, heightmap, biomeMap, voxelMap } = ctx
    const noiseCache = new Map<string, number>()

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        const biome = biomeMap[lx][lz]
        const entries = BIOME_FLOWERS[biome]
        if (!entries || entries.length === 0) continue

        const surfaceKey = localKey(lx, topY, lz)
        const surfaceId = voxelMap[surfaceKey]
        const surfaceType = idToType(surfaceId) as BlockType
        if (!SURFACE_BLOCKS_FOR_FLOWERS.includes(surfaceType)) continue

        const keyAbove = localKey(lx, topY + 1, lz)
        if (voxelMap[keyAbove]) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (sampleFlowerPlaceNoise(noiseCache, wx, wz) > FLOWER_DENSITY) continue

        const n = sampleFlowerNoise(noiseCache, wx, wz)
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
