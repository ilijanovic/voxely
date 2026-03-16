/**
 * Contract tests: terrain block-ids vs block-registry, and save VALID_BLOCK_TYPES consistency.
 */
import { describe, it, expect } from 'vitest'
import { ID_TO_TYPE } from './terrain/block-ids'
import {
  getBlockDefinition,
  getBlockHeight,
  getBlockBreakTime,
  getBlockBreakTimeWithTool,
  HAND_BREAK_TIME_MULTIPLIER,
  getAllBlockIds,
  getPlaceableBlockIds,
  isPlaceableBlock,
  isOccludingBlock,
  isFluidBlock,
  getPlacedStairsId,
  getStairsItemId,
  getStairsFacingAndHalfFromId,
  isPlacedStairsVariant,
  getBlockCollisionBoxesLocal,
  getFenceCollisionBoxesLocal,
  getFenceConnectionMask,
  getBlockTextureNames,
  getBlockFlammability,
  getBlockBurnability,
  getBlockPistonBehavior,
} from './block-registry'
import { VALID_BLOCK_TYPES } from './save'

describe('Block-type consistency: terrain block-ids vs block-registry', () => {
  it('every non-air entry in ID_TO_TYPE has a BlockDefinition in block-registry', () => {
    for (let id = 0; id < ID_TO_TYPE.length; id++) {
      const type = ID_TO_TYPE[id]
      if (type === 'air') continue
      const def = getBlockDefinition(type)
      expect(
        def,
        `terrain block type "${type}" (id ${id}) must have a BlockDefinition in block-registry`,
      ).toBeDefined()
      expect(def!.id).toBe(type)
    }
  })
})

describe('getBlockBreakTime', () => {
  it('returns 0 for instant-break blocks (e.g. flowers)', () => {
    expect(getBlockBreakTime('dandelion')).toBe(0)
    expect(getBlockBreakTime('fern')).toBe(0)
    expect(getBlockBreakTime('dead_bush')).toBe(0)
  })

  it('returns default 1.0 for blocks without breakTimeSeconds', () => {
    expect(getBlockBreakTime('oak_planks')).toBe(1)
    expect(getBlockBreakTime('torch')).toBe(1)
  })

  it('returns configured break time for blocks with breakTimeSeconds', () => {
    expect(getBlockBreakTime('dirt')).toBe(0.5)
    expect(getBlockBreakTime('stone')).toBe(1.5)
    expect(getBlockBreakTime('bricks')).toBe(2)
  })

  it('returns default for unknown block id', () => {
    expect(getBlockBreakTime('unknown_block_xyz')).toBe(1)
  })
})

