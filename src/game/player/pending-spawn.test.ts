import { describe, it, expect } from 'vitest'
import { isPendingSpawnReady, type PendingSpawn } from './pending-spawn'

describe('isPendingSpawnReady', () => {
  it('returns true when all required chunks exist', () => {
    const pending: PendingSpawn = {
      spawnX: 1,
      spawnZ: 2,
      chunkKeys: new Set([1, 2, 3]),
    }
    expect(isPendingSpawnReady(pending, (k) => k === 1 || k === 2 || k === 3)).toBe(true)
  })

  it('returns false when any required chunk is missing', () => {
    const pending: PendingSpawn = {
      spawnX: 1,
      spawnZ: 2,
      chunkKeys: new Set([1, 2, 3]),
    }
    expect(isPendingSpawnReady(pending, (k) => k !== 2)).toBe(false)
  })
})
