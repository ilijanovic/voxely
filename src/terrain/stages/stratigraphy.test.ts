/**
 * Tests for the stratigraphy stage (pipeline stage 7 surface): layers and surface block from biome.
 */
import { describe, it, expect } from 'vitest'
import type { BlockType } from '../../types'
import { CHUNK_SIZE, WATER_LEVEL, WORLD_MIN_Y } from '../../constants'
import { createChunkContext } from '../pipeline'
import { createStage3 } from './stratigraphy'
import { localKey, typeToId, idToType, CARVED_ID } from '../block-ids'

const SURFACE_Y = 64
const LY_SURFACE = SURFACE_Y - WORLD_MIN_Y

function makeCtxWithHeightmap(surfaceY: number): ReturnType<typeof createChunkContext> {
  const ctx = createChunkContext(0, 0, [])
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      ctx.heightmap[lx][lz] = surfaceY
      ctx.biomeMap[lx][lz] = 'plains'
    }
  }
  return ctx
}

describe('createStage3 (stratigraphy)', () => {
  it('places bedrock at ly=0 and surface block at top column', () => {
    const ctx = makeCtxWithHeightmap(SURFACE_Y)
    const stage = createStage3()
    stage(ctx)

    const bedrockId = typeToId('bedrock')
    const grassId = typeToId('grass')
    expect(ctx.voxelMap[localKey(0, 0, 0)]).toBe(bedrockId)
    expect(ctx.voxelMap[localKey(0, LY_SURFACE, 0)]).toBe(grassId)
    expect(idToType(ctx.voxelMap[localKey(0, LY_SURFACE, 0)])).toBe('grass')
  })

  it('places dirt in subsurface layers and stone below for plains', () => {
    const ctx = makeCtxWithHeightmap(SURFACE_Y)
    const stage = createStage3()
    stage(ctx)

    const dirtId = typeToId('dirt')
    const stoneId = typeToId('stone')
    expect(ctx.voxelMap[localKey(0, LY_SURFACE - 1, 0)]).toBe(dirtId)
    expect(ctx.voxelMap[localKey(0, LY_SURFACE - 3, 0)]).toBe(dirtId)
    expect(ctx.voxelMap[localKey(0, LY_SURFACE - 4, 0)]).toBe(stoneId)
  })

  it('uses getSurfaceBlock when provided', () => {
    const ctx = makeCtxWithHeightmap(SURFACE_Y)
    const stage = createStage3({
      getSurfaceBlock: () => 'grass_snow' as BlockType,
    })
    stage(ctx)

    expect(idToType(ctx.voxelMap[localKey(0, LY_SURFACE, 0)])).toBe('grass_snow')
  })

  it('uses shore block when surface Y is at water level', () => {
    const ctx = makeCtxWithHeightmap(WATER_LEVEL)
    const stage = createStage3()
    stage(ctx)

    const sandId = typeToId('sand')
    const lyShore = WATER_LEVEL - WORLD_MIN_Y
    expect(ctx.voxelMap[localKey(0, lyShore, 0)]).toBe(sandId)
  })

  it('skips CARVED_ID columns (does not overwrite caves)', () => {
    const ctx = makeCtxWithHeightmap(SURFACE_Y)
    const lkCave = localKey(5, LY_SURFACE - 2, 5)
    ctx.voxelMap[lkCave] = CARVED_ID

    const stage = createStage3()
    stage(ctx)

    expect(ctx.voxelMap[lkCave]).toBe(CARVED_ID)
  })
})
