/**
 * Tests for the noise stage: heightmap is filled with clamped integers in world bounds.
 */
import { describe, it, expect } from 'vitest'
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../../constants'
import { createChunkContext } from '../pipeline'
import { createStageNoise } from './noise'

describe('createStageNoise', () => {
  it('fills heightmap with clamped integers in world bounds', () => {
    const ctx = createChunkContext(0, 0, [])
    const stage = createStageNoise({ getHeight: () => 64 })
    stage(ctx)

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const h = ctx.heightmap[lx][lz]
        expect(Number.isInteger(h)).toBe(true)
        expect(h).toBeGreaterThanOrEqual(WORLD_MIN_Y)
        expect(h).toBeLessThanOrEqual(WORLD_MAX_Y)
      }
    }
    expect(ctx.heightmap[0][0]).toBe(64)
  })

  it('clamps height to WORLD_MIN_Y and WORLD_MAX_Y', () => {
    const ctxHigh = createChunkContext(0, 0, [])
    createStageNoise({ getHeight: () => 1e6 })(ctxHigh)
    expect(ctxHigh.heightmap[0][0]).toBe(WORLD_MAX_Y)

    const ctxLow = createChunkContext(0, 0, [])
    createStageNoise({ getHeight: () => -1e6 })(ctxLow)
    expect(ctxLow.heightmap[0][0]).toBe(WORLD_MIN_Y)
  })

  it('uses world coordinates for each column', () => {
    const ctx = createChunkContext(2, 3, [])
    const heights: Array<{ x: number; z: number; h: number }> = []
    const stage = createStageNoise({
      getHeight: (x, z) => {
        const h = x * 2 + z
        heights.push({ x, z, h })
        return h
      },
    })
    stage(ctx)

    const worldX = 2 * CHUNK_SIZE
    const worldZ = 3 * CHUNK_SIZE
    expect(ctx.heightmap[0][0]).toBe(worldX * 2 + worldZ)
    expect(heights.some(({ x, z }) => x === worldX && z === worldZ)).toBe(true)
  })
})
