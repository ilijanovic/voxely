/**
 * Shore and water vegetation for Stage 4: sugar cane on shores, kelp in ocean.
 */
import { CHUNK_SIZE, WATER_LEVEL } from "../../constants";
import { localKey, typeToId } from "../block-ids";
import type { ChunkContext, FeatureFn } from "../pipeline-types";

const SUGAR_CANE_NOISE_SEED = 600111;
const SUGAR_CANE_HEIGHT_SEED = 600112;
const KELP_NOISE_SEED = 600211;

function noiseKey(seed: number, wx: number, wz: number): string {
  return `${seed},${wx},${wz}`;
}

function sampleNoise(cache: Map<string, number>, seed: number, wx: number, wz: number): number {
  let v = cache.get(noiseKey(seed, wx, wz));
  if (v === undefined) {
    let h = wx * 374761393 + wz * 668265263 + seed;
    h = (h ^ (h >> 13)) * 1274126177;
    h ^= h >> 16;
    v = (h >>> 0) / 0xffffffff;
    cache.set(noiseKey(seed, wx, wz), v);
  }
  return v;
}

const SUGAR_CANE_PLACE_THRESHOLD = 0.72;
const SUGAR_CANE_HEIGHT_MAX = 3;

export function createSugarCaneFeature(): FeatureFn {
  return function sugarCaneFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, voxelMap } = ctx;
    const cache = new Map<string, number>();
    const sugarCaneId = typeToId("sugar_cane");

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz];
        if (topY <= WATER_LEVEL) continue;

        const surfaceKey = localKey(lx, topY, lz);
        const surfaceId = voxelMap[surfaceKey];
        const isSandOrGrass =
          surfaceId !== 0 &&
          (surfaceId === typeToId("sand") ||
            surfaceId === typeToId("grass") ||
            surfaceId === typeToId("grass_snow") ||
            surfaceId === typeToId("grass_savanna") ||
            surfaceId === typeToId("dirt"));
        if (!isSandOrGrass) continue;

        let adjacentWater = false;
        const wx = worldX + lx;
        const wz = worldZ + lz;
        for (const [dx, dz] of [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ] as const) {
          const nx = lx + dx;
          const nz = lz + dz;
          if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) {
            adjacentWater = true;
            break;
          }
          const neighborTopY = heightmap[nx][nz];
          if (neighborTopY <= WATER_LEVEL) {
            adjacentWater = true;
            break;
          }
        }
        if (!adjacentWater) continue;

        const keyAbove = localKey(lx, topY + 1, lz);
        if (voxelMap[keyAbove]) continue;

        if (sampleNoise(cache, SUGAR_CANE_NOISE_SEED, wx, wz) < SUGAR_CANE_PLACE_THRESHOLD) continue;

        const heightSample = sampleNoise(cache, SUGAR_CANE_HEIGHT_SEED, wx, wz);
        const height = 1 + Math.min(Math.floor(heightSample * SUGAR_CANE_HEIGHT_MAX), SUGAR_CANE_HEIGHT_MAX - 1);

        for (let h = 1; h <= height; h++) {
          const lk = localKey(lx, topY + h, lz);
          if (!voxelMap[lk]) voxelMap[lk] = sugarCaneId;
        }
      }
    }
  };
}

const KELP_PLACE_THRESHOLD = 0.65;

export function createKelpFeature(): FeatureFn {
  return function kelpFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap } = ctx;
    const cache = new Map<string, number>();
    const kelpId = typeToId("kelp");

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz];
        if (topY >= WATER_LEVEL) continue;
        const biome = biomeMap[lx][lz];
        if (biome !== "ocean") continue;

        const wx = worldX + lx;
        const wz = worldZ + lz;
        if (sampleNoise(cache, KELP_NOISE_SEED, wx, wz) < KELP_PLACE_THRESHOLD) continue;

        const kelpTop = WATER_LEVEL - 1;
        const baseY = topY + 1;
        for (let y = baseY; y <= kelpTop; y++) {
          const ly = y;
          const lk = localKey(lx, ly, lz);
          if (!voxelMap[lk]) voxelMap[lk] = kelpId;
        }
      }
    }
  };
}
