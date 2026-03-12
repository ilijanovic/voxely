/**
 * Stage 8 (features): Runs feature callbacks (trees, ore, flowers, etc.) then paints template structures.
 */
import type { ChunkContext, PipelineStage, FeatureFn } from '../pipeline-types'
import { paintStructures, type PaintStructuresDeps } from './paint-structures'
import { createStage4 } from './structures'

export interface FeaturesStageDeps {
  /** Feature callbacks to run (e.g. trees, ore, flowers). */
  features: FeatureFn[]
  /** Deps for painting villages/temples and walkways; read from ctx.structureOrigins. */
  paintStructuresDeps: PaintStructuresDeps
}

/**
 * Creates the features stage: runs the feature list then paintStructures.
 */
export function createStageFeatures(deps: FeaturesStageDeps): PipelineStage {
  const stage4 = createStage4(deps.features)
  const paintDeps = deps.paintStructuresDeps

  return function stageFeatures(ctx: ChunkContext): void {
    stage4(ctx)
    paintStructures(ctx, paintDeps)
  }
}
