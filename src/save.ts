/**
 * Save/load serialization and localStorage. Application of loaded state stays in game.ts.
 */
import type { BlockType } from './types'
import type { EquipmentSlot, Faction, PlayerClass } from './player/faction'
import { getAllBlockIds } from './block-registry'

export const SAVE_KEY = 'voxel-save'
export const WORLD_SLOTS_KEY = 'voxel-world-slots'
export const ACTIVE_WORLD_SLOT_KEY = 'voxel-active-world-slot'
export const WORLD_SEED_STORAGE_KEY = 'voxel-world-seed'

const WORLD_SLOTS_VERSION = 1
const WORLD_NAME_MAX_LENGTH = 40
const DEFAULT_WORLD_NAME_PREFIX = 'World'

/**
 * Increment when save format changes; used to reject or migrate older saves.
 * Policy: add a roundtrip test in save.test.ts for new optional fields; keep OLD_SAVE_FIXTURE_* for previous version.
 */
export const SAVE_VERSION = 8

/** One inventory slot (hotbar or main; crafting grid not persisted). */
export interface SaveInventorySlot {
  type: BlockType | null
  count: number
}

/** Serialized game state written to localStorage: player, block mods, torches, day time, snow override, inventory. */
export interface SaveData {
  saveVersion: number
  worldSeed: number
  player: {
    x: number
    y: number
    z: number
    rotationY: number
    lookPitch: number
    /** Player level 1..MAX_LEVEL. Omitted in older saves (default 1). */
    level?: number
    /** Current XP toward next level. Omitted in older saves (default 0). */
    experience?: number
    /** Gold (money) for NPC trading. Omitted in older saves (default 0). */
    gold?: number
    /** Current health (0..PLAYER_MAX_HEALTH). Omitted in older saves (default max). */
    health?: number
    /** Current hunger/food level (0..PLAYER_MAX_HUNGER). Omitted in older saves (default max). */
    hunger?: number
    /** Base character stats (WoW-style: strength, intellect, agility, stamina, spirit). Omitted in older saves (defaults applied). */
    stats?: Record<string, number>
    /** Faction (Covenant / Legion). Omitted in older saves (default: covenant). */
    faction?: Faction
    /** Player class (e.g. warrior). Omitted in older saves (default: warrior). */
    class?: PlayerClass
    /** Equipped items per slot (helm, chest, legs, boots, mainHand, offHand). Omitted in older saves (all empty). */
    equipment?: Partial<Record<EquipmentSlot, { type: BlockType | null; count: number }>>
  }
  removedBlocks: Array<{ x: number; y: number; z: number }>
  placedBlocks: Array<{ x: number; y: number; z: number; type: BlockType }>
  /** Torch cell center (x,y,z) and optional face normal (nx,ny,nz). Omitted nx/ny/nz = floor placement. */
  placedTorches?: Array<{ x: number; y: number; z: number; nx?: number; ny?: number; nz?: number }>
  dayTime?: number
  /** Snow override: null = auto (cold biomes), true = force on, false = force off. */
  snowForced?: boolean | null
  /** Hotbar + main inventory (36 slots). Omitted in older saves. */
  inventory?: SaveInventorySlot[]
  /** Active quests (id + progress). Omitted in older saves. */
  activeQuests?: Array<{ questId: string; progress: number[] }>
  /** Completed quest ids. Omitted in older saves. */
  completedQuestIds?: string[]
  /** Quest ids tracked on the HUD. Omitted in older saves. */
  trackedQuestIds?: string[]
  /** Chunk keys (chunkKeyNumeric) the player has visited; used for map discovery. Omitted in older saves. */
  discoveredChunkKeys?: number[]
}

/** User-facing world slot shown in the start menu. */
export interface WorldSlotMeta {
  id: string
  name: string
  seed: number
  createdAt: number
  updatedAt: number
  hasSave: boolean
}

