/**
 * Tests for village structure template: dimensions, 1×2 door, windows at height 2,
 * floor/wall materials (planks, stone, bricks), and optional wood corners.
 */
import { describe, it, expect } from 'vitest'
import {
  getHouseDimensions,
  getVillageBlocks,
  getHouseMaterials,
  getDoorPosition,
  getVillageWalkwayBlocks,
} from './village'

/** House height is chosen deterministically in [5, 6] per origin/size. */
const HOUSE_HEIGHT_MIN = 5
const HOUSE_HEIGHT_MAX = 6

const SIZE_RANGES = {
  small: { minWidthX: 6, maxWidthX: 9, minWidthZ: 6, maxWidthZ: 8 },
  medium: { minWidthX: 9, maxWidthX: 12, minWidthZ: 8, maxWidthZ: 11 },
  large: { minWidthX: 11, maxWidthX: 15, minWidthZ: 10, maxWidthZ: 13 },
} as const

describe('getHouseDimensions', () => {
  it('returns height between 5 and 6 blocks for all sizes', () => {
    const origins = [[0, 0], [10, 20], [-5, -15]] as const
    for (const size of ['small', 'medium', 'large'] as const) {
      for (const [ox, oz] of origins) {
        const { height } = getHouseDimensions(ox, oz, size)
        expect(height).toBeGreaterThanOrEqual(HOUSE_HEIGHT_MIN)
        expect(height).toBeLessThanOrEqual(HOUSE_HEIGHT_MAX)
      }
    }
  })

  it('returns widthX and widthZ within configured ranges per size', () => {
    const origins = [
      [0, 0],
      [100, -50],
      [-200, 300],
    ] as const
    for (const size of ['small', 'medium', 'large'] as const) {
      const ranges = SIZE_RANGES[size]
      for (const [ox, oz] of origins) {
        const { widthX, widthZ } = getHouseDimensions(ox, oz, size)
        expect(widthX).toBeGreaterThanOrEqual(ranges.minWidthX)
        expect(widthX).toBeLessThanOrEqual(ranges.maxWidthX)
        expect(widthZ).toBeGreaterThanOrEqual(ranges.minWidthZ)
        expect(widthZ).toBeLessThanOrEqual(ranges.maxWidthZ)
      }
    }
  })

  it('is deterministic for same origin and size', () => {
    const a = getHouseDimensions(12, -8, 'medium')
    const b = getHouseDimensions(12, -8, 'medium')
    expect(a.widthX).toBe(b.widthX)
    expect(a.widthZ).toBe(b.widthZ)
    expect(a.height).toBe(b.height)
  })
})

