import { describe, it, expect } from 'vitest'
import {
  BADLANDS_VALLEY_MASK_FLOOR_MAX,
  HEIGHT_EXTREME_CLIFF_SOFTEN_MAX_BLEND,
  HEIGHT_EXTREME_CLIFF_SOFTEN_START,
  MOUNTAIN_CORE_BLEND_MIN_STRENGTH,
  MACRO_TERRAIN_DEEP_OCEAN_MAX,
  MACRO_TERRAIN_FAR_INLAND_MIN,
  MACRO_TERRAIN_MID_INLAND_MIN,
  MACRO_TERRAIN_NEAR_INLAND_MIN,
  OCEAN_CONTINENTALNESS_THRESHOLD,
} from './constants'
import {
  getBadlandsBlendFactor,
  getBadlandsValleyFactor,
  getCoreMountainBlendWeight,
  getMacroTerrainOffset,
  getMountainBlendStrength,
  softenExtremeCliffHeight,
} from './height-shaping'

const BLEND_HALF = 0.5
const NO_EROSION = -1
const STRONG_EROSION = 0.9
const LOW_MOUNTAIN_MASK = 0.08
const HIGH_MOUNTAIN_MASK = BADLANDS_VALLEY_MASK_FLOOR_MAX + 0.2
const CENTER_HEIGHT = 120
const NORTH_HEIGHT = 119
const SOUTH_HEIGHT = 121
const EAST_HEIGHT = 118
const WEST_HEIGHT = 120
const SMOOTHED_HEIGHT = 119.75
const EXTREME_NORTH_HEIGHT = 70
const EXTREME_SMOOTHED_HEIGHT = 110

describe('getMacroTerrainOffset', () => {
  it('matches key macro profile knots', () => {
    expect(getMacroTerrainOffset(-1.2)).toBe(-24)
    expect(getMacroTerrainOffset(MACRO_TERRAIN_DEEP_OCEAN_MAX)).toBe(-24)
    expect(getMacroTerrainOffset(OCEAN_CONTINENTALNESS_THRESHOLD)).toBe(-10)
    expect(getMacroTerrainOffset(MACRO_TERRAIN_NEAR_INLAND_MIN)).toBe(2)
    expect(getMacroTerrainOffset(MACRO_TERRAIN_MID_INLAND_MIN)).toBe(16)
    expect(getMacroTerrainOffset(MACRO_TERRAIN_FAR_INLAND_MIN)).toBe(26)
    expect(getMacroTerrainOffset(1)).toBe(26)
  })

  it('is non-decreasing across continentalness', () => {
    let prev = getMacroTerrainOffset(-1.2)
    for (let c = -1.15; c <= 1; c += 0.05) {
      const current = getMacroTerrainOffset(c)
      expect(current).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = current
    }
  })
})

describe('badlands shaping helpers', () => {
  it('computes badlands blend factor from primary/secondary blend', () => {
    expect(getBadlandsBlendFactor('badlands', 'plains', BLEND_HALF)).toBeCloseTo(BLEND_HALF)
    expect(getBadlandsBlendFactor('plains', 'badlands', BLEND_HALF)).toBeCloseTo(BLEND_HALF)
    expect(getBadlandsBlendFactor('plains', 'forest', BLEND_HALF)).toBe(0)
  })

  it('produces stronger valley factor on low-mask, high-erosion badlands floors', () => {
    const lowMaskHighErosion = getBadlandsValleyFactor(1, LOW_MOUNTAIN_MASK, STRONG_EROSION)
    const highMaskHighErosion = getBadlandsValleyFactor(1, HIGH_MOUNTAIN_MASK, STRONG_EROSION)
    const lowMaskLowErosion = getBadlandsValleyFactor(1, LOW_MOUNTAIN_MASK, NO_EROSION)
    expect(lowMaskHighErosion).toBeGreaterThan(highMaskHighErosion)
    expect(lowMaskHighErosion).toBeGreaterThan(lowMaskLowErosion)
    expect(lowMaskHighErosion).toBeGreaterThan(0)
  })
})

describe('softenExtremeCliffHeight', () => {
  it('keeps regular slopes unchanged below the softening threshold', () => {
    const unchanged = softenExtremeCliffHeight({
      center: CENTER_HEIGHT,
      north: NORTH_HEIGHT,
      south: SOUTH_HEIGHT,
      east: EAST_HEIGHT,
      west: WEST_HEIGHT,
      smoothed: SMOOTHED_HEIGHT,
    })
    expect(unchanged).toBe(SMOOTHED_HEIGHT)
  })

  it('softens extreme cliffs toward the cardinal neighborhood average', () => {
    const softened = softenExtremeCliffHeight({
      center: CENTER_HEIGHT,
      north: EXTREME_NORTH_HEIGHT,
      south: SOUTH_HEIGHT,
      east: EAST_HEIGHT,
      west: WEST_HEIGHT,
      smoothed: EXTREME_SMOOTHED_HEIGHT,
    })
    const cardinalAverage =
      (EXTREME_NORTH_HEIGHT + SOUTH_HEIGHT + EAST_HEIGHT + WEST_HEIGHT) * 0.25
    const expected =
      EXTREME_SMOOTHED_HEIGHT +
      (cardinalAverage - EXTREME_SMOOTHED_HEIGHT) * HEIGHT_EXTREME_CLIFF_SOFTEN_MAX_BLEND
    expect(Math.abs(CENTER_HEIGHT - EXTREME_NORTH_HEIGHT)).toBeGreaterThan(
      HEIGHT_EXTREME_CLIFF_SOFTEN_START,
    )
    expect(softened).toBeCloseTo(expected)
  })
})

describe('mountain blend shaping', () => {
  it('computes core mountain blend weight from primary/secondary blend', () => {
    expect(getCoreMountainBlendWeight('forest', 'mountain', 0.25)).toBeCloseTo(0.25)
    expect(getCoreMountainBlendWeight('mountain', 'snow', 0.4)).toBe(1)
    expect(getCoreMountainBlendWeight('forest', 'jungle', 0.5)).toBe(0)
  })

  it('attenuates mountain uplift on low-core transition blends', () => {
    const edgeStrength = getMountainBlendStrength('forest', 'mountain', 0.261)
    expect(edgeStrength).toBeGreaterThan(MOUNTAIN_CORE_BLEND_MIN_STRENGTH)
    expect(edgeStrength).toBeLessThan(1)
    expect(getMountainBlendStrength('mountain', 'snow', 0.4)).toBe(1)
  })
})
