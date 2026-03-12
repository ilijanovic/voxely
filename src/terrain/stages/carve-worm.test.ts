import { describe, it, expect } from 'vitest'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../constants'
import type { ChunkContext } from '../pipeline-types'
import { localKey, CARVED_ID, typeToId } from '../block-ids'
import { createStage2Worm } from './carve-worm'

const TEST_SEED = 12345
const TEST_SURFACE_Y = 80
const TEST_MIN_DEPTH_BELOW_SURFACE = 5
const STONE_ID = typeToId('stone')

/**
 * Creates a minimal chunk context with a flat heightmap and solid-filled voxelMap.
 */
function makeSolidCtx(): ChunkContext {
  const heightmap = new Array(CHUNK_SIZE).fill(0).map(() => new Array(CHUNK_SIZE).fill(TEST_SURFACE_Y))
  const biomeMap = new Array(CHUNK_SIZE).fill(0).map(() => new Array(CHUNK_SIZE).fill('plains' as const))
  const voxelMap = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)
  voxelMap.fill(STONE_ID)
  return {
    chunkX: 0,
    chunkZ: 0,
    worldX: 0,
    worldZ: 0,
    heightmap,
    biomeMap,
    voxelMap,
    blockMods: [],
    structureOrigins: [],
  }
}

describe('carve-worm', () => {
  it('is deterministic for the same seed and chunk', () => {
    const stage = createStage2Worm({
      seed: TEST_SEED,
      startRate: 1,
      cellSize: 24,
      steps: 10,
      radius: 2.5,
      maxY: TEST_SURFACE_Y,
      minDepthBelowSurface: TEST_MIN_DEPTH_BELOW_SURFACE,
    })

    const a = makeSolidCtx()
    const b = makeSolidCtx()
    stage(a)
    stage(b)
    expect(b.voxelMap).toEqual(a.voxelMap)
  })

  it('never carves at or above (surfaceY - minDepthBelowSurface)', () => {
    const stage = createStage2Worm({
      seed: TEST_SEED,
      startRate: 1,
      cellSize: 24,
      steps: 10,
      radius: 2.5,
      maxY: TEST_SURFACE_Y,
      minDepthBelowSurface: TEST_MIN_DEPTH_BELOW_SURFACE,
    })

    const ctx = makeSolidCtx()
    stage(ctx)

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const carveCeiling = ctx.heightmap[lx][lz] - TEST_MIN_DEPTH_BELOW_SURFACE
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const v = ctx.voxelMap[localKey(lx, y, lz)]
          if (v !== CARVED_ID) continue
          expect(y).toBeLessThan(carveCeiling)
        }
      }
    }
  })
})

