/**
 * Stage 7 (surface): Block layers and surface blocks (stratigraphy).
 */
import type { PipelineStage } from '../pipeline-types'
import { createFidelityStage3, type FidelityStage3Deps } from './stratigraphy-fidelity'

/**
 * Creates the surface stage: fills voxelMap with layers and surface blocks.
 */
export function createStageSurface(deps?: FidelityStage3Deps): PipelineStage {
  return createFidelityStage3(deps)
}
