import { describe, it, expect } from "vitest";
import { filterVisibleBlocks } from "./visible-blocks";
import type { BlockPos, BlockType } from "../../types";

function makeLocalKey(chunkSize: number) {
  return (lx: number, ly: number, lz: number) => lx + chunkSize * (lz + chunkSize * ly);
}

describe("filterVisibleBlocks", () => {
  it("culls fully surrounded blocks but keeps edge blocks", () => {
    const chunkSize = 3;
    const worldHeight = 3;
    const localKey = makeLocalKey(chunkSize);

    const voxelMap = new Map<number, BlockType>();
    const solid: BlockType = "stone";

    // Fill a 3x3x3 cube of solid blocks so center is fully surrounded.
    for (let y = 0; y < worldHeight; y++) {
      for (let z = 0; z < chunkSize; z++) {
        for (let x = 0; x < chunkSize; x++) {
          voxelMap.set(localKey(x, y, z), solid);
        }
      }
    }

    const positions: BlockPos[] = [
      { x: 1, y: 1, z: 1 }, // center (should be culled)
      { x: 0, y: 1, z: 1 }, // edge (visible because out-of-bounds neighbor)
    ];

    const visible = filterVisibleBlocks({
      worldX: 0,
      worldZ: 0,
      chunkSize,
      worldHeight,
      voxelMap,
      positions,
      localKey,
      isSolidBlock: () => true,
    });

    expect(visible).toEqual([{ x: 0, y: 1, z: 1 }]);
  });
});

