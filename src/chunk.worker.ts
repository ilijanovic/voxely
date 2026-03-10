/**
 * Web Worker: generates chunk terrain data off the main thread.
 * Receives: { type: "init", seed } then { type: "generate", chunkX, chunkZ, blockMods, requestId? }.
 * Sends back: ChunkDataPayload (optionally with requestId for stale filtering on main thread).
 */
import { createChunkGenerator } from "./terrain-core";
import type { BlockModEntry, ChunkDataPayload } from "./terrain-core";

type InitMsg = { type: "init"; seed: number };
type GenerateMsg = {
  type: "generate";
  chunkX: number;
  chunkZ: number;
  blockMods: BlockModEntry[];
  /**
   * Optional request identifier propagated back to the main thread so it can discard stale results.
   */
  requestId?: number;
};

type WorkerMsg = InitMsg | GenerateMsg;

let generateChunkData: ReturnType<typeof createChunkGenerator>["generateChunkData"] | null = null;
let pendingQueue: GenerateMsg[] = [];

function postPayload(payload: ChunkDataPayload): void {
  const transferList: Transferable[] = [];
  if (payload.buffer?.buffer instanceof ArrayBuffer) {
    transferList.push(payload.buffer.buffer);
  }
  // @ts-expect-error lib.d.ts may not declare self as DedicatedWorkerGlobalScope in this context.
  self.postMessage(payload, transferList);
}

self.onmessage = (e: MessageEvent<WorkerMsg>) => {
  const msg = e.data;
  if (msg.type === "init" && typeof msg.seed === "number") {
    const gen = createChunkGenerator(msg.seed);
    generateChunkData = gen.generateChunkData;
    for (const queued of pendingQueue) {
      const basePayload = generateChunkData(queued.chunkX, queued.chunkZ, queued.blockMods);
      const payload: ChunkDataPayload =
        queued.requestId != null ? { ...basePayload, requestId: queued.requestId } : basePayload;
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
        requestId: msg.requestId,
      });
      return;
    }
    const basePayload = generateChunkData(msg.chunkX, msg.chunkZ, msg.blockMods ?? []);
    const payload: ChunkDataPayload =
      msg.requestId != null ? { ...basePayload, requestId: msg.requestId } : basePayload;
    postPayload(payload);
    return;
  }
};
