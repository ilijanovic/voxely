/**
 * Save/load serialization and localStorage. Application of loaded state stays in game.ts.
 */
import type { BlockType } from './types'
import { getAllBlockIds } from './block-registry'

export const SAVE_KEY = 'voxel-save'

/** Increment when save format changes; used to reject or migrate older saves. */
export const SAVE_VERSION = 4

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
  }
  removedBlocks: Array<{ x: number; y: number; z: number }>
  placedBlocks: Array<{ x: number; y: number; z: number; type: BlockType }>
  placedTorches?: Array<{ x: number; y: number; z: number }>
  dayTime?: number
  /** Snow override: null = auto (cold biomes), true = force on, false = force off. */
  snowForced?: boolean | null
  /** Hotbar + main inventory (36 slots). Omitted in older saves. */
  inventory?: SaveInventorySlot[]
}

/**
 * Allowlist for loading placed blocks from storage.
 * Keep this derived from the block registry so newly added blocks don't silently fail to load.
 */
export const VALID_BLOCK_TYPES = new Set<string>(getAllBlockIds())

/**
 * Persists save data to localStorage under SAVE_KEY.
 * Silently ignores quota exceeded or disabled storage.
 * @param data - Full save payload (player, block mods, torches, day time, etc.)
 */
export function saveToStorage(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch {
    // quota exceeded or disabled
  }
}

/**
 * Loads save data from localStorage if present and valid.
 * Validates saveVersion (1..SAVE_VERSION) and required player object.
 * @returns Parsed SaveData or null if missing, invalid, or parse error
 */
export function loadFromStorage(): SaveData | null {
  const raw = localStorage.getItem(SAVE_KEY)
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
