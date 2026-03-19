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
const OAK_STAIRS = 'oak_stairs'
const SPRUCE_STAIRS = 'spruce_stairs'
const BIRCH_STAIRS = 'birch_stairs'
const JUNGLE_STAIRS = 'jungle_stairs'
const ACACIA_STAIRS = 'acacia_stairs'
const DARK_OAK_STAIRS = 'dark_oak_stairs'
const COBBLESTONE = 'cobblestone'
const COBBLESTONE_STAIRS = 'cobblestone_stairs'
const STONE_BRICKS = 'stone_bricks'
const STONE_BRICKS_STAIRS = 'stone_bricks_stairs'
const BRICKS = 'bricks'
const BRICK_STAIRS = 'brick_stairs'
const SANDSTONE = 'sandstone'
const SANDSTONE_STAIRS = 'sandstone_stairs'
const DOOR_CLOSED = 'door_closed'
const OAK_FENCE = 'oak_fence'
const SPRUCE_FENCE = 'spruce_fence'
const BIRCH_FENCE = 'birch_fence'
const JUNGLE_FENCE = 'jungle_fence'
const ACACIA_FENCE = 'acacia_fence'
const DARK_OAK_FENCE = 'dark_oak_fence'

/** All 2×2 recipes. Order matters: more specific (larger) patterns first so they match before subsets (e.g. crafting_table before stick). */
const RECIPES_2X2: Recipe2x2[] = [
  {
    kind: 'shapeless',
    ingredients: [{ type: WOOD, count: 1 }],
    result: { type: OAK_PLANKS, count: 4 },
  },
  /** 4 planks -> crafting table (must be before stick so full grid matches this). */
  {
    kind: 'shaped_2x2',
    pattern: [OAK_PLANKS, OAK_PLANKS, OAK_PLANKS, OAK_PLANKS],
    result: { type: CRAFTING_TABLE, count: 1 },
  },
  /** Sword: 2 planks + stick (before stick-only). */
  {
    kind: 'shaped_2x2',
    pattern: [OAK_PLANKS, OAK_PLANKS, STICK, null],
    result: { type: WOOD_SWORD, count: 1 },
  },
  /** Shovel: 1 plank + 1 stick (inventory 2×2). */
  {
    kind: 'shaped_2x2',
    pattern: [OAK_PLANKS, null, STICK, null],
    result: { type: WOOD_SHOVEL, count: 1 },
  },
  /** Sticks: 2 planks vertical (Vanilla); sliding matches any column. */
  {
    kind: 'shaped_2x2',
    pattern: [OAK_PLANKS, null, OAK_PLANKS, null],
    result: { type: STICK, count: 4 },
  },
  /** Sticks: 2 planks horizontal. */
  {
    kind: 'shaped_2x2',
    pattern: [OAK_PLANKS, OAK_PLANKS, null, null],
    result: { type: STICK, count: 4 },
  },
  {
    kind: 'shapeless',
    ingredients: [{ type: STICK, count: 1 }, { type: COAL, count: 1 }],
    result: { type: TORCH, count: 4 },
  },
]

