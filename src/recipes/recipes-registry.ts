/**
 * 2×2 recipe definitions and matching. Grid is 4 elements row-major (indices 0–3).
 */
import type { BlockType } from '../types'
import type { Recipe2x2, RecipeResult } from './recipes-types'

const OAK_PLANKS = 'oak_planks'
const WOOD = 'wood'
const STICK = 'stick'
const CRAFTING_TABLE = 'crafting_table'
const WOOD_SWORD = 'wood_sword'
const TORCH = 'torch'
const COAL = 'coal'

/** All 2×2 recipes. Order may affect which match is chosen when multiple match (first wins). */
const RECIPES_2X2: Recipe2x2[] = [
  {
    kind: 'shapeless',
    ingredients: [{ type: WOOD, count: 1 }],
    result: { type: OAK_PLANKS, count: 4 },
  },
  {
    kind: 'shaped_2x2',
    pattern: [OAK_PLANKS, OAK_PLANKS, null, null],
    result: { type: STICK, count: 4 },
  },
  {
    kind: 'shaped_2x2',
    pattern: [OAK_PLANKS, OAK_PLANKS, OAK_PLANKS, OAK_PLANKS],
    result: { type: CRAFTING_TABLE, count: 1 },
  },
  {
    kind: 'shaped_2x2',
    pattern: [OAK_PLANKS, OAK_PLANKS, STICK, null],
    result: { type: WOOD_SWORD, count: 1 },
  },
  {
    kind: 'shapeless',
    ingredients: [{ type: STICK, count: 1 }, { type: COAL, count: 1 }],
    result: { type: TORCH, count: 4 },
  },
]

/**
 * Checks if the grid matches the shaped pattern (exact 4 slots).
 */
function matchShaped(
  grid: (BlockType | null)[],
  pattern: (BlockType | null)[],
): boolean {
  if (grid.length !== 4 || pattern.length !== 4) return false
  for (let i = 0; i < 4; i++) {
    const g = grid[i] ?? null
    const p = pattern[i]
    if (g !== p) return false
  }
  return true
}

/**
 * Counts items by type in the grid (ignores empty).
 */
function countByType(grid: (BlockType | null)[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of grid) {
    if (t) m.set(t, (m.get(t) ?? 0) + 1)
  }
  return m
}

/**
 * Checks if the grid has at least the required ingredients for shapeless recipe.
 */
function matchShapeless(
  grid: (BlockType | null)[],
  ingredients: Array<{ type: BlockType; count: number }>,
): boolean {
  const counts = countByType(grid)
  for (const { type, count } of ingredients) {
    const have = counts.get(type) ?? 0
    if (have < count) return false
  }
  return true
}

export interface Match2x2 {
  recipe: Recipe2x2
  result: RecipeResult
}

/**
 * Matches the 2×2 crafting grid against registered recipes.
 * @param grid - 4 elements row-major (indices 0–3), each is type or null (count assumed 1+ when non-null).
 * @returns Recipe and result if a recipe matches, null otherwise.
 */
export function matchRecipe2x2(grid: (BlockType | null)[]): Match2x2 | null {
  if (grid.length < 4) return null
  const g = [
    grid[0] ?? null,
    grid[1] ?? null,
    grid[2] ?? null,
    grid[3] ?? null,
  ]
  for (const recipe of RECIPES_2X2) {
    if (recipe.kind === 'shaped_2x2') {
      if (matchShaped(g, recipe.pattern)) return { recipe, result: recipe.result }
    } else {
      if (matchShapeless(g, recipe.ingredients))
        return { recipe, result: recipe.result }
    }
  }
  return null
}

/**
 * Returns amount to consume from each of the 4 crafting slots for one craft of the given recipe.
 * Grid is 4 slots row-major; each slot is { type, count }. Returns [a0, a1, a2, a3].
 */
export function getConsumeAmountsForCraft(
  recipe: Recipe2x2,
  grid: Array<{ type: BlockType | null; count: number }>,
): number[] {
  const amounts = [0, 0, 0, 0]
  if (grid.length < 4) return amounts

  if (recipe.kind === 'shaped_2x2') {
    for (let i = 0; i < 4; i++) {
      if (recipe.pattern[i] != null) amounts[i] = 1
    }
    return amounts
  }

  const remaining = new Map<BlockType, number>()
  for (const { type, count } of recipe.ingredients) {
    remaining.set(type, (remaining.get(type) ?? 0) + count)
  }
  for (let i = 0; i < 4; i++) {
    const slot = grid[i]
    if (!slot?.type) continue
    const need = remaining.get(slot.type) ?? 0
    if (need <= 0) continue
    const take = Math.min(need, slot.count)
    amounts[i] = take
    remaining.set(slot.type, need - take)
  }
  return amounts
}
