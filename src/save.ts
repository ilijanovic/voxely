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
const WORLD_EXPORT_VERSION = 1
const WORLD_NAME_MAX_LENGTH = 40
const DEFAULT_WORLD_NAME_PREFIX = 'World'

/**
 * Increment when save format changes; used to reject or migrate older saves.
 * Policy: add a roundtrip test in save.test.ts for new optional fields; keep OLD_SAVE_FIXTURE_* for previous version.
 */
export const SAVE_VERSION = 9

/** Play mode used when launching a world. */
export type WorldMode = 'singleplayer' | 'multiplayer'

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
  /** Version of serialized block-state representation (for migrations). */
  blockStateVersion?: number
}

/** User-facing world slot shown in the start menu. */
export interface WorldSlotMeta {
  id: string
  name: string
  seed: number
  createdAt: number
  updatedAt: number
  hasSave: boolean
  lastMode?: WorldMode
  isPinned: boolean
  playtimeMs: number
}

interface StoredWorldSlotsPayload {
  version: number
  worlds: WorldSlotMeta[]
}

/** Serializable world metadata included in export files. */
interface ExportWorldMeta {
  name: string
  seed: number
  lastMode?: WorldMode
  isPinned?: boolean
  playtimeMs?: number
}

/** Conflict strategy when importing into an existing world name. */
export type ImportConflictStrategy = 'rename' | 'replace' | 'merge'

