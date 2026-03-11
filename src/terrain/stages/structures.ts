/**
 * Stage 4: Structures and decoration. Runs a list of feature callbacks that can
 * read heightmap/biomeMap and write to voxelMap (e.g. trees, cacti).
 */
import type { ChunkContext, PipelineStage, FeatureFn } from '../pipeline-types'

export function createStage4(features: FeatureFn[]): PipelineStage {
  return function stage4Structures(ctx: ChunkContext): void {
    for (const feature of features) feature(ctx)
  }
}