interface StoredWorldSlotsPayload {
  version: number
  worlds: WorldSlotMeta[]
}

/**
 * Allowlist for loading placed blocks from storage.
 * Keep this derived from the block registry so newly added blocks don't silently fail to load.
 */
export const VALID_BLOCK_TYPES = new Set<string>(getAllBlockIds())

/**
 * Reads a localStorage key and returns null when storage is unavailable.
 *
 * @param key - Storage key
 * @returns Stored value or null
 */
function readStorageKey(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Writes a localStorage key and ignores storage failures.
 *
 * @param key - Storage key
 * @param value - Serialized value
 */
function writeStorageKey(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch (error) {
    if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
      console.warn(
        `[save] Failed to write "${key}" to localStorage. Saving is disabled or quota exceeded.`,
        error,
      )
    }
  }
}

/**
 * Removes a localStorage key and ignores storage failures.
 *
 * @param key - Storage key
 */
function removeStorageKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore storage failures (private mode, disabled storage, quota exceeded)
  }
}

/**
 * Produces a deterministic key for a world-specific save payload.
 *
 * @param worldId - World slot id
 * @returns localStorage key for that world save
 */
function getWorldSaveKey(worldId: string): string {
  return `${SAVE_KEY}:${worldId}`
}

/**
 * Generates a random unsigned 32-bit world seed.
 *
 * @returns Seed in [0, 2^32-1]
 */
function generateWorldSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0
}

/**
 * Generates a menu-safe id for a new world slot.
 *
 * @returns Unique-ish world id
 */
function generateWorldId(): string {
  const timePart = Date.now().toString(36)
  const randomPart = Math.floor(Math.random() * 0x100000).toString(36)
  return `world_${timePart}_${randomPart}`
}

/**
 * Coerces a world name into a short, safe label.
 *
 * @param rawName - User or generated name
 * @param fallbackIndex - 1-based world index used when name is empty
 * @returns Sanitized display name
 */
function sanitizeWorldName(rawName: string | undefined, fallbackIndex: number): string {
  const fallback = `${DEFAULT_WORLD_NAME_PREFIX} ${fallbackIndex}`
  if (rawName == null) return fallback
  const compact = rawName.replace(/\s+/g, ' ').trim()
  if (!compact) return fallback
  return compact.slice(0, WORLD_NAME_MAX_LENGTH)
}

/**
 * Parses and validates stored world slot metadata.
 *
 * @param raw - Raw JSON from WORLD_SLOTS_KEY
 * @returns Valid world slots (possibly empty)
 */
function parseWorldSlots(raw: string | null): WorldSlotMeta[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    const payload = Array.isArray(parsed)
      ? ({ version: WORLD_SLOTS_VERSION, worlds: parsed } as StoredWorldSlotsPayload)
      : (parsed as StoredWorldSlotsPayload)
    if (!Array.isArray(payload.worlds)) return []

    const worlds: WorldSlotMeta[] = []
    const seenIds = new Set<string>()
    for (let i = 0; i < payload.worlds.length; i++) {
      const candidate = payload.worlds[i]
      if (!candidate || typeof candidate !== 'object') continue
      const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
      if (!id || seenIds.has(id)) continue
      const createdAt = Number.isFinite(candidate.createdAt) ? candidate.createdAt : Date.now()
      const updatedAt = Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : createdAt
      const seed = Number.isFinite(candidate.seed)
        ? Math.floor(candidate.seed) >>> 0
        : generateWorldSeed()
      worlds.push({
        id,
        name: sanitizeWorldName(candidate.name, i + 1),
        seed,
        createdAt,
        updatedAt,
        hasSave: candidate.hasSave === true,
      })
      seenIds.add(id)
    }
    return worlds
  } catch {
    return []
  }
}

/**
 * Persists the full world slot list payload.
 *
 * @param worlds - World metadata array
 */
