/**
 * Web Worker: generates chunk terrain data off the main thread.
 * Receives: { type: "init", seed } then { type: "generate", chunkX, chunkZ, blockMods, requestId? }.
 * Sends back: ChunkDataPayload (optionally with requestId for stale filtering on main thread).
 *
 * Core logic lives in chunk-worker-handler.ts so it can be tested without a Worker scope.
 */
import type { ChunkDataPayload } from "./terrain-core";
import { createWorkerHandler } from "./chunk-worker-handler";
import type { WorkerMsg } from "./chunk-worker-handler";

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
      if (layer.position?.buffer instanceof ArrayBuffer)
        transferList.push(layer.position.buffer);
      if (layer.normal?.buffer instanceof ArrayBuffer)
        transferList.push(layer.normal.buffer);
      if (layer.uv?.buffer instanceof ArrayBuffer)
        transferList.push(layer.uv.buffer);
      if (layer.faceVertexCounts?.buffer instanceof ArrayBuffer)
        transferList.push(layer.faceVertexCounts.buffer);
    }
  }
  if (payload.visibleBlockKeysByType) {
    for (const entry of payload.visibleBlockKeysByType) {
      if (entry.keys?.buffer instanceof ArrayBuffer)
        transferList.push(entry.keys.buffer);
    }
  }
  // @ts-expect-error lib.d.ts may not declare self as DedicatedWorkerGlobalScope in this context.
  self.postMessage(payload, transferList);
}

const handler = createWorkerHandler();

self.onmessage = (e: MessageEvent<WorkerMsg>) => {
  for (const payload of handler.handleMessage(e.data)) {
    postPayload(payload);
  }
};
