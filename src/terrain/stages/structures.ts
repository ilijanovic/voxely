/**
 * Feature runner: runs a list of feature callbacks that can read heightmap/biomeMap and write to voxelMap (e.g. trees, cacti).
 * Used only inside the features stage (pipeline stage 8), not as a standalone pipeline stage.
 */
import type { ChunkContext, PipelineStage, FeatureFn } from '../pipeline-types'

export function createStage4(features: FeatureFn[]): PipelineStage {
  return function stage4Structures(ctx: ChunkContext): void {
    for (const feature of features) feature(ctx)
  }
}
