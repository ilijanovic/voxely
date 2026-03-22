import { describe, it, expect } from 'vitest'
import { getAllBlockIds, getBlockDefinition } from '../../block-registry'
import type { BlockType } from '../../types'
import { CROSS_GEOMETRY_BLOCK_TYPES } from './cross-geometry-block-types'

/** Returns all block ids marked as crossGeometry in the block registry. */
function getRegistryCrossGeometryBlockTypes(): BlockType[] {
  return getAllBlockIds().filter((id): id is BlockType => getBlockDefinition(id)?.crossGeometry === true)
}

describe('CROSS_GEOMETRY_BLOCK_TYPES', () => {
  it('includes poppy for flower rendering', () => {
    expect(CROSS_GEOMETRY_BLOCK_TYPES).toContain('poppy')
  })

  it('stays in sync with block registry crossGeometry definitions', () => {
    const expected = new Set(getRegistryCrossGeometryBlockTypes())
    const actual = new Set(CROSS_GEOMETRY_BLOCK_TYPES)
    expect(actual).toEqual(expected)
  })
})
