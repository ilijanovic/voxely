/**
 * Ore feature for Stage 4: replaces stone with coal, iron, gold, diamond ore based on Y and 3D noise.
 */
import { CHUNK_SIZE, WORLD_HEIGHT } from "../../constants";
import { localKey, typeToId, idToType } from "../block-ids";
import { BIOME_REGISTRY } from "../biomes";
import type { ChunkContext, FeatureFn } from "../pipeline-types";

function hash3D(seed: number, wx: number, wy: number, wz: number): number {
  let h = (seed * 374761393) ^ (wx * 668265263) ^ (wy * 1274126177) ^ (wz * 2023189);
  h = (h ^ (h >> 13)) * 1274126177;
  h ^= h >> 16;
  return (h >>> 0) / 0xffffffff;
}

const ORE_CONFIGS = [
  { block: "coal_ore" as const, seed: 1001, minY: 20, maxY: WORLD_HEIGHT - 1, threshold: 0.965 },
  { block: "iron_ore" as const, seed: 1002, minY: 10, maxY: WORLD_HEIGHT - 1, threshold: 0.975 },
  { block: "gold_ore" as const, seed: 1003, minY: 5, maxY: 64, threshold: 0.985 },
  { block: "diamond_ore" as const, seed: 1004, minY: 0, maxY: 32, threshold: 0.992 },
];

export function createOreFeature(): FeatureFn {
  return function oreFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap } = ctx;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz];
        const biome = biomeMap[lx][lz];
        const subsurfaceDepth = BIOME_REGISTRY[biome].blocks.subsurfaceDepth;
        const stoneTop = topY - subsurfaceDepth;

        for (let ly = 1; ly < stoneTop && ly < WORLD_HEIGHT; ly++) {
          const lk = localKey(lx, ly, lz);
          if (idToType(voxelMap[lk]) !== "stone") continue;

          const wx = worldX + lx;
          const wz = worldZ + lz;

          for (const cfg of ORE_CONFIGS) {
            if (ly < cfg.minY || ly > cfg.maxY) continue;
            if (hash3D(cfg.seed, wx, ly, wz) <= cfg.threshold) continue;
            voxelMap[lk] = typeToId(cfg.block);
            break;
          }
        }
      }
    }
  };
}
