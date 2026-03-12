/**
 * Stage 6 (carvers): Runs 3D noise, cheese, and spaghetti carving in order.
 */
import type { ChunkContext, PipelineStage } from '../pipeline-types'
import { createStage2 } from './carve-3d'
import type { Stage2Deps } from './carve-3d'
import { createStage2Cheese } from './carve-cheese'
import type { Stage2CheeseDeps } from './carve-cheese'
import { createStage2Spaghetti } from './carve-spaghetti'
import type { Stage2SpaghettiDeps } from './carve-spaghetti'

export interface CarversStageDeps {
  carve3d: Stage2Deps
  cheese: Stage2CheeseDeps
  spaghetti: Stage2SpaghettiDeps
}

/**
 * Creates the carvers stage: runs carve-3d, carve-cheese, carve-spaghetti in sequence.
 */
export function createStageCarvers(deps: CarversStageDeps): PipelineStage {
  const stageCarve3d = createStage2(deps.carve3d)
  const stageCheese = createStage2Cheese(deps.cheese)
  const stageSpaghetti = createStage2Spaghetti(deps.spaghetti)

  return function stageCarvers(ctx: ChunkContext): void {
    stageCarve3d(ctx)
    stageCheese(ctx)
    stageSpaghetti(ctx)
  }
}