/** All 3×3 recipes (crafting table block UI). Order matters: more specific (larger) patterns first. Matching uses trim + sliding (Vanilla-style). */
const RECIPES_3X3: ShapedRecipe3x3[] = [
  // Furnace: 8 cobblestone around empty center
  {
    kind: 'shaped_3x3',
    pattern: [
      COBBLESTONE, COBBLESTONE, COBBLESTONE,
      COBBLESTONE, null, COBBLESTONE,
      COBBLESTONE, COBBLESTONE, COBBLESTONE,
    ],
    result: { type: 'furnace', count: 1 },
  },
  // Bed: 3 wool + 3 planks (top row wool, middle row planks)
  {
    kind: 'shaped_3x3',
    pattern: [
      'white_wool', 'white_wool', 'white_wool',
      OAK_PLANKS, OAK_PLANKS, OAK_PLANKS,
      null, null, null,
    ],
    result: { type: 'bed', count: 1 },
  },
  // --- Stairs and larger patterns first (so they match before stick subset) ---
  // Oak stairs
  {
    kind: 'shaped_3x3',
    pattern: [
      OAK_PLANKS, null, null,
      OAK_PLANKS, OAK_PLANKS, null,
      OAK_PLANKS, OAK_PLANKS, OAK_PLANKS,
    ],
    result: { type: OAK_STAIRS, count: 4 },
  },
  // Spruce stairs
  {
    kind: 'shaped_3x3',
    pattern: [
      'spruce_planks', null, null,
      'spruce_planks', 'spruce_planks', null,
      'spruce_planks', 'spruce_planks', 'spruce_planks',
    ],
    result: { type: SPRUCE_STAIRS, count: 4 },
  },
  // Birch stairs
  {
    kind: 'shaped_3x3',
    pattern: [
      'birch_planks', null, null,
      'birch_planks', 'birch_planks', null,
      'birch_planks', 'birch_planks', 'birch_planks',
    ],
    result: { type: BIRCH_STAIRS, count: 4 },
  },
  // Jungle stairs
  {
    kind: 'shaped_3x3',
    pattern: [
      'jungle_planks', null, null,
      'jungle_planks', 'jungle_planks', null,
      'jungle_planks', 'jungle_planks', 'jungle_planks',
    ],
    result: { type: JUNGLE_STAIRS, count: 4 },
  },
  // Acacia stairs
  {
    kind: 'shaped_3x3',
    pattern: [
      'acacia_planks', null, null,
      'acacia_planks', 'acacia_planks', null,
      'acacia_planks', 'acacia_planks', 'acacia_planks',
    ],
    result: { type: ACACIA_STAIRS, count: 4 },
  },
  // Dark oak stairs
  {
    kind: 'shaped_3x3',
    pattern: [
      'dark_oak_planks', null, null,
      'dark_oak_planks', 'dark_oak_planks', null,
      'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks',
    ],
    result: { type: DARK_OAK_STAIRS, count: 4 },
  },
  // Cobblestone stairs
  {
    kind: 'shaped_3x3',
    pattern: [
      COBBLESTONE, null, null,
      COBBLESTONE, COBBLESTONE, null,
      COBBLESTONE, COBBLESTONE, COBBLESTONE,
    ],
    result: { type: COBBLESTONE_STAIRS, count: 4 },
  },
  // Stone brick stairs
  {
    kind: 'shaped_3x3',
    pattern: [
      STONE_BRICKS, null, null,
      STONE_BRICKS, STONE_BRICKS, null,
      STONE_BRICKS, STONE_BRICKS, STONE_BRICKS,
    ],
    result: { type: STONE_BRICKS_STAIRS, count: 4 },
  },
  // Brick stairs
  {
    kind: 'shaped_3x3',
    pattern: [
      BRICKS, null, null,
      BRICKS, BRICKS, null,
      BRICKS, BRICKS, BRICKS,
    ],
    result: { type: BRICK_STAIRS, count: 4 },
  },
  // Sandstone stairs
  {
    kind: 'shaped_3x3',
    pattern: [
      SANDSTONE, null, null,
      SANDSTONE, SANDSTONE, null,
      SANDSTONE, SANDSTONE, SANDSTONE,
    ],
    result: { type: SANDSTONE_STAIRS, count: 4 },
  },
  // Oak door: 6 planks in 2 columns → 3 doors (Minecraft-style)
  {
    kind: 'shaped_3x3',
    pattern: [
      OAK_PLANKS, OAK_PLANKS, null,
      OAK_PLANKS, OAK_PLANKS, null,
      OAK_PLANKS, OAK_PLANKS, null,
    ],
    result: { type: DOOR_CLOSED, count: 3 },
  },
<<<<<<< HEAD
  // --- Tools (before stick so multi-plank grids match tools first) ---
  /** Wooden pickaxe: 3 planks top + 2 sticks (sliding). */
=======
  // --- Fences (Minecraft-style): 6 planks + 2 sticks → 3 fences ---
>>>>>>> dev
  {
    kind: 'shaped_3x3',
    pattern: [
      OAK_PLANKS, OAK_PLANKS, OAK_PLANKS,
<<<<<<< HEAD
      null, STICK, null,
      null, STICK, null,
    ],
    result: { type: WOOD_PICKAXE, count: 1 },
  },
  /** Wooden axe: mirror allowed (left/right). */
  {
    kind: 'shaped_3x3',
    pattern: [
      OAK_PLANKS, OAK_PLANKS, null,
      OAK_PLANKS, STICK, null,
      null, STICK, null,
    ],
    result: { type: WOOD_AXE, count: 1 },
    mirror: true,
  },
  /** Wooden sword: 2 planks + stick (sliding). */
  {
    kind: 'shaped_3x3',
    pattern: [
      OAK_PLANKS, OAK_PLANKS, null,
      null, STICK, null,
      null, null, null,
    ],
    result: { type: WOOD_SWORD, count: 1 },
  },
  /** Wooden shovel: 1 plank + 2 sticks vertical. */
  {
    kind: 'shaped_3x3',
    pattern: [
      null, OAK_PLANKS, null,
      null, STICK, null,
      null, STICK, null,
    ],
    result: { type: WOOD_SHOVEL, count: 1 },
  },
  /** Sticks: 2 planks horizontal (any row) – last so subset of planks matches tools first. */
  {
    kind: 'shaped_3x3',
    pattern: [
      OAK_PLANKS, OAK_PLANKS, null,
      null, null, null,
      null, null, null,
    ],
    result: { type: STICK, count: 4 },
  },
  /** Sticks: 2 planks vertical (any column). */
  {
    kind: 'shaped_3x3',
    pattern: [
      OAK_PLANKS, null, null,
      OAK_PLANKS, null, null,
      null, null, null,
    ],
    result: { type: STICK, count: 4 },
=======
      OAK_PLANKS, OAK_PLANKS, OAK_PLANKS,
      STICK, STICK, null,
    ],
    result: { type: OAK_FENCE, count: 3 },
  },
  {
    kind: 'shaped_3x3',
    pattern: [
      'spruce_planks', 'spruce_planks', 'spruce_planks',
      'spruce_planks', 'spruce_planks', 'spruce_planks',
      STICK, STICK, null,
    ],
    result: { type: SPRUCE_FENCE, count: 3 },
  },
  {
    kind: 'shaped_3x3',
    pattern: [
      'birch_planks', 'birch_planks', 'birch_planks',
      'birch_planks', 'birch_planks', 'birch_planks',
      STICK, STICK, null,
    ],
    result: { type: BIRCH_FENCE, count: 3 },
  },
  {
    kind: 'shaped_3x3',
    pattern: [
      'jungle_planks', 'jungle_planks', 'jungle_planks',
      'jungle_planks', 'jungle_planks', 'jungle_planks',
      STICK, STICK, null,
    ],
    result: { type: JUNGLE_FENCE, count: 3 },
  },
  {
    kind: 'shaped_3x3',
    pattern: [
      'acacia_planks', 'acacia_planks', 'acacia_planks',
      'acacia_planks', 'acacia_planks', 'acacia_planks',
      STICK, STICK, null,
    ],
    result: { type: ACACIA_FENCE, count: 3 },
  },
  {
    kind: 'shaped_3x3',
    pattern: [
      'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks',
      'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks',
      STICK, STICK, null,
    ],
    result: { type: DARK_OAK_FENCE, count: 3 },
>>>>>>> dev
  },
]

