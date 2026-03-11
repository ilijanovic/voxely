import type { Biome, BlockType } from '../../types'
import { CHUNK_SIZE, WATER_LEVEL } from '../../constants'
import { localKey, typeToId, idToType } from '../block-ids'
import type { ChunkContext, FeatureFn } from '../pipeline-types'

/** Ground features (tall_grass, grass_path, hay_block) only on these surface blocks. */
const SURFACE_BLOCKS_FOR_GROUND: BlockType[] = ['grass', 'grass_snow', 'grass_savanna', 'dirt']

function groundNoiseKey(wx: number, wz: number): string {
  return `${wx},${wz}`
}

function sampleGroundNoise(cache: Map<string, number>, wx: number, wz: number): number {
  const k = groundNoiseKey(wx, wz)
  let v = cache.get(k)
  if (v === undefined) {
    // Simple hash-based pseudo-noise in [0,1] that is stable per (wx,wz).
    let h = wx * 374761393 + wz * 668265263
    h = (h ^ (h >> 13)) * 1274126177
    h ^= h >> 16
    v = (h >>> 0) / 0xffffffff
    cache.set(k, v)
  }
  return v
}

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
    const { worldX, worldZ, heightmap, biomeMap, voxelMap } = ctx
    const noiseCache = new Map<string, number>()

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        const surfaceKey = localKey(lx, topY, lz)
        const surfaceType = idToType(voxelMap[surfaceKey]) as BlockType
        if (!SURFACE_BLOCKS_FOR_GROUND.includes(surfaceType)) continue

        const biome = biomeMap[lx][lz]
        const configs = BIOME_GROUND_FEATURES[biome]
        if (!configs || configs.length === 0) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        const n = sampleGroundNoise(noiseCache, wx, wz)

        for (const cfg of configs) {
          if (n >= cfg.minThreshold && n < cfg.maxThreshold) {
            const key = localKey(lx, topY + 1, lz)
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