describe('getBlockBreakTimeWithTool', () => {
  it('returns base × HAND_BREAK_TIME_MULTIPLIER when no tool (undefined held item)', () => {
    expect(getBlockBreakTimeWithTool('stone')).toBe(
      getBlockBreakTime('stone') * HAND_BREAK_TIME_MULTIPLIER,
    )
    expect(getBlockBreakTimeWithTool('oak_planks')).toBe(
      getBlockBreakTime('oak_planks') * HAND_BREAK_TIME_MULTIPLIER,
    )
    expect(getBlockBreakTimeWithTool('dirt')).toBe(
      getBlockBreakTime('dirt') * HAND_BREAK_TIME_MULTIPLIER,
    )
  })

  it('returns base × HAND_BREAK_TIME_MULTIPLIER when held item is not a tool', () => {
    expect(getBlockBreakTimeWithTool('stone', 'stone')).toBe(
      getBlockBreakTime('stone') * HAND_BREAK_TIME_MULTIPLIER,
    )
    expect(getBlockBreakTimeWithTool('oak_planks', 'torch')).toBe(
      getBlockBreakTime('oak_planks') * HAND_BREAK_TIME_MULTIPLIER,
    )
  })

  it('returns reduced time when correct tool is used (vanilla formula: base × 0.3 / toolSpeed)', () => {
    expect(getBlockBreakTime('stone')).toBe(1.5)
    // Wood pickaxe (speed 2): stone 1.5 × (1.5/5) / 2 = 0.225 s
    expect(getBlockBreakTimeWithTool('stone', 'wood_pickaxe')).toBe(1.5 * (1.5 / 5) / 2)
    expect(getBlockBreakTimeWithTool('oak_planks', 'wood_axe')).toBe(
      getBlockBreakTime('oak_planks') * (1.5 / 5) / 2,
    )
    expect(getBlockBreakTimeWithTool('dirt', 'wood_shovel')).toBe(
      getBlockBreakTime('dirt') * (1.5 / 5) / 2,
    )
  })

  it('returns base × HAND_BREAK_TIME_MULTIPLIER when wrong tool is used (e.g. axe on stone)', () => {
    expect(getBlockBreakTimeWithTool('stone', 'wood_axe')).toBe(
      getBlockBreakTime('stone') * HAND_BREAK_TIME_MULTIPLIER,
    )
    expect(getBlockBreakTimeWithTool('oak_planks', 'wood_pickaxe')).toBe(
      getBlockBreakTime('oak_planks') * HAND_BREAK_TIME_MULTIPLIER,
    )
  })

  it('returns default × HAND_BREAK_TIME_MULTIPLIER for unknown block or unknown held item', () => {
    expect(getBlockBreakTimeWithTool('unknown_block_xyz', 'wood_pickaxe')).toBe(
      1 * HAND_BREAK_TIME_MULTIPLIER,
    )
    expect(getBlockBreakTimeWithTool('stone', 'unknown_tool_xyz')).toBe(
      getBlockBreakTime('stone') * HAND_BREAK_TIME_MULTIPLIER,
    )
  })
})

describe('getBlockHeight', () => {
  it('returns 1 for full blocks', () => {
    expect(getBlockHeight('stone')).toBe(1)
    expect(getBlockHeight('snow')).toBe(1)
  })

  it('returns layer/8 for snow_layer_1..8', () => {
    for (let k = 1; k <= 8; k++) {
      expect(getBlockHeight(`snow_layer_${k}`)).toBe(k / 8)
    }
  })
})

describe('Save VALID_BLOCK_TYPES', () => {
  it('every VALID_BLOCK_TYPES entry has a BlockDefinition', () => {
    for (const id of VALID_BLOCK_TYPES) {
      const def = getBlockDefinition(id)
      expect(
        def,
        `VALID_BLOCK_TYPES contains "${id}" which must exist in block-registry`,
      ).toBeDefined()
    }
  })
})

describe('Block registry invariants', () => {
  it('no duplicate block IDs', () => {
    const ids = getAllBlockIds()
    const seen = new Set<string>()
    for (const id of ids) {
      expect(seen.has(id), `duplicate block id: ${id}`).toBe(false)
      seen.add(id)
    }
  })

  it('getPlaceableBlockIds and isPlaceableBlock agree', () => {
    const placeableIds = new Set(getPlaceableBlockIds())
    for (const id of getAllBlockIds()) {
      expect(isPlaceableBlock(id), `isPlaceableBlock("${id}")`).toBe(placeableIds.has(id))
    }
  })

  it('water and torch are placeable; water_source and weapons are not', () => {
    expect(isPlaceableBlock('water')).toBe(true)
    expect(isPlaceableBlock('torch')).toBe(true)
    expect(isPlaceableBlock('water_source')).toBe(false)
    expect(isPlaceableBlock('wood_sword')).toBe(false)
  })

  it('leaves and ice are non-occluding; stone is occluding', () => {
    expect(isOccludingBlock('leaves')).toBe(false)
    expect(isOccludingBlock('ice')).toBe(false)
    expect(isOccludingBlock('stone')).toBe(true)
  })

  it('water block types are fluid; stone is not', () => {
    expect(isFluidBlock('water')).toBe(true)
    expect(isFluidBlock('water_source')).toBe(true)
    expect(isFluidBlock('water_flowing_1')).toBe(true)
    expect(isFluidBlock('stone')).toBe(false)
  })

  it('exposes fire metadata for common families (wood/leaves/plants)', () => {
    expect(getBlockFlammability('stone')).toBe(0)
    expect(getBlockBurnability('stone')).toBe(0)
    expect(getBlockFlammability('oak_planks')).toBe(5)
    expect(getBlockBurnability('oak_planks')).toBe(20)
    expect(getBlockFlammability('oak_leaves')).toBe(30)
    expect(getBlockBurnability('oak_leaves')).toBe(60)
    expect(getBlockFlammability('dandelion')).toBe(60)
    expect(getBlockBurnability('dandelion')).toBe(100)
  })

  it('exposes piston behavior metadata', () => {
    expect(getBlockPistonBehavior('stone')).toBe('normal')
    expect(getBlockPistonBehavior('dandelion')).toBe('destroy')
    expect(getBlockPistonBehavior('water_source')).toBe('block')
    expect(getBlockPistonBehavior('bedrock')).toBe('block')
  })
})

