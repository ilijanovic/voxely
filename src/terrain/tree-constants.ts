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

/** Scale for tree shape 2D noise (height, leaf size, density). Higher = more variation between nearby trees. */
export const TREE_SHAPE_NOISE_SCALE = 4.5

/** Offset applied to (wx, wz) when sampling tree shape noise for jungle so jungle trees use a different slice of noise than forest. */
export const JUNGLE_TREE_SHAPE_OFFSET_X = 500
export const JUNGLE_TREE_SHAPE_OFFSET_Z = -300

/** Min forest density to allow trees in forest / jungle / windswept_forest. */
export const FOREST_DENSITY_THRESHOLD = 0.0

export const TREE_PLACEMENT_FOREST_THRESHOLD = -0.25
export const TREE_PLACEMENT_WINDSWEPT_FOREST_THRESHOLD = 0.0
/** Lower than forest so jungle has noticeably more trees (denser canopy). */
export const TREE_PLACEMENT_JUNGLE_THRESHOLD = -0.88
export const TREE_PLACEMENT_PLAINS_THRESHOLD = 0.93
/** Meadow trees are rarer than plains to preserve open flower fields. */
export const TREE_PLACEMENT_MEADOW_THRESHOLD = 0.98
export const TREE_PLACEMENT_MOUNTAIN_THRESHOLD = 0.97
export const TREE_PLACEMENT_SNOW_THRESHOLD = 0.55
/** Very sparse trees on snowy_slopes (high threshold so only a few conifers appear). */
export const TREE_PLACEMENT_SNOWY_SLOPES_THRESHOLD = 0.88
/** Chance for a meadow tree to get a bee nest attachment. */
export const MEADOW_BEE_NEST_CHANCE = 0.08

/** Max height difference between column and 4 neighbours for tree placement. */
export const TREE_MAX_SLOPE = 2

/** Biomes that do not get grass_snow at high elevation (WATER_LEVEL + 20). Used by game-terrain and terrain-sampling. Includes snow-peak biomes so they keep snow/ice, not grass_snow. */
export const BIOMES_WITHOUT_GRASS_SNOW: ReadonlySet<Biome> = new Set([
  'desert',
  'savanna',
  'mountain',
  'jungle',
  'cherry_grove',
  'windswept_forest',
  'meadow',
  'plains',
  'frozen_peaks',
  'jagged_peaks',
  'frozen_river',
  'snowy_slopes',
  'snowy_beach',
  'badlands',
  'mushroom_fields',
  'mangrove_swamp',
  'old_growth_taiga',
])

/** Per-biome tree placement: use forest density check and threshold, or threshold only. */
export interface TreePlacementConfig {
  useForestDensity: boolean
  threshold: number
}

/** Map from biome to tree placement config. Unlisted biomes do not place trees. */
export const TREE_PLACEMENT_CONFIG: Partial<Record<Biome, TreePlacementConfig>> = {
  forest: { useForestDensity: true, threshold: TREE_PLACEMENT_FOREST_THRESHOLD },
  jungle: { useForestDensity: true, threshold: TREE_PLACEMENT_JUNGLE_THRESHOLD },
  mountain: { useForestDensity: false, threshold: TREE_PLACEMENT_MOUNTAIN_THRESHOLD },
  plains: { useForestDensity: false, threshold: TREE_PLACEMENT_PLAINS_THRESHOLD },
  meadow: { useForestDensity: false, threshold: TREE_PLACEMENT_MEADOW_THRESHOLD },
  savanna: { useForestDensity: false, threshold: TREE_PLACEMENT_PLAINS_THRESHOLD },
  cherry_grove: { useForestDensity: false, threshold: TREE_PLACEMENT_PLAINS_THRESHOLD },
  windswept_forest: { useForestDensity: true, threshold: TREE_PLACEMENT_WINDSWEPT_FOREST_THRESHOLD },
  snow: { useForestDensity: false, threshold: TREE_PLACEMENT_SNOW_THRESHOLD },
  grove: { useForestDensity: false, threshold: TREE_PLACEMENT_SNOW_THRESHOLD },
  snowy_slopes: {
    useForestDensity: false,
    threshold: TREE_PLACEMENT_SNOWY_SLOPES_THRESHOLD,
  },
  old_growth_taiga: { useForestDensity: true, threshold: TREE_PLACEMENT_FOREST_THRESHOLD },
}

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
  trunkMin: 3,
  trunkMax: 10,
  leafRadiusMin: 1,
  leafRadiusMax: 4,
  leafHeightMin: 2,
  leafHeightMax: 7,
  leafDensityMin: 0.42,
  leafDensityMax: 0.95,
  giantChance: 0.03,
  giantTrunkBonusMax: 5,
  giantLeafRadiusBonusMax: 2,
  giantLeafHeightBonusMax: 3,
  giantDensityBonusMax: 0.05,
}

