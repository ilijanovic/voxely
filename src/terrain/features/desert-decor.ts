/**
 * Desert and savanna decor for Stage 4: dead bush on sand, cactus on desert sand.
 * Cactus uses vanilla-style placement: no solid block in 4 cardinal directions, 2–3 blocks high, flower on top.
 */
import { CHUNK_SIZE, WATER_LEVEL, WORLD_HEIGHT, WORLD_MIN_Y } from '../../constants'
import { localKey, typeToId, idToType, AIR_ID, CARVED_ID } from '../block-ids'
import { FEATURE_PLACEMENT_NOISE_SCALE } from '../constants'
import { BADLANDS_BAND_BLOCKS } from '../surface-resolver'
import type { ChunkContext, FeatureFn } from '../pipeline-types'

/** Surface blocks in badlands (band blocks); dead bush and cactus can place on any of them. */
const BADLANDS_SURFACE_BLOCKS = new Set(BADLANDS_BAND_BLOCKS)

/** Seed offsets for feature noise; deterministic per world seed. */
const DEAD_BUSH_NOISE_SEED = 400111
const CACTUS_NOISE_SEED = 500222
const CACTUS_HEIGHT_NOISE_SEED = 500223

/** Vanilla Java: height 1 (1/18), 2 (5/18), 3 (2/18). We use 2–3 only; this maps noise [0,1) to 2 or 3. */
const CACTUS_HEIGHT_2_THRESHOLD = 5 / 18

const DEAD_BUSH_THRESHOLD = 0.82
const CACTUS_PLACE_THRESHOLD = 0.88
const CACTUS_HEIGHT_MIN = 2
const CACTUS_HEIGHT_MAX = 3

/** Block types that do not break cactus in vanilla (air, water, plants). All others count as solid for adjacency. */
const NON_SOLID_FOR_CACTUS = new Set<string>([
  'air',
  'water_source',
  'water_flowing_1',
  'water_flowing_2',
  'water_flowing_3',
  'water_flowing_4',
  'water_flowing_5',
  'water_flowing_6',
  'water_flowing_7',
  'dead_bush',
  'dandelion',
  'poppy',
  'tulip_red',
  'tulip_orange',
  'tulip_white',
  'tulip_pink',
  'oxeye_daisy',
  'cornflower',
  'azure_bluet',
  'allium',
  'lily_of_the_valley',
  'blue_orchid',
  'cactus_flower',
  'tall_grass',
  'fern',
  'large_fern',
  'brown_mushroom',
  'red_mushroom',
  'lily_pad',
  'sugar_cane',
  'kelp',
  'seagrass',
  'sea_pickle',
  'vine',
  'bamboo',
  'sweet_berry_bush',
  'pink_petals',
])

/** Returns true if this block id is solid for vanilla cactus adjacency (would break cactus if adjacent). Exported for tests. */
export function isSolidForCactus(id: number): boolean {
  if (id === AIR_ID || id === CARVED_ID) return false
  const type = idToType(id) as string
  return !NON_SOLID_FOR_CACTUS.has(type)
}

export function createDeadBushFeature(): FeatureFn {
  return function deadBushFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap, getFeatureNoise } = ctx
    if (!getFeatureNoise) return
    const placeNoise = getFeatureNoise(DEAD_BUSH_NOISE_SEED)
    const scale = FEATURE_PLACEMENT_NOISE_SCALE

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        const biome = biomeMap[lx][lz]
        if (
          biome !== 'desert' &&
          biome !== 'savanna' &&
          biome !== 'badlands' &&
          biome !== 'old_growth_taiga'
        )
          continue

        const surfaceLy = topY - WORLD_MIN_Y
        const surfaceKey = localKey(lx, surfaceLy, lz)
        const surfaceType = idToType(voxelMap[surfaceKey]) as string
        const allowedForDeadBush =
          biome === 'old_growth_taiga'
            ? surfaceType === 'podzol' || surfaceType === 'coarse_dirt'
            : surfaceType === 'sand' || (biome === 'badlands' && BADLANDS_SURFACE_BLOCKS.has(surfaceType))
        if (!allowedForDeadBush) continue

        const keyAbove = localKey(lx, surfaceLy + 1, lz)
        if (voxelMap[keyAbove]) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (placeNoise(wx * scale, wz * scale) < DEAD_BUSH_THRESHOLD) continue

        voxelMap[keyAbove] = typeToId('dead_bush')
      }
    }
  }
}

export function createCactusFeature(): FeatureFn {
  return function cactusFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap, getFeatureNoise } = ctx
    if (!getFeatureNoise) return
    const placeNoise = getFeatureNoise(CACTUS_NOISE_SEED)
    const heightNoise = getFeatureNoise(CACTUS_HEIGHT_NOISE_SEED)
    const scale = FEATURE_PLACEMENT_NOISE_SCALE
    const cactusId = typeToId('cactus')
    const cactusFlowerId = typeToId('cactus_flower')

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        if (lx <= 0 || lx >= CHUNK_SIZE - 1 || lz <= 0 || lz >= CHUNK_SIZE - 1) continue

        const topY = heightmap[lx][lz]
        if (topY <= WATER_LEVEL) continue
        const biome = biomeMap[lx][lz]
        if (biome !== 'desert' && biome !== 'badlands') continue

        const surfaceLy = topY - WORLD_MIN_Y
        const surfaceKey = localKey(lx, surfaceLy, lz)
        const surfaceType = idToType(voxelMap[surfaceKey]) as string
        const allowedForCactus =
          surfaceType === 'sand' || (biome === 'badlands' && BADLANDS_SURFACE_BLOCKS.has(surfaceType))
        if (!allowedForCactus) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        if (placeNoise(wx * scale, wz * scale) < CACTUS_PLACE_THRESHOLD) continue

        const heightSample = heightNoise(wx * scale, wz * scale)
        const height =
          heightSample < CACTUS_HEIGHT_2_THRESHOLD ? CACTUS_HEIGHT_MIN : CACTUS_HEIGHT_MAX

        let anySolidNeighbour = false
        for (let h = 1; h <= height && !anySolidNeighbour; h++) {
          const ly = surfaceLy + h
          const lkN = localKey(lx, ly, lz - 1)
          const lkS = localKey(lx, ly, lz + 1)
          const lkW = localKey(lx - 1, ly, lz)
          const lkE = localKey(lx + 1, ly, lz)
          if (
            isSolidForCactus(voxelMap[lkN]) ||
            isSolidForCactus(voxelMap[lkS]) ||
            isSolidForCactus(voxelMap[lkW]) ||
            isSolidForCactus(voxelMap[lkE])
          ) {
            anySolidNeighbour = true
          }
        }
        if (anySolidNeighbour) continue

        for (let h = 1; h <= height; h++) {
          const ly = surfaceLy + h
          const lk = localKey(lx, ly, lz)
          if (voxelMap[lk] === AIR_ID || voxelMap[lk] === CARVED_ID) voxelMap[lk] = cactusId
        }

        const topCactusLy = surfaceLy + height
        if (topCactusLy + 1 < WORLD_HEIGHT) {
          const flowerKey = localKey(lx, topCactusLy + 1, lz)
          if (voxelMap[flowerKey] === AIR_ID || voxelMap[flowerKey] === CARVED_ID) {
            voxelMap[flowerKey] = cactusFlowerId
          }
        }
      }
    }
  }
}
