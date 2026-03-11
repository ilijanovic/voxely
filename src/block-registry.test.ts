/**
 * Contract tests: terrain block-ids vs block-registry, and save VALID_BLOCK_TYPES consistency.
 */
import { describe, it, expect } from 'vitest'
import { ID_TO_TYPE } from './terrain/block-ids'
import { getBlockDefinition, getBlockHeight } from './block-registry'
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
