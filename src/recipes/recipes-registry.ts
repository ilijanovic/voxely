/**
 * 2×2 and 3×3 recipe definitions and matching. Grids are row-major.
 */
import type { BlockType } from '../types'
import type { Recipe2x2, RecipeResult, ShapedRecipe3x3 } from './recipes-types'

const OAK_PLANKS = 'oak_planks'
const WOOD = 'wood'
const STICK = 'stick'
const CRAFTING_TABLE = 'crafting_table'
const WOOD_SWORD = 'wood_sword'
const WOOD_SHOVEL = 'wood_shovel'
const WOOD_PICKAXE = 'wood_pickaxe'
const WOOD_AXE = 'wood_axe'
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
    pattern: [OAK_PLANKS, null, OAK_PLANKS, null],
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
  /** Shovel: 1 plank top, 1 stick bottom (inventory 2×2). */
  {
    kind: 'shaped_2x2',
    pattern: [OAK_PLANKS, null, STICK, null],
    result: { type: WOOD_SHOVEL, count: 1 },
  },
  {
    kind: 'shapeless',
    ingredients: [{ type: STICK, count: 1 }, { type: COAL, count: 1 }],
    result: { type: TORCH, count: 4 },
  },
]

/** All 3×3 recipes (crafting table block UI). Pattern is 9 elements row-major. */
const RECIPES_3X3: ShapedRecipe3x3[] = [
  {
    kind: 'shaped_3x3',
    pattern: [
      OAK_PLANKS, OAK_PLANKS, OAK_PLANKS,
      OAK_PLANKS, OAK_PLANKS, OAK_PLANKS,
      OAK_PLANKS, OAK_PLANKS, OAK_PLANKS,
    ],
    result: { type: CRAFTING_TABLE, count: 1 },
  },
  // Sticks: 2 planks top row (also craftable in 2×2 inventory)
  {
    kind: 'shaped_3x3',
    pattern: [
      OAK_PLANKS, OAK_PLANKS, null,
      null, null, null,
      null, null, null,
    ],
    result: { type: STICK, count: 4 },
  },
  // Sticks: 2 planks left column (vertical variant)
  {
    kind: 'shaped_3x3',
    pattern: [
      OAK_PLANKS, null, null,
      OAK_PLANKS, null, null,
      null, null, null,
    ],
    result: { type: STICK, count: 4 },
  },
  // Wooden sword: 2 planks top row, 1 stick middle left (also craftable in 2×2 inventory)
  {
    kind: 'shaped_3x3',
    pattern: [
      OAK_PLANKS, OAK_PLANKS, null,
      null, STICK, null,
      null, null, null,
    ],
    result: { type: WOOD_SWORD, count: 1 },
  },
  // Wooden shovel: 1 plank top center, 1 stick middle, 1 stick bottom center
  {
    kind: 'shaped_3x3',
    pattern: [
      null, OAK_PLANKS, null,
      null, STICK, null,
      null, STICK, null,
    ],
    result: { type: WOOD_SHOVEL, count: 1 },
  },
  // Wooden pickaxe: 3 planks top row, 2 sticks middle column
  {
    kind: 'shaped_3x3',
    pattern: [
      OAK_PLANKS, OAK_PLANKS, OAK_PLANKS,
      null, STICK, null,
      null, STICK, null,
    ],
    result: { type: WOOD_PICKAXE, count: 1 },
  },
  // Wooden axe: 2 planks top row, 1 plank middle left, 2 sticks
  {
    kind: 'shaped_3x3',
    pattern: [
      OAK_PLANKS, OAK_PLANKS, null,
      OAK_PLANKS, STICK, null,
      null, STICK, null,
    ],
    result: { type: WOOD_AXE, count: 1 },
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
 * Checks if the 3×3 grid matches the shaped pattern (9 slots).
 */
function matchShaped3x3(
  grid: (BlockType | null)[],
  pattern: (BlockType | null)[],
): boolean {
  if (grid.length < 9 || pattern.length !== 9) return false
  for (let i = 0; i < 9; i++) {
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

/** Match from a 3×3 recipe. */
export interface Match3x3Shaped {
  recipe: ShapedRecipe3x3
  result: RecipeResult
}

/** Match from a 2×2 quadrant of the 3×3 grid (inventory recipes work at crafting table in any 2×2). */
export interface Match3x3From2x2 {
  recipe2x2: Recipe2x2
  result: RecipeResult
  /** 3×3 slot indices for this 2×2 quadrant (row-major: top-left, top-right, bottom-left, bottom-right). */
  indices: readonly [number, number, number, number]
}

export type Match3x3 = Match3x3Shaped | Match3x3From2x2

/**
 * All four 2×2 quadrants of the 3×3 grid (row-major order per quadrant).
 * Order: top-left, top-right, bottom-left, bottom-right.
 */
const QUADRANT_2X2_INDICES: readonly (readonly [number, number, number, number])[] = [
  [0, 1, 3, 4], // top-left
  [1, 2, 4, 5], // top-right
  [3, 4, 6, 7], // bottom-left
  [4, 5, 7, 8], // bottom-right
]

/**
 * Matches the 3×3 crafting grid: first tries 3×3 recipes, then each 2×2 quadrant against 2×2 recipes.
 * @param grid - 9 elements row-major (indices 0–8).
 * @returns Recipe and result if a recipe matches, null otherwise.
 */
export function matchRecipe3x3(grid: (BlockType | null)[]): Match3x3 | null {
  if (grid.length < 9) return null
  const g = grid.slice(0, 9).map((t) => t ?? null)
  for (const recipe of RECIPES_3X3) {
    if (matchShaped3x3(g, recipe.pattern)) return { recipe, result: recipe.result }
  }
  for (const indices of QUADRANT_2X2_INDICES) {
    const subGrid2x2 = indices.map((i) => g[i])
    const match2x2 = matchRecipe2x2(subGrid2x2)
    if (match2x2)
      return {
        recipe2x2: match2x2.recipe,
        result: match2x2.result,
        indices,
      }
  }
  return null
}

/**
 * Returns amount to consume from each of the 9 crafting table slots for one craft (3×3 recipe only).
 * @param recipe - The matched 3×3 recipe
 * @param grid - 9 slots row-major; each slot is { type, count }. Returns [a0..a8].
 */
export function getConsumeAmountsForCraft3x3(
  recipe: ShapedRecipe3x3,
  grid: Array<{ type: BlockType | null; count: number }>,
): number[] {
  const amounts = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  if (grid.length < 9) return amounts
  for (let i = 0; i < 9; i++) {
    if (recipe.pattern[i] != null) amounts[i] = 1
  }
  return amounts
}

/**
 * Returns amount to consume from each of the 9 crafting table slots for one craft.
 * Handles both 3×3 matches and 2×2 matches (any 2×2 quadrant).
 * @param match - The result of matchRecipe3x3
 * @param grid - 9 slots row-major. Returns [a0..a8].
 */
export function getConsumeAmountsForCraft3x3FromMatch(
  match: Match3x3,
  grid: Array<{ type: BlockType | null; count: number }>,
): number[] {
  const amounts = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  if (grid.length < 9) return amounts
  if ('recipe' in match) {
    return getConsumeAmountsForCraft3x3(match.recipe, grid)
  }
  const indices = match.indices
  const subGrid2x2 = indices.map((i) => grid[i])
  const amounts2x2 = getConsumeAmountsForCraft(match.recipe2x2, subGrid2x2)
  indices.forEach((slot3x3, i) => {
    amounts[slot3x3] = amounts2x2[i]
  })
  return amounts
}
