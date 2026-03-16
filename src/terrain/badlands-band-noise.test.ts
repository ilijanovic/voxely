/**
 * Tests for badlands-band-noise: shared world-Y strata sampler used by worker and main thread.
 */
import { describe, it, expect } from 'vitest'
import { getBadlandsBandNoise } from './badlands-band-noise'

const WX = 128
const WZ = -64
const Y_LOW = 70
const Y_HIGH = 90
const MIN_NOISE = 0
const MAX_NOISE_EXCLUSIVE = 1

/**
 * Noise stub that always returns 0 (middle of [-1, 1] after normalization).
 *
 * @returns 0
 */
function zeroNoise(): number {
  return 0
}

/**
 * Deterministic synthetic noise used in tests.
 *
 * @param x - Sample X
 * @param z - Sample Z
 * @returns Smooth value in [-1, 1]
 */
function syntheticNoise(x: number, z: number): number {
  return Math.sin(x * 0.11 + z * 0.07)
}

describe('getBadlandsBandNoise', () => {
  it('returns values in [0, 1)', () => {
    for (let y = 40; y <= 120; y++) {
      const value = getBadlandsBandNoise(WX, WZ, y, syntheticNoise)
      expect(value).toBeGreaterThanOrEqual(MIN_NOISE)
      expect(value).toBeLessThan(MAX_NOISE_EXCLUSIVE)
    }
  })

  it('changes with world Y at fixed XZ (horizontal strata behavior)', () => {
    const low = getBadlandsBandNoise(WX, WZ, Y_LOW, zeroNoise)
    const high = getBadlandsBandNoise(WX, WZ, Y_HIGH, zeroNoise)
    expect(high).not.toBe(low)
  })

  it('changes with XZ due to warp/noise jitter at fixed world Y', () => {
    const a = getBadlandsBandNoise(WX, WZ, Y_LOW, syntheticNoise)
    const b = getBadlandsBandNoise(WX + 256, WZ + 256, Y_LOW, syntheticNoise)
    expect(a).not.toBe(b)
  })
})