const COLS_2X2 = 2
const ROWS_2X2 = 2
const COLS_3X3 = 3
const ROWS_3X3 = 3

/**
 * Trims a 2×2 pattern to its minimal bounding box (remove empty outer rows/columns).
 * Returns trimmed row-major array and width/height (1 or 2).
 */
function trimPattern2x2(
  pattern: (BlockType | null)[],
): { trimmed: (BlockType | null)[]; width: number; height: number } {
  if (pattern.length < 4) return { trimmed: [], width: 0, height: 0 }
  let minR = ROWS_2X2
  let maxR = -1
  let minC = COLS_2X2
  let maxC = -1
  for (let r = 0; r < ROWS_2X2; r++) {
    for (let c = 0; c < COLS_2X2; c++) {
      if (pattern[r * COLS_2X2 + c] != null) {
        minR = Math.min(minR, r)
        maxR = Math.max(maxR, r)
        minC = Math.min(minC, c)
        maxC = Math.max(maxC, c)
      }
    }
  }
  if (maxR < minR || maxC < minC) return { trimmed: [], width: 0, height: 0 }
  const w = maxC - minC + 1
  const h = maxR - minR + 1
  const trimmed: (BlockType | null)[] = []
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      trimmed.push(pattern[r * COLS_2X2 + c] ?? null)
    }
  }
  return { trimmed, width: w, height: h }
}

