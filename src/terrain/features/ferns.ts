/**
 * Fern feature for Stage 4: places fern or large_fern on grass/dirt in forest, jungle, meadow, grove, plains.
 */
import type { Biome, BlockType } from '../../types'
import { CHUNK_SIZE, WATER_LEVEL } from '../../constants'
import { localKey, typeToId, idToType } from '../block-ids'
import type { ChunkContext, FeatureFn } from '../pipeline-types'

const FERN_NOISE_SEED = 819381
/** Seed for choosing large_fern vs fern; must differ from FERN_NOISE_SEED. */
const LARGE_FERN_NOISE_SEED = 819382
const SURFACE_BLOCKS_FOR_FERN: BlockType[] = [
  'grass',
  'grass_snow',
  'grass_savanna',
  'dirt',
  'podzol',
  'coarse_dirt',
]

/** Fraction of fern placements that become large_fern (0–1). */
const LARGE_FERN_CHANCE = 0.12

function fernNoiseKey(seed: number, wx: number, wz: number): string {
  return `${seed},${wx},${wz}`
}

function sampleFernNoise(cache: Map<string, number>, wx: number, wz: number): number {
  const k = fernNoiseKey(FERN_NOISE_SEED, wx, wz)
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

function sampleLargeFernNoise(cache: Map<string, number>, wx: number, wz: number): number {
  const k = fernNoiseKey(LARGE_FERN_NOISE_SEED, wx, wz)
  let v = cache.get(k)
  if (v === undefined) {
    let h = wx * 374761393 + wz * 668265263 + LARGE_FERN_NOISE_SEED
    h = (h ^ (h >> 13)) * 1274126177
    h ^= h >> 16
    v = (h >>> 0) / 0xffffffff
    cache.set(k, v)
  }
  return v
}

/** Default threshold: place fern when noise >= this (higher = fewer ferns). */
const FERN_PLACE_THRESHOLD = 0.82
/** Lower threshold in forest/windswept_forest so more ferns appear (lusher undergrowth). */
const FERN_PLACE_THRESHOLD_FOREST = 0.75
/** Even lower in jungle for dense undergrowth. */
const FERN_PLACE_THRESHOLD_JUNGLE = 0.68

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
  old_growth_taiga: true,
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
        const threshold =
          biome === 'jungle'
            ? FERN_PLACE_THRESHOLD_JUNGLE
            : biome === 'forest' ||
                biome === 'windswept_forest' ||
                biome === 'old_growth_taiga'
              ? FERN_PLACE_THRESHOLD_FOREST
              : FERN_PLACE_THRESHOLD
        if (sampleFernNoise(noiseCache, wx, wz) < threshold) continue

        const largeFernRoll = sampleLargeFernNoise(noiseCache, wx, wz)
        const block: BlockType = largeFernRoll < LARGE_FERN_CHANCE ? 'large_fern' : 'fern'
        voxelMap[keyAbove] = typeToId(block)
      }
    }
  }
}
