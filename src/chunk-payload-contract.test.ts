/**
 * Contract / roundtrip tests: run the same pipeline the worker runs,
 * then assert the resulting ChunkDataPayload satisfies every structural
 * assumption that chunk-apply.ts (main thread) relies on.
 *
 * This catches worker ↔ main-thread drift without a real Web Worker.
 */
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createWorkerHandler } from "./chunk-worker-handler";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./constants";
import {
  idToType,
  CARVED_ID,
  localKey as terrainLocalKey,
  typeToId,
} from "./terrain/block-ids";
import { buildWorkerGeometryFromVoxelBuffer } from "./terrain/worker-geometry";
import { localKey as runtimeLocalKey } from "./chunk-runtime";
import type { ChunkDataPayload } from "./terrain-core";
import { createTerrainSampling } from "./terrain-sampling";

const TEST_SEED = 12345;

function generatePayload(chunkX: number, chunkZ: number): ChunkDataPayload {
  const handler = createWorkerHandler();
  handler.handleMessage({ type: "init", seed: TEST_SEED });
  const payloads = handler.handleMessage({
    type: "generate",
    chunkX,
    chunkZ,
    blockMods: [],
  });
  expect(payloads).toHaveLength(1);
  return payloads[0];
}

function generatePayloadWithSnowHeight(
  chunkX: number,
  chunkZ: number,
  snowAccumulationHeight: number
): ChunkDataPayload {
  const handler = createWorkerHandler();
  handler.handleMessage({
    type: "init",
    seed: TEST_SEED,
    snowAccumulationHeight,
  });
  const payloads = handler.handleMessage({
    type: "generate",
    chunkX,
    chunkZ,
    blockMods: [],
  });
  expect(payloads).toHaveLength(1);
  return payloads[0];
}

