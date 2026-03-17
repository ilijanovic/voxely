/**
 * Unit tests for chunk-worker-client: stale response filtering and queue behavior.
 * Uses a mock Worker to simulate message passing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initChunkWorkerClient } from './chunk-worker-client'
import type { ChunkDataPayload } from '../../terrain-core'

function makeMinimalPayload(
  chunkX: number,
  chunkZ: number,
  requestId: number,
): ChunkDataPayload & { requestId?: number } {
  return {
    chunkX,
    chunkZ,
    buffer: new Uint8Array(1),
    heightmap: [],
    requestId,
  }
}

describe('chunk-worker-client', () => {
  const workerInstances: Array<{
    postMessage: ReturnType<typeof vi.fn>
    _onmessage: ((e: MessageEvent) => void) | null
  }> = []

  beforeEach(() => {
    workerInstances.length = 0
    vi.stubGlobal(
      'Worker',
      class MockWorker {
        postMessage = vi.fn()
        _onmessage: ((e: MessageEvent) => void) | null = null
        set onmessage(fn: (e: MessageEvent) => void) {
          this._onmessage = fn
        }
        terminate = vi.fn()
        constructor() {
          workerInstances.push(this as unknown as (typeof workerInstances)[0])
        }
      },
    )
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('discards stale response when a newer request was made for the same chunk', () => {
    const onPayload = vi.fn()
    const client = initChunkWorkerClient({
      seed: 1,
      maxWorkers: 2,
      onPayload,
    })
    expect(client).not.toBeNull()
    expect(workerInstances.length).toBeGreaterThanOrEqual(2)

    client!.requestChunk({ chunkX: 0, chunkZ: 0, blockMods: [] })
    client!.requestChunk({ chunkX: 0, chunkZ: 0, blockMods: [] })

    const [worker0, worker1] = workerInstances
    expect(worker0._onmessage).not.toBeNull()
    expect(worker1._onmessage).not.toBeNull()

    worker1._onmessage!({ data: makeMinimalPayload(0, 0, 2) } as MessageEvent)
    expect(onPayload).toHaveBeenCalledTimes(1)
    expect(onPayload).toHaveBeenLastCalledWith(
      expect.objectContaining({ chunkX: 0, chunkZ: 0, requestId: 2 }),
    )

    worker0._onmessage!({ data: makeMinimalPayload(0, 0, 1) } as MessageEvent)
    expect(onPayload).toHaveBeenCalledTimes(1)
  })

  it('delivers responses for different chunks in request order', () => {
    const onPayload = vi.fn()
    const client = initChunkWorkerClient({
      seed: 1,
      maxWorkers: 1,
      onPayload,
    })
    expect(client).not.toBeNull()
    expect(workerInstances[0]._onmessage).not.toBeNull()

    client!.requestChunk({ chunkX: 0, chunkZ: 0, blockMods: [] })
    client!.requestChunk({ chunkX: 1, chunkZ: 0, blockMods: [] })

    const onmessage = workerInstances[0]._onmessage!
    onmessage({ data: makeMinimalPayload(0, 0, 1) } as MessageEvent)
    onmessage({ data: makeMinimalPayload(1, 0, 2) } as MessageEvent)

    expect(onPayload).toHaveBeenCalledTimes(2)
    expect(onPayload).toHaveBeenNthCalledWith(1, expect.objectContaining({ chunkX: 0, chunkZ: 0 }))
    expect(onPayload).toHaveBeenNthCalledWith(2, expect.objectContaining({ chunkX: 1, chunkZ: 0 }))
  })

  it('terminate clears state and prevents further requests from being sent', () => {
    const onPayload = vi.fn()
    const client = initChunkWorkerClient({
      seed: 1,
      maxWorkers: 1,
      onPayload,
    })
    expect(client).not.toBeNull()
    client!.terminate()
    workerInstances[0].postMessage.mockClear()
    client!.requestChunk({ chunkX: 0, chunkZ: 0, blockMods: [] })
    expect(workerInstances[0].postMessage).not.toHaveBeenCalled()
  })

  it('sends default overhang profile in init message', () => {
    initChunkWorkerClient({
      seed: 1,
      maxWorkers: 1,
      onPayload: vi.fn(),
    })
    expect(workerInstances[0].postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'init',
        overhangProfile: 'vanilla',
      }),
    )
  })

  it('sends custom overhang profile in init message', () => {
    initChunkWorkerClient({
      seed: 1,
      overhangProfile: 'dramatic',
      maxWorkers: 1,
      onPayload: vi.fn(),
    })
    expect(workerInstances[0].postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'init',
        overhangProfile: 'dramatic',
      }),
    )
  })
})
