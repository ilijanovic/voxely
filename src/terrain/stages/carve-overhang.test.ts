import { describe, it, expect } from 'vitest'
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_MIN_Y } from '../../constants'
import { CARVED_ID, localKey } from '../block-ids'
import { createChunkContext } from '../pipeline'
import { createStage2Overhang } from './carve-overhang'

describe('createStage2Overhang', () => {
  it('carves near-surface cavities on steep slopes', () => {
    const ctx = createChunkContext(0, 0, [])
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        ctx.heightmap[lx][lz] = 40 + lx * 2
        ctx.biomeMap[lx][lz] = 'mountain'
      }
    }

    const stage = createStage2Overhang({
      overhangNoise3D: () => 1,
      scaleXZ: 0.1,
      scaleY: 0.1,
      threshold: 0.5,
      minSlope: 2,
      minDepthBelowSurface: 2,
      maxDepthBelowSurface: 6,
    })

    stage(ctx)

    let carvedCount = 0
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = ctx.heightmap[lx][lz]
        for (let ly = 1; ly < WORLD_HEIGHT; ly++) {
          const lk = localKey(lx, ly, lz)
          if (ctx.voxelMap[lk] !== CARVED_ID) continue
          carvedCount++
          const worldY = WORLD_MIN_Y + ly
          expect(worldY).toBeGreaterThanOrEqual(topY - 6)
          expect(worldY).toBeLessThanOrEqual(topY - 2)
        }
      }
    }

    expect(carvedCount).toBeGreaterThan(0)
  })

  it('does not carve on flat terrain when slope is below threshold', () => {
    const ctx = createChunkContext(0, 0, [])
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        ctx.heightmap[lx][lz] = 64
        ctx.biomeMap[lx][lz] = 'mountain'
      }
    }

    const stage = createStage2Overhang({
      overhangNoise3D: () => 1,
      scaleXZ: 0.1,
      scaleY: 0.1,
      threshold: 0.5,
      minSlope: 2,
      minDepthBelowSurface: 2,
      maxDepthBelowSurface: 6,
    })

    stage(ctx)

    let carvedCount = 0
    for (let i = 0; i < ctx.voxelMap.length; i++) {
      if (ctx.voxelMap[i] === CARVED_ID) carvedCount++
    }
    expect(carvedCount).toBe(0)
  })

  it('does not carve in non-overhang biomes even on steep slopes', () => {
    const ctx = createChunkContext(0, 0, [])
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        ctx.heightmap[lx][lz] = 48 + lx * 2
        ctx.biomeMap[lx][lz] = 'plains'
      }
    }

    const stage = createStage2Overhang({
      overhangNoise3D: () => 1,
      scaleXZ: 0.1,
      scaleY: 0.1,
      threshold: 0.5,
      minSlope: 2,
      minDepthBelowSurface: 2,
      maxDepthBelowSurface: 6,
    })

    stage(ctx)

    let carvedCount = 0
    for (let i = 0; i < ctx.voxelMap.length; i++) {
      if (ctx.voxelMap[i] === CARVED_ID) carvedCount++
    }
    expect(carvedCount).toBe(0)
  })
})
