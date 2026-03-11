import { describe, it, expect } from 'vitest'
import { planChunksAroundPlayer, sortChunksByLookPriority } from './chunk-planning'

function key(cx: number, cz: number): number {
  // Stable, collision-free for small test coords.
  return (cx + 1000) * 10_000 + (cz + 1000)
}

describe('sortChunksByLookPriority', () => {
  it('prioritizes chunks in front of look direction', () => {
    const chunks = [
      { cx: -1, cz: 0 },
      { cx: 1, cz: 0 },
    ]
    const sorted = sortChunksByLookPriority(chunks, 0, 0, { x: 1, z: 0 })
    expect(sorted[0]).toEqual({ cx: 1, cz: 0 })
  })

  it('keeps order when look direction is near zero', () => {
    const chunks = [
      { cx: -1, cz: 0 },
      { cx: 1, cz: 0 },
    ]
    const sorted = sortChunksByLookPriority(chunks, 0, 0, { x: 0, z: 0 })
    expect(sorted).toEqual(chunks)
  })
})

describe('planChunksAroundPlayer', () => {
  it('plans loading for missing chunks within render distance', () => {
    const existingChunks = [{ keyNum: key(0, 0), cx: 0, cz: 0 }]
    const pendingChunkKeys = new Set<number>()
    const out = planChunksAroundPlayer({
      playerX: 0,
      playerZ: 0,
      renderDistance: 1,
      renderDistanceSq: 1,
      existingChunks,
      pendingChunkKeys,
      useWorker: true,
      lookDirection: { x: 1, z: 0 },
      chunkKeyNumeric: key,
    })

    // radiusSq=1 includes center + 4 axis neighbors; center is already present
    expect(out.toLoad).toHaveLength(4)
    const coords = new Set(out.toLoad.map((c) => `${c.cx},${c.cz}`))
    expect(coords.has('1,0')).toBe(true)
    expect(coords.has('-1,0')).toBe(true)
    expect(coords.has('0,1')).toBe(true)
    expect(coords.has('0,-1')).toBe(true)
  })

  it('plans unloading for chunks beyond render distance', () => {
    const existingChunks = [
      { keyNum: key(0, 0), cx: 0, cz: 0 },
      { keyNum: key(3, 0), cx: 3, cz: 0 },
    ]
    const out = planChunksAroundPlayer({
      playerX: 0,
      playerZ: 0,
      renderDistance: 1,
      renderDistanceSq: 1,
      existingChunks,
      pendingChunkKeys: new Set<number>(),
      useWorker: true,
      chunkKeyNumeric: key,
    })
    expect(out.toUnload).toEqual([key(3, 0)])
  })
})