/**
 * Trims a 3×3 pattern to its minimal bounding box.
 */
function trimPattern3x3(
  pattern: (BlockType | null)[],
): { trimmed: (BlockType | null)[]; width: number; height: number } {
  if (pattern.length < 9) return { trimmed: [], width: 0, height: 0 }
  let minR = ROWS_3X3
  let maxR = -1
  let minC = COLS_3X3
  let maxC = -1
  for (let r = 0; r < ROWS_3X3; r++) {
    for (let c = 0; c < COLS_3X3; c++) {
      if (pattern[r * COLS_3X3 + c] != null) {
        minR = Math.min(minR, r)
        maxR = Math.max(maxR, r)
        minC = Math.min(minC, c)
        maxC = Math.max(maxC, c)
      }
    }
  }
  if (maxR < minR || maxC < minC) return { trimmed: [], width: 0, height: 0 }
  const w = maxC - minC + 1
  const h = maxR - minR + 1
  const trimmed: (BlockType | null)[] = []
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      trimmed.push(pattern[r * COLS_3X3 + c] ?? null)
    }
  }
  return { trimmed, width: w, height: h }
}

/** Mirrors a 2×2 pattern horizontally (swap columns). */
function mirrorPattern2x2(pattern: (BlockType | null)[]): (BlockType | null)[] {
  if (pattern.length < 4) return []
  return [
    pattern[1] ?? null,
    pattern[0] ?? null,
    pattern[3] ?? null,
    pattern[2] ?? null,
  ]
}

/** Mirrors a 3×3 pattern horizontally (swap columns). */
function mirrorPattern3x3(pattern: (BlockType | null)[]): (BlockType | null)[] {
  if (pattern.length < 9) return []
  return [
    pattern[2] ?? null,
    pattern[1] ?? null,
    pattern[0] ?? null,
    pattern[5] ?? null,
    pattern[4] ?? null,
    pattern[3] ?? null,
    pattern[8] ?? null,
    pattern[7] ?? null,
    pattern[6] ?? null,
  ]
}

/**
 * Tries to match a trimmed pattern at offset (sr, sc) in the 2×2 grid.
 * Returns consumed slot indices (0–3) if match, null otherwise.
 */
function matchTrimmedIn2x2(
  grid: (BlockType | null)[],
  trimmed: (BlockType | null)[],
  width: number,
  height: number,
  startR: number,
  startC: number,
): number[] | null {
  const consumed: number[] = []
  let ti = 0
  for (let r = startR; r < startR + height; r++) {
    for (let c = startC; c < startC + width; c++) {
      const gridIdx = r * COLS_2X2 + c
      const g = grid[gridIdx] ?? null
      const p = trimmed[ti]
      ti++
      if (p === null) continue
      if (g !== p) return null
      consumed.push(gridIdx)
    }
  }
  return consumed
}

/**
 * Tries to match a trimmed pattern at offset (sr, sc) in the 3×3 grid.
 * Returns consumed slot indices (0–8) if match, null otherwise.
 */
function matchTrimmedIn3x3(
  grid: (BlockType | null)[],
  trimmed: (BlockType | null)[],
  width: number,
  height: number,
  startR: number,
  startC: number,
): number[] | null {
  const consumed: number[] = []
  let ti = 0
  for (let r = startR; r < startR + height; r++) {
    for (let c = startC; c < startC + width; c++) {
      const gridIdx = r * COLS_3X3 + c
      const g = grid[gridIdx] ?? null
      const p = trimmed[ti]
      ti++
      if (p === null) continue
      if (g !== p) return null
      consumed.push(gridIdx)
    }
  }
  return consumed
}

