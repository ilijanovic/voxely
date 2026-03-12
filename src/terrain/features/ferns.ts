/**
 * Fern feature for Stage 4: places fern or large_fern on grass/dirt in forest, jungle, meadow, grove, plains.
 */
import type { Biome, BlockType } from '../../types'
import { CHUNK_SIZE, WATER_LEVEL, WORLD_MIN_Y } from '../../constants'
import { localKey, typeToId, idToType } from '../block-ids'
import { FEATURE_PLACEMENT_NOISE_SCALE } from '../constants'
import type { ChunkContext, FeatureFn } from '../pipeline-types'

/** Seed offsets for feature noise (placement and large_fern choice); deterministic per world seed. */
const FERN_NOISE_SEED = 819381
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
    const { worldX, worldZ, heightmap, biomeMap, voxelMap, getFeatureNoise } = ctx
    if (!getFeatureNoise) return
    const placeNoise = getFeatureNoise(FERN_NOISE_SEED)
    const largeFernNoise = getFeatureNoise(LARGE_FERN_NOISE_SEED)
    const scale = FEATURE_PLACEMENT_NOISE_SCALE

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        const biome = biomeMap[lx][lz]
        if (!BIOME_FERN[biome]) continue

        const surfaceLy = topY - WORLD_MIN_Y
        const surfaceKey = localKey(lx, surfaceLy, lz)
        const surfaceType = idToType(voxelMap[surfaceKey]) as BlockType
        if (!SURFACE_BLOCKS_FOR_FERN.includes(surfaceType)) continue

        const keyAbove = localKey(lx, surfaceLy + 1, lz)
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
        if (placeNoise(wx * scale, wz * scale) < threshold) continue

        const largeFernRoll = largeFernNoise(wx * scale, wz * scale)
        const block: BlockType = largeFernRoll < LARGE_FERN_CHANCE ? 'large_fern' : 'fern'
        voxelMap[keyAbove] = typeToId(block)
      }
    }
  }
}
