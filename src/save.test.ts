/**
 * Tests for save/load validation and roundtrip.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  SAVE_KEY,
  SAVE_VERSION,
  VALID_BLOCK_TYPES,
  loadFromStorage,
  saveToStorage,
  type SaveData,
} from './save'

const validPayload: SaveData = {
  saveVersion: SAVE_VERSION,
  worldSeed: 12345,
  player: {
    x: 0,
    y: 64,
    z: 0,
    rotationY: 0,
    lookPitch: 0,
  },
  removedBlocks: [],
  placedBlocks: [],
}

function createStorageMock(initialStore: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initialStore }
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    setGetItem: (value: string | null) => {
      if (value === null) delete store[SAVE_KEY]
      else store[SAVE_KEY] = value
    },
  }
}

describe('loadFromStorage', () => {
  let mock: ReturnType<typeof createStorageMock>

  beforeEach(() => {
    mock = createStorageMock()
    vi.stubGlobal('localStorage', mock)
  })

  it('returns null when nothing stored', () => {
    expect(loadFromStorage()).toBe(null)
  })

  it('returns null for invalid JSON', () => {
    mock.setGetItem('not json')
    expect(loadFromStorage()).toBe(null)
  })

  it('returns null when saveVersion > SAVE_VERSION', () => {
    mock.setGetItem(JSON.stringify({ ...validPayload, saveVersion: SAVE_VERSION + 1 }))
    expect(loadFromStorage()).toBe(null)
  })

  it('returns null when saveVersion < 1', () => {
    mock.setGetItem(JSON.stringify({ ...validPayload, saveVersion: 0 }))
    expect(loadFromStorage()).toBe(null)
  })

  it('returns null when player is missing', () => {
    mock.setGetItem(JSON.stringify({ ...validPayload, player: undefined }))
    expect(loadFromStorage()).toBe(null)
  })

  it('accepts valid payload with saveVersion 1', () => {
    const data = { ...validPayload, saveVersion: 1 }
    mock.setGetItem(JSON.stringify(data))
    expect(loadFromStorage()).toEqual(data)
  })

  it('accepts valid payload with saveVersion 2', () => {
    mock.setGetItem(JSON.stringify(validPayload))
    expect(loadFromStorage()).toEqual(validPayload)
  })
})

describe('saveToStorage and loadFromStorage roundtrip', () => {
  beforeEach(() => {
    const mock = createStorageMock()
    vi.stubGlobal('localStorage', mock)
  })

  it('includes grass_snow in VALID_BLOCK_TYPES (regression)', () => {
    expect(VALID_BLOCK_TYPES.has('grass_snow')).toBe(true)
    expect(VALID_BLOCK_TYPES.has('__not_a_real_block__')).toBe(false)
  })

  it('roundtrips valid SaveData', () => {
    const data: SaveData = {
      ...validPayload,
      placedBlocks: [{ x: 1, y: 65, z: 1, type: 'grass' }],
      dayTime: 0.5,
    }
    saveToStorage(data)
    expect(loadFromStorage()).toEqual(data)
  })

  it('roundtrips SaveData with grass_snow placed block', () => {
    const data: SaveData = {
      ...validPayload,
      placedBlocks: [{ x: 2, y: 65, z: 2, type: 'grass_snow' }],
    }
    saveToStorage(data)
    expect(loadFromStorage()).toEqual(data)
  })

  it('roundtrips SaveData with all critical optional fields (no drops)', () => {
    const data: SaveData = {
      saveVersion: SAVE_VERSION,
      worldSeed: 42,
      player: {
        x: 10,
        y: 70,
        z: -5,
        rotationY: 1.5,
        lookPitch: 0.1,
        level: 2,
        experience: 100,
        gold: 50,
        health: 18,
        hunger: 14,
      },
      removedBlocks: [{ x: 0, y: 64, z: 0 }],
      placedBlocks: [
        { x: 1, y: 65, z: 1, type: 'grass' },
        { x: 2, y: 65, z: 2, type: 'torch' },
      ],
      placedTorches: [{ x: 3, y: 66, z: 3, nx: 0, ny: 1, nz: 0 }],
      dayTime: 0.75,
      snowForced: false,
      inventory: Array.from({ length: 36 }, (_, i) =>
        i === 0 ? { type: 'dirt', count: 64 } : { type: null, count: 0 },
      ),
      activeQuests: [{ questId: 'q1', progress: [1, 0] }],
      completedQuestIds: ['q0'],
      discoveredChunkKeys: [0, 1, 2],
    }
    saveToStorage(data)
    const loaded = loadFromStorage()
    expect(loaded).not.toBe(null)
    expect(loaded!.saveVersion).toBe(data.saveVersion)
    expect(loaded!.worldSeed).toBe(data.worldSeed)
    expect(loaded!.player.x).toBe(data.player.x)
    expect(loaded!.player.level).toBe(data.player.level)
    expect(loaded!.removedBlocks).toEqual(data.removedBlocks)
    expect(loaded!.placedBlocks).toEqual(data.placedBlocks)
    expect(loaded!.placedTorches).toEqual(data.placedTorches)
    expect(loaded!.dayTime).toBe(data.dayTime)
    expect(loaded!.snowForced).toBe(data.snowForced)
    expect(loaded!.inventory).toHaveLength(data.inventory!.length)
    expect(loaded!.activeQuests).toEqual(data.activeQuests)
    expect(loaded!.completedQuestIds).toEqual(data.completedQuestIds)
    expect(loaded!.discoveredChunkKeys).toEqual(data.discoveredChunkKeys)
  })
})

/** Minimal valid save from previous version; used to ensure we can still load older saves. */
const OLD_SAVE_FIXTURE_V7 = JSON.stringify({
  saveVersion: 7,
  worldSeed: 999,
  player: { x: 0, y: 64, z: 0, rotationY: 0, lookPitch: 0 },
  removedBlocks: [],
  placedBlocks: [],
})

describe('save versioning (load older)', () => {
  beforeEach(() => {
    const mock = createStorageMock()
    vi.stubGlobal('localStorage', mock)
  })

  it('loads older save fixture (v7) and returns valid shape', () => {
    const mock = createStorageMock({ [SAVE_KEY]: OLD_SAVE_FIXTURE_V7 })
    vi.stubGlobal('localStorage', mock)
    const loaded = loadFromStorage()
    expect(loaded).not.toBe(null)
    expect(loaded!.saveVersion).toBe(7)
    expect(loaded!.worldSeed).toBe(999)
    expect(loaded!.player).toBeDefined()
    expect(loaded!.player.x).toBe(0)
    expect(loaded!.removedBlocks).toEqual([])
    expect(loaded!.placedBlocks).toEqual([])
  })
})
