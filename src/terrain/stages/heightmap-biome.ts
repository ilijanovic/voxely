/**
 * Stage 1: Heightmap and biome selection. Fills context.heightmap and context.biomeMap
 * from 2D temperature/humidity and height-based resolution.
 */
import type { Biome } from "../../types";
import { CHUNK_SIZE, WORLD_HEIGHT } from "../../constants";
import { clamp } from "../utils";
import type { ChunkContext, PipelineStage } from "../pipeline-types";

export interface Stage1Deps {
  getTemperature(x: number, z: number): number;
  getHumidity(x: number, z: number): number;
  getBiomeByClimate(temp: number, humidity: number): Biome;
  getHeightForBase(base: Biome, x: number, z: number): number;
  getResolvedBiomeFromHeight(base: Biome, height: number, x: number, z: number): Biome;
}

export function createStage1(deps: Stage1Deps): PipelineStage {
  const {
    getTemperature,
    getHumidity,
    getBiomeByClimate,
    getHeightForBase,
    getResolvedBiomeFromHeight,
  } = deps;

  return function stage1HeightmapBiome(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap } = ctx;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = worldX + lx;
        const wz = worldZ + lz;
        const temp = getTemperature(wx, wz);
        const humidity = getHumidity(wx, wz);
        const base = getBiomeByClimate(temp, humidity);
        const rawH = getHeightForBase(base, wx, wz);
        const n = getHeightForBase(getBiomeByClimate(getTemperature(wx, wz + 1), getHumidity(wx, wz + 1)), wx, wz + 1);
        const s = getHeightForBase(getBiomeByClimate(getTemperature(wx, wz - 1), getHumidity(wx, wz - 1)), wx, wz - 1);
        const e = getHeightForBase(getBiomeByClimate(getTemperature(wx + 1, wz), getHumidity(wx + 1, wz)), wx + 1, wz);
        const w = getHeightForBase(getBiomeByClimate(getTemperature(wx - 1, wz), getHumidity(wx - 1, wz)), wx - 1, wz);
        const smoothedH = rawH * 0.5 + (n + s + e + w) * 0.125;
        const height = Math.floor(clamp(smoothedH, 0, WORLD_HEIGHT));
        heightmap[lx][lz] = height;
        biomeMap[lx][lz] = getResolvedBiomeFromHeight(base, height, wx, wz);
      }
    }
  };
}
