import { describe, expect, it } from 'vitest'
import { WATER_LEVEL } from '../constants'
import {
  BEACH_GRAVEL_PATCH_NOISE_MAX,
  BEACH_GRAVEL_PATCH_SLOPE_MIN,
  RIVER_BANK_GRAVEL_SLOPE_MIN,
  RIVER_BANK_NEAR_WATER_GRAVEL_NOISE_MAX,
  RIVER_BANK_SAND_MAX_HEIGHT,
  RIVER_BANK_UPPER_GRAVEL_NOISE_MAX,
  STONY_SHORE_STONE_NOISE_MIN,
} from './surface-constants'
import { resolveSurfaceBlock } from './surface-resolver'

const BASE_ARGS = {
  biome: 'river' as const,
  blend: { primary: 'plains' as const, secondary: 'plains' as const, t: 0 },
  slope: 0,
  ditherNoiseCoast: 1,
  ditherNoiseLand: 1,
  riverBankNoise: 0.5,
  frozenPeaksNoiseN: 0.5,
  frozenPeaksNoiseBlob: 0.5,
  hasSnowNeighbor: false,
}

describe('resolveSurfaceBlock river banks', () => {
  it('prefers gravel near water when river bank noise is low', () => {
    const block = resolveSurfaceBlock({
      ...BASE_ARGS,
      topY: RIVER_BANK_SAND_MAX_HEIGHT,
      riverBankNoise: RIVER_BANK_NEAR_WATER_GRAVEL_NOISE_MAX - 0.01,
    })
    expect(block).toBe('gravel')
  })

  it('keeps sand near water when river bank noise is higher on gentle banks', () => {
    const block = resolveSurfaceBlock({
      ...BASE_ARGS,
      topY: RIVER_BANK_SAND_MAX_HEIGHT,
      riverBankNoise: RIVER_BANK_NEAR_WATER_GRAVEL_NOISE_MAX + 0.01,
    })
    expect(block).toBe('sand')
  })

  it('prefers gravel on steep river banks even with high noise', () => {
    const block = resolveSurfaceBlock({
      ...BASE_ARGS,
      topY: RIVER_BANK_SAND_MAX_HEIGHT,
      slope: RIVER_BANK_GRAVEL_SLOPE_MIN,
      riverBankNoise: 0.95,
    })
    expect(block).toBe('gravel')
  })

  it('uses upper-bank gravel threshold above near-water band', () => {
    const block = resolveSurfaceBlock({
      ...BASE_ARGS,
      topY: WATER_LEVEL + 5,
      riverBankNoise: RIVER_BANK_UPPER_GRAVEL_NOISE_MAX - 0.01,
    })
    expect(block).toBe('gravel')
  })
})

describe('resolveSurfaceBlock coastal edge biomes', () => {
  it('keeps stony_shore as stone/gravel instead of collapsing to sand in ocean blend', () => {
    const stony = resolveSurfaceBlock({
      ...BASE_ARGS,
      biome: 'stony_shore',
      topY: WATER_LEVEL + 1,
      blend: { primary: 'ocean', secondary: 'mountain', t: 0.8 },
      ditherNoiseLand: STONY_SHORE_STONE_NOISE_MIN + 0.01,
      ditherNoiseCoast: 0.1,
    })
    expect(stony).toBe('stone')
  })

  it('allows gravel pockets on steeper beaches with low noise', () => {
    const beach = resolveSurfaceBlock({
      ...BASE_ARGS,
      biome: 'beach',
      topY: WATER_LEVEL + 1,
      slope: BEACH_GRAVEL_PATCH_SLOPE_MIN,
      ditherNoiseLand: BEACH_GRAVEL_PATCH_NOISE_MAX - 0.01,
    })
    expect(beach).toBe('gravel')
  })
})
