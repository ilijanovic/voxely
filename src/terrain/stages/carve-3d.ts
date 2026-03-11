/**
 * Stage 2: 3D noise carving. Sets voxels to "carved" (air) where cave noise exceeds threshold.
 */
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../constants'
import { localKey, CARVED_ID } from '../block-ids'
import type { ChunkContext, PipelineStage } from '../pipeline-types'

export interface Stage2Deps {
  caveNoise3D(x: number, y: number, z: number): number
  /** Carve where noise > threshold (e.g. 0.4 for worm-like caves). */
  carveThreshold: number
}

export function createStage2(deps: Stage2Deps): PipelineStage {
  const { caveNoise3D, carveThreshold } = deps

  return function stage2Carve3D(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, voxelMap } = ctx
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const topY = heightmap[lx][lz]
        // Carve only below surface (ly < topY) so caves don't punch triangular holes in the ground.
        for (let ly = 0; ly < topY && ly < WORLD_HEIGHT; ly++) {
          const wx = worldX + lx
          const wy = ly
          const wz = worldZ + lz
          if (caveNoise3D(wx, wy, wz) > carveThreshold) {
            voxelMap[localKey(lx, ly, lz)] = CARVED_ID
          }
        }
      }
    }
  }
}
