import { describe, it, expect, vi } from "vitest";
import { breakBlock } from "./mining";
import { buildVoxelMapFromBuffer } from "../chunks/chunk-apply";
import { localKey } from "../../chunk-runtime";
import { typeToId } from "../../terrain/block-ids";
import { CHUNK_SIZE, WORLD_HEIGHT } from "../../constants";
import type { BlockType, ChunkData, BlockPos } from "../../types";

function makeChunkData(cx: number, cz: number): ChunkData {
  return {
    group: null as unknown as ChunkData["group"],
    cx,
    cz,
    voxelMap: new Map(),
    blockPositionsByType: new Map(),
  };
}

function makeParams(overrides: Partial<Parameters<typeof breakBlock>[0]> = {}) {
  const blockModifications = new Map<string, BlockType | "air">();
  const invalidateColumnHeight = vi.fn();
  const refreshChunkVisibleMeshes = vi.fn();
  const spawnDrop = vi.fn();
  const chunks = new Map<number, ChunkData>();
  const chunkSize = 16;

  return {
    chunkKeyNum: 0,
    blockType: "stone" as BlockType,
    worldX: 5,
    worldY: 10,
    worldZ: 5,
    chunks,
    getLayerPositions: (_data: ChunkData, _bt: BlockType): BlockPos[] | null => [
      { x: 5, y: 10, z: 5 },
    ],
    isUnbreakableBlock: (_bt: BlockType) => false,
    blockModifications,
    blockKeyString: (x: number, y: number, z: number) => `${x},${y},${z}`,
    invalidateColumnHeight,
    localKey: (lx: number, ly: number, lz: number) => lx + ly * 16 + lz * 16 * 128,
    chunkSize,
    isSolidBlock: (bt: BlockType) => bt === "stone" || bt === "dirt",
    getBlockAt: (_x: number, _y: number, _z: number): BlockType | "air" | null => "air",
    refreshChunkVisibleMeshes,
    spawnDrop,
    ...overrides,
  };
}

describe("breakBlock", () => {
  it("does nothing for unbreakable blocks", () => {
    const params = makeParams({
      isUnbreakableBlock: () => true,
    });
    params.chunks.set(0, makeChunkData(0, 0));
    breakBlock(params);
    expect(params.blockModifications.size).toBe(0);
    expect(params.spawnDrop).not.toHaveBeenCalled();
  });

  it("returns without crash when chunk is not loaded", () => {
    const params = makeParams();
    breakBlock(params);
    expect(params.blockModifications.size).toBe(0);
    expect(params.spawnDrop).not.toHaveBeenCalled();
  });

  it("returns when getLayerPositions yields null", () => {
    const params = makeParams({
      getLayerPositions: () => null,
    });
    params.chunks.set(0, makeChunkData(0, 0));
    breakBlock(params);
    expect(params.blockModifications.size).toBe(0);
    expect(params.spawnDrop).not.toHaveBeenCalled();
  });

  it("sets blockModification to air and invalidates column height", () => {
    const data = makeChunkData(0, 0);
    const localKeyFn = (lx: number, ly: number, lz: number) => lx + ly * 16 + lz * 16 * 128;
    data.voxelMap.set(localKeyFn(5, 10, 5), "stone");
    const params = makeParams();
    params.chunks.set(0, data);
    breakBlock(params);
    expect(params.blockModifications.get("5,10,5")).toBe("air");
    expect(params.invalidateColumnHeight).toHaveBeenCalledWith(5, 5);
  });

  it("removes block from voxelMap", () => {
    const data = makeChunkData(0, 0);
    const lk = 5 + 10 * 16 + 5 * 16 * 128;
    data.voxelMap.set(lk, "stone");
    const params = makeParams();
    params.chunks.set(0, data);
    breakBlock(params);
    expect(data.voxelMap.has(lk)).toBe(false);
  });

  it("spawns drop with correct position when instanceIndex found", () => {
    const data = makeChunkData(0, 0);
    const params = makeParams({
      getBlockAt: (_x: number, y: number, _z: number) => {
        if (y === 9) return "stone";
        return "air";
      },
    });
    params.chunks.set(0, data);
    breakBlock(params);
    expect(params.spawnDrop).toHaveBeenCalledTimes(1);
    const [cx, cy, cz, bt] = vi.mocked(params.spawnDrop).mock.calls[0];
    expect(cx).toBe(5.5);
    expect(cz).toBe(5.5);
    expect(bt).toBe("stone");
    expect(cy).toBeGreaterThan(9);
  });

  it("calls refreshChunkVisibleMeshes with data and affectedBlockTypes when instanceIndex is -1", () => {
    const data = makeChunkData(0, 0);
    const params = makeParams({
      getLayerPositions: () => [{ x: 99, y: 99, z: 99 }],
    });
    params.chunks.set(0, data);
    breakBlock(params);
    expect(params.refreshChunkVisibleMeshes).toHaveBeenCalledTimes(1);
    expect(params.refreshChunkVisibleMeshes).toHaveBeenCalledWith(data, expect.any(Set));
    const affected = vi.mocked(params.refreshChunkVisibleMeshes).mock.calls[0][1] as Set<string>;
    expect(affected.has("stone")).toBe(true);
    expect(params.spawnDrop).not.toHaveBeenCalled();
  });

  it("searches downward for ground and spawns drop above solid block", () => {
    const data = makeChunkData(0, 0);
    const params = makeParams({
      getBlockAt: (_x: number, y: number, _z: number) => {
        if (y === 7) return "stone";
        return "air";
      },
    });
    params.chunks.set(0, data);
    breakBlock(params);
    expect(params.spawnDrop).toHaveBeenCalledTimes(1);
    const [, cy] = vi.mocked(params.spawnDrop).mock.calls[0];
    const dropSize = 0.35;
    const groundY = 7 + 0.5;
    expect(cy).toBeCloseTo(groundY + dropSize * 0.5);
  });

  it("removes block from worker-built voxelMap (buildVoxelMapFromBuffer)", () => {
    const BUFFER_LENGTH = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;
    const buffer = new Uint8Array(BUFFER_LENGTH);
    const lx = 5, ly = 10, lz = 5;
    const worldX = 0, worldZ = 0;
    buffer[localKey(lx, ly, lz)] = typeToId("stone");

    const voxelMap = buildVoxelMapFromBuffer(buffer);
    expect(voxelMap.get(localKey(lx, ly, lz))).toBe("stone");

    const data = makeChunkData(0, 0);
    data.voxelMap = voxelMap;
    data.blockPositionsByType.set("stone" as BlockType, [
      { x: worldX + lx, y: ly, z: worldZ + lz },
    ]);

    const params = makeParams({
      getLayerPositions: (d: ChunkData, bt: BlockType) =>
        d.blockPositionsByType.get(bt) ?? null,
      getBlockAt: (_x: number, y: number) => (y === 9 ? "stone" : "air"),
    });
    params.chunks.set(0, data);
    params.worldX = worldX + lx;
    params.worldY = ly;
    params.worldZ = worldZ + lz;

    breakBlock(params);

    expect(voxelMap.has(localKey(lx, ly, lz))).toBe(false);
    expect(params.blockModifications.get(`${worldX + lx},${ly},${worldZ + lz}`)).toBe("air");
    expect(params.spawnDrop).toHaveBeenCalledTimes(1);
  });
});
