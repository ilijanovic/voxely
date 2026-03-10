/**
 * Stage 1: Heightmap and biome selection. Fills context.heightmap and context.biomeMap
 * from 2D temperature/humidity and height-based resolution.
 */
import type { Biome } from "../../types";
import { CHUNK_SIZE, WORLD_HEIGHT } from "../../constants";
import { clamp } from "../utils";
import type { ChunkContext, PipelineStage } from "../pipeline-types";

export interface Stage1Deps {
  getBaseBiomeAt(x: number, z: number): Biome;
  getHeightForBase(base: Biome, x: number, z: number): number;
  getResolvedBiomeFromHeight(base: Biome, height: number, x: number, z: number): Biome;
  /** Smoothed height (e.g. 3x3 kernel) for gentle biome transitions. */
  getHeight(x: number, z: number): number;
}

export function createStage1(deps: Stage1Deps): PipelineStage {
  const {
    getBaseBiomeAt,
    getResolvedBiomeFromHeight,
    getHeight,
  } = deps;

  return function stage1HeightmapBiome(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap } = ctx;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = worldX + lx;
        const wz = worldZ + lz;
        const base = getBaseBiomeAt(wx, wz);
        const height = Math.floor(clamp(getHeight(wx, wz), 0, WORLD_HEIGHT));
        heightmap[lx][lz] = height;
        biomeMap[lx][lz] = getResolvedBiomeFromHeight(base, height, wx, wz);
      }
    }
  };
}
