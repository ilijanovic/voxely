/**
 * Mountain peak alignment tests.
 *
 * These tests keep the current terrain model closer to Minecraft's mountain feel:
 * peak bands should come from the weirdness signal, jagged peaks should prefer the
 * sharp negative branch, and frozen peaks should remain tied to mountain chains.
 */
import { describe, expect, it } from 'vitest'
import { createTerrainSampling } from '../terrain-sampling'
import { getBiomeByMultiNoise } from './biomes'
import { getJaggedPeakFactor, getPeakBandFactor, getRidgeTerm } from './height-shaping'

const FULL_MOUNTAIN_FACTOR = 1
const PEAK_BAND_WEIRDNESS = 1.16
const SAMPLE_STEP = 32
const SAMPLE_RADIUS = 1536
const SAMPLE_SEEDS = [42, 12345]
const PEAK_BASE_BIOMES = new Set(['mountain', 'snow'])

/**
 * Counts resolved peak biomes in a sampled square region.
 *
 * @param seed - World seed used for sampling
 * @returns Total count of resolved jagged peaks
 */
function countJaggedPeaks(seed: number): number {
  const terrain = createTerrainSampling(seed)
  let total = 0
  for (let x = -SAMPLE_RADIUS; x <= SAMPLE_RADIUS; x += SAMPLE_STEP) {
    for (let z = -SAMPLE_RADIUS; z <= SAMPLE_RADIUS; z += SAMPLE_STEP) {
      if (terrain.getResolvedBiome(x, z, terrain.getSmoothedHeight) === 'jagged_peaks') total += 1
    }
  }
  return total
}

describe('height shaping', () => {
  it('treats weirdness peak bands as taller than the neutral center', () => {
    expect(getPeakBandFactor(PEAK_BAND_WEIRDNESS)).toBeGreaterThan(getPeakBandFactor(0))
    expect(getPeakBandFactor(-PEAK_BAND_WEIRDNESS)).toBeGreaterThan(getPeakBandFactor(0))
  })

  it('gives negative weirdness ridges the sharpest peak boost', () => {
    const neutral = getRidgeTerm(0, FULL_MOUNTAIN_FACTOR)
    const frozenBranch = getRidgeTerm(PEAK_BAND_WEIRDNESS, FULL_MOUNTAIN_FACTOR)
    const jaggedBranch = getRidgeTerm(-PEAK_BAND_WEIRDNESS, FULL_MOUNTAIN_FACTOR)

    expect(frozenBranch).toBeGreaterThan(neutral)
    expect(jaggedBranch).toBeGreaterThan(frozenBranch)
    expect(getJaggedPeakFactor(-PEAK_BAND_WEIRDNESS)).toBeGreaterThan(
      getJaggedPeakFactor(PEAK_BAND_WEIRDNESS),
    )
  })
})

describe('peak biome multi-noise selection', () => {
  it('selects frozen, jagged, and stony peaks from their tuned peak centers', () => {
    expect(
      getBiomeByMultiNoise({
        continentalness: 0.516,
        erosion: -0.3,
        temperature: -0.78,
        humidity: 0.22,
        weirdness: 0.72,
        y: 0.86,
      }),
    ).toBe('frozen_peaks')

    expect(
      getBiomeByMultiNoise({
        continentalness: 0.516,
        erosion: -0.86,
        temperature: -0.18,
        humidity: 0.25,
        weirdness: -0.82,
        y: 0.86,
      }),
    ).toBe('jagged_peaks')

    expect(
      getBiomeByMultiNoise({
        continentalness: 0.516,
        erosion: -0.55,
        temperature: 0.42,
        humidity: -0.55,
        weirdness: 0.18,
        y: 0.84,
      }),
    ).toBe('stony_peaks')
  })
})

describe('resolved peak biomes', () => {
  it('keeps frozen peaks attached to mountain and snowy base biomes', () => {
    for (const seed of SAMPLE_SEEDS) {
      const terrain = createTerrainSampling(seed)
      for (let x = -SAMPLE_RADIUS; x <= SAMPLE_RADIUS; x += SAMPLE_STEP) {
        for (let z = -SAMPLE_RADIUS; z <= SAMPLE_RADIUS; z += SAMPLE_STEP) {
          const resolved = terrain.getResolvedBiome(x, z, terrain.getSmoothedHeight)
          if (resolved !== 'frozen_peaks') continue
          expect(PEAK_BASE_BIOMES.has(terrain.getBiome(x, z))).toBe(true)
        }
      }
    }
  })

  it('produces jagged peaks in a large cold mountain sample', () => {
    const total = SAMPLE_SEEDS.reduce((sum, seed) => sum + countJaggedPeaks(seed), 0)
    expect(total).toBeGreaterThan(0)
  })
})
