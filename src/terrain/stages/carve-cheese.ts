/**
 * Stage 2b: Cheese caves. Large, blobby caverns via 3D noise at a larger scale.
 * Carves only below surface and above bedrock (ly >= 1).
 */
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../constants'
import { localKey, CARVED_ID } from '../block-ids'
import type { ChunkContext, PipelineStage } from '../pipeline-types'

export interface Stage2CheeseDeps {
  cheeseNoise3D(x: number, y: number, z: number): number
  /** Scale for noise sampling (larger = bigger caverns). */
  scale: number
  /** Carve where noise > threshold. */
  threshold: number
  /** Optional: depth-dependent density (0..1). Higher = more caves at this Y. Default: always 1. */
  caveDensityFactor?: (y: number) => number
}

export function createStage2Cheese(deps: Stage2CheeseDeps): PipelineStage {
  const { cheeseNoise3D, scale, threshold, caveDensityFactor } = deps
  const densityAt = caveDensityFactor ?? (() => 1)

  return function stage2Cheese(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, voxelMap } = ctx
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const topY = heightmap[lx][lz]
        for (let ly = 1; ly < topY && ly < WORLD_HEIGHT; ly++) {
          const wx = worldX + lx
          const wy = ly
          const wz = worldZ + lz
          const effectiveThreshold = threshold / Math.max(0.01, densityAt(wy))
          if (cheeseNoise3D(wx * scale, wy * scale, wz * scale) > effectiveThreshold) {
            voxelMap[localKey(lx, ly, lz)] = CARVED_ID
          }
        }
      }
    }
  }
}