describe('getVillageBlocks', () => {
  const ox = 10
  const oy = 64
  const oz = 20

  it('has 1×2 door opening (no blocks at door position at oy+1 and oy+2) so player can walk through', () => {
    const blocks = getVillageBlocks(ox, oy, oz, 'small')
    const { doorX, doorZ } = getDoorPosition(ox, oz, 'small')
    const atDoor = (b: { bx: number; by: number; bz: number }) =>
      b.bx === doorX && b.bz === doorZ && (b.by === oy + 1 || b.by === oy + 2)
    const doorBlocks = blocks.filter(atDoor)
    expect(doorBlocks.length).toBe(0)
  })

  it('every house has a 1×2 door opening (air) for any origin and size', () => {
    const origins = [[0, 0], [10, 20], [-5, -15], [100, 100]] as const
    const sizes = ['small', 'medium', 'large'] as const
    const oy = 64
    for (const [ox, oz] of origins) {
      for (const size of sizes) {
        const blocks = getVillageBlocks(ox, oy, oz, size)
        const { doorX, doorZ } = getDoorPosition(ox, oz, size)
        const atDoor = (b: { bx: number; by: number; bz: number }) =>
          b.bx === doorX && b.bz === doorZ && (b.by === oy + 1 || b.by === oy + 2)
        expect(blocks.filter(atDoor).length).toBe(0)
      }
    }
  })

  it('produces bounding box matching getHouseDimensions', () => {
    const dims = getHouseDimensions(ox, oz, 'large')
    const blocks = getVillageBlocks(ox, oy, oz, 'large')
    const bxs = blocks.map((b) => b.bx)
    const bys = blocks.map((b) => b.by)
    const bzs = blocks.map((b) => b.bz)
    const spanX = Math.max(...bxs) - Math.min(...bxs) + 1
    const spanZ = Math.max(...bzs) - Math.min(...bzs) + 1
    const spanY = Math.max(...bys) - Math.min(...bys) + 1
    expect(spanX).toBe(dims.widthX)
    expect(spanZ).toBe(dims.widthZ)
    expect(spanY).toBe(dims.height)
  })

  const WALL_MATERIALS = ['oak_planks', 'stone', 'bricks'] as const
  const FLOOR_MATERIALS = [
    'oak_planks',
    'spruce_planks',
    'birch_planks',
    'jungle_planks',
    'acacia_planks',
    'dark_oak_planks',
    'stone',
  ] as const
  const PLANK_TYPES = [
    'oak_planks',
    'spruce_planks',
    'birch_planks',
    'jungle_planks',
    'acacia_planks',
    'dark_oak_planks',
  ] as const

  it('uses only allowed floor materials (planks or stone)', () => {
    const blocks = getVillageBlocks(ox, oy, oz, 'medium')
    const floorBlocks = blocks.filter((b) => b.by === oy)
    for (const b of floorBlocks) {
      expect(FLOOR_MATERIALS).toContain(b.block)
    }
  })

  it('uses only allowed wall materials (planks, stone, or bricks)', () => {
    const blocks = getVillageBlocks(ox, oy, oz, 'small')
    const allowedWallBlocks = [...WALL_MATERIALS, ...PLANK_TYPES]
    const wallBlocks = blocks.filter(
      (b) => b.by > oy && b.by < oy + 3 && b.block !== 'hay_block',
    )
    for (const b of wallBlocks) {
      expect(allowedWallBlocks).toContain(b.block)
    }
  })

  it('leaves window gaps at oy+2 (fewer wall blocks than full perimeter)', () => {
    const blocks = getVillageBlocks(ox, oy, oz, 'medium')
    const wallBlocksAtWindowHeight = blocks.filter(
      (b) =>
        b.by === oy + 2 &&
        (b.block === 'oak_planks' || b.block === 'stone' || b.block === 'bricks' ||
          b.block === 'spruce_planks' || b.block === 'birch_planks' || b.block === 'jungle_planks' ||
          b.block === 'acacia_planks' || b.block === 'dark_oak_planks'),
    )
    const { widthX, widthZ } = getHouseDimensions(ox, oz, 'medium')
    const wallCellsAtHeight2 = 2 * widthX + 2 * (widthZ - 2)
    expect(wallBlocksAtWindowHeight.length).toBeLessThan(wallCellsAtHeight2)
  })

  it('is deterministic for same inputs', () => {
    const a = getVillageBlocks(ox, oy, oz, 'small')
    const b = getVillageBlocks(ox, oy, oz, 'small')
    expect(a.length).toBe(b.length)
    const sortKey = (t: { bx: number; by: number; bz: number; block: string }) =>
      `${t.bx},${t.by},${t.bz},${t.block}`
    expect(a.map(sortKey).sort()).toEqual(b.map(sortKey).sort())
  })

  it('when useWoodCorners is true and wall is wood, the four corners are a plank type', () => {
    let originOx = 0
    let originOz = 0
    let found = false
    for (let x = -20; x <= 20 && !found; x++) {
      for (let z = -20; z <= 20; z++) {
        const m = getHouseMaterials(x, z)
        if (m.useWoodCorners && m.wallMaterial === 'oak_planks') {
          originOx = x
          originOz = z
          found = true
          break
        }
      }
    }
    const { useWoodCorners, wallMaterial } = getHouseMaterials(originOx, originOz)
    if (!useWoodCorners || wallMaterial !== 'oak_planks') return
    const blocks = getVillageBlocks(originOx, oy, originOz, 'small')
    const { widthX, widthZ } = getHouseDimensions(originOx, originOz, 'small')
    const halfX = Math.floor((widthX - 1) / 2)
    const halfZ = Math.floor((widthZ - 1) / 2)
    const minX = originOx - halfX
    const minZ = originOz - halfZ
    const maxX = minX + widthX - 1
    const maxZ = minZ + widthZ - 1
    const corners = [
      [minX, minZ],
      [minX, maxZ],
      [maxX, minZ],
      [maxX, maxZ],
    ] as const
    for (const [cx, cz] of corners) {
      for (let wy = 1; wy <= 2; wy++) {
        const by = oy + wy
        const cornerBlock = blocks.find((b) => b.bx === cx && b.by === by && b.bz === cz)
        expect(cornerBlock).toBeDefined()
        expect(PLANK_TYPES).toContain(cornerBlock!.block)
      }
    }
  })

  it('when wall is bricks or stone, corners use the same material as walls', () => {
    let originOx = 0
    let originOz = 0
    let found = false
    for (let x = -30; x <= 30 && !found; x++) {
      for (let z = -30; z <= 30; z++) {
        const m = getHouseMaterials(x, z)
        if (m.wallMaterial === 'bricks' || m.wallMaterial === 'stone') {
          originOx = x
          originOz = z
          found = true
          break
        }
      }
    }
    const { wallMaterial } = getHouseMaterials(originOx, originOz)
    if (wallMaterial !== 'bricks' && wallMaterial !== 'stone') return
    const blocks = getVillageBlocks(originOx, oy, originOz, 'small')
    const { widthX, widthZ } = getHouseDimensions(originOx, originOz, 'small')
    const halfX = Math.floor((widthX - 1) / 2)
    const halfZ = Math.floor((widthZ - 1) / 2)
    const minX = originOx - halfX
    const minZ = originOz - halfZ
    const maxX = minX + widthX - 1
    const maxZ = minZ + widthZ - 1
    const corners = [
      [minX, minZ],
      [minX, maxZ],
      [maxX, minZ],
      [maxX, maxZ],
    ] as const
    for (const [cx, cz] of corners) {
      for (let wy = 1; wy <= 2; wy++) {
        const by = oy + wy
        const cornerBlock = blocks.find((b) => b.bx === cx && b.by === by && b.bz === cz)
        expect(cornerBlock).toBeDefined()
        expect(cornerBlock!.block).toBe(wallMaterial)
      }
    }
  })
})

