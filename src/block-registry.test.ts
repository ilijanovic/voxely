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
})
