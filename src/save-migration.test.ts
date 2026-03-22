import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SAVE_VERSION, loadFromStorage, saveToStorage, type SaveData } from './save'

const SAVE_KEY = 'voxel-save'

/**
 * Creates a lightweight localStorage mock for save migration tests.
 *
 * @param initialStore - Initial key-value entries
 * @returns Mocked storage API
 */
function createStorageMock(initialStore: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initialStore }
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
  }
}

describe('save migration fields', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock())
  })

  it('writes current save version and block state version', () => {
    const payload: SaveData = {
      saveVersion: SAVE_VERSION,
      worldSeed: 1,
      player: { x: 0, y: 64, z: 0, rotationY: 0, lookPitch: 0 },
      removedBlocks: [],
      placedBlocks: [],
      blockStateVersion: 1,
    }
    saveToStorage(payload)
    const loaded = loadFromStorage()
    expect(loaded?.saveVersion).toBe(SAVE_VERSION)
    expect(loaded?.blockStateVersion).toBe(1)
  })

  it('migrates legacy water placements to water_source', () => {
    const legacy: SaveData = {
      saveVersion: 8,
      worldSeed: 7,
      player: { x: 0, y: 64, z: 0, rotationY: 0, lookPitch: 0 },
      removedBlocks: [],
      placedBlocks: [{ x: 1, y: 62, z: 1, type: 'water' }],
    }
    vi.stubGlobal('localStorage', createStorageMock({ [SAVE_KEY]: JSON.stringify(legacy) }))
    const loaded = loadFromStorage()
    expect(loaded?.placedBlocks[0]?.type).toBe('water_source')
    expect(loaded?.blockStateVersion).toBeUndefined()
  })
})
