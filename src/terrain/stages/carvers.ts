/**
 * Stage 6 (carvers): Runs 3D noise, cheese, noodle, spaghetti, optional worm,
 * and optional overhang carving in order.
 */
import type { ChunkContext, PipelineStage } from '../pipeline-types'
import { createStage2 } from './carve-3d'
import type { Stage2Deps } from './carve-3d'
import { createStage2Cheese } from './carve-cheese'
import type { Stage2CheeseDeps } from './carve-cheese'
import { createStage2Noodle } from './carve-noodle'
import type { Stage2NoodleDeps } from './carve-noodle'
import { createStage2Spaghetti } from './carve-spaghetti'
import type { Stage2SpaghettiDeps } from './carve-spaghetti'
import { createStage2Worm } from './carve-worm'
import type { Stage2WormDeps } from './carve-worm'
import { createStage2Overhang } from './carve-overhang'
import type { Stage2OverhangDeps } from './carve-overhang'

export interface CarversStageDeps {
  carve3d: Stage2Deps
  cheese: Stage2CheeseDeps
  noodle: Stage2NoodleDeps
  spaghetti: Stage2SpaghettiDeps
  /** Optional worm carver (Minecraft-style random-walk caves). When omitted, worm stage is skipped. */
  worm?: Stage2WormDeps
  /** Optional overhang carver (density-like near-surface cliff cavities). */
  overhang?: Stage2OverhangDeps
}

/**
 * Creates the carvers stage: runs carve-3d, carve-cheese, carve-noodle, carve-spaghetti,
 * then optional worm and overhang carvers.
 */
export function createStageCarvers(deps: CarversStageDeps): PipelineStage {
  const stageCarve3d = createStage2(deps.carve3d)
  const stageCheese = createStage2Cheese(deps.cheese)
  const stageNoodle = createStage2Noodle(deps.noodle)
  const stageSpaghetti = createStage2Spaghetti(deps.spaghetti)
  const stageWorm = deps.worm != null ? createStage2Worm(deps.worm) : null
  const stageOverhang = deps.overhang != null ? createStage2Overhang(deps.overhang) : null

  return function stageCarvers(ctx: ChunkContext): void {
    stageCarve3d(ctx)
    stageCheese(ctx)
    stageNoodle(ctx)
    stageSpaghetti(ctx)
    if (stageWorm) stageWorm(ctx)
    if (stageOverhang) stageOverhang(ctx)
  }
}
