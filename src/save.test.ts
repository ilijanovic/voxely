/**
 * Tests for save/load validation and roundtrip.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  SAVE_KEY,
  SAVE_VERSION,
  addWorldPlaytime,
  applyWorldSlotSeed,
  createDefaultNamedWorldSlot,
  createWorldSlot,
  duplicateWorldSlot,
  deleteWorldSlot,
  ensureWorldSlots,
  exportWorldSlot,
  getActiveWorldSlotId,
  getStoredWorldSeed,
  importWorldSlot,
  loadWorldSave,
  listWorldSlots,
  markWorldLaunched,
  renameWorldSlot,
  setWorldPinned,
  VALID_BLOCK_TYPES,
  loadFromStorage,
  saveToStorage,
  setActiveWorldSlotId,
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
    removeItem: (key: string) => {
      delete store[key]
    },
    setGetItem: (value: string | null) => {
      if (value === null) delete store[SAVE_KEY]
      else store[SAVE_KEY] = value
    },
    getStore: () => ({ ...store }),
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

describe('world slots', () => {
  beforeEach(() => {
    const mock = createStorageMock()
    vi.stubGlobal('localStorage', mock)
  })

  it('migrates legacy save to first world slot', () => {
    const legacyData: SaveData = {
      ...validPayload,
      worldSeed: 777,
      player: {
        ...validPayload.player,
        x: 12,
      },
    }
    const legacyRaw = JSON.stringify(legacyData)
    const mock = createStorageMock({ [SAVE_KEY]: legacyRaw })
    vi.stubGlobal('localStorage', mock)

    const ensured = ensureWorldSlots()
    expect(ensured.worlds).toHaveLength(1)
    expect(ensured.activeWorldId).toBeTruthy()
    expect(getActiveWorldSlotId()).toBe(ensured.activeWorldId)
    expect(ensured.worlds[0].hasSave).toBe(true)

    const store = mock.getStore()
    const worldSaveKey = `${SAVE_KEY}:${ensured.worlds[0].id}`
    expect(store[worldSaveKey]).toBe(legacyRaw)
    // Migration should not keep legacy SAVE_KEY around, otherwise every new world slot
    // would inherit the same player position from the legacy payload.
    expect(store[SAVE_KEY]).toBeUndefined()
  })

  it('does not inherit legacy save for later world slots', () => {
    const legacyData: SaveData = {
      ...validPayload,
      worldSeed: 777,
      player: {
        ...validPayload.player,
        x: 12,
      },
    }
    const legacyRaw = JSON.stringify(legacyData)
    const mock = createStorageMock({ [SAVE_KEY]: legacyRaw })
    vi.stubGlobal('localStorage', mock)

    const ensured = ensureWorldSlots()
    expect(ensured.worlds).toHaveLength(1)

    const second = createWorldSlot('Bravo', 222)
    setActiveWorldSlotId(second.id)

    // Legacy save has been removed during ensureWorldSlots migration, so this new world
    // must not get the legacy player state.
    expect(loadFromStorage()).toBe(null)
  })

  it('creates a default-named world and selects it', () => {
    ensureWorldSlots()
    const created = createDefaultNamedWorldSlot()
    const worlds = listWorldSlots()

    expect(worlds.some((world) => world.id === created.id)).toBe(true)
    expect(created.name.startsWith('World')).toBe(true)
    expect(getActiveWorldSlotId()).toBe(created.id)
  })

  it('keeps saves isolated per active world slot', () => {
    ensureWorldSlots()
    const first = createWorldSlot('Alpha', 111)
    const second = createWorldSlot('Bravo', 222)

    const firstSave: SaveData = {
      ...validPayload,
      worldSeed: first.seed,
      player: { ...validPayload.player, x: 1 },
    }
    const secondSave: SaveData = {
      ...validPayload,
      worldSeed: second.seed,
      player: { ...validPayload.player, x: 2 },
    }

    setActiveWorldSlotId(first.id)
    saveToStorage(firstSave)
    setActiveWorldSlotId(second.id)
    saveToStorage(secondSave)

    setActiveWorldSlotId(first.id)
    expect(loadFromStorage()).toEqual(firstSave)
    expect(loadWorldSave(first.id)).toEqual(firstSave)
    setActiveWorldSlotId(second.id)
    expect(loadFromStorage()).toEqual(secondSave)
    expect(loadWorldSave(second.id)).toEqual(secondSave)
  })

  it('returns null when loading save for unknown world id', () => {
    ensureWorldSlots()
    expect(loadWorldSave('missing-world')).toBe(null)
  })

  it('applies selected world seed to seed storage', () => {
    ensureWorldSlots()
    const world = createWorldSlot('Seed world', 987654)
    const applied = applyWorldSlotSeed(world.id)

    expect(applied).toBe(987654)
    expect(getStoredWorldSeed()).toBe(987654)
  })

  it('renames an existing world slot', () => {
    ensureWorldSlots()
    const world = createWorldSlot('Old name', 111)
    const changed = renameWorldSlot(world.id, '  New Name  ')
    const renamed = listWorldSlots().find((entry) => entry.id === world.id)

    expect(changed).toBe(true)
    expect(renamed?.name).toBe('New Name')
  })

  it('deletes world slot and keeps a valid active world', () => {
    ensureWorldSlots()
    const worldA = createWorldSlot('A', 1)
    const worldB = createWorldSlot('B', 2)
    setActiveWorldSlotId(worldB.id)

    const deleted = deleteWorldSlot(worldB.id)
    const worlds = listWorldSlots()

    expect(deleted).toBe(true)
    expect(worlds.some((entry) => entry.id === worldB.id)).toBe(false)
    expect(worlds.some((entry) => entry.id === worldA.id)).toBe(true)
    expect(getActiveWorldSlotId()).toBeTruthy()
  })

  it('stores last launched mode for quick continue', () => {
    ensureWorldSlots()
    const world = createWorldSlot('Mode world', 3)
    markWorldLaunched(world.id, 'multiplayer')
    const updated = listWorldSlots().find((entry) => entry.id === world.id)

    expect(updated?.lastMode).toBe('multiplayer')
  })

  it('duplicates world slot with copied save data', () => {
    ensureWorldSlots()
    const source = createWorldSlot('Source', 101)
    setWorldPinned(source.id, true)
    addWorldPlaytime(source.id, 5 * 60 * 1000)
    const sourceSave: SaveData = {
      ...validPayload,
      worldSeed: source.seed,
      player: { ...validPayload.player, x: 33 },
    }
    setActiveWorldSlotId(source.id)
    saveToStorage(sourceSave)

    const duplicated = duplicateWorldSlot(source.id)
    expect(duplicated).not.toBe(null)
    expect(duplicated!.seed).toBe(source.seed)
    expect(duplicated!.id).not.toBe(source.id)
    expect(duplicated!.isPinned).toBe(true)
    expect(duplicated!.playtimeMs).toBe(5 * 60 * 1000)

    setActiveWorldSlotId(duplicated!.id)
    expect(loadFromStorage()).toEqual(sourceSave)
  })

  it('pins worlds and accumulates playtime', () => {
    ensureWorldSlots()
    const world = createWorldSlot('Pinned world', 707)
    const first = listWorldSlots().find((entry) => entry.id === world.id)
    expect(first?.isPinned).toBe(false)
    expect(first?.playtimeMs).toBe(0)

    expect(setWorldPinned(world.id, true)).toBe(true)
    addWorldPlaytime(world.id, 3210)
    addWorldPlaytime(world.id, 1790)
    const updated = listWorldSlots().find((entry) => entry.id === world.id)
    expect(updated?.isPinned).toBe(true)
    expect(updated?.playtimeMs).toBe(5000)
  })

  it('exports and imports world payload', () => {
    ensureWorldSlots()
    const source = createWorldSlot('Export source', 303)
    const sourceSave: SaveData = {
      ...validPayload,
      worldSeed: source.seed,
      player: { ...validPayload.player, x: 77 },
    }
    setActiveWorldSlotId(source.id)
    saveToStorage(sourceSave)
    markWorldLaunched(source.id, 'singleplayer')
    setWorldPinned(source.id, true)
    addWorldPlaytime(source.id, 180000)

    const exported = exportWorldSlot(source.id)
    expect(exported).not.toBe(null)

    const imported = importWorldSlot(exported as string, 'rename')
    expect(imported).not.toBe(null)
    expect(imported!.name.startsWith('Export source')).toBe(true)
    expect(imported!.hasSave).toBe(true)
    expect(imported!.lastMode).toBe('singleplayer')
    expect(imported!.isPinned).toBe(true)
    expect(imported!.playtimeMs).toBe(180000)

    setActiveWorldSlotId(imported!.id)
    const importedSave = loadFromStorage()
    expect(importedSave).not.toBe(null)
    expect(importedSave!.player.x).toBe(77)
    expect(importedSave!.worldSeed).toBe(imported!.seed)
  })

  it('imports conflicting world name as renamed copy', () => {
    ensureWorldSlots()
    const existing = createWorldSlot('Conflict', 11)
    const source = createWorldSlot('Conflict', 99)
    const exported = exportWorldSlot(source.id)
    expect(exported).not.toBe(null)

    const imported = importWorldSlot(exported as string, 'rename')
    expect(imported).not.toBe(null)
    expect(imported!.id).not.toBe(existing.id)
    expect(imported!.name).not.toBe(existing.name)
    expect(imported!.name.startsWith('Conflict')).toBe(true)
  })

  it('replaces conflicting world when replace strategy is selected', () => {
    ensureWorldSlots()
    const target = createWorldSlot('Replace me', 10)
    setWorldPinned(target.id, false)
    addWorldPlaytime(target.id, 12000)
    const source = createWorldSlot('Replace me', 999)
    setWorldPinned(source.id, true)
    addWorldPlaytime(source.id, 45000)
    const sourceSave: SaveData = {
      ...validPayload,
      worldSeed: source.seed,
      player: { ...validPayload.player, x: 44 },
    }
    setActiveWorldSlotId(source.id)
    saveToStorage(sourceSave)
    const exported = exportWorldSlot(source.id)
    expect(exported).not.toBe(null)

    const replaced = importWorldSlot(exported as string, 'replace')
    expect(replaced).not.toBe(null)
    expect(replaced!.id).toBe(target.id)
    expect(replaced!.seed).toBe(source.seed)
    expect(replaced!.isPinned).toBe(true)
    expect(replaced!.playtimeMs).toBe(45000)

    setActiveWorldSlotId(target.id)
    const loaded = loadFromStorage()
    expect(loaded?.player.x).toBe(44)
  })

  it('merges import into conflicting world while keeping seed', () => {
    ensureWorldSlots()
    const target = createWorldSlot('Merge me', 333)
    setWorldPinned(target.id, true)
    addWorldPlaytime(target.id, 60000)
    const source = createWorldSlot('Merge me', 888)
    addWorldPlaytime(source.id, 15000)
    const sourceSave: SaveData = {
      ...validPayload,
      worldSeed: source.seed,
      player: { ...validPayload.player, x: 99 },
    }
    setActiveWorldSlotId(source.id)
    saveToStorage(sourceSave)
    const exported = exportWorldSlot(source.id)
    expect(exported).not.toBe(null)

    const merged = importWorldSlot(exported as string, 'merge')
    expect(merged).not.toBe(null)
    expect(merged!.id).toBe(target.id)
    expect(merged!.seed).toBe(333)
    expect(merged!.isPinned).toBe(true)
    expect(merged!.playtimeMs).toBe(75000)

    setActiveWorldSlotId(target.id)
    const loaded = loadFromStorage()
    expect(loaded?.player.x).toBe(99)
    expect(loaded?.worldSeed).toBe(333)
  })

  it('rejects invalid import payload', () => {
    ensureWorldSlots()
    const imported = importWorldSlot('{"format":"wrong","version":1}')
    expect(imported).toBe(null)
  })
})
