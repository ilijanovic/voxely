import type { ChunkDataPayload, BlockModEntry, OverhangProfile } from '../../terrain-core'
import type { WorldPoi } from '../../world-pois'
import { chunkKeyNumeric } from '../../chunk-runtime'
import { SNOW_ACCUMULATION_HEIGHT } from '../../constants'

export type ChunkWorkerClient = {
  /**
   * Enqueue a chunk generation job. The pool will schedule it on the next available worker.
   */
  requestChunk: (options: { chunkX: number; chunkZ: number; blockMods: BlockModEntry[] }) => void
  /**
   * Terminate all underlying workers.
   */
  terminate: () => void
}

type InternalJob = {
  requestId: number
  chunkX: number
  chunkZ: number
  blockMods: BlockModEntry[]
}

type WorkerState = {
  worker: Worker
  busy: boolean
  currentRequestId: number | null
}

export function initChunkWorkerClient(options: {
  seed: number
  /** Snow layer height 0–8 for terrain. Default from SNOW_ACCUMULATION_HEIGHT. */
  snowAccumulationHeight?: number
  /** Overhang carving profile for terrain generation. */
  overhangProfile?: OverhangProfile
  /** Pre-defined POIs for biome override and fixed village/NPC/mob placement. */
  pois?: WorldPoi[]
  /**
   * Upper bound for how many workers may be created.
   * Default: 4.
   */
  maxWorkers?: number
  onPayload: (payload: ChunkDataPayload) => void
  onError?: (message: string, error?: unknown) => void
}): ChunkWorkerClient | null {
  if (typeof Worker === 'undefined') return null

  const hardwareConcurrency =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 4
  const maxWorkers = Math.max(1, Math.floor(options.maxWorkers ?? 4))
  const workerCount = Math.max(1, Math.min(maxWorkers, hardwareConcurrency - 1))

  const workers: WorkerState[] = []
  const jobQueue: InternalJob[] = []
  const latestRequestIdByChunkKey = new Map<number, number>()
  let nextRequestId = 1
  let initializationFailed = false

  function flushQueue(): void {
    if (initializationFailed) return
    for (const state of workers) {
      if (!jobQueue.length) break
      if (state.busy) continue
      const job = jobQueue.shift()
      if (!job) break
      state.busy = true
      state.currentRequestId = job.requestId
      state.worker.postMessage({
        type: 'generate',
        chunkX: job.chunkX,
        chunkZ: job.chunkZ,
        blockMods: job.blockMods,
        requestId: job.requestId,
      })
    }
  }

  try {
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(new URL('../../chunk.worker.ts', import.meta.url), {
        type: 'module',
      })
      const state: WorkerState = {
        worker,
        busy: false,
        currentRequestId: null,
      }

      worker.onmessage = (e: MessageEvent<ChunkDataPayload & { requestId?: number }>) => {
        const payload = e.data
        const keyNum = chunkKeyNumeric(payload.chunkX, payload.chunkZ)
        const latestForChunk = latestRequestIdByChunkKey.get(keyNum)
        const reqId = payload.requestId ?? null

        state.busy = false
        state.currentRequestId = null

        // Stale-filter: if this response is older than the latest request for this chunk, discard it.
        if (latestForChunk != null && reqId != null && reqId < latestForChunk) {
          flushQueue()
          return
        }

        options.onPayload(payload)
        flushQueue()
      }

      worker.onerror = (event: ErrorEvent) => {
        initializationFailed = true
        options.onError?.(event.message, event)
      }

      worker.postMessage({
        type: 'init',
        seed: options.seed,
        snowAccumulationHeight: options.snowAccumulationHeight ?? SNOW_ACCUMULATION_HEIGHT,
        overhangProfile: options.overhangProfile ?? 'vanilla',
        pois: options.pois,
      })
      workers.push(state)
    }
  } catch (error) {
    initializationFailed = true
    options.onError?.('chunk worker initialization failed', error)
    for (const state of workers) state.worker.terminate()
    return null
  }

  const client: ChunkWorkerClient = {
    requestChunk: ({ chunkX, chunkZ, blockMods }) => {
      if (initializationFailed) return
      const keyNum = chunkKeyNumeric(chunkX, chunkZ)
      const requestId = nextRequestId++
      latestRequestIdByChunkKey.set(keyNum, requestId)
      jobQueue.push({ requestId, chunkX, chunkZ, blockMods })
      flushQueue()
    },
    terminate: () => {
      for (const state of workers) {
        state.worker.terminate()
      }
      workers.length = 0
      jobQueue.length = 0
      latestRequestIdByChunkKey.clear()
      initializationFailed = true
    },
  }

  return client
}
