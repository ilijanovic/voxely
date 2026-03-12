/**
 * Legacy stage: paint structure templates (village, temple) into the chunk.
 * The 12-stage pipeline uses structures_starts (stage 2) + paintStructures in the features stage (stage 8) instead.
 * This module still exports createStage5Structures for compatibility: it sets ctx.structureOrigins then calls paintStructures.
 */
import type { ChunkContext, PipelineStage } from '../pipeline-types'
import { createStageStructuresStarts } from './structures-starts'
import { paintStructures } from './paint-structures'
import type { PaintStructuresDeps } from './paint-structures'

export type Stage5StructuresDeps = PaintStructuresDeps

/**
 * Returns a pipeline stage that computes structure origins for this chunk, sets ctx.structureOrigins, then paints.
 * Use this when not using the full 12-stage pipeline; otherwise the pipeline uses structures_starts + features (paintStructures).
 */
export function createStage5Structures(deps: Stage5StructuresDeps): PipelineStage {
  const stageStarts = createStageStructuresStarts(deps)

  return function stage5Structures(ctx: ChunkContext): void {
    stageStarts(ctx)
    paintStructures(ctx, deps)
  }
}