function writeWorldSlots(worlds: WorldSlotMeta[]): void {
  const payload: StoredWorldSlotsPayload = {
    version: WORLD_SLOTS_VERSION,
    worlds,
  }
  writeStorageKey(WORLD_SLOTS_KEY, JSON.stringify(payload))
}

/**
 * Computes the default world name for a new slot.
 *
 * @param existingWorlds - Current slot list
 * @returns Generated "World N" label
 */
function getDefaultWorldName(existingWorlds: WorldSlotMeta[]): string {
  return `${DEFAULT_WORLD_NAME_PREFIX} ${existingWorlds.length + 1}`
}

/**
 * Returns all saved world slots.
 *
 * @returns World slot metadata list
 */
export function listWorldSlots(): WorldSlotMeta[] {
  return parseWorldSlots(readStorageKey(WORLD_SLOTS_KEY))
}

/**
 * Returns the currently selected world slot id.
 *
 * @returns Active world id or null
 */
export function getActiveWorldSlotId(): string | null {
  const raw = readStorageKey(ACTIVE_WORLD_SLOT_KEY)
  if (!raw) return null
  const id = raw.trim()
  return id.length > 0 ? id : null
}

/**
 * Updates the currently selected world slot id.
 *
 * @param worldId - Slot id or null to clear selection
 */
export function setActiveWorldSlotId(worldId: string | null): void {
  if (!worldId) {
    removeStorageKey(ACTIVE_WORLD_SLOT_KEY)
    return
  }
  writeStorageKey(ACTIVE_WORLD_SLOT_KEY, worldId)
}

/**
 * Finds a world slot by id.
 *
 * @param worldId - Slot id
 * @returns Matching world metadata or null
 */
export function getWorldSlot(worldId: string): WorldSlotMeta | null {
  const worlds = listWorldSlots()
  return worlds.find((w) => w.id === worldId) ?? null
}

/**
 * Reads the currently stored terrain seed used by terrain bootstrap.
 *
 * @returns Stored seed or null when missing/invalid
 */
