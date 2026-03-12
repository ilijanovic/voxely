/**
 * Stage 7 (surface): Block layers and surface blocks (stratigraphy).
 */
import type { PipelineStage } from '../pipeline-types'
import { createStage3, type Stage3Deps } from './stratigraphy'

/**
 * Creates the surface stage: fills voxelMap with layers and surface blocks.
 */
export function createStageSurface(deps?: Stage3Deps): PipelineStage {
  return createStage3(deps)
}
