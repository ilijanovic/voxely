/**
 * Save/load serialization and localStorage. Application of loaded state stays in game.ts.
 */
import type { BlockType } from "./types";
import { getAllBlockIds } from "./block-registry";

export const SAVE_KEY = "voxel-save";
export const SAVE_VERSION = 2;

export interface SaveData {
  saveVersion: number;
  worldSeed: number;
  player: {
    x: number;
    y: number;
    z: number;
    rotationY: number;
    lookPitch: number;
  };
  removedBlocks: Array<{ x: number; y: number; z: number }>;
  placedBlocks: Array<{ x: number; y: number; z: number; type: BlockType }>;
  placedTorches?: Array<{ x: number; y: number; z: number }>;
  dayTime?: number;
  /** Current rain state (from atmosphere). */
  isRaining?: boolean;
  /** Rain override: null = auto, true = force on, false = force off. */
  rainForced?: boolean | null;
  /** Snow override: null = auto (cold biomes), true = force on, false = force off. */
  snowForced?: boolean | null;
}

/**
 * Allowlist for loading placed blocks from storage.
 * Keep this derived from the block registry so newly added blocks don't silently fail to load.
 */
export const VALID_BLOCK_TYPES = new Set<string>(getAllBlockIds());

export function saveToStorage(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded or disabled
  }
}

export function loadFromStorage(): SaveData | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SaveData;
    if (
      data.saveVersion > SAVE_VERSION ||
      data.saveVersion < 1 ||
      !data.player
    ) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
