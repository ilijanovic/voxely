/**
 * Legacy stage: paint structure templates (village, temple) into the chunk.
 * The 12-stage pipeline uses structures_starts (stage 2) + paintStructures in the features stage (stage 8) instead.
 * @deprecated Use the 12-stage pipeline (structures_starts + features with paintStructures). This module is kept for compatibility only.
 */
import type { ChunkContext, PipelineStage } from '../pipeline-types'
import { createStageStructuresStarts } from './structures-starts'
import { paintStructures } from './paint-structures'
import type { PaintStructuresDeps } from './paint-structures'

export type Stage5StructuresDeps = PaintStructuresDeps

/**
 * Returns a pipeline stage that computes structure origins for this chunk, sets ctx.structureOrigins, then paints.
 * @deprecated Use the 12-stage pipeline (structures_starts + features with paintStructures) instead.
 */
export function createStage5Structures(deps: Stage5StructuresDeps): PipelineStage {
  const stageStarts = createStageStructuresStarts(deps)

  return function stage5Structures(ctx: ChunkContext): void {
    stageStarts(ctx)
    paintStructures(ctx, deps)
  }
}