export function getStoredWorldSeed(): number | null {
  const raw = readStorageKey(WORLD_SEED_STORAGE_KEY)
  if (raw == null) return null
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Persists the terrain seed used by terrain bootstrap.
 *
 * @param seed - World seed
 */
export function setStoredWorldSeed(seed: number): void {
  writeStorageKey(WORLD_SEED_STORAGE_KEY, String(Math.floor(seed) >>> 0))
}

/**
 * Ensures world slots exist and migrates the legacy single-save format on first use.
 *
 * @returns Current world list and selected world id
 */
export function ensureWorldSlots(): { worlds: WorldSlotMeta[]; activeWorldId: string | null } {
  let worlds = listWorldSlots()
  const legacySave = readStorageKey(SAVE_KEY)
  const now = Date.now()

  if (worlds.length === 0) {
    const seed = getStoredWorldSeed() ?? generateWorldSeed()
    const firstWorld: WorldSlotMeta = {
      id: generateWorldId(),
      name: `${DEFAULT_WORLD_NAME_PREFIX} 1`,
      seed,
      createdAt: now,
      updatedAt: now,
      hasSave: legacySave != null,
    }
    worlds = [firstWorld]
    writeWorldSlots(worlds)
    setActiveWorldSlotId(firstWorld.id)
    if (legacySave != null) {
      writeStorageKey(getWorldSaveKey(firstWorld.id), legacySave)
    }
  }

  let activeWorldId = getActiveWorldSlotId()
  if (!activeWorldId || !worlds.some((w) => w.id === activeWorldId)) {
    activeWorldId = worlds[0]?.id ?? null
    setActiveWorldSlotId(activeWorldId)
  }

  return { worlds, activeWorldId }
}

/**
 * Creates a world slot and makes it the active one.
 *
 * @param name - Optional world display name
 * @param seed - Optional terrain seed (random when omitted)
 * @returns Newly created world metadata
 */
export function createWorldSlot(name?: string, seed?: number): WorldSlotMeta {
  const { worlds } = ensureWorldSlots()
  const now = Date.now()
  const seedValue =
    typeof seed === 'number' && Number.isFinite(seed) ? Math.floor(seed) >>> 0 : generateWorldSeed()
  const world: WorldSlotMeta = {
    id: generateWorldId(),
    name: sanitizeWorldName(name, worlds.length + 1),
    seed: seedValue,
    createdAt: now,
    updatedAt: now,
    hasSave: false,
  }
  const nextWorlds = [...worlds, world]
  writeWorldSlots(nextWorlds)
  setActiveWorldSlotId(world.id)
  return world
}

/**
 * Creates a world with an auto-generated name and makes it active.
 *
 * @returns Newly created world metadata
 */
export function createDefaultNamedWorldSlot(): WorldSlotMeta {
  const { worlds } = ensureWorldSlots()
  return createWorldSlot(getDefaultWorldName(worlds))
}

/**
 * Applies the selected world's seed to storage so the next app bootstrap uses it.
 *
 * @param worldId - Slot id
 * @returns Applied seed, or null when world id is unknown
 */
export function applyWorldSlotSeed(worldId: string): number | null {
  const world = getWorldSlot(worldId)
  if (!world) return null
  setStoredWorldSeed(world.seed)
  return world.seed
}

/**
 * Resolves the save key for the currently active world slot.
 *
 * @returns localStorage key used for save payloads
 */
function getActiveSaveKey(): string {
  const activeWorldId = getActiveWorldSlotId()
  if (!activeWorldId) return SAVE_KEY
  return getWorldSaveKey(activeWorldId)
}

/**
 * Updates active world metadata after a successful save.
 */
function touchActiveWorldOnSave(): void {
  const activeWorldId = getActiveWorldSlotId()
  if (!activeWorldId) return

  const worlds = listWorldSlots()
  const index = worlds.findIndex((world) => world.id === activeWorldId)
  if (index < 0) return

  const prev = worlds[index]
  const next: WorldSlotMeta = {
    ...prev,
    hasSave: true,
    updatedAt: Date.now(),
  }
  worlds[index] = next
  writeWorldSlots(worlds)
}

/**
 * Parses and validates one stored save payload.
 *
 * @param raw - Raw JSON string from localStorage
 * @returns Parsed SaveData or null when invalid
 */
function parseSavePayload(raw: string | null): SaveData | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as SaveData
    if (data.saveVersion > SAVE_VERSION || data.saveVersion < 1 || !data.player) {
      return null
    }
    return data
  } catch {
    return null
  }
}

/**
 * Persists save data to localStorage under the active world key (or legacy key when no slot is selected).
 *
 * @param data - Full save payload (player, block mods, torches, day time, etc.)
 */
export function saveToStorage(data: SaveData): void {
  writeStorageKey(getActiveSaveKey(), JSON.stringify(data))
  touchActiveWorldOnSave()
}

/**
 * Loads save data for the active world slot (or legacy key when no slot is selected).
 * Falls back to legacy SAVE_KEY once when migrating into a selected world slot.
 *
 * @returns Parsed SaveData or null if missing/invalid
 */
export function loadFromStorage(): SaveData | null {
  const activeWorldId = getActiveWorldSlotId()
  if (!activeWorldId) {
    return parseSavePayload(readStorageKey(SAVE_KEY))
  }

  const worldSaveKey = getWorldSaveKey(activeWorldId)
  const worldRaw = readStorageKey(worldSaveKey)
  const parsedWorld = parseSavePayload(worldRaw)
  if (parsedWorld) return parsedWorld

  const legacyRaw = readStorageKey(SAVE_KEY)
  const parsedLegacy = parseSavePayload(legacyRaw)
  if (!parsedLegacy) return null

  writeStorageKey(worldSaveKey, legacyRaw as string)
  touchActiveWorldOnSave()
  return parsedLegacy
}