describe('Stairs placement and collision', () => {
  it('getPlacedStairsId returns _facing for half bottom (default)', () => {
    expect(getPlacedStairsId('oak_stairs', 'north')).toBe('oak_stairs_north')
    expect(getPlacedStairsId('oak_stairs', 'south')).toBe('oak_stairs_south')
    expect(getPlacedStairsId('cobblestone_stairs', 'east')).toBe('cobblestone_stairs_east')
  })

  it('getPlacedStairsId returns _facing_top for half top', () => {
    expect(getPlacedStairsId('oak_stairs', 'north', 'top')).toBe('oak_stairs_north_top')
    expect(getPlacedStairsId('oak_stairs', 'south', 'top')).toBe('oak_stairs_south_top')
    expect(getPlacedStairsId('cobblestone_stairs', 'west', 'top')).toBe('cobblestone_stairs_west_top')
  })

  it('getStairsItemId strips facing and optional _top', () => {
    expect(getStairsItemId('oak_stairs_north')).toBe('oak_stairs')
    expect(getStairsItemId('oak_stairs_north_top')).toBe('oak_stairs')
    expect(getStairsItemId('oak_stairs')).toBe('oak_stairs')
  })

  it('isPlacedStairsVariant recognizes bottom and top variants', () => {
    expect(isPlacedStairsVariant('oak_stairs_north')).toBe(true)
    expect(isPlacedStairsVariant('oak_stairs_north_top')).toBe(true)
    expect(isPlacedStairsVariant('oak_stairs')).toBe(false)
    expect(isPlacedStairsVariant('stone')).toBe(false)
  })

  it('getStairsFacingAndHalfFromId parses bottom and top variants', () => {
    expect(getStairsFacingAndHalfFromId('oak_stairs_north')).toEqual({ facing: 'north', half: 'bottom' })
    expect(getStairsFacingAndHalfFromId('oak_stairs_south_top')).toEqual({ facing: 'south', half: 'top' })
    expect(getStairsFacingAndHalfFromId('oak_stairs')).toBe(null)
  })

  it('getBlockCollisionBoxesLocal returns two boxes for bottom-half stairs (slab + step)', () => {
    const boxes = getBlockCollisionBoxesLocal('oak_stairs_north')
    expect(boxes).toHaveLength(2)
    expect(boxes[0].minY).toBe(0)
    expect(boxes[0].maxY).toBe(0.5)
    expect(boxes[0].minX).toBe(0)
    expect(boxes[0].maxX).toBe(1)
    expect(boxes[0].minZ).toBe(0)
    expect(boxes[0].maxZ).toBe(1)
    expect(boxes[1].minY).toBe(0.5)
    expect(boxes[1].maxY).toBe(1)
    expect(boxes[1].maxZ).toBe(0.5)
  })

  it('getBlockCollisionBoxesLocal returns two boxes for top-half stairs (upside-down)', () => {
    const boxes = getBlockCollisionBoxesLocal('oak_stairs_north_top')
    expect(boxes).toHaveLength(2)
    expect(boxes[0].minY).toBe(0)
    expect(boxes[0].maxY).toBe(0.5)
    expect(boxes[0].maxZ).toBe(0.5)
    expect(boxes[1].minY).toBe(0.5)
    expect(boxes[1].maxY).toBe(1)
    expect(boxes[1].minX).toBe(0)
    expect(boxes[1].maxX).toBe(1)
    expect(boxes[1].minZ).toBe(0)
    expect(boxes[1].maxZ).toBe(1)
  })

  it('getBlockTextureNames returns base block texture for placed stairs variants', () => {
    expect(getBlockTextureNames('oak_stairs_north')).toEqual(['planks_oak'])
    expect(getBlockTextureNames('oak_stairs_north_top')).toEqual(['planks_oak'])
    expect(getBlockTextureNames('oak_stairs')).toEqual(['planks_oak'])
    expect(getBlockTextureNames('cobblestone_stairs_east')).toEqual(['cobblestone'])
    expect(getBlockTextureNames('sandstone_stairs_south')).toEqual(['sandstone_normal'])
  })
})

