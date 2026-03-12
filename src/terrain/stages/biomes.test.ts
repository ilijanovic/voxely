/**
 * Tests for the biomes stage: biomeMap is filled from heightmap and climate, with optional POI override.
 */
import { describe, it, expect } from 'vitest'
import type { Biome } from '../../types'
import { CHUNK_SIZE } from '../../constants'
import { createChunkContext } from '../pipeline'
import { createStageNoise } from './noise'
import { createStageBiomes } from './biomes'
import { BIOME_REGISTRY } from '../biomes'

const ALL_BIOMES: readonly Biome[] = Object.keys(BIOME_REGISTRY) as Biome[]

describe('createStageBiomes', () => {
  it('fills biomeMap from heightmap when run after noise stage', () => {
    const ctx = createChunkContext(0, 0, [])
    createStageNoise({ getHeight: () => 64 })(ctx)
    const stage = createStageBiomes({
      getBaseBiomeAt: () => 'plains',
      getResolvedBiomeFromHeight: () => 'plains',
    })
    stage(ctx)

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        expect(ctx.biomeMap[lx][lz]).toBe('plains')
        expect(ALL_BIOMES).toContain(ctx.biomeMap[lx][lz])
      }
    }
  })

  it('applies POI override when getPoiBiomeOverride returns a biome', () => {
    const ctx = createChunkContext(0, 0, [])
    createStageNoise({ getHeight: () => 64 })(ctx)
    const stage = createStageBiomes({
      getBaseBiomeAt: () => 'plains',
      getResolvedBiomeFromHeight: () => 'plains',
      getPoiBiomeOverride: (x, z) => (x === 5 && z === 5 ? 'desert' : null),
    })
    stage(ctx)

    expect(ctx.biomeMap[5][5]).toBe('desert')
    expect(ctx.biomeMap[0][0]).toBe('plains')
  })

  it('uses height from heightmap for getResolvedBiomeFromHeight', () => {
    const ctx = createChunkContext(0, 0, [])
    createStageNoise({ getHeight: (x, _z) => 64 + (x % 2) })(ctx)
    const resolved: Array<{ height: number; biome: Biome }> = []
    const stage = createStageBiomes({
      getBaseBiomeAt: () => 'forest',
      getResolvedBiomeFromHeight: (base, height, _x, _z) => {
        const biome = height > 64 ? 'mountain' : base
        resolved.push({ height, biome })
        return biome
      },
    })
    stage(ctx)

    expect(resolved.length).toBe(CHUNK_SIZE * CHUNK_SIZE)
    expect(resolved.some((r) => r.biome === 'mountain')).toBe(true)
  })
})
