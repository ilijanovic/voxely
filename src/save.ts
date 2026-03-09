/**
 * Save/load serialization and localStorage. Application of loaded state stays in game.ts.
 */
import type { BlockType } from "./types";

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
}

export const VALID_BLOCK_TYPES = new Set<string>([
  "grass",
  "dirt",
  "stone",
  "sand",
  "snow",
  "water",
  "wood",
  "leaves",
]);

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