/**
 * Matches a shaped 2×2 recipe against the grid with trim + sliding (and optional mirror).
 * Returns consumed slot indices (0–3) if a match is found, null otherwise.
 */
function matchShaped2x2WithSliding(
  grid: (BlockType | null)[],
  pattern: (BlockType | null)[],
  mirror: boolean,
): number[] | null {
  if (grid.length < 4 || pattern.length < 4) return null
  const patternsToTry: (BlockType | null)[][] = [pattern]
  if (mirror) patternsToTry.push(mirrorPattern2x2(pattern))
  for (const p of patternsToTry) {
    const { trimmed, width, height } = trimPattern2x2(p)
    if (trimmed.length === 0) continue
    for (let sr = 0; sr <= ROWS_2X2 - height; sr++) {
      for (let sc = 0; sc <= COLS_2X2 - width; sc++) {
        const consumed = matchTrimmedIn2x2(grid, trimmed, width, height, sr, sc)
        if (consumed) return consumed
      }
    }
  }
  return null
}

/**
 * Matches a shaped 3×3 recipe against the grid with trim + sliding (and optional mirror).
 * Returns consumed slot indices (0–8) if a match is found, null otherwise.
 */
function matchShaped3x3WithSliding(
  grid: (BlockType | null)[],
  pattern: (BlockType | null)[],
  mirror: boolean,
): number[] | null {
  if (grid.length < 9 || pattern.length < 9) return null
  const patternsToTry: (BlockType | null)[][] = [pattern]
  if (mirror) patternsToTry.push(mirrorPattern3x3(pattern))
  for (const p of patternsToTry) {
    const { trimmed, width, height } = trimPattern3x3(p)
    if (trimmed.length === 0) continue
    for (let sr = 0; sr <= ROWS_3X3 - height; sr++) {
      for (let sc = 0; sc <= COLS_3X3 - width; sc++) {
        const consumed = matchTrimmedIn3x3(grid, trimmed, width, height, sr, sc)
        if (consumed) return consumed
      }
    }
  }
  return null
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
  /** For shaped recipes: grid slot indices (0–3) to consume. Set when matching with sliding. */
  shapedConsumedIndices?: number[]
}

/**
 * Matches the 2×2 crafting grid against registered recipes (trim + sliding for shaped; Vanilla-style).
 * @param grid - 4 elements row-major (indices 0–3), each is type or null (count assumed 1+ when non-null).
 * @returns Recipe and result if a recipe matches, null otherwise. Shaped matches include shapedConsumedIndices.
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
      const consumed = matchShaped2x2WithSliding(g, recipe.pattern, recipe.mirror ?? false)
      if (consumed) return { recipe, result: recipe.result, shapedConsumedIndices: consumed }
    } else {
      if (matchShapeless(g, recipe.ingredients))
        return { recipe, result: recipe.result }
    }
  }
  return null
}

/**
 * Returns amount to consume from each of the 4 crafting slots for one craft of the given recipe.
 * For shaped recipes, pass shapedConsumedIndices from the match when using sliding (Vanilla-style).
 * @param recipe - The matched recipe
 * @param grid - 4 slots row-major; each slot is { type, count }. Returns [a0, a1, a2, a3].
 * @param shapedConsumedIndices - Optional; from Match2x2.shapedConsumedIndices when matching used sliding.
 */
