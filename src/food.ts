/**
 * Food items: restore hunger (and optionally health) when consumed.
 * Used by the survival eating mechanic.
 */
import type { BlockType } from './types'

export interface FoodRestore {
  /** Hunger points restored (0..20). */
  hunger: number
  /** Optional health restored (e.g. golden apple). */
  health?: number
}

/** Item types that can be consumed for hunger/health. Add more as block registry grows. */
const FOOD_MAP: Partial<Record<BlockType, FoodRestore>> = {
  raw_porkchop: { hunger: 3 },
  bread: { hunger: 5 },
  apple: { hunger: 4 },
  melon: { hunger: 2 },
  wheat_1: { hunger: 1 },
  wheat_2: { hunger: 1 },
  wheat_3: { hunger: 1 },
  wheat_4: { hunger: 1 },
  wheat_5: { hunger: 1 },
  wheat_6: { hunger: 1 },
  wheat_7: { hunger: 1 },
  wheat_8: { hunger: 1 },
}

/**
 * Returns the hunger/health restore for an item type, or null if not food.
 */
export function getFoodRestore(type: BlockType | null): FoodRestore | null {
  if (type == null) return null
  return FOOD_MAP[type] ?? null
}

/** Returns true if the item type is consumable as food. */
export function isFood(type: BlockType | null): boolean {
  return getFoodRestore(type) !== null
}
