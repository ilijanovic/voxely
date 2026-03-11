/**
 * Pipeline runner: runs stages in order over a chunk context.
 * Export: runPipeline, createChunkContext.
 */
import { CHUNK_SIZE } from '../constants'
import { VOXEL_BUFFER_LENGTH, AIR_ID } from './block-ids'
import type { ChunkContext, PipelineStage } from './pipeline-types'
import type { Biome } from '../types'

export function runPipeline(ctx: ChunkContext, stages: PipelineStage[]): void {
  for (const stage of stages) stage(ctx)
}

export function createChunkContext(
  chunkX: number,
  chunkZ: number,
  blockMods: ChunkContext['blockMods'],
): ChunkContext {
  const worldX = chunkX * CHUNK_SIZE
  const worldZ = chunkZ * CHUNK_SIZE
  const heightmap: number[][] = []
  for (let x = 0; x < CHUNK_SIZE; x++) {
    heightmap[x] = new Array<number>(CHUNK_SIZE)
  }
  const biomeMap: Biome[][] = []
  for (let x = 0; x < CHUNK_SIZE; x++) {
    biomeMap[x] = new Array(CHUNK_SIZE)
  }
  const voxelMap = new Uint8Array(VOXEL_BUFFER_LENGTH)
  voxelMap.fill(AIR_ID)
  return {
    chunkX,
    chunkZ,
    worldX,
    worldZ,
    heightmap,
    biomeMap,
    voxelMap,
    blockMods,
  }
}
