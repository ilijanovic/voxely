/**
 * Smelting recipes and fuel burn times. Used by the furnace UI.
 */
import type { BlockType } from './types'

export interface SmeltingRecipe {
  input: BlockType
  output: BlockType
  outputCount: number
  /** Seconds to smelt one input (Minecraft: 10s per item with coal). */
  cookTimeSeconds: number
}

/** All smelting recipes (input -> one recipe). Output types must exist in block registry. */
const SMELTING_RECIPES: SmeltingRecipe[] = [
  { input: 'cobblestone', output: 'stone', outputCount: 1, cookTimeSeconds: 10 },
  { input: 'sand', output: 'sandstone', outputCount: 1, cookTimeSeconds: 10 },
  { input: 'coal_ore', output: 'coal', outputCount: 1, cookTimeSeconds: 10 },
]

/** Fuel type -> seconds of burn time (per one item; smelting uses this to decrement). */
const FUEL_BURN_TIME: Partial<Record<BlockType, number>> = {
  coal: 80,
  wood: 15,
  oak_planks: 15,
  stick: 5,
}

/**
 * Returns the smelting recipe for an input type, or null.
 */
export function getSmeltingRecipe(input: BlockType | null): SmeltingRecipe | null {
  if (input == null) return null
  return SMELTING_RECIPES.find((r) => r.input === input) ?? null
}

/**
 * Returns burn time in seconds for one fuel item, or 0 if not fuel.
 */
export function getFuelBurnTime(fuel: BlockType | null): number {
  if (fuel == null) return 0
  return FUEL_BURN_TIME[fuel] ?? 0
}

/**
 * Returns true if the block type can be used as furnace fuel.
 */
export function isFuel(type: BlockType | null): boolean {
  return getFuelBurnTime(type) > 0
}
