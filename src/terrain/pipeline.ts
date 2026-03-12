/**
 * Pipeline runner: runs stages in order over a chunk context.
 * Export: runPipeline, createChunkContext.
 */
import { CHUNK_SIZE } from '../constants'
import { VOXEL_BUFFER_LENGTH, AIR_ID } from './block-ids'
import type { ChunkContext, PipelineStage, RunPipelineOptions } from './pipeline-types'
import type { Biome } from '../types'

/**
 * Runs all pipeline stages in order over the chunk context (mutates ctx).
 * If options.override is set, calls it before and after each stage with phase and stageIndex/stageName.
 */
export function runPipeline(
  ctx: ChunkContext,
  stages: PipelineStage[],
  options?: RunPipelineOptions,
): void {
  const override = options?.override
  const stageNames = options?.stageNames
  for (let i = 0; i < stages.length; i++) {
    if (override) override(ctx, 'before', i, stageNames?.[i])
    stages[i](ctx)
    if (override) override(ctx, 'after', i, stageNames?.[i])
  }
}

/** Allocates a chunk context (heightmap, biomeMap, voxel buffer, blockMods) for the given chunk coordinates. */
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