describe('getVillageWalkwayBlocks', () => {
  it('returns only gravel blocks inside the given chunk bounds (L-path, 2 wide)', () => {
    const doors = [
      { doorX: 10, doorZ: 10, oy: 64, minX: 8, maxX: 12, minZ: 8, maxZ: 12 },
      { doorX: 14, doorZ: 14, oy: 64, minX: 12, maxX: 16, minZ: 12, maxZ: 16 },
    ]
    const centerX = 12
    const centerZ = 12
    const worldX = 8
    const worldZ = 8
    const chunkSize = 8
    const blocks = getVillageWalkwayBlocks(doors, centerX, centerZ, worldX, worldZ, chunkSize)
    expect(blocks.length).toBeGreaterThan(0)
    for (const b of blocks) {
      expect(b.block).toBe('gravel')
      expect(b.bx).toBeGreaterThanOrEqual(worldX)
      expect(b.bx).toBeLessThan(worldX + chunkSize)
      expect(b.bz).toBeGreaterThanOrEqual(worldZ)
      expect(b.bz).toBeLessThan(worldZ + chunkSize)
      expect(b.by).toBe(64)
    }
  })

  it('returns empty when chunk does not intersect the path', () => {
    const doors = [{ doorX: 0, doorZ: 0, oy: 64, minX: -1, maxX: 1, minZ: -1, maxZ: 1 }]
    const blocks = getVillageWalkwayBlocks(doors, 0, 0, 100, 100, 16)
    expect(blocks).toHaveLength(0)
  })
})