export const TREE_SHAPE_FOREST: TreeShapeConfig = {
  trunkMin: 4,
  trunkMax: 13,
  leafRadiusMin: 2,
  leafRadiusMax: 5,
  leafHeightMin: 3,
  leafHeightMax: 9,
  leafDensityMin: 0.48,
  leafDensityMax: 0.98,
  giantChance: 0.06,
  giantTrunkBonusMax: 6,
  giantLeafRadiusBonusMax: 2,
  giantLeafHeightBonusMax: 3,
  giantDensityBonusMax: 0.04,
}

/** Jungle trees: wider ranges (short bushy to very tall), denser canopy and more giants for a dense jungle feel. */
export const TREE_SHAPE_JUNGLE: TreeShapeConfig = {
  trunkMin: 4,
  trunkMax: 20,
  leafRadiusMin: 2,
  leafRadiusMax: 8,
  leafHeightMin: 4,
  leafHeightMax: 15,
  leafDensityMin: 0.6,
  leafDensityMax: 0.99,
  giantChance: 0.18,
  giantTrunkBonusMax: 10,
  giantLeafRadiusBonusMax: 3,
  giantLeafHeightBonusMax: 5,
  giantDensityBonusMax: 0.05,
}

export const TREE_SHAPE_MOUNTAIN: TreeShapeConfig = {
  trunkMin: 3,
  trunkMax: 9,
  leafRadiusMin: 1,
  leafRadiusMax: 4,
  leafHeightMin: 2,
  leafHeightMax: 6,
  leafDensityMin: 0.35,
  leafDensityMax: 0.88,
  giantChance: 0.02,
  giantTrunkBonusMax: 4,
  giantLeafRadiusBonusMax: 1,
  giantLeafHeightBonusMax: 2,
  giantDensityBonusMax: 0.06,
}

export const TREE_SHAPE_SNOW: TreeShapeConfig = {
  trunkMin: 6,
  trunkMax: 16,
  leafRadiusMin: 1,
  leafRadiusMax: 4,
  leafHeightMin: 4,
  leafHeightMax: 11,
  leafDensityMin: 0.4,
  leafDensityMax: 0.94,
  giantChance: 0.05,
  giantTrunkBonusMax: 7,
  giantLeafRadiusBonusMax: 2,
  giantLeafHeightBonusMax: 3,
  giantDensityBonusMax: 0.05,
}

/** Map from biome to tree shape config. Unlisted biomes use TREE_SHAPE_DEFAULT. */
export const BIOME_TO_TREE_SHAPE: Partial<Record<Biome, TreeShapeConfig>> = {
  snow: TREE_SHAPE_SNOW,
  grove: TREE_SHAPE_SNOW,
  snowy_slopes: TREE_SHAPE_SNOW,
  forest: TREE_SHAPE_FOREST,
  windswept_forest: TREE_SHAPE_FOREST,
  old_growth_taiga: TREE_SHAPE_FOREST,
  jungle: TREE_SHAPE_JUNGLE,
  mountain: TREE_SHAPE_MOUNTAIN,
}

/**
 * Returns the tree shape config for the given biome. Used by both worker and main thread.
 */
export function getTreeShapeConfigForBiome(biome: Biome): TreeShapeConfig {
  return BIOME_TO_TREE_SHAPE[biome] ?? TREE_SHAPE_DEFAULT
}