describe('getFenceCollisionBoxesLocal', () => {
  it('returns only center post box for mask 0 (no connections)', () => {
    const boxes = getFenceCollisionBoxesLocal(0)
    expect(boxes).toHaveLength(1)
    expect(boxes[0]).toEqual({
      minX: 0.375,
      minY: 0,
      minZ: 0.375,
      maxX: 0.625,
      maxY: 1.5,
      maxZ: 0.625,
    })
  })

  it('returns post plus one box per connected direction', () => {
    const maskNorth = 1
    const boxesNorth = getFenceCollisionBoxesLocal(maskNorth)
    expect(boxesNorth).toHaveLength(2)
    expect(boxesNorth[0].minZ).toBe(0.375)
    expect(boxesNorth[1].minZ).toBe(0)
    expect(boxesNorth[1].maxZ).toBe(0.5)

    const maskAll = 1 | 2 | 4 | 8
    const boxesAll = getFenceCollisionBoxesLocal(maskAll)
    expect(boxesAll).toHaveLength(5)
  })

  it('fence block type returns same as getFenceCollisionBoxesLocal(0)', () => {
    const fromType = getBlockCollisionBoxesLocal('oak_fence')
    const fromMask = getFenceCollisionBoxesLocal(0)
    expect(fromType).toEqual(fromMask)
  })
})

describe('getFenceConnectionMask', () => {
  it('returns 0 when all neighbors are air or unloaded', () => {
    const getBlock = () => 'air'
    expect(getFenceConnectionMask(0, 0, 0, getBlock)).toBe(0)
    const getNull = () => null
    expect(getFenceConnectionMask(0, 0, 0, getNull)).toBe(0)
  })

  it('sets North bit when neighbor at (bx, by, bz - 1) is fence', () => {
    const getBlock = (bx: number, _by: number, bz: number) =>
      bx === 0 && bz === -1 ? 'oak_fence' : 'air'
    expect(getFenceConnectionMask(0, 0, 0, getBlock)).toBe(1)
  })

  it('sets East bit when neighbor at (bx + 1, by, bz) is solid', () => {
    const getBlock = (bx: number, _by: number, bz: number) =>
      bx === 1 && bz === 0 ? 'stone' : 'air'
    expect(getFenceConnectionMask(0, 0, 0, getBlock)).toBe(4)
  })

  it('returns combined mask for multiple connections', () => {
    const getBlock = (bx: number, _by: number, bz: number) => {
      if (bz === -1) return 'oak_fence'
      if (bx === 1) return 'dirt'
      return 'air'
    }
    expect(getFenceConnectionMask(0, 0, 0, getBlock)).toBe(1 | 4)
  })
})
