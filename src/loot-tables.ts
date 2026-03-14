/**
 * Mob loot tables: drop chance and count per item. Used on entity death.
 */
import type { BlockType } from './types'
import { randomFloat, randomInt } from './random'
import type { AnimalKind } from './entities/types'

export interface DropEntry {
  /** Item (block type id) to drop. Must exist in block registry. */
  item: BlockType
  /** Drop chance in [0, 1]. Rolled once per entry. */
  chance: number
  /** Minimum count (inclusive). */
  minCount: number
  /** Maximum count (inclusive). */
  maxCount: number
}

/** Loot table per animal kind. Villager typically has no drops. */
export const DROP_TABLES: Record<AnimalKind, DropEntry[]> = {
  sheep: [
    { item: 'white_wool', chance: 0.7, minCount: 1, maxCount: 2 },
  ],
  pig: [
    { item: 'raw_porkchop', chance: 1, minCount: 1, maxCount: 3 },
  ],
  cow: [
    { item: 'raw_porkchop', chance: 1, minCount: 1, maxCount: 3 },
  ],
  chicken: [
    { item: 'raw_porkchop', chance: 0.5, minCount: 0, maxCount: 1 },
  ],
  horse: [],
  wolf: [
    { item: 'raw_porkchop', chance: 0.6, minCount: 0, maxCount: 1 },
  ],
  villager: [],
  zombie: [],
}

/**
 * Rolls loot for a killed mob and returns list of { item, count } to spawn.
 * Uses the shared gameplay RNG; call from game loop on entity death.
 */
export function rollLoot(kind: AnimalKind): Array<{ item: BlockType; count: number }> {
  const table = DROP_TABLES[kind]
  if (!table || table.length === 0) return []
  const result: Array<{ item: BlockType; count: number }> = []
  for (const entry of table) {
    if (randomFloat() > entry.chance) continue
    const count = randomInt(entry.minCount, entry.maxCount)
    if (count > 0) result.push({ item: entry.item, count })
  }
  return result
}
