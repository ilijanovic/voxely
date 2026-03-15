/**
 * Macro-terrain profile regression tests.
 *
 * These tests intentionally avoid exact snapshots; instead they assert broad,
 * Minecraft-like statistical properties of the terrain so tuning stays stable
 * while still allowing small/local changes.
 */
import { describe, it, expect } from 'vitest'
import { createTerrainSampling } from '../terrain-sampling'
import { WATER_LEVEL } from '../constants'
import { OCEAN_CONTINENTALNESS_THRESHOLD } from './constants'

/** Inclusive integer range helper. */
function rangeIntInclusive(min: number, max: number): number[] {
  const out: number[] = []
  for (let i = min; i <= max; i++) out.push(i)
  return out
}

/**
 * Samples a square grid of points with a fixed step for stable distribution checks.
 *
 * @param radius - Radius in blocks from origin
 * @param step - Sampling step in blocks
 * @returns Array of world (x,z) points
 */
function buildGrid(radius: number, step: number): Array<{ x: number; z: number }> {
  const coords = rangeIntInclusive(-radius, radius)
  const out: Array<{ x: number; z: number }> = []
  for (const x of coords) {
    if (x % step !== 0) continue
    for (const z of coords) {
      if (z % step !== 0) continue
      out.push({ x, z })
    }
  }
  return out
}

/**
 * Computes basic stats for a list of numbers.
 *
 * @param values - Input values
 * @returns min/max/mean
 */
function stats(values: number[]): { min: number; max: number; mean: number } {
  let min = Infinity
  let max = -Infinity
  let sum = 0
  for (const v of values) {
    min = Math.min(min, v)
    max = Math.max(max, v)
    sum += v
  }
  return { min, max, mean: values.length > 0 ? sum / values.length : 0 }
}

describe('macro terrain profile', () => {
  it('has a stable ocean/land split away from spawn bias', () => {
    const seed = 12345
    const t = createTerrainSampling(seed)

    // Sample far enough that spawn-origin forest bias does not dominate.
    const radius = 2048
    const step = 32
    const points = buildGrid(radius, step)

    let ocean = 0
    let land = 0
    for (const p of points) {
      const c = t.getContinentalness(p.x, p.z)
      if (c < OCEAN_CONTINENTALNESS_THRESHOLD) ocean++
      else land++
    }

    const total = ocean + land
    const oceanFrac = total > 0 ? ocean / total : 0

    // Broad invariants: overworld should have significant oceans but not be mostly ocean.
    expect(oceanFrac).toBeGreaterThan(0.3)
    expect(oceanFrac).toBeLessThan(0.55)
  })

  it('produces plausible height ranges (sea level centered, peaks exist)', () => {
    const seed = 99999
    const t = createTerrainSampling(seed)

    const radius = 1024
    const step = 16
    const points = buildGrid(radius, step)

    const heights: number[] = []
    for (const p of points) heights.push(t.getSmoothedHeight(p.x, p.z))

    const s = stats(heights)

    // The mean should be near sea level (BASE_HEIGHT == WATER_LEVEL) for 1.18+ feel.
    expect(s.mean).toBeGreaterThan(WATER_LEVEL - 20)
    expect(s.mean).toBeLessThan(WATER_LEVEL + 30)

    // Ensure both low (ocean basins) and high (mountains/peaks) exist in a large region.
    expect(s.min).toBeLessThan(WATER_LEVEL - 8)
    expect(s.max).toBeGreaterThan(WATER_LEVEL + 55)
  })
})