/** Versioned export payload for one world. */
interface WorldExportPayload {
  format: 'voxely-world'
  version: number
  exportedAt: number
  world: ExportWorldMeta
  saveData: SaveData | null
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
 * Normalizes a world name for case-insensitive conflict checks.
 *
 * @param name - Display name
 * @returns Lowercased compact key
 */
function normalizeWorldName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Computes a unique world name by appending " (N)" when needed.
 *
 * @param baseName - Preferred name
 * @param existingWorlds - Current world list
 * @returns Unique display name respecting max length
 */
function getUniqueWorldName(baseName: string, existingWorlds: WorldSlotMeta[]): string {
  const compactBase = sanitizeWorldName(baseName, existingWorlds.length + 1)
  const taken = new Set(existingWorlds.map((world) => normalizeWorldName(world.name)))
  if (!taken.has(normalizeWorldName(compactBase))) return compactBase

  for (let i = 2; i < 1000; i++) {
    const suffix = ` (${i})`
    const maxBaseLength = Math.max(1, WORLD_NAME_MAX_LENGTH - suffix.length)
    const candidate = `${compactBase.slice(0, maxBaseLength)}${suffix}`
    if (!taken.has(normalizeWorldName(candidate))) return candidate
  }
  return sanitizeWorldName(`${compactBase} Copy`, existingWorlds.length + 1)
}

/**
 * Coerces potentially invalid playtime values to a non-negative integer.
 *
 * @param value - Any incoming playtime value
 * @returns Clamped milliseconds
 */
function sanitizePlaytimeMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
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
        lastMode:
          candidate.lastMode === 'singleplayer' || candidate.lastMode === 'multiplayer'
            ? candidate.lastMode
            : undefined,
        isPinned: candidate.isPinned === true,
        playtimeMs: sanitizePlaytimeMs(candidate.playtimeMs),
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
      isPinned: false,
      playtimeMs: 0,
    }
    worlds = [firstWorld]
    writeWorldSlots(worlds)
    setActiveWorldSlotId(firstWorld.id)
    if (legacySave != null) {
      writeStorageKey(getWorldSaveKey(firstWorld.id), legacySave)
      // Migrate only once: keep new worlds isolated from the legacy single-save payload.
      removeStorageKey(SAVE_KEY)
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
    lastMode: undefined,
    isPinned: false,
    playtimeMs: 0,
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
 * Duplicates an existing world slot, including save payload when present.
 *
 * @param worldId - Source world id
 * @returns Newly created duplicated world, or null when source is missing
 */
export function duplicateWorldSlot(worldId: string): WorldSlotMeta | null {
  const { worlds } = ensureWorldSlots()
  const source = worlds.find((world) => world.id === worldId)
  if (!source) return null

  const now = Date.now()
  const sourceRaw = readStorageKey(getWorldSaveKey(source.id))
  const sourceSave = parseSavePayload(sourceRaw)
  const duplicated: WorldSlotMeta = {
    id: generateWorldId(),
    name: getUniqueWorldName(`${source.name} Copy`, worlds),
    seed: source.seed,
    createdAt: now,
    updatedAt: now,
    hasSave: sourceSave != null,
    lastMode: source.lastMode,
    isPinned: source.isPinned,
    playtimeMs: source.playtimeMs,
  }

  writeWorldSlots([...worlds, duplicated])
  if (sourceSave != null && sourceRaw != null) {
    writeStorageKey(getWorldSaveKey(duplicated.id), sourceRaw)
  }
  setActiveWorldSlotId(duplicated.id)
  return duplicated
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
 * Builds a world export JSON string for download/share.
 *
 * @param worldId - Slot id to export
 * @returns Pretty JSON export payload or null when world is missing
 */
export function exportWorldSlot(worldId: string): string | null {
  const world = getWorldSlot(worldId)
  if (!world) return null
  const saveData = parseSavePayload(readStorageKey(getWorldSaveKey(world.id)))
  const payload: WorldExportPayload = {
    format: 'voxely-world',
    version: WORLD_EXPORT_VERSION,
    exportedAt: Date.now(),
    world: {
      name: world.name,
      seed: world.seed,
      lastMode: world.lastMode,
      isPinned: world.isPinned,
      playtimeMs: world.playtimeMs,
    },
    saveData,
  }
  return JSON.stringify(payload, null, 2)
}

interface ParsedWorldImport {
  name: string
  seed: number
  lastMode?: WorldMode
  isPinned: boolean
  playtimeMs: number
  saveData: SaveData | null
}

/**
 * Parses an exported world payload and validates known fields.
 *
 * @param exportedJson - JSON string from export
 * @returns Parsed payload summary or null when invalid
 */
function parseWorldImport(exportedJson: string): ParsedWorldImport | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(exportedJson)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const payload = parsed as Partial<WorldExportPayload>
  if (payload.format !== 'voxely-world' || payload.version !== WORLD_EXPORT_VERSION) return null
  if (!payload.world || typeof payload.world !== 'object') return null

  const world = payload.world as Partial<ExportWorldMeta>
  const name = sanitizeWorldName(world.name, 1)
  const seed =
    typeof world.seed === 'number' && Number.isFinite(world.seed)
      ? Math.floor(world.seed) >>> 0
      : generateWorldSeed()
  const serializedSave =
    payload.saveData == null ? null : JSON.stringify(payload.saveData as SaveData)
  return {
    name,
    seed,
    lastMode:
      world.lastMode === 'singleplayer' || world.lastMode === 'multiplayer'
        ? world.lastMode
        : undefined,
    isPinned: world.isPinned === true,
    playtimeMs: sanitizePlaytimeMs(world.playtimeMs),
    saveData: parseSavePayload(serializedSave),
  }
}

/**
 * Imports a world from an exported JSON payload and activates it.
 *
 * @param exportedJson - JSON string from export
 * @param conflictStrategy - How to resolve same-name conflicts
 * @returns Imported world metadata or null when payload is invalid
 */
export function importWorldSlot(
  exportedJson: string,
  conflictStrategy: ImportConflictStrategy = 'rename',
): WorldSlotMeta | null {
  const importedPayload = parseWorldImport(exportedJson)
  if (!importedPayload) return null

  const worlds = listWorldSlots()
  const conflict = worlds.find(
    (world) => normalizeWorldName(world.name) === normalizeWorldName(importedPayload.name),
  )

  if (conflict && conflictStrategy !== 'rename') {
    const conflictIndex = worlds.findIndex((world) => world.id === conflict.id)
    if (conflictIndex < 0) return null
    const now = Date.now()
    const keepSeed = conflictStrategy === 'merge'
    const mergedSeed = keepSeed ? conflict.seed : importedPayload.seed

    if (importedPayload.saveData != null) {
      const normalizedSave: SaveData = {
        ...importedPayload.saveData,
        worldSeed: mergedSeed,
      }
      writeStorageKey(getWorldSaveKey(conflict.id), JSON.stringify(normalizedSave))
    } else if (conflictStrategy === 'replace') {
      removeStorageKey(getWorldSaveKey(conflict.id))
    }

    const mergedLastMode = importedPayload.lastMode ?? worlds[conflictIndex].lastMode
    const mergedHasSave =
      conflictStrategy === 'replace'
        ? importedPayload.saveData != null
        : worlds[conflictIndex].hasSave || importedPayload.saveData != null
    const mergedPinned =
      conflictStrategy === 'replace'
        ? importedPayload.isPinned
        : worlds[conflictIndex].isPinned || importedPayload.isPinned
    const mergedPlaytimeMs =
      conflictStrategy === 'replace'
        ? importedPayload.playtimeMs
        : worlds[conflictIndex].playtimeMs + importedPayload.playtimeMs

    worlds[conflictIndex] = {
      ...worlds[conflictIndex],
      name: conflictStrategy === 'replace' ? importedPayload.name : worlds[conflictIndex].name,
      seed: mergedSeed,
      hasSave: mergedHasSave,
      updatedAt: now,
      lastMode: mergedLastMode,
      isPinned: mergedPinned,
      playtimeMs: mergedPlaytimeMs,
    }
    writeWorldSlots(worlds)
    setActiveWorldSlotId(conflict.id)
    return getWorldSlot(conflict.id)
  }

  const importName =
    conflict && conflictStrategy === 'rename'
      ? getUniqueWorldName(importedPayload.name, worlds)
      : importedPayload.name
  const imported = createWorldSlot(importName, importedPayload.seed)
  const importedSave = importedPayload.saveData
  if (importedSave) {
    const normalizedSave: SaveData = {
      ...importedSave,
      worldSeed: imported.seed,
    }
    writeStorageKey(getWorldSaveKey(imported.id), JSON.stringify(normalizedSave))
  }

  const nextWorlds = listWorldSlots()
  const index = nextWorlds.findIndex((world) => world.id === imported.id)
  if (index >= 0) {
    nextWorlds[index] = {
      ...nextWorlds[index],
      hasSave: importedSave != null,
      lastMode: importedPayload.lastMode ?? nextWorlds[index].lastMode,
      isPinned: importedPayload.isPinned,
      playtimeMs: importedPayload.playtimeMs,
    }
    writeWorldSlots(nextWorlds)
  }

  setActiveWorldSlotId(imported.id)
  return getWorldSlot(imported.id)
}

/**
 * Renames a world slot.
 *
 * @param worldId - Slot id
 * @param name - New display name
 * @returns true when renamed, false when id/name is invalid
 */
export function renameWorldSlot(worldId: string, name: string): boolean {
  const compact = name.replace(/\s+/g, ' ').trim()
  if (!compact) return false

  const worlds = listWorldSlots()
  const index = worlds.findIndex((world) => world.id === worldId)
  if (index < 0) return false

  worlds[index] = {
    ...worlds[index],
    name: compact.slice(0, WORLD_NAME_MAX_LENGTH),
  }
  writeWorldSlots(worlds)
  return true
}

/**
 * Pins or unpins a world for launcher sorting and quick access.
 *
 * @param worldId - Slot id
 * @param pinned - Pin state
 * @returns true when world exists and was updated
 */
export function setWorldPinned(worldId: string, pinned: boolean): boolean {
  const worlds = listWorldSlots()
  const index = worlds.findIndex((world) => world.id === worldId)
  if (index < 0) return false
  worlds[index] = { ...worlds[index], isPinned: pinned }
  writeWorldSlots(worlds)
  return true
}

/**
 * Adds session playtime to one world.
 *
 * @param worldId - Slot id
 * @param deltaMs - Elapsed milliseconds to add
 */
export function addWorldPlaytime(worldId: string, deltaMs: number): void {
  const increment = sanitizePlaytimeMs(deltaMs)
  if (increment <= 0) return
  const worlds = listWorldSlots()
  const index = worlds.findIndex((world) => world.id === worldId)
  if (index < 0) return
  worlds[index] = {
    ...worlds[index],
    playtimeMs: worlds[index].playtimeMs + increment,
  }
  writeWorldSlots(worlds)
}

/**
 * Deletes a world slot and its persisted save payload.
 * Keeps at least one slot available by creating a fresh fallback when needed.
 *
 * @param worldId - Slot id
 * @returns true when deleted, false when world id does not exist
 */
export function deleteWorldSlot(worldId: string): boolean {
  const { worlds } = ensureWorldSlots()
  const index = worlds.findIndex((world) => world.id === worldId)
  if (index < 0) return false

  let nextWorlds = worlds.filter((world) => world.id !== worldId)
  removeStorageKey(getWorldSaveKey(worldId))

  if (nextWorlds.length === 0) {
    const now = Date.now()
    nextWorlds = [
      {
        id: generateWorldId(),
        name: `${DEFAULT_WORLD_NAME_PREFIX} 1`,
        seed: getStoredWorldSeed() ?? generateWorldSeed(),
        createdAt: now,
        updatedAt: now,
        hasSave: false,
        isPinned: false,
        playtimeMs: 0,
      },
    ]
  }

  writeWorldSlots(nextWorlds)
  const activeWorldId = getActiveWorldSlotId()
  if (
    !activeWorldId ||
    activeWorldId === worldId ||
    !nextWorlds.some((world) => world.id === activeWorldId)
  ) {
    setActiveWorldSlotId(nextWorlds[0].id)
  }
  return true
}

/**
 * Stores the latest launch mode for quick continue.
 *
 * @param worldId - Slot id
 * @param mode - Last launched mode
 */
export function markWorldLaunched(worldId: string, mode: WorldMode): void {
  const worlds = listWorldSlots()
  const index = worlds.findIndex((world) => world.id === worldId)
  if (index < 0) return

  worlds[index] = {
    ...worlds[index],
    lastMode: mode,
    updatedAt: Date.now(),
  }
  writeWorldSlots(worlds)
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
    if (Array.isArray(data.placedBlocks)) {
      data.placedBlocks = data.placedBlocks.map((entry) => ({
        ...entry,
        type: entry.type === 'water' ? ('water_source' as BlockType) : entry.type,
      }))
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
  // Migrate only once so newly created world slots don't inherit the legacy player position.
  removeStorageKey(SAVE_KEY)
  touchActiveWorldOnSave()
  return parsedLegacy
}

/**
 * Loads save data for a specific world slot id.
 *
 * @param worldId - Slot id
 * @returns Parsed world save payload or null when missing/invalid
 */
export function loadWorldSave(worldId: string): SaveData | null {
  if (!worldId || worldId.trim().length === 0) return null
  return parseSavePayload(readStorageKey(getWorldSaveKey(worldId)))
}
