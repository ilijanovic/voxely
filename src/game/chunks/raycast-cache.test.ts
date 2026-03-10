/**
 * Unit tests for RaycastMeshCache: cache is rebuilt when dirty, returns meshes with blockType.
 */
import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { RaycastMeshCache } from "./raycast-cache";
import type { ChunkData } from "../../types";

function makeChunkDataWithMesh(blockType: string): ChunkData {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial()
  );
  mesh.userData = { blockType };
  group.add(mesh);
  return {
    group,
    cx: 0,
    cz: 0,
    voxelMap: new Map(),
    blockPositionsByType: new Map(),
  };
}

describe("RaycastMeshCache", () => {
  let cache: RaycastMeshCache;

  beforeEach(() => {
    cache = new RaycastMeshCache();
  });

  it("returns meshes with blockType from chunk groups", () => {
    const chunks = new Map<number, ChunkData>();
    const data = makeChunkDataWithMesh("stone");
    chunks.set(1, data);
    const result = cache.get(chunks);
    expect(result).toHaveLength(1);
    expect(result[0].userData).toEqual({ blockType: "stone" });
  });

  it("returns cached result when not dirty", () => {
    const chunks = new Map<number, ChunkData>();
    chunks.set(1, makeChunkDataWithMesh("stone"));
    const first = cache.get(chunks);
    chunks.set(2, makeChunkDataWithMesh("dirt"));
    const second = cache.get(chunks);
    expect(first).toBe(second);
    expect(second).toHaveLength(1);
  });

  it("rebuilds cache after markDirty", () => {
    const chunks = new Map<number, ChunkData>();
    chunks.set(1, makeChunkDataWithMesh("stone"));
    cache.get(chunks);
    chunks.set(2, makeChunkDataWithMesh("dirt"));
    cache.markDirty();
    const result = cache.get(chunks);
    expect(result).toHaveLength(2);
  });
});
