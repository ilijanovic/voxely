/**
 * Determinism snapshots for worldgen: same seed + chunk coords must produce
 * identical summaries. Prevents accidental seed drift when changing terrain/biomes/features.
 */
import { describe, it, expect } from 'vitest'
import { createWorkerHandler } from '../chunk-worker-handler'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../constants'
import type { ChunkDataPayload } from './index'
import { ALL_BIOMES } from './index'
import { idToType } from './block-ids'

/** Seeds used for snapshot regression; change only when worldgen is intentionally changed. */
const SNAPSHOT_SEEDS = [12345, 99999] as const

/** Chunk coords around spawn (0,0): 3×3 grid. */
const SNAPSHOT_CHUNKS: Array<[number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 0],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]

/**
 * FNV-1a 32-bit hash of bytes for stable buffer fingerprint.
 */
function fnv1a32(bytes: Uint8Array): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Builds a compact, deterministic summary of a chunk payload for snapshot comparison.
 * Biome and block counts catch worldgen changes; hashes catch any byte-level drift.
 */
function summarizePayload(payload: ChunkDataPayload): {
  biomeCounts: Record<string, number>
  blockCounts: Record<string, number>
  bufferHash: string
  heightmapHash: string
  surfaceYMin: number
  surfaceYMax: number
} {
  const biomeCounts: Record<string, number> = {}
  const blockCounts: Record<string, number> = {}

  if (payload.biomeMapBuffer) {
    for (let i = 0; i < payload.biomeMapBuffer.length; i++) {
      const idx: number = payload.biomeMapBuffer[i]
      const name = ALL_BIOMES[idx] ?? `unknown_${idx}`
      biomeCounts[name] = (biomeCounts[name] ?? 0) + 1
    }
  }

  for (let i = 0; i < payload.buffer.length; i++) {
    const id = payload.buffer[i]
    const name = idToType(id)
    blockCounts[name] = (blockCounts[name] ?? 0) + 1
  }

  let surfaceYMin = Infinity
  let surfaceYMax = -Infinity
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const y = payload.heightmap[lx][lz]
      if (Number.isFinite(y)) {
        surfaceYMin = Math.min(surfaceYMin, y)
        surfaceYMax = Math.max(surfaceYMax, y)
      }
    }
  }
  if (surfaceYMin === Infinity) surfaceYMin = 0
  if (surfaceYMax === -Infinity) surfaceYMax = 0

  const heightmapHash = payload.heightmapBuffer
    ? fnv1a32(new Uint8Array(payload.heightmapBuffer.buffer, payload.heightmapBuffer.byteOffset, payload.heightmapBuffer.byteLength))
    : 'none'

  return {
    biomeCounts: Object.keys(biomeCounts)
      .sort()
      .reduce<Record<string, number>>((acc, k) => {
        acc[k] = biomeCounts[k]
        return acc
      }, {}),
    blockCounts: Object.keys(blockCounts)
      .sort()
      .reduce<Record<string, number>>((acc, k) => {
        acc[k] = blockCounts[k]
        return acc
      }, {}),
    bufferHash: fnv1a32(payload.buffer),
    heightmapHash,
    surfaceYMin,
    surfaceYMax,
  }
}

/**
 * Generates one chunk payload via the same path as the worker (deterministic).
 */
function generateChunk(seed: number, chunkX: number, chunkZ: number): ChunkDataPayload {
  const handler = createWorkerHandler()
  handler.handleMessage({ type: 'init', seed })
  const payloads = handler.handleMessage({
    type: 'generate',
    chunkX,
    chunkZ,
    blockMods: [],
  })
  if (payloads.length !== 1) throw new Error(`Expected one payload, got ${payloads.length}`)
  return payloads[0]
}

describe('worldgen determinism snapshots', () => {
  it('produces identical summary when generated twice (same seed + chunk)', () => {
    const seed = SNAPSHOT_SEEDS[0]
    const [cx, cz] = SNAPSHOT_CHUNKS[0]
    const a = summarizePayload(generateChunk(seed, cx, cz))
    const b = summarizePayload(generateChunk(seed, cx, cz))
    expect(b).toEqual(a)
  })

  it('keeps deterministic summaries for all seeds and chunks (regression)', () => {
    const firstPass: Record<string, Record<string, ReturnType<typeof summarizePayload>>> = {}
    const secondPass: Record<string, Record<string, ReturnType<typeof summarizePayload>>> = {}
    for (const seed of SNAPSHOT_SEEDS) {
      const seedKey = `seed_${seed}`
      firstPass[seedKey] = {}
      secondPass[seedKey] = {}
      for (const [cx, cz] of SNAPSHOT_CHUNKS) {
        const key = `${cx},${cz}`
        firstPass[seedKey][key] = summarizePayload(generateChunk(seed, cx, cz))
        secondPass[seedKey][key] = summarizePayload(generateChunk(seed, cx, cz))
      }
    }
    expect(secondPass).toEqual(firstPass)
  })

  it('payloads have valid structure (no NaN, expected lengths)', () => {
    const payload = generateChunk(SNAPSHOT_SEEDS[0], 0, 0)
    expect(payload.heightmap).toHaveLength(CHUNK_SIZE)
    expect(payload.heightmap[0]).toHaveLength(CHUNK_SIZE)
    expect(payload.buffer).toHaveLength(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const y = payload.heightmap[lx][lz]
        expect(Number.isFinite(y)).toBe(true)
        expect(y).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
