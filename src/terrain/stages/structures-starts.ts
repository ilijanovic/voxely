/**
 * Stage 2 (structures_starts): Compute structure origins for this chunk and store in context.
 */
import type { WorldPoi } from '../../world-pois'
import { getFixedVillageOriginsInChunk } from '../../world-pois'
import type { ChunkContext, PipelineStage } from '../pipeline-types'
import type { StructureOrigin } from '../structures/origins'
import { getStructureOriginsInChunk } from '../structures/origins'

export interface StructuresStartsDeps {
  seed: number
  getHeight: (x: number, z: number) => number
  getResolvedBiome: (x: number, z: number) => import('../../types').Biome
  /** Pre-defined village POIs; their origins are merged with procedural structure origins. */
  pois?: WorldPoi[]
}

/**
 * Creates the structures_starts stage: fills ctx.structureOrigins for this chunk.
 */
export function createStageStructuresStarts(deps: StructuresStartsDeps): PipelineStage {
  const { seed, getHeight, getResolvedBiome, pois } = deps

  return function stageStructuresStarts(ctx: ChunkContext): void {
    const { chunkX, chunkZ } = ctx
    const procedural = getStructureOriginsInChunk(seed, chunkX, chunkZ, getHeight, getResolvedBiome)
    const fixed =
      pois?.length
        ? getFixedVillageOriginsInChunk(pois, chunkX, chunkZ, getHeight, getResolvedBiome)
        : []
    ctx.structureOrigins = [...procedural, ...fixed] as StructureOrigin[]
  }
}
