import { describe, expect, it } from 'vitest'
import { WATER_LEVEL } from '../constants'
import { RIVER_BIOME_FACTOR_THRESHOLD } from './constants'
import {
  applyFrozenRiverHeight,
  carveRiverHeight,
  getRiverCarveFactor,
  shouldUseFrozenRiver,
} from './river-shaping'

describe('getRiverCarveFactor', () => {
  it('widens channels where primary and secondary signals overlap (confluence)', () => {
    const baseInputs = {
      signalAbs: 0.04,
      widthNoise01: 0.5,
      continentalness: 0.35,
      baseHeight: WATER_LEVEL + 2,
    }

    const withoutConfluence = getRiverCarveFactor({
      ...baseInputs,
      secondarySignalAbs: 0.8,
    })
    const withConfluence = getRiverCarveFactor({
      ...baseInputs,
      secondarySignalAbs: 0.04,
    })

    expect(withConfluence).toBeGreaterThan(withoutConfluence)
  })
})

describe('shouldUseFrozenRiver', () => {
  it('returns true for cold, strong, low-altitude river cores with high rare-noise', () => {
    expect(
      shouldUseFrozenRiver({
        temperature01: 0.1,
        riverFactor: 0.9,
        carvedHeight: WATER_LEVEL,
        rareNoise01: 0.95,
      }),
    ).toBe(true)
  })

  it('returns false when any freezing gate fails', () => {
    expect(
      shouldUseFrozenRiver({
        temperature01: 0.4,
        riverFactor: 0.9,
        carvedHeight: WATER_LEVEL,
        rareNoise01: 0.95,
      }),
    ).toBe(false)

    expect(
      shouldUseFrozenRiver({
        temperature01: 0.1,
        riverFactor: 0.2,
        carvedHeight: WATER_LEVEL,
        rareNoise01: 0.95,
      }),
    ).toBe(false)

    expect(
      shouldUseFrozenRiver({
        temperature01: 0.1,
        riverFactor: 0.9,
        carvedHeight: WATER_LEVEL + 20,
        rareNoise01: 0.95,
      }),
    ).toBe(false)

    expect(
      shouldUseFrozenRiver({
        temperature01: 0.1,
        riverFactor: 0.9,
        carvedHeight: WATER_LEVEL,
        rareNoise01: 0.2,
      }),
    ).toBe(false)
  })
})

describe('applyFrozenRiverHeight', () => {
  it('clamps frozen river surfaces to water level', () => {
    expect(applyFrozenRiverHeight(WATER_LEVEL - 4, true)).toBe(WATER_LEVEL)
    expect(applyFrozenRiverHeight(WATER_LEVEL + 1, true)).toBe(WATER_LEVEL + 1)
  })

  it('leaves non-frozen rivers unchanged', () => {
    expect(applyFrozenRiverHeight(WATER_LEVEL - 4, false)).toBe(WATER_LEVEL - 4)
  })
})

describe('carveRiverHeight', () => {
  it('clamps river-biome columns to sea level so channels can hold visible water', () => {
    const carved = carveRiverHeight(WATER_LEVEL + 16, RIVER_BIOME_FACTOR_THRESHOLD, 0)
    expect(carved).toBeLessThanOrEqual(WATER_LEVEL)
  })
})
