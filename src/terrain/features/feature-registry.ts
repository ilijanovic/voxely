/**
 * Canonical decorator order and per-biome density/eligibility for terrain features (Minecraft-style).
 * Order is fixed; features run in this sequence in the features stage.
 * Density values are optional hints (0..1) for features that support them; unused features ignore.
 */
import type { Biome } from '../../types'
import type { FeatureFn } from '../pipeline-types'

/** Stable feature identifiers; order matches the sequence used in terrain/index.ts. */
export const FEATURE_ORDER = [
  'trees',
  'ferns',
  'flowers',
  'ground',
  'dead_bush',
  'cactus',
  'sugar_cane',
  'kelp',
  'lily_pad',
  'seagrass',
  'sea_pickle',
  'mushrooms',
  'bamboo',
  'vine',
  'sweet_berry_bush',
  'pumpkin',
  'melon',
  'pink_petals',
] as const

export type FeatureId = (typeof FEATURE_ORDER)[number]

/**
 * Builds the canonical, stable-ordered feature callback list for the features stage.
 * Throws if any feature is missing to prevent silent ordering drift.
 */
export function createOrderedFeatureList(featuresById: Record<FeatureId, FeatureFn>): FeatureFn[] {
  return FEATURE_ORDER.map((id) => {
    const fn = featuresById[id]
    if (fn == null) throw new Error(`Missing feature implementation for "${id}"`)
    return fn
  })
}

/**
 * Optional density target per (feature, biome). Value in [0, 1]; higher = more placement attempts.
 * Features may use this when they support configurable density; otherwise they use internal thresholds.
 */
export const FEATURE_DENSITY_BY_BIOME: Partial<Record<FeatureId, Partial<Record<Biome, number>>>> = {
  trees: {
    plains: 0.04,
    forest: 0.12,
    jungle: 0.18,
    savanna: 0.03,
    meadow: 0.05,
    cherry_grove: 0.08,
    snow: 0.02,
    snowy_slopes: 0.02,
    mountain: 0.02,
    windswept_forest: 0.06,
    grove: 0.04,
    old_growth_taiga: 0.08,
    mangrove_swamp: 0.06,
  },
  flowers: {
    plains: 0.15,
    meadow: 0.2,
    forest: 0.08,
    cherry_grove: 0.12,
  },
  ground: {
    plains: 0.9,
    meadow: 0.85,
    forest: 0.7,
    jungle: 0.8,
    savanna: 0.6,
  },
  mushrooms: {
    forest: 0.03,
    jungle: 0.05,
    mangrove_swamp: 0.04,
    old_growth_taiga: 0.04,
  },
  dead_bush: { desert: 0.08 },
  cactus: { desert: 0.02 },
}

/**
 * Returns the optional density target for a feature in a biome (0..1).
 * Use in feature logic to scale placement probability when supported.
 */
export function getFeatureDensityForBiome(featureId: FeatureId, biome: Biome): number | undefined {
  const byBiome = FEATURE_DENSITY_BY_BIOME[featureId]
  if (byBiome == null) return undefined
  return byBiome[biome]
}
