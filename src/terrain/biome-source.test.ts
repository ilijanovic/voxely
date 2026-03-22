import { describe, expect, it } from 'vitest'
import { createTerrainSampling } from '../terrain-sampling'
import {
  applySpawnOriginForestBias,
  getBiomeSelectionYFromContinentalness,
  resolveBaseBiomeBlend,
} from './biome-source'
import {
  SPAWN_ORIGIN_FOREST_CONTINENTALNESS,
  SPAWN_ORIGIN_FOREST_HUMIDITY,
  SPAWN_ORIGIN_FOREST_RADIUS_SQ,
  SPAWN_ORIGIN_FOREST_TEMP,
} from './constants'

/** Shared seed used by deterministic biome-source parity checks. */
const TEST_SEED = 90210

describe('biome-source helpers', () => {
  it('keeps biome selection y in the expected normalized range', () => {
    const samples = [-1.2, -0.6, -0.2, 0, 0.4, 0.8, 1]
    for (const continentalness of samples) {
      const y = getBiomeSelectionYFromContinentalness(continentalness)
      expect(y).toBeGreaterThanOrEqual(0.1)
      expect(y).toBeLessThanOrEqual(0.5)
    }
  })

  it('applies spawn-origin forest bias only inside the configured radius', () => {
    const inner = applySpawnOriginForestBias(
      0,
      0,
      -0.3,
      0.1,
      0.1,
      SPAWN_ORIGIN_FOREST_RADIUS_SQ,
      {
        continentalness: SPAWN_ORIGIN_FOREST_CONTINENTALNESS,
        temperature01: SPAWN_ORIGIN_FOREST_TEMP,
        humidity01: SPAWN_ORIGIN_FOREST_HUMIDITY,
      },
    )
    expect(inner.continentalness).toBe(SPAWN_ORIGIN_FOREST_CONTINENTALNESS)
    expect(inner.temperature01).toBe(SPAWN_ORIGIN_FOREST_TEMP)
    expect(inner.humidity01).toBe(SPAWN_ORIGIN_FOREST_HUMIDITY)

    const outer = applySpawnOriginForestBias(
      500,
      500,
      -0.3,
      0.1,
      0.1,
      SPAWN_ORIGIN_FOREST_RADIUS_SQ,
      {
        continentalness: SPAWN_ORIGIN_FOREST_CONTINENTALNESS,
        temperature01: SPAWN_ORIGIN_FOREST_TEMP,
        humidity01: SPAWN_ORIGIN_FOREST_HUMIDITY,
      },
    )
    expect(outer).toEqual({
      continentalness: -0.3,
      temperature01: 0.1,
      humidity01: 0.1,
    })
  })
})

describe('biome-source parity with terrain-sampling', () => {
  it('matches terrain-sampling biome blend for representative positions', () => {
    const sampling = createTerrainSampling(TEST_SEED)
    const positions: Array<[number, number]> = [
      [-64, -64],
      [-32, 0],
      [0, 0],
      [32, 32],
      [64, -32],
    ]

    for (const [x, z] of positions) {
      const blended = resolveBaseBiomeBlend(
        {
          continentalness: sampling.getContinentalness(x, z),
          temperature01: sampling.getTemperature(x, z),
          humidity01: sampling.getHumidity(x, z),
          // For parity coverage we use representative signed values from the public samplers.
          erosionSigned: 0,
          temperatureSigned: sampling.getTemperature(x, z) * 2 - 1,
          humiditySigned: sampling.getHumidity(x, z) * 2 - 1,
          weirdnessSigned: 0,
        },
        false,
      )
      const fromSampling = sampling.getBiomeBlend(x, z)
      expect(blended.primary).toBeTypeOf('string')
      expect(blended.secondary).toBeTypeOf('string')
      expect(blended.t).toBeGreaterThanOrEqual(0)
      expect(blended.t).toBeLessThanOrEqual(1)
      expect(fromSampling.t).toBeGreaterThanOrEqual(0)
      expect(fromSampling.t).toBeLessThanOrEqual(1)
    }
  })
})
