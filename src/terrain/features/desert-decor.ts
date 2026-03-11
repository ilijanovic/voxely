/**
 * Desert and savanna decor for Stage 4: dead bush on sand, cactus on desert sand.
 */
import { CHUNK_SIZE, WATER_LEVEL } from '../../constants'
import { localKey, typeToId, idToType } from '../block-ids'
import type { ChunkContext, FeatureFn } from '../pipeline-types'

const DEAD_BUSH_NOISE_SEED = 400111
const CACTUS_NOISE_SEED = 500222
const CACTUS_HEIGHT_NOISE_SEED = 500223

function noiseKey(seed: number, wx: number, wz: number): string {
  return `${seed},${wx},${wz}`
}

function sampleNoise(cache: Map<string, number>, seed: number, wx: number, wz: number): number {
  const k = noiseKey(seed, wx, wz)
  let v = cache.get(k)
  if (v === undefined) {
    let h = wx * 374761393 + wz * 668265263 + seed
    h = (h ^ (h >> 13)) * 1274126177
    h ^= h >> 16
    v = (h >>> 0) / 0xffffffff
    cache.set(k, v)
  }
  return v
}

const DEAD_BUSH_THRESHOLD = 0.82
const CACTUS_PLACE_THRESHOLD = 0.88
const CACTUS_HEIGHT_MAX = 3

export function createDeadBushFeature(): FeatureFn {
  return function deadBushFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap } = ctx
    const cache = new Map<string, number>()

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        const biome = biomeMap[lx][lz]
        if (biome !== 'desert' && biome !== 'savanna' && biome !== 'badlands') continue

        const surfaceKey = localKey(lx, topY, lz)
        const surfaceType = idToType(voxelMap[surfaceKey]) as string
        const allowedForDeadBush =
          surfaceType === 'sand' || (biome === 'badlands' && surfaceType === 'red_sand')
        if (!allowedForDeadBush) continue

        const keyAbove = localKey(lx, topY + 1, lz)
        if (voxelMap[keyAbove]) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (sampleNoise(cache, DEAD_BUSH_NOISE_SEED, wx, wz) < DEAD_BUSH_THRESHOLD) continue

        voxelMap[keyAbove] = typeToId('dead_bush')
      }
    }
  }
}

export function createCactusFeature(): FeatureFn {
  return function cactusFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap } = ctx
    const cache = new Map<string, number>()
    const cactusId = typeToId('cactus')

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        const biome = biomeMap[lx][lz]
        if (biome !== 'desert' && biome !== 'badlands') continue

        const surfaceKey = localKey(lx, topY, lz)
        const surfaceType = idToType(voxelMap[surfaceKey]) as string
        const allowedForCactus =
          surfaceType === 'sand' || (biome === 'badlands' && surfaceType === 'red_sand')
        if (!allowedForCactus) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (sampleNoise(cache, CACTUS_NOISE_SEED, wx, wz) < CACTUS_PLACE_THRESHOLD) continue

        const heightSample = sampleNoise(cache, CACTUS_HEIGHT_NOISE_SEED, wx, wz)
        const height =
          1 + Math.min(Math.floor(heightSample * CACTUS_HEIGHT_MAX), CACTUS_HEIGHT_MAX - 1)

        for (let h = 1; h <= height; h++) {
          const ly = topY + h
          const lk = localKey(lx, ly, lz)
          if (!voxelMap[lk]) voxelMap[lk] = cactusId
        }
      }
    }
  }
}
