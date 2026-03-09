/**
 * Tree feature for Stage 4: places trees using placement/density noise and getTreeBlocks.
 */
import type { Biome } from "../../types";
import { CHUNK_SIZE } from "../../constants";
import { localKey, typeToId } from "../block-ids";
import type { ChunkContext, FeatureFn } from "../pipeline-types";

export interface TreeFeatureDeps {
  /** Returns whether to place a tree at (wx, wz); uses ctx for chunk column data and caches. */
  shouldPlaceTree(
    ctx: ChunkContext,
    wx: number,
    wz: number,
    treeCache: Map<string, number>,
    forestCache: Map<string, number>
  ): boolean;
  getTreeBlocks(
    wx: number,
    baseY: number,
    wz: number,
    biome: Biome
  ): { wood: Array<{ x: number; y: number; z: number }>; leaves: Array<{ x: number; y: number; z: number }> };
}

export function createTreeFeature(deps: TreeFeatureDeps): FeatureFn {
  const { shouldPlaceTree, getTreeBlocks } = deps;

  return function treeFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap } = ctx;
    const treeCache = new Map<string, number>();
    const forestCache = new Map<string, number>();
    const minX = worldX;
    const maxX = worldX + CHUNK_SIZE - 1;
    const minZ = worldZ;
    const maxZ = worldZ + CHUNK_SIZE - 1;

    for (let twx = minX; twx <= maxX; twx++) {
      for (let twz = minZ; twz <= maxZ; twz++) {
        if (!shouldPlaceTree(ctx, twx, twz, treeCache, forestCache)) continue;
        const lx = twx - worldX;
        const lz = twz - worldZ;
        const baseY = heightmap[lx][lz];
        const biome = biomeMap[lx][lz];
        const { wood, leaves } = getTreeBlocks(twx, baseY, twz, biome);
        for (const b of wood) {
          if (b.x >= worldX && b.x < worldX + CHUNK_SIZE && b.z >= worldZ && b.z < worldZ + CHUNK_SIZE) {
            const lkx = b.x - worldX;
            const lkz = b.z - worldZ;
            voxelMap[localKey(lkx, b.y, lkz)] = typeToId("wood");
          }
        }
        for (const b of leaves) {
          if (b.x >= worldX && b.x < worldX + CHUNK_SIZE && b.z >= worldZ && b.z < worldZ + CHUNK_SIZE) {
            const lkx = b.x - worldX;
            const lkz = b.z - worldZ;
            const topY = heightmap[lkx][lkz];
            if (b.y > topY) voxelMap[localKey(lkx, b.y, lkz)] = typeToId("leaves");
          }
        }
      }
    }
  };
}
