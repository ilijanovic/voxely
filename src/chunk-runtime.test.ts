/**
 * Contract and unit tests for chunk-runtime: key helpers, localKey equality with terrain/block-ids, getBlockAt, getBlockModsForChunk.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  chunkKey,
  chunkKeyNumeric,
  blockKeyNumeric,
  blockKeyFromNumeric,
  blockKeyString,
  columnCacheKey,
  localKey as runtimeLocalKey,
  decodeLocalKey,
  chunks,
  blockModifications,
  columnHeightCache,
  getBlockAt,
  getBlockModsForChunk,
} from "./chunk-runtime";
import { localKey as terrainLocalKey } from "./terrain/block-ids";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./constants";
import type { ChunkData } from "./types";

// Minimal ChunkData for tests (no THREE)
function makeChunkData(cx: number, cz: number, voxelMap: Map<number, string>): ChunkData {
  return {
    group: null as unknown as ChunkData["group"],
    cx,
    cz,
    voxelMap,
    blockPositionsByType: new Map(),
  };
}

describe("localKey contract: chunk-runtime vs terrain/block-ids", () => {
  it("matches terrain localKey for all (lx, ly, lz) in chunk bounds", () => {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          expect(runtimeLocalKey(lx, ly, lz)).toBe(terrainLocalKey(lx, ly, lz));
        }
      }
    }
  });
});

describe("chunkKey", () => {
  it("returns string key cx,cz", () => {
    expect(chunkKey(0, 0)).toBe("0,0");
    expect(chunkKey(-1, 2)).toBe("-1,2");
  });
});

describe("chunkKeyNumeric", () => {
  it("is deterministic and reversible via chunk coords", () => {
    const pairs: [number, number][] = [[0, 0], [1, 0], [0, 1], [-1, -1], [100, -100]];
    const seen = new Set<number>();
    for (const [cx, cz] of pairs) {
      const k = chunkKeyNumeric(cx, cz);
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });
});

describe("blockKeyNumeric and blockKeyFromNumeric", () => {
  it("roundtrip for typical coords", () => {
    const coords: [number, number, number][] = [
      [0, 0, 0],
      [1, 64, 1],
      [-1, 127, -1],
      [16, 0, 16],
    ];
    for (const [bx, by, bz] of coords) {
      const k = blockKeyNumeric(bx, by, bz);
      const out = blockKeyFromNumeric(k);
      expect(out.bx).toBe(Math.floor(bx));
      expect(out.by).toBe(Math.floor(by));
      expect(out.bz).toBe(Math.floor(bz));
    }
  });
});

describe("columnCacheKey", () => {
  it("is deterministic for (bx, bz)", () => {
    expect(columnCacheKey(0, 0)).toBe(columnCacheKey(0, 0));
    expect(columnCacheKey(1, 0)).not.toBe(columnCacheKey(0, 1));
  });
});

describe("localKey and decodeLocalKey", () => {
  it("roundtrip for (lx, ly, lz) in valid range", () => {
    const samples: [number, number, number][] = [];
    for (let lz = 0; lz < CHUNK_SIZE; lz += 4) {
      for (let ly = 0; ly < WORLD_HEIGHT; ly += 16) {
        for (let lx = 0; lx < CHUNK_SIZE; lx += 4) {
          samples.push([lx, ly, lz]);
        }
      }
    }
    for (const [lx, ly, lz] of samples) {
      const k = runtimeLocalKey(lx, ly, lz);
      const d = decodeLocalKey(k);
      expect(d.lx).toBe(lx);
      expect(d.ly).toBe(ly);
      expect(d.lz).toBe(lz);
    }
  });
});

describe("getBlockAt", () => {
  beforeEach(() => {
    chunks.clear();
    blockModifications.clear();
    columnHeightCache.clear();
  });

  it("returns air for y < 0 or y >= WORLD_HEIGHT", () => {
    expect(getBlockAt(0, -1, 0)).toBe("air");
    expect(getBlockAt(0, WORLD_HEIGHT, 0)).toBe("air");
  });

  it("returns null when chunk not loaded", () => {
    expect(getBlockAt(0, 64, 0)).toBe(null);
  });

  it("returns block from chunk voxelMap when no mod", () => {
    const voxel = new Map<number, string>();
    voxel.set(runtimeLocalKey(0, 64, 0), "stone");
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel));
    expect(getBlockAt(0, 64, 0)).toBe("stone");
  });

  it("returns air for position not in voxelMap", () => {
    const voxel = new Map<number, string>();
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel));
    expect(getBlockAt(0, 64, 0)).toBe("air");
  });

  it("mod overrides chunk data", () => {
    const voxel = new Map<number, string>();
    voxel.set(runtimeLocalKey(0, 64, 0), "stone");
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel));
    blockModifications.set(blockKeyString(0, 64, 0), "air");
    expect(getBlockAt(0, 64, 0)).toBe("air");
  });

  it("mod overrides to different block", () => {
    const voxel = new Map<number, string>();
    voxel.set(runtimeLocalKey(0, 64, 0), "stone");
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel));
    blockModifications.set(blockKeyString(0, 64, 0), "grass");
    expect(getBlockAt(0, 64, 0)).toBe("grass");
  });

  it("string key avoids collision: -268,75,280 vs 1780,75,280 (same blockKeyNumeric)", () => {
    const cx = Math.floor(-268 / CHUNK_SIZE);
    const cz = Math.floor(280 / CHUNK_SIZE);
    const lx = -268 - cx * CHUNK_SIZE;
    const lz = 280 - cz * CHUNK_SIZE;
    const voxel = new Map<number, string>();
    voxel.set(runtimeLocalKey(lx, 75, lz), "stone");
    chunks.set(chunkKeyNumeric(cx, cz), makeChunkData(cx, cz, voxel));
    const cx2 = Math.floor(1780 / CHUNK_SIZE);
    const cz2 = Math.floor(280 / CHUNK_SIZE);
    const voxel2 = new Map<number, string>();
    voxel2.set(runtimeLocalKey(1780 - cx2 * CHUNK_SIZE, 75, 280 - cz2 * CHUNK_SIZE), "dirt");
    chunks.set(chunkKeyNumeric(cx2, cz2), makeChunkData(cx2, cz2, voxel2));
    expect(blockKeyNumeric(-268, 75, 280)).toBe(blockKeyNumeric(1780, 75, 280));
    blockModifications.set(blockKeyString(1780, 75, 280), "air");
    expect(getBlockAt(-268, 75, 280)).toBe("stone");
    expect(getBlockAt(1780, 75, 280)).toBe("air");
  });
});

describe("getBlockModsForChunk", () => {
  beforeEach(() => {
    chunks.clear();
    blockModifications.clear();
    columnHeightCache.clear();
  });

  it("returns only mods in the given chunk", () => {
    blockModifications.set(blockKeyString(0, 64, 0), "grass");   // chunk 0,0
    blockModifications.set(blockKeyString(16, 64, 0), "dirt");   // chunk 1,0
    blockModifications.set(blockKeyString(0, 64, 16), "stone");  // chunk 0,1
    const mods = getBlockModsForChunk(0, 0);
    expect(mods).toHaveLength(1);
    expect(mods[0].bx).toBe(0);
    expect(mods[0].by).toBe(64);
    expect(mods[0].bz).toBe(0);
    expect(mods[0].value).toBe("grass");
  });

  it("returns multiple mods in same chunk", () => {
    blockModifications.set(blockKeyString(1, 65, 1), "grass");
    blockModifications.set(blockKeyString(2, 65, 2), "dirt");
    const mods = getBlockModsForChunk(0, 0);
    expect(mods).toHaveLength(2);
  });
});
