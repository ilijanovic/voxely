/**
 * Stage 4 (noise): Terrain shape. Fills context.heightmap from height sampling.
 */
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../constants'
import { clamp } from '../utils'
import type { ChunkContext, PipelineStage } from '../pipeline-types'

export interface NoiseStageDeps {
  /** Smoothed height (e.g. 3x3 kernel) for terrain shape. */
  getHeight(x: number, z: number): number
}

/**
 * Creates the noise stage: fills heightmap only (no biome data).
 */
export function createStageNoise(deps: NoiseStageDeps): PipelineStage {
  const { getHeight } = deps

  return function stageNoise(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap } = ctx
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = worldX + lx
        const wz = worldZ + lz
        heightmap[lx][lz] = Math.floor(clamp(getHeight(wx, wz), 0, WORLD_HEIGHT))
      }
    }
  }
}
