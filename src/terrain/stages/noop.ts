/**
 * No-op pipeline stage. Used for empty, structures_references, initialize_light, light, spawn, full.
 */
import type { ChunkContext, PipelineStage } from '../pipeline-types'

/**
 * Returns a pipeline stage that does nothing. Name is for documentation/logging only.
 */
export function createNoopStage(_name: string): PipelineStage {
  return function noop(_ctx: ChunkContext): void {}
}
