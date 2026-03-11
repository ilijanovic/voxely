/**
 * Shared tree placement and shape constants for worker and main thread.
 * Single source of truth so terrain/index.ts and game-terrain.ts stay in sync.
 * Pure data only; no THREE, no DOM, no side effects.
 */
import type { Biome } from '../types'

/** Scale for forest density 2D noise (wx * scale, wz * scale). */
export const FOREST_DENSITY_SCALE = 0.028

/** Scale for tree placement 2D noise. */
export const TREE_PLACEMENT_SCALE = 0.12

/** Min forest density to allow trees in forest / jungle / windswept_forest. */
export const FOREST_DENSITY_THRESHOLD = 0.0

export const TREE_PLACEMENT_FOREST_THRESHOLD = -0.1
export const TREE_PLACEMENT_WINDSWEPT_FOREST_THRESHOLD = 0.0
export const TREE_PLACEMENT_JUNGLE_THRESHOLD = -0.65
export const TREE_PLACEMENT_PLAINS_THRESHOLD = 0.93
export const TREE_PLACEMENT_MOUNTAIN_THRESHOLD = 0.97
export const TREE_PLACEMENT_SNOW_THRESHOLD = 0.55

/** Max height difference between column and 4 neighbours for tree placement. */
export const TREE_MAX_SLOPE = 2

export interface TreeShapeConfig {
  trunkMin: number
  trunkMax: number
  leafRadiusMin: number
  leafRadiusMax: number
  leafHeightMin: number
  leafHeightMax: number
  leafDensityMin: number
  leafDensityMax: number
  giantChance: number
  giantTrunkBonusMax: number
  giantLeafRadiusBonusMax: number
  giantLeafHeightBonusMax: number
  giantDensityBonusMax: number
}

export const TREE_SHAPE_DEFAULT: TreeShapeConfig = {
  trunkMin: 4,
  trunkMax: 8,
  leafRadiusMin: 1,
  leafRadiusMax: 3,
  leafHeightMin: 3,
  leafHeightMax: 6,
  leafDensityMin: 0.58,
  leafDensityMax: 0.92,
  giantChance: 0.03,
  giantTrunkBonusMax: 5,
  giantLeafRadiusBonusMax: 2,
  giantLeafHeightBonusMax: 3,
  giantDensityBonusMax: 0.05,
}

export const TREE_SHAPE_FOREST: TreeShapeConfig = {
  trunkMin: 5,
  trunkMax: 10,
  leafRadiusMin: 2,
  leafRadiusMax: 4,
  leafHeightMin: 4,
  leafHeightMax: 7,
  leafDensityMin: 0.62,
  leafDensityMax: 0.96,
  giantChance: 0.06,
  giantTrunkBonusMax: 6,
  giantLeafRadiusBonusMax: 2,
  giantLeafHeightBonusMax: 3,
  giantDensityBonusMax: 0.04,
}

export const TREE_SHAPE_JUNGLE: TreeShapeConfig = {
  trunkMin: 8,
  trunkMax: 14,
  leafRadiusMin: 3,
  leafRadiusMax: 6,
  leafHeightMin: 6,
  leafHeightMax: 11,
  leafDensityMin: 0.78,
  leafDensityMax: 0.98,
  giantChance: 0.1,
  giantTrunkBonusMax: 8,
  giantLeafRadiusBonusMax: 2,
  giantLeafHeightBonusMax: 4,
  giantDensityBonusMax: 0.03,
}

export const TREE_SHAPE_MOUNTAIN: TreeShapeConfig = {
  trunkMin: 4,
  trunkMax: 7,
  leafRadiusMin: 1,
  leafRadiusMax: 3,
  leafHeightMin: 2,
  leafHeightMax: 5,
  leafDensityMin: 0.45,
  leafDensityMax: 0.82,
  giantChance: 0.02,
  giantTrunkBonusMax: 4,
  giantLeafRadiusBonusMax: 1,
  giantLeafHeightBonusMax: 2,
  giantDensityBonusMax: 0.06,
}

export const TREE_SHAPE_SNOW: TreeShapeConfig = {
  trunkMin: 8,
  trunkMax: 14,
  leafRadiusMin: 1,
  leafRadiusMax: 3,
  leafHeightMin: 5,
  leafHeightMax: 9,
  leafDensityMin: 0.55,
  leafDensityMax: 0.9,
  giantChance: 0.05,
  giantTrunkBonusMax: 7,
  giantLeafRadiusBonusMax: 2,
  giantLeafHeightBonusMax: 3,
  giantDensityBonusMax: 0.05,
}

/**
 * Returns the tree shape config for the given biome. Used by both worker and main thread.
 */
export function getTreeShapeConfigForBiome(biome: Biome): TreeShapeConfig {
  if (biome === 'snow' || biome === 'grove') return TREE_SHAPE_SNOW
  if (biome === 'forest' || biome === 'windswept_forest') return TREE_SHAPE_FOREST
  if (biome === 'jungle') return TREE_SHAPE_JUNGLE
  if (biome === 'mountain') return TREE_SHAPE_MOUNTAIN
  return TREE_SHAPE_DEFAULT
}
