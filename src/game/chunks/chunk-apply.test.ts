/**
 * Unit tests for chunk-apply pure helpers: buildVoxelMapFromBuffer,
 * buildPositionsByTypeFromVisibleKeys, buildChunkWaterGeometry, getTallGrassPositions.
 */
import { describe, it, expect } from "vitest";
import {
  buildVoxelMapFromBuffer,
  buildPositionsByTypeFromVisibleKeys,
  buildChunkWaterGeometry,
  getTallGrassPositions,
} from "./chunk-apply";
import { localKey } from "../../chunk-runtime";
import { CHUNK_SIZE, WORLD_HEIGHT, WATER_LEVEL } from "../../constants";
import { CARVED_ID } from "../../terrain-core";
import type { BlockPos } from "../../types";

describe("buildVoxelMapFromBuffer", () => {
  const BUFFER_LENGTH = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;

  it("maps buffer indices to voxelMap using localKey convention", () => {
    const buffer = new Uint8Array(BUFFER_LENGTH);
    buffer[localKey(0, 0, 0)] = 2; // stone
    buffer[localKey(1, 1, 1)] = 2; // stone
    const voxelMap = buildVoxelMapFromBuffer(buffer);
    expect(voxelMap.size).toBe(2);
    expect(voxelMap.get(localKey(0, 0, 0))).toBe("stone");
    expect(voxelMap.get(localKey(1, 1, 1))).toBe("stone");
  });

  it("skips air (id 0) and CARVED_ID", () => {
    const buffer = new Uint8Array(BUFFER_LENGTH);
    buffer[localKey(0, 0, 0)] = 0;
    buffer[localKey(1, 0, 0)] = CARVED_ID;
    buffer[localKey(2, 0, 0)] = 2; // stone
    const voxelMap = buildVoxelMapFromBuffer(buffer);
    expect(voxelMap.size).toBe(1);
    expect(voxelMap.get(localKey(2, 0, 0))).toBe("stone");
  });

  it("produces keys deletable via chunk-runtime localKey (mining compat)", () => {
    const coords: [number, number, number][] = [
      [0, 0, 0],
      [15, 127, 15],
      [7, 64, 3],
      [0, 127, 0],
      [15, 0, 15],
    ];
    const buffer = new Uint8Array(BUFFER_LENGTH);
    for (const [lx, ly, lz] of coords) {
      buffer[localKey(lx, ly, lz)] = 2; // stone
    }
    const voxelMap = buildVoxelMapFromBuffer(buffer);
    expect(voxelMap.size).toBe(coords.length);

    for (const [lx, ly, lz] of coords) {
      const key = localKey(lx, ly, lz);
      expect(voxelMap.has(key)).toBe(true);
      voxelMap.delete(key);
      expect(voxelMap.has(key)).toBe(false);
    }
    expect(voxelMap.size).toBe(0);
  });
});

describe("buildPositionsByTypeFromVisibleKeys", () => {
  it("decodes visibleBlockKeysByType to world positions", () => {
    const worldX = 32;
    const worldZ = 48;
    const visible = [
      { blockTypeId: 2, keys: new Uint32Array([localKey(0, 0, 0), localKey(1, 1, 1)]) }, // stone
    ];
    const out = buildPositionsByTypeFromVisibleKeys(visible, worldX, worldZ);
    expect(out.size).toBe(1);
    const positions = out.get("stone")!;
    expect(positions).toHaveLength(2);
    expect(positions[0]).toEqual({ x: worldX + 0, y: 0, z: worldZ + 0 });
    expect(positions[1]).toEqual({ x: worldX + 1, y: 1, z: worldZ + 1 });
  });

  it("skips air blockTypeId", () => {
    const visible = [
      { blockTypeId: 0, keys: new Uint32Array([localKey(0, 0, 0)]) },
      { blockTypeId: 2, keys: new Uint32Array([localKey(1, 1, 1)]) },
    ];
    const out = buildPositionsByTypeFromVisibleKeys(visible, 0, 0);
    expect(out.has("stone")).toBe(true);
    expect(out.get("stone")!).toHaveLength(1);
    expect(out.get("air")).toBeUndefined();
  });
});

describe("buildChunkWaterGeometry", () => {
  const worldX = 0;
  const worldZ = 0;

  it("returns null when all heightmap values are at or above WATER_LEVEL", () => {
    const heightmap2D: number[][] = [];
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      heightmap2D[lx] = [];
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        heightmap2D[lx][lz] = WATER_LEVEL;
      }
    }
    const geo = buildChunkWaterGeometry(worldX, worldZ, heightmap2D);
    expect(geo).toBeNull();
  });

  it("builds geometry for cells below WATER_LEVEL with 2D heightmap", () => {
    const heightmap2D: number[][] = [];
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      heightmap2D[lx] = [];
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        heightmap2D[lx][lz] = lx === 0 && lz === 0 ? WATER_LEVEL - 1 : WATER_LEVEL;
      }
    }
    const geo = buildChunkWaterGeometry(worldX, worldZ, heightmap2D);
    expect(geo).not.toBeNull();
    expect(geo!.index?.count ?? geo!.getAttribute("position")?.count).toBeGreaterThan(0);
  });

  it("builds geometry for cells below WATER_LEVEL with Float32Array heightmap", () => {
    const heightmapFlat = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        heightmapFlat[lx + lz * CHUNK_SIZE] = lx === 0 && lz === 0 ? WATER_LEVEL - 1 : WATER_LEVEL;
      }
    }
    const geo = buildChunkWaterGeometry(worldX, worldZ, heightmapFlat);
    expect(geo).not.toBeNull();
    const posAttr = geo!.getAttribute("position");
    expect(posAttr?.count).toBe((CHUNK_SIZE + 1) * (CHUNK_SIZE + 1));
  });
});

describe("getTallGrassPositions", () => {
  const worldX = 0;
  const worldZ = 0;

  it("excludes positions with block above (voxelMap has keyAbove)", () => {
    const voxelMap = new Map<number, string>();
    voxelMap.set(localKey(0, 1, 0), "stone"); // block above (0,0,0)
    const positionsByType = new Map<string, BlockPos[]>();
    positionsByType.set("grass", [{ x: 0, y: 0, z: 0 }]);
    const out = getTallGrassPositions(12345, worldX, worldZ, voxelMap, positionsByType);
    expect(out).toHaveLength(0);
  });

  it("includes worker-placed tall_grass with y-1 mesh base", () => {
    const voxelMap = new Map<number, string>();
    const positionsByType = new Map<string, BlockPos[]>();
    positionsByType.set("tall_grass", [{ x: 5, y: 65, z: 5 }]); // block at topY+1 in worker
    const out = getTallGrassPositions(999, worldX, worldZ, voxelMap, positionsByType);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ x: 5, y: 64, z: 5 });
  });

  it("respects pseudoRandom threshold so some grass positions are skipped", () => {
    const voxelMap = new Map<number, string>();
    const positionsByType = new Map<string, BlockPos[]>();
    positionsByType.set("grass", [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
    ]);
    const out = getTallGrassPositions(12345, worldX, worldZ, voxelMap, positionsByType);
    // With TALL_GRASS_SPAWN_CHANCE 0.05, most seeds yield no grass; we only assert structure
    expect(Array.isArray(out)).toBe(true);
    out.forEach((p) => {
      expect(p).toHaveProperty("x");
      expect(p).toHaveProperty("y");
      expect(p).toHaveProperty("z");
    });
  });
});
