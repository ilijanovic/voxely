/**
 * Recipe types for 2×2 crafting grid (and future 3×3).
 */
import type { BlockType } from '../types'

/** Result of a single craft. */
export interface RecipeResult {
  type: BlockType
  count: number
}

/** Shaped 2×2 recipe: pattern is row-major (top-left, top-right, bottom-left, bottom-right). */
export interface ShapedRecipe2x2 {
  kind: 'shaped_2x2'
  /** Pattern: 4 elements, null = empty slot. */
  pattern: (BlockType | null)[]
  result: RecipeResult
}

/** Shapeless: grid must contain at least the given ingredients (counts); order doesn't matter. */
export interface ShapelessRecipe {
  kind: 'shapeless'
  /** Required ingredients; grid must contain at least these counts per type. */
  ingredients: Array<{ type: BlockType; count: number }>
  result: RecipeResult
}

export type Recipe2x2 = ShapedRecipe2x2 | ShapelessRecipe

/** Shaped 3×3 recipe: pattern is 9 elements row-major (row 0 left→right, row 1, row 2). */
export interface ShapedRecipe3x3 {
  kind: 'shaped_3x3'
  /** Pattern: 9 elements, null = empty slot. */
  pattern: (BlockType | null)[]
  result: RecipeResult
}
