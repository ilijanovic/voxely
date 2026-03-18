import { describe, it, expect } from 'vitest'
import { CROSS_GEOMETRY_BLOCK_TYPES } from './cross-geometry-block-types'

describe('CROSS_GEOMETRY_BLOCK_TYPES', () => {
  it('includes desert dead bush and cactus flower as cross-rendered plants', () => {
    expect(CROSS_GEOMETRY_BLOCK_TYPES).toContain('dead_bush')
    expect(CROSS_GEOMETRY_BLOCK_TYPES).toContain('cactus_flower')
  })

  it('keeps entries unique', () => {
    const unique = new Set(CROSS_GEOMETRY_BLOCK_TYPES)
    expect(unique.size).toBe(CROSS_GEOMETRY_BLOCK_TYPES.length)
  })
})
