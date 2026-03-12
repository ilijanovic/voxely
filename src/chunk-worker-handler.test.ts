/**
 * Tests for createWorkerHandler – the extracted worker state machine.
 * Verifies init/generate flow, pending queue, requestId propagation,
 * and blockMods application without a real Web Worker.
 */
import { describe, it, expect } from 'vitest'
import { createWorkerHandler } from './chunk-worker-handler'
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_MIN_Y } from './constants'
import { typeToId } from './terrain/block-ids'
import { localKey } from './terrain/block-ids'

const TEST_SEED = 42

describe('createWorkerHandler', () => {
  it('returns no payloads for init message', () => {
    const handler = createWorkerHandler()
    const payloads = handler.handleMessage({ type: 'init', seed: TEST_SEED })
    expect(payloads).toHaveLength(0)
  })

  it('generates a payload after init then generate', () => {
    const handler = createWorkerHandler()
    handler.handleMessage({ type: 'init', seed: TEST_SEED })

    const payloads = handler.handleMessage({
      type: 'generate',
      chunkX: 0,
      chunkZ: 0,
      blockMods: [],
    })
    expect(payloads).toHaveLength(1)
    const p = payloads[0]
    expect(p.chunkX).toBe(0)
    expect(p.chunkZ).toBe(0)
    expect(p.buffer).toBeInstanceOf(Uint8Array)
    expect(p.buffer.length).toBe(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)
    expect(p.heightmap).toBeDefined()
    expect(p.geometryLayers).toBeDefined()
    expect(p.visibleBlockKeysByType).toBeDefined()
  })

  it('queues generate before init and flushes on init', () => {
    const handler = createWorkerHandler()

    const earlyPayloads = handler.handleMessage({
      type: 'generate',
      chunkX: 1,
      chunkZ: 2,
      blockMods: [],
    })
    expect(earlyPayloads).toHaveLength(0)

    const initPayloads = handler.handleMessage({ type: 'init', seed: TEST_SEED })
    expect(initPayloads).toHaveLength(1)
    expect(initPayloads[0].chunkX).toBe(1)
    expect(initPayloads[0].chunkZ).toBe(2)
  })

  it('flushes multiple pending generates on init', () => {
    const handler = createWorkerHandler()

    handler.handleMessage({ type: 'generate', chunkX: 0, chunkZ: 0, blockMods: [] })
    handler.handleMessage({ type: 'generate', chunkX: 1, chunkZ: 0, blockMods: [] })
    handler.handleMessage({ type: 'generate', chunkX: 0, chunkZ: 1, blockMods: [] })

    const payloads = handler.handleMessage({ type: 'init', seed: TEST_SEED })
    expect(payloads).toHaveLength(3)
    expect(payloads.map((p) => [p.chunkX, p.chunkZ])).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
    ])
  })

  it('propagates requestId when present', () => {
    const handler = createWorkerHandler()
    handler.handleMessage({ type: 'init', seed: TEST_SEED })

    const payloads = handler.handleMessage({
      type: 'generate',
      chunkX: 0,
      chunkZ: 0,
      blockMods: [],
      requestId: 77,
    })
    expect(payloads[0].requestId).toBe(77)
  })

  it('omits requestId when not provided', () => {
    const handler = createWorkerHandler()
    handler.handleMessage({ type: 'init', seed: TEST_SEED })

    const payloads = handler.handleMessage({
      type: 'generate',
      chunkX: 0,
      chunkZ: 0,
      blockMods: [],
    })
    expect(payloads[0].requestId).toBeUndefined()
  })

  it('preserves requestId through pending queue', () => {
    const handler = createWorkerHandler()
    handler.handleMessage({
      type: 'generate',
      chunkX: 0,
      chunkZ: 0,
      blockMods: [],
      requestId: 99,
    })
    const payloads = handler.handleMessage({ type: 'init', seed: TEST_SEED })
    expect(payloads[0].requestId).toBe(99)
  })

  it('applies blockMods to generated buffer', () => {
    const handler = createWorkerHandler()
    handler.handleMessage({ type: 'init', seed: TEST_SEED })

    const stoneId = typeToId('stone')
    const modX = 5
    const modY = 70 // world Y
    const modZ = 5
    const payloads = handler.handleMessage({
      type: 'generate',
      chunkX: 0,
      chunkZ: 0,
      blockMods: [{ bx: modX, by: modY, bz: modZ, value: 'stone' }],
    })

    const ly = modY - WORLD_MIN_Y
    const key = localKey(modX, ly, modZ)
    expect(payloads[0].buffer[key]).toBe(stoneId)
  })

  it('each generate returns exactly one payload', () => {
    const handler = createWorkerHandler()
    handler.handleMessage({ type: 'init', seed: TEST_SEED })

    for (let i = 0; i < 3; i++) {
      const payloads = handler.handleMessage({
        type: 'generate',
        chunkX: i,
        chunkZ: 0,
        blockMods: [],
      })
      expect(payloads).toHaveLength(1)
      expect(payloads[0].chunkX).toBe(i)
    }
  })

  it('ignores unrecognized message types', () => {
    const handler = createWorkerHandler()
    const payloads = handler.handleMessage({ type: 'unknown' } as never)
    expect(payloads).toHaveLength(0)
  })
})
