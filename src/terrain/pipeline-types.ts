/**
 * Types for the terrain generation pipeline: context and stage signatures.
 */
import type { Biome, BlockType } from '../types'
import type { StructureOrigin } from './structures/origins'

export interface ChunkContext {
  chunkX: number
  chunkZ: number
  worldX: number
  worldZ: number
  /** Heightmap: heightmap[lx][lz] = terrain surface Y (integer). */
  heightmap: number[][]
  /** Biome per column: biomeMap[lx][lz] = resolved biome. */
  biomeMap: Biome[][]
  /** Flat voxel buffer: block id per local key. 0 = air. */
  voxelMap: Uint8Array
  /** User block modifications (place/destroy); applied after features stage. */
  blockMods: Array<{ bx: number; by: number; bz: number; value: BlockType | 'air' }>
  /** Structure origins for this chunk; set by structures_starts stage, used by features stage. */
  structureOrigins?: StructureOrigin[]
  /**
   * Optional 2D noise for feature placement/density. Returns a sampler in [0, 1] per (seed + seedOffset, x, z).
   * Provided by the chunk generator; use for vegetation and decoration placement (Minecraft-style).
   */
  getFeatureNoise?(seedOffset: number): (x: number, z: number) => number
}

/** A pipeline stage: reads/writes context. */
export type PipelineStage = (ctx: ChunkContext) => void

/**
 * Optional hook called before and after each pipeline stage.
 * Mutate ctx in place; no return value. stageName is from RunPipelineOptions.stageNames.
 */
export type PipelineOverrideHook = (
  ctx: ChunkContext,
  phase: 'before' | 'after',
  stageIndex: number,
  stageName?: string,
) => void

/** Options for runPipeline: override hook and optional stage names for the hook. */
export interface RunPipelineOptions {
  override?: PipelineOverrideHook
  stageNames?: readonly string[]
}

/** A feature runs in Stage 4; can read heightmap/biomeMap and write voxelMap. */
export type FeatureFn = (ctx: ChunkContext) => void

/**
 * Names of the no-op pipeline stages (for documentation and createNoopStage).
 * Order: empty (1), structures_references (3), initialize_light (9), light (10), spawn (11), full (12).
 */
export const PIPELINE_NOP_STAGE_NAMES = [
  'empty',
  'structures_references',
  'initialize_light',
  'light',
  'spawn',
  'full',
] as const
