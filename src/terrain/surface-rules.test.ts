/**
 * Tests for shared surface rules (height-to-stone, biome exemptions, grass_snow).
 * Ensures getSurfaceBlockFromRules stays the single source of truth and catches drift.
 */
import { describe, it, expect } from 'vitest'
import { WATER_LEVEL } from '../constants'
import {
  MOUNTAIN_STONE_SURFACE_HEIGHT,
  SURFACE_STONE_HEIGHT,
} from './surface-constants'
import { getSurfaceBlockFromRules } from './surface-rules'

describe('getSurfaceBlockFromRules', () => {
  it('returns grass for jungle at high Y (exempt from global_height_to_stone)', () => {
    const topY = SURFACE_STONE_HEIGHT + 7
    expect(getSurfaceBlockFromRules('jungle', topY, 'grass')).toBe('grass')
  })

  it('returns stone for plains at Y >= SURFACE_STONE_HEIGHT', () => {
    const topY = SURFACE_STONE_HEIGHT
    expect(getSurfaceBlockFromRules('plains', topY, 'grass')).toBe('stone')
  })

  it('returns stone for forest at Y above surface stone height', () => {
    expect(getSurfaceBlockFromRules('forest', 97, 'grass')).toBe('stone')
  })

  it('returns grass for plains below SURFACE_STONE_HEIGHT', () => {
    const topY = SURFACE_STONE_HEIGHT - 1
    expect(getSurfaceBlockFromRules('plains', topY, 'grass')).toBe('grass')
  })

  it('returns stone for mountain at Y >= MOUNTAIN_STONE_SURFACE_HEIGHT', () => {
    const topY = MOUNTAIN_STONE_SURFACE_HEIGHT
    expect(getSurfaceBlockFromRules('mountain', topY, 'grass')).toBe('stone')
  })

  it('returns snow for frozen_peaks when no slope/noise options (default)', () => {
    const topY = WATER_LEVEL + 35
    expect(getSurfaceBlockFromRules('frozen_peaks', topY, 'snow')).toBe('snow')
  })

  it('returns grass_snow for forest at high elevation (not in BIOMES_WITHOUT_GRASS_SNOW)', () => {
    const topY = WATER_LEVEL + 25
    expect(getSurfaceBlockFromRules('forest', topY, 'grass')).toBe('grass_snow')
  })

  it('returns grass_savanna for savanna with grass surface', () => {
    expect(getSurfaceBlockFromRules('savanna', 70, 'grass')).toBe('grass_savanna')
  })

  it('returns grass_snow when effectiveSurface is grass and hasSnowNeighbor', () => {
    expect(
      getSurfaceBlockFromRules('plains', 70, 'grass', { hasSnowNeighbor: true }),
    ).toBe('grass_snow')
  })
})
