/**
 * Web Worker: generates chunk terrain data off the main thread.
 * Receives: { type: "init", seed } then { type: "generate", chunkX, chunkZ, blockMods, requestId? }.
 * Sends back: ChunkDataPayload (optionally with requestId for stale filtering on main thread).
 */
import { createChunkGenerator } from "./terrain-core";
import type { BlockModEntry, ChunkDataPayload } from "./terrain-core";
import { CHUNK_SIZE } from "./constants";
import { buildWorkerGeometryFromVoxelBuffer } from "./terrain/worker-geometry";

type InitMsg = { type: "init"; seed: number };
type GenerateMsg = {
  type: "generate";
  chunkX: number;
  chunkZ: number;
  blockMods: BlockModEntry[];
  lod?: "full" | "far";
  /**
   * Optional request identifier propagated back to the main thread so it can discard stale results.
   */
  requestId?: number;
};

type WorkerMsg = InitMsg | GenerateMsg;

let generateChunkData: ReturnType<typeof createChunkGenerator>["generateChunkData"] | null = null;
let generateChunkHeightmap: ReturnType<typeof createChunkGenerator>["generateChunkHeightmap"] | null = null;
let pendingQueue: GenerateMsg[] = [];

function postPayload(payload: ChunkDataPayload): void {
  const transferList: Transferable[] = [];
  if (payload.buffer?.buffer instanceof ArrayBuffer) {
    transferList.push(payload.buffer.buffer);
  }
  if (payload.heightmapBuffer?.buffer instanceof ArrayBuffer) {
    transferList.push(payload.heightmapBuffer.buffer);
  }
  if (payload.geometryLayers) {
    for (const layer of payload.geometryLayers) {
      if (layer.position?.buffer instanceof ArrayBuffer) transferList.push(layer.position.buffer);
      if (layer.normal?.buffer instanceof ArrayBuffer) transferList.push(layer.normal.buffer);
      if (layer.uv?.buffer instanceof ArrayBuffer) transferList.push(layer.uv.buffer);
      if (layer.faceVertexCounts?.buffer instanceof ArrayBuffer) transferList.push(layer.faceVertexCounts.buffer);
    }
  }
  if (payload.visibleBlockKeysByType) {
    for (const entry of payload.visibleBlockKeysByType) {
      if (entry.keys?.buffer instanceof ArrayBuffer) transferList.push(entry.keys.buffer);
    }
  }
  // @ts-expect-error lib.d.ts may not declare self as DedicatedWorkerGlobalScope in this context.
  self.postMessage(payload, transferList);
}

self.onmessage = (e: MessageEvent<WorkerMsg>) => {
  const msg = e.data;
  if (msg.type === "init" && typeof msg.seed === "number") {
    const gen = createChunkGenerator(msg.seed);
    generateChunkData = gen.generateChunkData;
    generateChunkHeightmap = gen.generateChunkHeightmap;
    for (const queued of pendingQueue) {
      const basePayload =
        queued.lod === "far" && generateChunkHeightmap
          ? ({ ...generateChunkHeightmap(queued.chunkX, queued.chunkZ), lod: "far" } as ChunkDataPayload)
          : generateChunkData(queued.chunkX, queued.chunkZ, queued.blockMods);
      const worldX = queued.chunkX * CHUNK_SIZE;
      const worldZ = queued.chunkZ * CHUNK_SIZE;
      const geo =
        basePayload.lod === "far"
          ? { geometryLayers: [], visibleBlockKeysByType: [] }
          : buildWorkerGeometryFromVoxelBuffer({
              buffer: basePayload.buffer,
              worldX,
              worldZ,
            });
      const { geometryLayers, visibleBlockKeysByType } = geo;
      const payload: ChunkDataPayload =
        queued.requestId != null
          ? { ...basePayload, geometryLayers, visibleBlockKeysByType, requestId: queued.requestId }
          : { ...basePayload, geometryLayers, visibleBlockKeysByType };
      postPayload(payload);
    }
    pendingQueue = [];
    return;
  }
  if (msg.type === "generate" && typeof msg.chunkX === "number" && typeof msg.chunkZ === "number") {
    if (!generateChunkData) {
      pendingQueue.push({
        type: "generate",
        chunkX: msg.chunkX,
        chunkZ: msg.chunkZ,
        blockMods: msg.blockMods ?? [],
        lod: msg.lod,
        requestId: msg.requestId,
      });
      return;
    }
    const basePayload =
      msg.lod === "far" && generateChunkHeightmap
        ? ({ ...generateChunkHeightmap(msg.chunkX, msg.chunkZ), lod: "far" } as ChunkDataPayload)
        : generateChunkData(msg.chunkX, msg.chunkZ, msg.blockMods ?? []);
    const worldX = msg.chunkX * CHUNK_SIZE;
    const worldZ = msg.chunkZ * CHUNK_SIZE;
    const geo =
      basePayload.lod === "far"
        ? { geometryLayers: [], visibleBlockKeysByType: [] }
        : buildWorkerGeometryFromVoxelBuffer({
            buffer: basePayload.buffer,
            worldX,
            worldZ,
          });
    const { geometryLayers, visibleBlockKeysByType } = geo;
    const payload: ChunkDataPayload =
      msg.requestId != null
        ? { ...basePayload, geometryLayers, visibleBlockKeysByType, requestId: msg.requestId }
        : { ...basePayload, geometryLayers, visibleBlockKeysByType };
    postPayload(payload);
    return;
  }
};
