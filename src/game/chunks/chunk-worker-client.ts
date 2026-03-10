import type { ChunkDataPayload } from "../../terrain-core";

export type ChunkWorkerClient = {
  worker: Worker;
  terminate: () => void;
};

export function initChunkWorkerClient(options: {
  seed: number;
  onPayload: (payload: ChunkDataPayload) => void;
  onError?: (message: string, error?: unknown) => void;
}): ChunkWorkerClient | null {
  if (typeof Worker === "undefined") return null;
  try {
    const worker = new Worker(new URL("../../chunk.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.postMessage({ type: "init", seed: options.seed });
    worker.onmessage = (e: MessageEvent<ChunkDataPayload>) => options.onPayload(e.data);
    worker.onerror = (event: ErrorEvent) => {
      options.onError?.(event.message, event);
    };
    return {
      worker,
      terminate: () => worker.terminate(),
    };
  } catch (error) {
    options.onError?.("chunk worker initialization failed", error);
    return null;
  }
}

