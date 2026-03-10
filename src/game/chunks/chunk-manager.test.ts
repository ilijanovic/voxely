/**
 * Integration tests for chunk-manager: updateChunks calls generateChunkSync/unloadChunk
 * or worker.requestChunk as planned, and spawns entities only for newly added chunks.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";
import { updateChunks } from "./chunk-manager";
import { chunks, chunkKeyNumeric, chunkKey } from "../../chunk-runtime";
import type { ChunkData } from "../../types";

vi.mock("./chunk-planning", () => ({
  planChunksAroundPlayer: vi.fn(),
}));

vi.mock("../../entities/spawn", () => ({
  spawnEntitiesForChunk: vi.fn(),
}));

import { planChunksAroundPlayer } from "./chunk-planning";
import { spawnEntitiesForChunk } from "../../entities/spawn";

function makeDummyChunkData(cx: number, cz: number): ChunkData {
  return {
    group: new THREE.Group(),
    cx,
    cz,
    voxelMap: new Map(),
    blockPositionsByType: new Map(),
  };
}

describe("updateChunks", () => {
  const scene = new THREE.Scene();
  const player = new THREE.Group();
  player.position.set(0, 0, 0);

  beforeEach(() => {
    chunks.clear();
    vi.mocked(planChunksAroundPlayer).mockReturnValue({ toLoad: [], toUnload: [] });
    vi.mocked(spawnEntitiesForChunk).mockClear();
  });

  it("calls generateChunkSync for each toLoad when useWorker is false", () => {
    vi.mocked(planChunksAroundPlayer).mockReturnValue({
      toLoad: [{ cx: 1, cz: 0 }, { cx: 0, cz: 1 }],
      toUnload: [],
    });
    const generateChunkSync = vi.fn();
    const unloadChunk = vi.fn();
    const pendingChunkKeys = new Set<number>();

    updateChunks({
      scene,
      player,
      chunkWorker: null,
      pendingChunkKeys,
      generateChunkSync,
      unloadChunk,
    });

    expect(generateChunkSync).toHaveBeenCalledTimes(2);
    expect(generateChunkSync).toHaveBeenCalledWith(scene, 1, 0);
    expect(generateChunkSync).toHaveBeenCalledWith(scene, 0, 1);
    expect(unloadChunk).not.toHaveBeenCalled();
  });

  it("calls unloadChunk for each toUnload", () => {
    const key00 = chunkKeyNumeric(0, 0);
    chunks.set(key00, makeDummyChunkData(0, 0));
    vi.mocked(planChunksAroundPlayer).mockReturnValue({
      toLoad: [],
      toUnload: [key00],
    });
    const generateChunkSync = vi.fn();
    const unloadChunk = vi.fn();

    updateChunks({
      scene,
      player,
      chunkWorker: null,
      pendingChunkKeys: new Set(),
      generateChunkSync,
      unloadChunk,
    });

    expect(unloadChunk).toHaveBeenCalledTimes(1);
    expect(unloadChunk).toHaveBeenCalledWith(scene, key00);
    expect(generateChunkSync).not.toHaveBeenCalled();
  });

  it("calls chunkWorker.requestChunk and adds to pendingChunkKeys when useWorker is true", () => {
    const requestChunk = vi.fn();
    const chunkWorker = { requestChunk, terminate: vi.fn() };
    vi.mocked(planChunksAroundPlayer).mockReturnValue({
      toLoad: [{ cx: 1, cz: 0 }],
      toUnload: [],
    });
    const pendingChunkKeys = new Set<number>();

    updateChunks({
      scene,
      player,
      chunkWorker,
      pendingChunkKeys,
      generateChunkSync: vi.fn(),
      unloadChunk: vi.fn(),
    });

    expect(pendingChunkKeys.has(chunkKeyNumeric(1, 0))).toBe(true);
    expect(requestChunk).toHaveBeenCalledTimes(1);
    expect(requestChunk).toHaveBeenCalledWith({
      chunkX: 1,
      chunkZ: 0,
      blockMods: expect.any(Array),
    });
  });

  it("calls spawnEntitiesForChunk only for chunks added during this update (sync path)", () => {
    const key00 = chunkKeyNumeric(0, 0);
    chunks.set(key00, makeDummyChunkData(0, 0));
    vi.mocked(planChunksAroundPlayer).mockReturnValue({
      toLoad: [{ cx: 1, cz: 0 }],
      toUnload: [],
    });
    const generateChunkSync = vi.fn((_scene: THREE.Scene, cx: number, cz: number) => {
      chunks.set(chunkKeyNumeric(cx, cz), makeDummyChunkData(cx, cz));
    });

    updateChunks({
      scene,
      player,
      chunkWorker: null,
      pendingChunkKeys: new Set(),
      generateChunkSync,
      unloadChunk: vi.fn(),
    });

    expect(spawnEntitiesForChunk).toHaveBeenCalledTimes(1);
    expect(spawnEntitiesForChunk).toHaveBeenCalledWith(
      scene,
      chunkKey(1, 0),
      1,
      0
    );
  });

  it("does not call spawnEntitiesForChunk when no new chunks were added", () => {
    const key00 = chunkKeyNumeric(0, 0);
    chunks.set(key00, makeDummyChunkData(0, 0));
    vi.mocked(planChunksAroundPlayer).mockReturnValue({
      toLoad: [],
      toUnload: [],
    });

    updateChunks({
      scene,
      player,
      chunkWorker: null,
      pendingChunkKeys: new Set(),
      generateChunkSync: vi.fn(),
      unloadChunk: vi.fn(),
    });

    expect(spawnEntitiesForChunk).not.toHaveBeenCalled();
  });
});