describe("ChunkDataPayload contract", () => {
  const payload = generatePayload(0, 0);

  describe("voxel buffer", () => {
    it("has correct length (CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)", () => {
      expect(payload.buffer).toBeInstanceOf(Uint8Array);
      expect(payload.buffer.length).toBe(
        CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE
      );
    });

    it("contains at least one non-air block", () => {
      let nonAir = 0;
      for (let i = 0; i < payload.buffer.length; i++) {
        if (payload.buffer[i] !== 0 && payload.buffer[i] !== CARVED_ID)
          nonAir++;
      }
      expect(nonAir).toBeGreaterThan(0);
    });

    it("all block IDs resolve to known types via idToType", () => {
      const unknowns: number[] = [];
      for (let i = 0; i < payload.buffer.length; i++) {
        const id = payload.buffer[i];
        if (id === 0 || id === CARVED_ID) continue;
        if (idToType(id) === "air") unknowns.push(id);
      }
      expect(unknowns).toEqual([]);
    });
  });

  describe("heightmap", () => {
    it("2D heightmap has CHUNK_SIZE rows, each with CHUNK_SIZE entries", () => {
      expect(payload.heightmap).toBeDefined();
      expect(payload.heightmap.length).toBe(CHUNK_SIZE);
      for (const row of payload.heightmap) {
        expect(row.length).toBe(CHUNK_SIZE);
      }
    });

    it("heightmapBuffer is present and has CHUNK_SIZE * CHUNK_SIZE entries", () => {
      expect(payload.heightmapBuffer).toBeInstanceOf(Float32Array);
      expect(payload.heightmapBuffer!.length).toBe(CHUNK_SIZE * CHUNK_SIZE);
    });

    it("heightmapBuffer matches 2D heightmap (row-major: lx + lz * CHUNK_SIZE)", () => {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          expect(payload.heightmapBuffer![lx + lz * CHUNK_SIZE]).toBe(
            payload.heightmap[lx][lz]
          );
        }
      }
    });
  });

  describe("geometryLayers", () => {
    it("is defined and non-empty for a chunk with blocks", () => {
      expect(payload.geometryLayers).toBeDefined();
      expect(payload.geometryLayers!.length).toBeGreaterThan(0);
    });

    it("every blockTypeId maps to a valid BlockType", () => {
      for (const layer of payload.geometryLayers!) {
        const type = idToType(layer.blockTypeId);
        expect(type).not.toBe("air");
      }
    });

    it("position and normal arrays have length divisible by 3", () => {
      for (const layer of payload.geometryLayers!) {
        expect(layer.position.length % 3).toBe(0);
        expect(layer.normal.length % 3).toBe(0);
        expect(layer.position.length).toBe(layer.normal.length);
      }
    });

    it("uv arrays have length divisible by 2", () => {
      for (const layer of payload.geometryLayers!) {
        expect(layer.uv.length % 2).toBe(0);
      }
    });

    it("vertex counts are consistent: position / 3 == uv / 2", () => {
      for (const layer of payload.geometryLayers!) {
        const vertexCount = layer.position.length / 3;
        expect(layer.uv.length / 2).toBe(vertexCount);
      }
    });

    it("faceVertexCounts sums to total vertex count", () => {
      for (const layer of payload.geometryLayers!) {
        expect(layer.faceVertexCounts).toBeInstanceOf(Uint32Array);
        expect(layer.faceVertexCounts.length).toBe(6);
        let sum = 0;
        for (const c of layer.faceVertexCounts) sum += c;
        expect(sum).toBe(layer.position.length / 3);
      }
    });

    it("face order matches BoxGeometry: +Y (top) face has normal (0,1,0)", () => {
      for (const layer of payload.geometryLayers!) {
        const faceVertexCounts = layer.faceVertexCounts;
        const topFaceIndex = 2;
        const startVertex =
          (faceVertexCounts[0] ?? 0) + (faceVertexCounts[1] ?? 0);
        if ((faceVertexCounts[topFaceIndex] ?? 0) === 0) continue;
        const n0 = startVertex * 3;
        expect(layer.normal[n0]).toBe(0);
        expect(layer.normal[n0 + 1]).toBe(1);
        expect(layer.normal[n0 + 2]).toBe(0);
      }
    });

    it("UV layout matches Three.js BoxGeometry (fails if worker UVs diverge → rotated blocks)", () => {
      const box = new THREE.BoxGeometry(1, 1, 1);
      const uvAttr = box.getAttribute("uv") as THREE.BufferAttribute;
      const topFaceGroupIndex = 2;
      const group = box.groups[topFaceGroupIndex];
      const firstVertexIndex = box.index
        ? box.index.array[group.start]
        : group.start;
      const boxU = uvAttr.getX(firstVertexIndex);
      const boxV = uvAttr.getY(firstVertexIndex);

      let matched = false;
      for (const layer of payload.geometryLayers!) {
        const faceVertexCounts = layer.faceVertexCounts;
        const topFaceVertexStart =
          (faceVertexCounts[0] ?? 0) + (faceVertexCounts[1] ?? 0);
        if ((faceVertexCounts[2] ?? 0) === 0) continue;
        const workerU = layer.uv[topFaceVertexStart * 2];
        const workerV = layer.uv[topFaceVertexStart * 2 + 1];
        expect(workerU).toBeCloseTo(boxU, 5);
        expect(workerV).toBeCloseTo(boxV, 5);
        matched = true;
      }
      expect(matched).toBe(true);
    });

    /**
     * Rotation-bug thesis: when a block is destroyed, refreshChunkVisibleMeshes
     * replaces worker geometry with instanced BoxGeometry (sharedBlockGeometry).
     * If worker UV layout differs from BoxGeometry on any face, neighbors appear
     * rotated 90°. This test fails if worker and BoxGeometry UVs differ on any
     * of the 6 faces (confirms the thesis).
     */
    it.skip("worker geometry UV layout matches BoxGeometry on all six faces (no rotation after refresh)", () => {
      const buffer = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
      buffer.fill(0);
      const lx = 1;
      const ly = 1;
      const lz = 1;
      buffer[terrainLocalKey(lx, ly, lz)] = typeToId("stone");

      const { geometryLayers } = buildWorkerGeometryFromVoxelBuffer({
        buffer,
        worldX: 0,
        worldZ: 0,
      });
      expect(geometryLayers.length).toBeGreaterThan(0);
      const layer = geometryLayers[0];
      const faceVertexCounts = layer.faceVertexCounts;

      const box = new THREE.BoxGeometry(1, 1, 1);
      const boxUV = box.getAttribute("uv") as THREE.BufferAttribute;
      expect(box.groups.length).toBe(6);

      let vertexOffset = 0;
      for (let face = 0; face < 6; face++) {
        const count = faceVertexCounts[face] ?? 0;
        if (count === 0) continue;

        const group = box.groups[face];
        expect(group.count).toBe(6);
        const indexArr = box.index ? box.index.array : null;

        for (let v = 0; v < 6; v++) {
          const workerU = layer.uv[(vertexOffset + v) * 2];
          const workerV = layer.uv[(vertexOffset + v) * 2 + 1];

          const boxVertexIndex = indexArr
            ? indexArr[group.start + v]
            : group.start + v;
          const boxU = boxUV.getX(boxVertexIndex);
          const boxV = boxUV.getY(boxVertexIndex);

          expect(
            workerU,
            `face ${face} vertex ${v}: worker UV (${workerU},${workerV}) should match Box (${boxU},${boxV})`
          ).toBeCloseTo(boxU, 5);
          expect(
            workerV,
            `face ${face} vertex ${v}: worker UV (${workerU},${workerV}) should match Box (${boxU},${boxV})`
          ).toBeCloseTo(boxV, 5);
        }
        vertexOffset += count;
      }
    });
  });

  describe("visibleBlockKeysByType", () => {
    it("is defined and non-empty for a chunk with blocks", () => {
      expect(payload.visibleBlockKeysByType).toBeDefined();
      expect(payload.visibleBlockKeysByType!.length).toBeGreaterThan(0);
    });

    it("every blockTypeId maps to a valid BlockType", () => {
      for (const entry of payload.visibleBlockKeysByType!) {
        const type = idToType(entry.blockTypeId);
        expect(type).not.toBe("air");
      }
    });

    it("all keys decode to valid local coordinates", () => {
      for (const entry of payload.visibleBlockKeysByType!) {
        for (const key of entry.keys) {
          const lx = key % CHUNK_SIZE;
          const ly = Math.floor(key / CHUNK_SIZE) % WORLD_HEIGHT;
          const lz = Math.floor(key / (CHUNK_SIZE * WORLD_HEIGHT));
          expect(lx).toBeGreaterThanOrEqual(0);
          expect(lx).toBeLessThan(CHUNK_SIZE);
          expect(ly).toBeGreaterThanOrEqual(0);
          expect(ly).toBeLessThan(WORLD_HEIGHT);
          expect(lz).toBeGreaterThanOrEqual(0);
          expect(lz).toBeLessThan(CHUNK_SIZE);
        }
      }
    });
  });

  describe("localKey contract: terrain/block-ids and chunk-runtime agree", () => {
    it("produces identical keys for all in-range coordinates", () => {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let ly = 0; ly < 4; ly++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            expect(terrainLocalKey(lx, ly, lz)).toBe(
              runtimeLocalKey(lx, ly, lz)
            );
          }
        }
      }
    });
  });

  describe("determinism", () => {
    it("same seed + coordinates produce identical payloads", () => {
      const a = generatePayload(3, -2);
      const b = generatePayload(3, -2);
      expect(a.chunkX).toBe(b.chunkX);
      expect(a.chunkZ).toBe(b.chunkZ);
      expect(a.buffer.length).toBe(b.buffer.length);
      for (let i = 0; i < a.buffer.length; i++) {
        if (a.buffer[i] !== b.buffer[i]) {
          throw new Error(
            `buffer mismatch at index ${i}: ${a.buffer[i]} vs ${b.buffer[i]}`
          );
        }
      }
      expect(a.heightmapBuffer).toEqual(b.heightmapBuffer);
    });
  });

  /**
   * Worker heightmap must match terrain-sampling (sync fallback) for same seed
   * so that main-thread getHeight and worker-generated chunks agree.
   */
  describe("worker heightmap vs terrain-sampling parity (sync fallback contract)", () => {
    it("payload heightmap matches terrain-sampling height for same seed and chunk", () => {
      const p = generatePayload(0, 0);
      const worldX = p.chunkX * CHUNK_SIZE;
      const worldZ = p.chunkZ * CHUNK_SIZE;
      const sampler = createTerrainSampling(TEST_SEED);
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          const smoothed = sampler.getSmoothedHeight(worldX + lx, worldZ + lz);
          const expectedY = Math.floor(
            Math.max(0, Math.min(WORLD_HEIGHT, smoothed))
          );
          expect(
            p.heightmap[lx][lz],
            `heightmap[${lx}][${lz}] (world ${worldX + lx}, ${worldZ + lz})`
          ).toBe(expectedY);
        }
      }
    });
  });

  describe("different chunk coordinates", () => {
    it("works for negative chunk coordinates", () => {
      const p = generatePayload(-3, -5);
      expect(p.chunkX).toBe(-3);
      expect(p.chunkZ).toBe(-5);
      expect(p.buffer.length).toBe(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
      expect(p.geometryLayers!.length).toBeGreaterThan(0);
    });

    it("works for large positive coordinates", () => {
      const p = generatePayload(100, 200);
      expect(p.chunkX).toBe(100);
      expect(p.chunkZ).toBe(200);
      expect(p.buffer.length).toBe(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    });
  });

  describe("snow layer placement", () => {
    it("when snowAccumulationHeight >= 1, every snow_layer block sits on grass_snow or snow", () => {
      const p = generatePayloadWithSnowHeight(0, 0, 2);
      const buf = p.buffer;
      const strideY = CHUNK_SIZE;
      const strideZ = CHUNK_SIZE * WORLD_HEIGHT;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let ly = 1; ly < WORLD_HEIGHT; ly++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const i = lx + ly * strideY + lz * strideZ;
            const type = idToType(buf[i]);
            if (!type.startsWith("snow_layer_")) continue;
            const belowI = lx + (ly - 1) * strideY + lz * strideZ;
            const belowType = idToType(buf[belowI]);
            expect(
              belowType === "grass_snow" || belowType === "snow",
              `snow_layer at (${lx},${ly},${lz}) must sit on grass_snow or snow, got ${belowType}`
            ).toBe(true);
          }
        }
      }
    });
  });
});
