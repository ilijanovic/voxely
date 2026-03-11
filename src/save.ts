/**
 * Save/load serialization and localStorage. Application of loaded state stays in game.ts.
 */
import type { BlockType } from './types'
import type { Faction, PlayerClass, EquipmentSlot } from './player/faction'
import { getAllBlockIds } from './block-registry'

export const SAVE_KEY = 'voxel-save'

/** Increment when save format changes; used to reject or migrate older saves. */
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
  /** Chunk keys (chunkKeyNumeric) the player has visited; used for map discovery. Omitted in older saves. */
  discoveredChunkKeys?: number[]
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
