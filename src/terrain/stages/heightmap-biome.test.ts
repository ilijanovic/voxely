/**
 * Tests for the single-pass heightmap+biome stage (createStage1).
 * Ensures heightmap and biomeMap are filled consistently; main pipeline uses separate noise + biomes stages.
 */
import { describe, it, expect } from 'vitest'
import type { Biome } from '../../types'
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../../constants'
import { createChunkContext } from '../pipeline'
import { createStage1, type Stage1Deps } from './heightmap-biome'
import { BIOME_REGISTRY } from '../biomes'

const ALL_BIOMES: readonly Biome[] = Object.keys(BIOME_REGISTRY) as Biome[]

function makeDeps(overrides?: Partial<Stage1Deps>): Stage1Deps {
  return {
    getBaseBiomeAt: () => 'plains',
    getHeightForBase: () => 64,
    getResolvedBiomeFromHeight: (_base, _height) => 'plains',
    getHeight: (x, z) => 64 + (x % 3) - (z % 2),
    ...overrides,
  }
}

describe('createStage1 (heightmap-biome)', () => {
  it('fills heightmap with clamped integers in world bounds', () => {
    const ctx = createChunkContext(0, 0, [])
    const stage = createStage1(makeDeps())
    stage(ctx)

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const h = ctx.heightmap[lx][lz]
        expect(Number.isInteger(h)).toBe(true)
        expect(h).toBeGreaterThanOrEqual(WORLD_MIN_Y)
        expect(h).toBeLessThanOrEqual(WORLD_MAX_Y)
      }
    }
  })

  it('fills biomeMap with resolved biomes from getResolvedBiomeFromHeight', () => {
    const ctx = createChunkContext(0, 0, [])
    const stage = createStage1(
      makeDeps({
        getBaseBiomeAt: (x) => (x % 2 === 0 ? 'plains' : 'forest'),
        getResolvedBiomeFromHeight: (base) => base,
      }),
    )
    stage(ctx)

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const biome = ctx.biomeMap[lx][lz]
        expect(ALL_BIOMES).toContain(biome)
      }
    }
  })

  it('applies POI override when getPoiBiomeOverride returns a biome', () => {
    const ctx = createChunkContext(0, 0, [])
    const stage = createStage1(
      makeDeps({
        getPoiBiomeOverride: (x, z) => (x === 5 && z === 5 ? 'desert' : null),
      }),
    )
    stage(ctx)

    expect(ctx.biomeMap[5][5]).toBe('desert')
    expect(ctx.biomeMap[0][0]).toBe('plains')
  })

  it('clamps height to WORLD_MIN_Y and WORLD_MAX_Y', () => {
    const ctx = createChunkContext(0, 0, [])
    const stage = createStage1(
      makeDeps({
        getHeight: () => 1e6,
      }),
    )
    stage(ctx)
    expect(ctx.heightmap[0][0]).toBe(WORLD_MAX_Y)

    const ctx2 = createChunkContext(0, 0, [])
    const stage2 = createStage1(
      makeDeps({
        getHeight: () => -1e6,
      }),
    )
    stage2(ctx2)
    expect(ctx2.heightmap[0][0]).toBe(WORLD_MIN_Y)
  })
})
