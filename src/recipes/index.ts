export type {
  Recipe2x2,
  RecipeResult,
  ShapedRecipe2x2,
  ShapedRecipe3x3,
  ShapelessRecipe,
} from './recipes-types'
export {
  matchRecipe2x2,
  getConsumeAmountsForCraft,
  matchRecipe3x3,
  getConsumeAmountsForCraft3x3,
  getConsumeAmountsForCraft3x3FromMatch,
  type Match2x2,
  type Match3x3,
  type Match3x3Shaped,
  type Match3x3From2x2,
} from './recipes-registry'