export function getConsumeAmountsForCraft(
  recipe: Recipe2x2,
  grid: Array<{ type: BlockType | null; count: number }>,
  shapedConsumedIndices?: number[],
): number[] {
  const amounts = [0, 0, 0, 0]
  if (grid.length < 4) return amounts

  if (recipe.kind === 'shaped_2x2') {
    if (shapedConsumedIndices && shapedConsumedIndices.length > 0) {
      for (const i of shapedConsumedIndices) {
        if (i >= 0 && i < 4) amounts[i] = 1
      }
    } else {
      for (let i = 0; i < 4; i++) {
        if (recipe.pattern[i] != null) amounts[i] = 1
      }
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
  /** Grid slot indices (0–8) to consume. Set when matching with sliding. */
  consumedSlotIndices?: number[]
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
 * Returns consumed slot count for a 2×2 match (for "best match" tie-breaking).
 */
function consumedCount2x2(m: Match2x2): number {
  if (m.shapedConsumedIndices) return m.shapedConsumedIndices.length
  if (m.recipe.kind === 'shapeless') {
    return m.recipe.ingredients.reduce((s, i) => s + i.count, 0)
  }
  return 4
}

/**
 * Matches the 3×3 crafting grid: tries all 3×3 recipes and all 2×2 quadrants, then returns the match that consumes the most slots (Vanilla-style: prefer more specific recipe).
 * @param grid - 9 elements row-major (indices 0–8).
 * @returns Recipe and result if a recipe matches, null otherwise. Shaped 3×3 matches include consumedSlotIndices.
 */
export function matchRecipe3x3(grid: (BlockType | null)[]): Match3x3 | null {
  if (grid.length < 9) return null
  const g = grid.slice(0, 9).map((t) => t ?? null)
  let best: Match3x3 | null = null
  let bestCount = 0
  for (const recipe of RECIPES_3X3) {
    const consumed = matchShaped3x3WithSliding(g, recipe.pattern, recipe.mirror ?? false)
    if (consumed && consumed.length > bestCount) {
      best = { recipe, result: recipe.result, consumedSlotIndices: consumed }
      bestCount = consumed.length
    }
  }
  for (const indices of QUADRANT_2X2_INDICES) {
    const subGrid2x2 = indices.map((i) => g[i])
    const match2x2 = matchRecipe2x2(subGrid2x2)
<<<<<<< HEAD
    if (match2x2) {
      const count = consumedCount2x2(match2x2)
      if (count > bestCount) {
        best = { recipe2x2: match2x2.recipe, result: match2x2.result, indices }
        bestCount = count
=======
    if (!match2x2) continue
    const inQuadrant = (i: number) => i === indices[0] || i === indices[1] || i === indices[2] || i === indices[3]
    let onlyQuadrantFilled = true
    for (let i = 0; i < 9; i++) {
      if (!inQuadrant(i) && g[i] != null) {
        onlyQuadrantFilled = false
        break
      }
    }
    if (onlyQuadrantFilled)
      return {
        recipe2x2: match2x2.recipe,
        result: match2x2.result,
        indices,
>>>>>>> dev
      }
    }
  }
  return best
}

/**
 * Returns amount to consume from each of the 9 crafting table slots for one craft (3×3 recipe only).
 * When sliding was used, pass consumedSlotIndices from the match.
 * @param recipe - The matched 3×3 recipe
 * @param grid - 9 slots row-major; each slot is { type, count }. Returns [a0..a8].
 * @param consumedSlotIndices - Optional; from Match3x3Shaped.consumedSlotIndices when matching used sliding.
 */
export function getConsumeAmountsForCraft3x3(
  recipe: ShapedRecipe3x3,
  grid: Array<{ type: BlockType | null; count: number }>,
  consumedSlotIndices?: number[],
): number[] {
  const amounts = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  if (grid.length < 9) return amounts
  if (consumedSlotIndices && consumedSlotIndices.length > 0) {
    for (const i of consumedSlotIndices) {
      if (i >= 0 && i < 9) amounts[i] = 1
    }
  } else {
    for (let i = 0; i < 9; i++) {
      if (recipe.pattern[i] != null) amounts[i] = 1
    }
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
    return getConsumeAmountsForCraft3x3(match.recipe, grid, match.consumedSlotIndices)
  }
  const indices = match.indices
  const subGrid2x2 = indices.map((i) => grid[i])
  const amounts2x2 = getConsumeAmountsForCraft(match.recipe2x2, subGrid2x2)
  indices.forEach((slot3x3, i) => {
    amounts[slot3x3] = amounts2x2[i]
  })
  return amounts
}
