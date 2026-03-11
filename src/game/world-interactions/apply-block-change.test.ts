import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { ChunkData, BlockType } from "../../types";
import { CHUNK_SIZE } from "../../constants";
import { chunkKeyNumeric, localKey } from "../../chunk-runtime";
import { applyBlockChangeToLoadedChunk } from "./apply-block-change";

function makeChunkData(cx: number, cz: number): ChunkData {
  return {
    group: new THREE.Group(),
    cx,
    cz,
    voxelMap: new Map<number, BlockType>(),
    blockPositionsByType: new Map(),
  };
}

describe("applyBlockChangeToLoadedChunk", () => {
  it("updates voxelMap in-place without removing chunk from map", () => {
    const chunks = new Map<number, ChunkData>();
    const data = makeChunkData(0, 0);
    const keyNum = chunkKeyNumeric(0, 0);
    chunks.set(keyNum, data);

    const bx = 2;
    const by = 5;
    const bz = 3;
    const k = localKey(bx, by, bz);
    expect(data.voxelMap.has(k)).toBe(false);

    const result = applyBlockChangeToLoadedChunk({
      chunks,
      bx,
      by,
      bz,
      next: "stone",
      getBlockAt: () => "air",
    });

    expect(chunks.has(keyNum)).toBe(true);
    expect(result.data).toBe(data);
    expect(data.voxelMap.get(k)).toBe("stone");
  });

  it("deletes from voxelMap when next is air", () => {
    const chunks = new Map<number, ChunkData>();
    const data = makeChunkData(0, 0);
    chunks.set(chunkKeyNumeric(0, 0), data);

    const bx = 1;
    const by = 1;
    const bz = 1;
    const k = localKey(bx, by, bz);
    data.voxelMap.set(k, "stone");

    applyBlockChangeToLoadedChunk({
      chunks,
      bx,
      by,
      bz,
      next: "air",
      getBlockAt: () => "air",
    });

    expect(data.voxelMap.has(k)).toBe(false);
  });

  it("computes correct chunk key for negative coordinates", () => {
    const chunks = new Map<number, ChunkData>();
    const data = makeChunkData(-1, -1);
    const keyNum = chunkKeyNumeric(-1, -1);
    chunks.set(keyNum, data);

    const bx = -CHUNK_SIZE + 1;
    const by = 2;
    const bz = -CHUNK_SIZE + 2;

    const out = applyBlockChangeToLoadedChunk({
      chunks,
      bx,
      by,
      bz,
      next: "stone",
      getBlockAt: () => "air",
    });

    expect(out.keyNum).toBe(keyNum);
    expect(out.data).toBe(data);
  });
});

