/**
 * Pure, testable handler for chunk-worker messages.
 * Encapsulates init/generate state machine so it can run
 * in both the real Web Worker and in Node/Vitest tests.
 */
import { createChunkGenerator } from "./terrain-core";
import type { BlockModEntry, ChunkDataPayload } from "./terrain-core";
import { CHUNK_SIZE, SNOW_ACCUMULATION_HEIGHT } from "./constants";
import { buildWorkerGeometryFromVoxelBuffer } from "./terrain/worker-geometry";

export type InitMsg = { type: "init"; seed: number; snowAccumulationHeight?: number };
export type GenerateMsg = {
  type: "generate";
  chunkX: number;
  chunkZ: number;
  blockMods: BlockModEntry[];
  requestId?: number;
};

export type WorkerMsg = InitMsg | GenerateMsg;

function processGenerate(
  msg: GenerateMsg,
  generateChunkData: ReturnType<typeof createChunkGenerator>["generateChunkData"],
): ChunkDataPayload {
  const basePayload = generateChunkData(msg.chunkX, msg.chunkZ, msg.blockMods ?? []);

  const worldX = msg.chunkX * CHUNK_SIZE;
  const worldZ = msg.chunkZ * CHUNK_SIZE;
  const geo = buildWorkerGeometryFromVoxelBuffer({
    buffer: basePayload.buffer,
    worldX,
    worldZ,
  });

  const { geometryLayers, visibleBlockKeysByType } = geo;
  const payload: ChunkDataPayload =
    msg.requestId != null
      ? { ...basePayload, geometryLayers, visibleBlockKeysByType, requestId: msg.requestId }
      : { ...basePayload, geometryLayers, visibleBlockKeysByType };
  return payload;
}

export function createWorkerHandler() {
  let generateChunkData: ReturnType<typeof createChunkGenerator>["generateChunkData"] | null = null;
  let pendingQueue: GenerateMsg[] = [];

  function handleMessage(msg: WorkerMsg): ChunkDataPayload[] {
    if (msg.type === "init" && typeof msg.seed === "number") {
      const gen = createChunkGenerator(msg.seed, {
        snowAccumulationHeight: msg.snowAccumulationHeight ?? SNOW_ACCUMULATION_HEIGHT,
      });
      generateChunkData = gen.generateChunkData;

      const results: ChunkDataPayload[] = [];
      for (const queued of pendingQueue) {
        results.push(processGenerate(queued, generateChunkData));
      }
      pendingQueue = [];
      return results;
    }

    if (msg.type === "generate" && typeof msg.chunkX === "number" && typeof msg.chunkZ === "number") {
      if (!generateChunkData) {
        pendingQueue.push({
          type: "generate",
          chunkX: msg.chunkX,
          chunkZ: msg.chunkZ,
          blockMods: msg.blockMods ?? [],
          requestId: msg.requestId,
        });
        return [];
      }
      return [processGenerate(msg, generateChunkData)];
    }

    return [];
  }

  return { handleMessage };
}
