/**
 * Tests for directional block textures (`type: 'faces'`) and texture-variant wiring.
 */
import { describe, it, expect } from 'vitest'
import {
  getBlockAllTextureNames,
  getBlockBaseSixTextureNames,
  getBlockFaceTextureVariants,
  getBlockTextureNames,
} from './block-registry'

const MIN_GRASS_TOP_VARIANTS = 2

describe('Directional textures + variants', () => {
  it('getBlockBaseSixTextureNames maps faces into BoxGeometry order (grass)', () => {
    const six = getBlockBaseSixTextureNames('grass')
    expect(six).toBeTruthy()
    // BoxGeometry order: [right(+X), left(-X), top(+Y), bottom(-Y), front(+Z), back(-Z)].
    expect(six).toEqual([
      'grass_block_side',
      'grass_block_side',
      'grass_block_top',
      'dirt',
      'grass_block_side',
      'grass_block_side',
    ])
  })

  it('getBlockFaceTextureVariants exposes top variants for grass', () => {
    const faces = getBlockFaceTextureVariants('grass')
    expect(faces).toBeTruthy()
    expect(faces!.top[0]).toBe('grass_block_top')
    expect(faces!.bottom[0]).toBe('dirt')
    expect(faces!.east[0]).toBe('grass_block_side')
    expect(faces!.top.length).toBeGreaterThanOrEqual(MIN_GRASS_TOP_VARIANTS)
  })

  it('getBlockAllTextureNames includes declared variants (grass)', () => {
    const names = getBlockAllTextureNames('grass')
    expect(names).toContain('grass_block_top')
    expect(names).toContain('grass_block_top_1')
    expect(names).toContain('grass_block_side')
    expect(names).toContain('dirt')
  })

  it('getBlockTextureNames returns only the base textures (grass)', () => {
    const names = getBlockTextureNames('grass')
    expect(names).toEqual([
      'grass_block_side',
      'grass_block_side',
      'grass_block_top',
      'dirt',
      'grass_block_side',
      'grass_block_side',
    ])
  })
})

