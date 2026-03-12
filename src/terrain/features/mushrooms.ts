/**
 * Mushroom feature for Stage 4: places brown_mushroom and red_mushroom on grass/dirt in forest, jungle, mushroom_fields, mangrove_swamp.
 */
import type { Biome, BlockType } from '../../types'
import { CHUNK_SIZE, WATER_LEVEL } from '../../constants'
import { localKey, typeToId, idToType } from '../block-ids'
import type { ChunkContext, FeatureFn } from '../pipeline-types'

const MUSHROOM_PLACE_NOISE_SEED = 720001
const MUSHROOM_TYPE_NOISE_SEED = 720002

/** Fraction of eligible surface blocks that get a mushroom (sparser than flowers). */
const MUSHROOM_DENSITY = 0.008
/** Vanilla: mushrooms more common in Old Growth Taiga. */
const MUSHROOM_DENSITY_OLD_GROWTH_TAIGA = 0.016

const SURFACE_BLOCKS_FOR_MUSHROOM: BlockType[] = ['grass', 'grass_snow', 'grass_savanna', 'dirt', 'mycelium', 'podzol']

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

const BIOME_MUSHROOM: Partial<Record<Biome, boolean>> = {
  forest: true,
  jungle: true,
  mushroom_fields: true,
  mangrove_swamp: true,
  plains: true,
  meadow: true,
  grove: true,
  old_growth_taiga: true,
}

/**
 * Creates the Stage 4 mushroom feature (brown and red mushrooms).
 */
export function createMushroomFeature(): FeatureFn {
  return function mushroomFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap } = ctx
    const cache = new Map<string, number>()

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        const biome = biomeMap[lx][lz]
        if (!BIOME_MUSHROOM[biome]) continue

        const surfaceKey = localKey(lx, topY, lz)
        const surfaceType = idToType(voxelMap[surfaceKey]) as BlockType
        if (!SURFACE_BLOCKS_FOR_MUSHROOM.includes(surfaceType)) continue

        const keyAbove = localKey(lx, topY + 1, lz)
        if (voxelMap[keyAbove]) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        const density =
          biome === 'old_growth_taiga' ? MUSHROOM_DENSITY_OLD_GROWTH_TAIGA : MUSHROOM_DENSITY
        if (sampleNoise(cache, MUSHROOM_PLACE_NOISE_SEED, wx, wz) > density) continue

        const typeRoll = sampleNoise(cache, MUSHROOM_TYPE_NOISE_SEED, wx, wz)
        const block: BlockType = typeRoll < 0.5 ? 'brown_mushroom' : 'red_mushroom'
        voxelMap[keyAbove] = typeToId(block)
      }
    }
  }
}
