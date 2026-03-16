import { describe, it, expect } from 'vitest'
import {
  BADLANDS_VALLEY_MASK_FLOOR_MAX,
  MACRO_TERRAIN_DEEP_OCEAN_MAX,
  MACRO_TERRAIN_FAR_INLAND_MIN,
  MACRO_TERRAIN_MID_INLAND_MIN,
  MACRO_TERRAIN_NEAR_INLAND_MIN,
  OCEAN_CONTINENTALNESS_THRESHOLD,
} from './constants'
import { getBadlandsBlendFactor, getBadlandsValleyFactor, getMacroTerrainOffset } from './height-shaping'

const BLEND_HALF = 0.5
const NO_EROSION = -1
const STRONG_EROSION = 0.9
const LOW_MOUNTAIN_MASK = 0.08
const HIGH_MOUNTAIN_MASK = BADLANDS_VALLEY_MASK_FLOOR_MAX + 0.2

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
