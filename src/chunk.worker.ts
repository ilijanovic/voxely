/**
 * Web Worker: generates chunk terrain data off the main thread.
 * Receives: { type: "init", seed } then { type: "generate", chunkX, chunkZ, blockMods }.
 * Sends back: ChunkDataPayload.
 */
import { createChunkGenerator } from "./terrain-core";
import type { BlockModEntry } from "./terrain-core";

type GenerateMsg = { type: "generate"; chunkX: number; chunkZ: number; blockMods: BlockModEntry[] };

let generateChunkData: ReturnType<typeof createChunkGenerator>["generateChunkData"] | null = null;
let pendingQueue: GenerateMsg[] = [];

self.onmessage = (e: MessageEvent<{ type: string; seed?: number; chunkX?: number; chunkZ?: number; blockMods?: BlockModEntry[] }>) => {
  const msg = e.data;
  if (msg.type === "init" && typeof msg.seed === "number") {
    const gen = createChunkGenerator(msg.seed);
    generateChunkData = gen.generateChunkData;
    for (const queued of pendingQueue) {
      self.postMessage(generateChunkData(queued.chunkX, queued.chunkZ, queued.blockMods));
    }
    pendingQueue = [];
    return;
  }
  if (msg.type === "generate" && typeof msg.chunkX === "number" && typeof msg.chunkZ === "number") {
    if (!generateChunkData) {
      pendingQueue.push({ type: "generate", chunkX: msg.chunkX, chunkZ: msg.chunkZ, blockMods: msg.blockMods ?? [] });
      return;
    }
    const payload = generateChunkData(msg.chunkX, msg.chunkZ, msg.blockMods ?? []);
    self.postMessage(payload);
    return;
  }
};
