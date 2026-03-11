/**
 * Fern feature for Stage 4: places fern on grass/dirt in forest, jungle, meadow, grove, plains.
 */
import type { Biome, BlockType } from '../../types'
import { CHUNK_SIZE, WATER_LEVEL } from '../../constants'
import { localKey, typeToId, idToType } from '../block-ids'
import type { ChunkContext, FeatureFn } from '../pipeline-types'

const FERN_NOISE_SEED = 819381
const SURFACE_BLOCKS_FOR_FERN: BlockType[] = ['grass', 'grass_snow', 'grass_savanna', 'dirt']

function fernNoiseKey(wx: number, wz: number): string {
  return `${wx},${wz}`
}

function sampleFernNoise(cache: Map<string, number>, wx: number, wz: number): number {
  const k = fernNoiseKey(wx, wz)
  let v = cache.get(k)
  if (v === undefined) {
    let h = wx * 374761393 + wz * 668265263 + FERN_NOISE_SEED
    h = (h ^ (h >> 13)) * 1274126177
    h ^= h >> 16
    v = (h >>> 0) / 0xffffffff
    cache.set(k, v)
  }
  return v
}

const FERN_PLACE_THRESHOLD = 0.82

const BIOME_FERN: Partial<Record<Biome, boolean>> = {
  plains: true,
  meadow: true,
  forest: true,
  jungle: true,
  grove: true,
  savanna: true,
  mountain: true,
  windswept_hills: true,
  windswept_forest: true,
  cherry_grove: true,
}

export function createFernFeature(): FeatureFn {
  return function fernFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap } = ctx
    const noiseCache = new Map<string, number>()

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        const biome = biomeMap[lx][lz]
        if (!BIOME_FERN[biome]) continue

        const surfaceKey = localKey(lx, topY, lz)
        const surfaceType = idToType(voxelMap[surfaceKey]) as BlockType
        if (!SURFACE_BLOCKS_FOR_FERN.includes(surfaceType)) continue

        const keyAbove = localKey(lx, topY + 1, lz)
        if (voxelMap[keyAbove]) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (sampleFernNoise(noiseCache, wx, wz) < FERN_PLACE_THRESHOLD) continue

        voxelMap[keyAbove] = typeToId('fern')
      }
    }
  }
}
