/**
 * Types for the terrain generation pipeline: context and stage signatures.
 */
import type { Biome, BlockType } from "../types";

export interface ChunkContext {
  chunkX: number;
  chunkZ: number;
  worldX: number;
  worldZ: number;
  /** Heightmap: heightmap[lx][lz] = terrain surface Y (integer). */
  heightmap: number[][];
  /** Biome per column: biomeMap[lx][lz] = resolved biome. */
  biomeMap: Biome[][];
  /** Flat voxel buffer: block id per local key. 0 = air. */
  voxelMap: Uint8Array;
  /** User block modifications (place/destroy); applied after Stage 4. */
  blockMods: Array<{ bx: number; by: number; bz: number; value: BlockType | "air" }>;
}

/** A pipeline stage: reads/writes context. */
export type PipelineStage = (ctx: ChunkContext) => void;

/** A feature runs in Stage 4; can read heightmap/biomeMap and write voxelMap. */
export type FeatureFn = (ctx: ChunkContext) => void;
