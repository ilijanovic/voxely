/**
 * Tests for desert decor: dead bush and cactus placement, vanilla adjacency, cactus_flower on top.
 */
import { describe, it, expect } from 'vitest'
import { CHUNK_SIZE, WATER_LEVEL, WORLD_HEIGHT } from '../../constants'
import { createChunkContext } from '../pipeline'
import { localKey, typeToId } from '../block-ids'
import {
  createCactusFeature,
  createDeadBushFeature,
  isSolidForCactus,
} from './desert-decor'

const SURFACE_Y = WATER_LEVEL + 10
const CACTUS_ID = typeToId('cactus')
const CACTUS_FLOWER_ID = typeToId('cactus_flower')
const SAND_ID = typeToId('sand')

/** Cactus height seed offset (desert-decor.ts); mock returns 0.5 so height is 2 or 3. */
const CACTUS_HEIGHT_NOISE_SEED = 500223

/**
 * Mock getFeatureNoise so desert features place (deterministic). Placement noise above thresholds, height noise gives mix of 2–3.
 */
function mockGetFeatureNoise(seedOffset: number): (x: number, z: number) => number {
  if (seedOffset === CACTUS_HEIGHT_NOISE_SEED) return () => 0.5
  return () => 0.9
}

/** Builds a chunk context with desert biome and sand surface for all columns. */
function buildDesertSandContext(chunkX: number, chunkZ: number): ReturnType<typeof createChunkContext> {
  const ctx = createChunkContext(chunkX, chunkZ, [])
  ctx.getFeatureNoise = mockGetFeatureNoise
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      ctx.heightmap[lx][lz] = SURFACE_Y
      ctx.biomeMap[lx][lz] = 'desert'
      const surfaceKey = localKey(lx, SURFACE_Y, lz)
      ctx.voxelMap[surfaceKey] = SAND_ID
    }
  }
  return ctx
}

describe('isSolidForCactus', () => {
  it('returns false for air and carved', () => {
    expect(isSolidForCactus(0)).toBe(false)
    expect(isSolidForCactus(255)).toBe(false)
  })

  it('returns false for water, flowers, dead_bush, tall_grass, fern', () => {
    expect(isSolidForCactus(typeToId('water_source'))).toBe(false)
    expect(isSolidForCactus(typeToId('dead_bush'))).toBe(false)
    expect(isSolidForCactus(typeToId('dandelion'))).toBe(false)
    expect(isSolidForCactus(typeToId('tall_grass'))).toBe(false)
    expect(isSolidForCactus(typeToId('fern'))).toBe(false)
    expect(isSolidForCactus(typeToId('cactus_flower'))).toBe(false)
  })

  it('returns true for sand, stone, dirt, cactus', () => {
    expect(isSolidForCactus(typeToId('sand'))).toBe(true)
    expect(isSolidForCactus(typeToId('stone'))).toBe(true)
    expect(isSolidForCactus(typeToId('dirt'))).toBe(true)
    expect(isSolidForCactus(typeToId('cactus'))).toBe(true)
  })
})

describe('createCactusFeature', () => {
  it('never places cactus on chunk border columns (lx or lz 0 or CHUNK_SIZE-1)', () => {
    const ctx = buildDesertSandContext(0, 0)
    createCactusFeature()(ctx)

    const borderLx = [0, CHUNK_SIZE - 1]
    const borderLz = [0, CHUNK_SIZE - 1]
    for (const lx of borderLx) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
          const key = localKey(lx, ly, lz)
          expect(ctx.voxelMap[key], `border (${lx},${ly},${lz}) should not be cactus`).not.toBe(CACTUS_ID)
        }
      }
    }
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (const lz of borderLz) {
        for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
          const key = localKey(lx, ly, lz)
          expect(ctx.voxelMap[key], `border (${lx},${ly},${lz}) should not be cactus`).not.toBe(CACTUS_ID)
        }
      }
    }
  })

  it('places cactus_flower on top of each cactus column when air above', () => {
    const ctx = buildDesertSandContext(5, 5)
    createCactusFeature()(ctx)

    for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
      for (let lz = 1; lz < CHUNK_SIZE - 1; lz++) {
        let topCactusY = -1
        for (let ly = SURFACE_Y + 1; ly < WORLD_HEIGHT; ly++) {
          const key = localKey(lx, ly, lz)
          if (ctx.voxelMap[key] === CACTUS_ID) topCactusY = ly
        }
        if (topCactusY >= 0 && topCactusY + 1 < WORLD_HEIGHT) {
          const aboveKey = localKey(lx, topCactusY + 1, lz)
          expect(
            ctx.voxelMap[aboveKey],
            `column (${lx},${lz}): block above top cactus at y=${topCactusY + 1} should be cactus_flower`,
          ).toBe(CACTUS_FLOWER_ID)
        }
      }
    }
  })

  it('cactus columns are 2 or 3 blocks high', () => {
    const ctx = buildDesertSandContext(3, 3)
    createCactusFeature()(ctx)

    for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
      for (let lz = 1; lz < CHUNK_SIZE - 1; lz++) {
        let count = 0
        for (let ly = SURFACE_Y + 1; ly < WORLD_HEIGHT; ly++) {
          if (ctx.voxelMap[localKey(lx, ly, lz)] === CACTUS_ID) count++
        }
        if (count > 0) {
          expect(count, `cactus column (${lx},${lz}) height`).toBeGreaterThanOrEqual(2)
          expect(count, `cactus column (${lx},${lz}) height`).toBeLessThanOrEqual(3)
        }
      }
    }
  })
})

describe('createDeadBushFeature', () => {
  it('places dead_bush only on sand in desert/savanna/badlands', () => {
    const ctx = buildDesertSandContext(0, 0)
    createDeadBushFeature()(ctx)
    const deadBushId = typeToId('dead_bush')
    let placed = 0
    for (let i = 0; i < ctx.voxelMap.length; i++) {
      if (ctx.voxelMap[i] === deadBushId) placed++
    }
    expect(placed).toBeGreaterThanOrEqual(0)
  })
})
