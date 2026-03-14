import { describe, it, expect } from 'vitest'
import { createTerrainSampling } from '../terrain-sampling'

/**
 * Simple diagnostic/regression test for ocean vs. land balance.
 *
 * It samples a square area around the world origin for a fixed seed and
 * computes the fraction of columns whose base biome is `ocean`. This is
 * intentionally coarse but gives a stable signal when tuning
 * continentalness / ocean thresholds.
 */
describe('terrain ocean balance', () => {
  it('measures reasonable ocean fraction around origin', () => {
    const seed = 12345
    const sampling = createTerrainSampling(seed)

    const min = -4096
    const max = 4096
    const step = 64

    let total = 0
    let ocean = 0

    for (let x = min; x <= max; x += step) {
      for (let z = min; z <= max; z += step) {
        total += 1
        const biome = sampling.getBiome(x, z)
        if (biome === 'ocean') {
          ocean += 1
        }
      }
    }

    const oceanFraction = ocean / total

    // Log for manual inspection when tuning.
    // eslint-disable-next-line no-console
    console.log(
      `[terrain-ocean-balance] seed=${seed} area=[${min},${max}] step=${step} -> oceanFraction=${oceanFraction.toFixed(
        3,
      )}`,
    )

    // Expected band after tuning: keep oceans significant but not dominant.
    expect(oceanFraction).toBeGreaterThan(0.25)
    expect(oceanFraction).toBeLessThan(0.6)
  })

  it('does not produce extremely long pure-ocean stretches along a line', () => {
    const seed = 12345
    const sampling = createTerrainSampling(seed)

    const z = 0
    const minX = -16384
    const maxX = 16384
    const step = 64

    let currentRun = 0
    let maxRun = 0

    for (let x = minX; x <= maxX; x += step) {
      const biome = sampling.getBiome(x, z)
      if (biome === 'ocean') {
        currentRun += 1
      } else {
        if (currentRun > maxRun) maxRun = currentRun
        currentRun = 0
      }
    }
    if (currentRun > maxRun) maxRun = currentRun

    const maxRunDistance = maxRun * step

    // We allow large oceans, but assert that auf einer geraden Linie
    // kein endloser Ozean ohne Landpassagen entsteht.
    expect(maxRunDistance).toBeLessThanOrEqual(4096)
  })
})

