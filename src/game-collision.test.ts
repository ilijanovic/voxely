/**
 * Tests for voxel AABB collision: resolveVoxelCollisions with minimal world state.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveVoxelCollisions,
  PLAYER_HALF,
  PLAYER_HEIGHT,
} from "./game-collision";
import {
  chunks,
  chunkKeyNumeric,
  localKey,
  blockModifications,
  columnHeightCache,
  getBlockAt,
} from "./chunk-runtime";
import type { ChunkData } from "./types";

function makeChunkData(cx: number, cz: number, voxelMap: Map<number, string>): ChunkData {
  return {
    group: null as unknown as ChunkData["group"],
    cx,
    cz,
    voxelMap,
    blockPositionsByType: new Map(),
  };
}

describe("resolveVoxelCollisions", () => {
  beforeEach(() => {
    chunks.clear();
    blockModifications.clear();
    columnHeightCache.clear();
  });

  it("pushes player up onto floor and sets grounded when landing on solid block", () => {
    const voxel = new Map<number, string>();
    voxel.set(localKey(0, 4, 0), "stone");
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel));
    expect(getBlockAt(0, 4, 0)).toBe("stone");

    const position = { x: 0.5, y: 5.5, z: 0.5 };
    const velocity = { x: 0, y: -1, z: 0 };
    const result = resolveVoxelCollisions(
      position,
      velocity,
      1,
      PLAYER_HALF,
      PLAYER_HALF,
      PLAYER_HEIGHT
    );

    expect(position.y).toBe(5);
    expect(velocity.y).toBe(0);
    expect(result.hitYDown).toBe(true);
  });

  it("sets grounded when landing with feet near block top", () => {
    const voxel = new Map<number, string>();
    voxel.set(localKey(0, 4, 0), "stone");
    chunks.set(chunkKeyNumeric(0, 0), makeChunkData(0, 0, voxel));

    const position = { x: 0.5, y: 5.95, z: 0.5 };
    const velocity = { x: 0, y: -1, z: 0 };
    const result = resolveVoxelCollisions(
      position,
      velocity,
      1,
      PLAYER_HALF,
      PLAYER_HALF,
      PLAYER_HEIGHT
    );

    expect(position.y).toBe(5);
    expect(result.grounded).toBe(true);
  });

  it("does not push when no blocks under player (empty world)", () => {
    const position = { x: 0.5, y: 64, z: 0.5 };
    const velocity = { x: 0, y: -1, z: 0 };
    const result = resolveVoxelCollisions(
      position,
      velocity,
      1,
      PLAYER_HALF,
      PLAYER_HALF,
      PLAYER_HEIGHT
    );

    expect(result.grounded).toBe(false);
    expect(result.hitYDown).toBe(false);
    expect(position.y).toBe(63);
    expect(velocity.y).toBe(-1);
  });
});
