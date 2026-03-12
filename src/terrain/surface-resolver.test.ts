/**
 * Tests for surface-resolver: single source for surface block (underwater, shore, blend, badlands banding).
 */
import { describe, it, expect } from 'vitest'
import { WATER_LEVEL } from '../constants'
import { resolveSurfaceBlock } from './surface-resolver'

describe('resolveSurfaceBlock', () => {
  const baseParams = {
    topY: WATER_LEVEL + 10,
    biome: 'plains' as const,
    blend: { primary: 'plains' as const, secondary: 'plains' as const, t: 0 },
    slope: 0,
    frozenPeaksNoiseN: 0.5,
    frozenPeaksNoiseBlob: 0.5,
    hasSnowNeighbor: false,
  }

  it('returns underwater block when topY < WATER_LEVEL', () => {
    const block = resolveSurfaceBlock({
      ...baseParams,
      topY: WATER_LEVEL - 2,
      biome: 'plains',
    })
    expect(block).toBe('sand')
  })

  it('returns shore block when topY in shore band', () => {
    const block = resolveSurfaceBlock({
      ...baseParams,
      topY: WATER_LEVEL,
      biome: 'plains',
    })
    expect(block).toBe('sand')
  })

  it('badlands banding: noise 0 gives red_sand', () => {
    const block = resolveSurfaceBlock({
      ...baseParams,
      biome: 'badlands',
      badlandsBandNoise: 0,
    })
    expect(block).toBe('red_sand')
  })

  it('badlands banding: noise 0.25 gives sandstone', () => {
    const block = resolveSurfaceBlock({
      ...baseParams,
      biome: 'badlands',
      badlandsBandNoise: 0.25,
    })
    expect(block).toBe('sandstone')
  })

  it('badlands banding: noise 0.99 gives white_terracotta', () => {
    const block = resolveSurfaceBlock({
      ...baseParams,
      biome: 'badlands',
      badlandsBandNoise: 0.99,
    })
    expect(block).toBe('white_terracotta')
  })

  it('badlands without badlandsBandNoise uses default surface (red_sand)', () => {
    const block = resolveSurfaceBlock({
      ...baseParams,
      biome: 'badlands',
    })
    expect(block).toBe('red_sand')
  })
})
