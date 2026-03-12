/**
 * Tests for structure painting: verifies village houses get a guaranteed torch next to the door.
 */
import { describe, it, expect } from 'vitest'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../constants'
import { localKey, typeToId } from '../block-ids'
import type { ChunkContext } from '../pipeline-types'
import { paintStructures } from './paint-structures'
import { getDoorPosition, getHouseDimensions } from '../structures/templates/village'

const TEST_SEED = 123
const TEST_SURFACE_Y = 64
const TORCH_ID = typeToId('torch')
const WOOD_ID = typeToId('wood')
const WATER_ID = typeToId('water_source')

/**
 * Creates a minimal chunk context for paintStructures.
 */
function makeCtx(): ChunkContext {
  const heightmap = new Array(CHUNK_SIZE).fill(0).map(() => new Array(CHUNK_SIZE).fill(TEST_SURFACE_Y))
  const biomeMap = new Array(CHUNK_SIZE).fill(0).map(() => new Array(CHUNK_SIZE).fill('plains' as const))
  return {
    chunkX: 0,
    chunkZ: 0,
    worldX: 0,
    worldZ: 0,
    heightmap,
    biomeMap,
    voxelMap: new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE),
    blockMods: [],
    structureOrigins: [],
  }
}

describe('paintStructures (village torches)', () => {
  it('places at least one torch next to each village house door', () => {
    const ctx = makeCtx()
    const ox = 8
    const oz = 8
    const houseSize = 'small' as const
    ctx.structureOrigins = [{ ox, oy: TEST_SURFACE_Y, oz, type: 'village', houseSize }]

    paintStructures(ctx, {
      seed: TEST_SEED,
      getHeight: () => TEST_SURFACE_Y,
      getResolvedBiome: () => 'plains',
    })

    const { widthZ } = getHouseDimensions(ox, oz, houseSize)
    const halfZ = Math.floor((widthZ - 1) / 2)
    const minZ = oz - halfZ
    const { doorX, doorZ } = getDoorPosition(ox, oz, houseSize)

    const doorOnMinZ = doorZ === minZ
    const doorOnMaxZ = doorZ === minZ + widthZ - 1
    const candidates: Array<{ x: number; z: number }> =
      doorOnMinZ || doorOnMaxZ
        ? [
            { x: doorX - 1, z: doorZ },
            { x: doorX + 1, z: doorZ },
          ]
        : [
            { x: doorX, z: doorZ - 1 },
            { x: doorX, z: doorZ + 1 },
          ]

    const torchY = TEST_SURFACE_Y + 2
    const hasTorch = candidates.some((c) => {
      if (c.x < 0 || c.x >= CHUNK_SIZE) return false
      if (c.z < 0 || c.z >= CHUNK_SIZE) return false
      const key = localKey(c.x, torchY, c.z)
      return ctx.voxelMap[key] === TORCH_ID
    })

    expect(hasTorch).toBe(true)
  })
})

/**
 * Returns true if voxelMap contains at least one “lantern”:
 * two wood blocks stacked above ground with a torch on top.
 */
function hasWalkwayLantern(ctx: ChunkContext): boolean {
  const { voxelMap } = ctx
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const baseY = TEST_SURFACE_Y
      const post1 = localKey(lx, baseY + 1, lz)
      const post2 = localKey(lx, baseY + 2, lz)
      const torch = localKey(lx, baseY + 3, lz)
      if (voxelMap[post1] === WOOD_ID && voxelMap[post2] === WOOD_ID && voxelMap[torch] === TORCH_ID) {
        return true
      }
    }
  }
  return false
}

describe('paintStructures (village walkway lanterns)', () => {
  it('places at least one lantern next to the generated gravel walkway', () => {
    const ctx = makeCtx()
    const houseSize = 'small' as const

    // Two houses in the same chunk so walkway clustering creates gravel connections.
    ctx.structureOrigins = [
      { ox: 6, oy: TEST_SURFACE_Y, oz: 6, type: 'village', houseSize },
      { ox: 22, oy: TEST_SURFACE_Y, oz: 10, type: 'village', houseSize },
    ]

    paintStructures(ctx, {
      seed: TEST_SEED,
      getHeight: () => TEST_SURFACE_Y,
      getResolvedBiome: () => 'plains',
    })

    expect(hasWalkwayLantern(ctx)).toBe(true)
  })
})

describe('paintStructures (village plaza)', () => {
  it('paints a small fountain (water_source) for door clusters', () => {
    const ctx = makeCtx()
    const houseSize = 'small' as const

    // Two houses in the same chunk so we get a cluster and a defined center.
    ctx.structureOrigins = [
      { ox: 3, oy: TEST_SURFACE_Y, oz: 3, type: 'village', houseSize },
      { ox: 13, oy: TEST_SURFACE_Y, oz: 13, type: 'village', houseSize },
    ]

    paintStructures(ctx, {
      seed: TEST_SEED,
      getHeight: () => TEST_SURFACE_Y,
      getResolvedBiome: () => 'plains',
    })

    expect(ctx.voxelMap.includes(WATER_ID)).toBe(true)
  })
})

