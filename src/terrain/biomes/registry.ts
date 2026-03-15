/**
 * Biome registry: single source of truth for biome definitions.
 * Exports climate-based land biome selection and compatibility helpers.
 */
import type { Biome } from '../../types'
import type {
  BiomeDefinition,
  ClimateBounds,
  MultiNoise6Point,
  MultiNoiseSelector6D,
} from './types'
import { DEFAULT_BIOME_RARITY_WEIGHT } from './types'
import { desertDefinition } from './desert'
import { oceanDefinition } from './ocean'
import { riverDefinition } from './river'
import { beachDefinition } from './beach'
import { stonyShoreDefinition } from './stony_shore'
import { snowyBeachDefinition } from './snowy_beach'
import { plainsDefinition } from './plains'
import { savannaDefinition } from './savanna'
import { forestDefinition } from './forest'
import { jungleDefinition } from './jungle'
import { mountainDefinition } from './mountain'
import { snowDefinition } from './snow'
import { meadowDefinition } from './meadow'
import { groveDefinition } from './grove'
import { snowySlopesDefinition } from './snowy_slopes'
import { stonyPeaksDefinition } from './stony_peaks'
import { frozenPeaksDefinition } from './frozen_peaks'
import { jaggedPeaksDefinition } from './jagged_peaks'
import { cherryGroveDefinition } from './cherry_grove'
import { windsweptHillsDefinition } from './windswept_hills'
import { windsweptGravellyHillsDefinition } from './windswept_gravelly_hills'
import { windsweptForestDefinition } from './windswept_forest'
import { badlandsDefinition } from './badlands'
import { mushroomFieldsDefinition } from './mushroom_fields'
import { mangroveSwampDefinition } from './mangrove_swamp'
import { oldGrowthTaigaDefinition } from './old_growth_taiga'

export const BIOME_REGISTRY: Record<Biome, BiomeDefinition> = {
  plains: plainsDefinition,
  ocean: oceanDefinition,
  river: riverDefinition,
  beach: beachDefinition,
  stony_shore: stonyShoreDefinition,
  snowy_beach: snowyBeachDefinition,
  desert: desertDefinition,
  savanna: savannaDefinition,
  forest: forestDefinition,
  jungle: jungleDefinition,
  mountain: mountainDefinition,
  snow: snowDefinition,
  meadow: meadowDefinition,
  grove: groveDefinition,
  snowy_slopes: snowySlopesDefinition,
  stony_peaks: stonyPeaksDefinition,
  frozen_peaks: frozenPeaksDefinition,
  jagged_peaks: jaggedPeaksDefinition,
  cherry_grove: cherryGroveDefinition,
  windswept_hills: windsweptHillsDefinition,
  windswept_gravelly_hills: windsweptGravellyHillsDefinition,
  windswept_forest: windsweptForestDefinition,
  badlands: badlandsDefinition,
  mushroom_fields: mushroomFieldsDefinition,
  mangrove_swamp: mangroveSwampDefinition,
  old_growth_taiga: oldGrowthTaigaDefinition,
}

/**
 * Base land biomes that have climate bounds.
 * Ocean is selected by continentalness in terrain sampling/generation, not by climate.
 */
export const BASE_LAND_BIOMES: Biome[] = [
  'desert',
  'plains',
  'savanna',
  'forest',
  'jungle',
  'mountain',
  'snow',
  'badlands',
  'mushroom_fields',
  'mangrove_swamp',
  'old_growth_taiga',
]

/**
 * Rarity weight per base land biome for climate-based selection (Minecraft-style).
 * Higher = more common (larger effective Voronoi region). Used as divisor for distSq.
 * Missing entries use DEFAULT_BIOME_RARITY_WEIGHT (1).
 *
 * Tuned to roughly match vanilla: plains/forest dominate temperate land, desert/savanna/snow/mountain
 * are medium common, jungle/badlands/mushroom_fields/mangrove_swamp/old_growth_taiga are rare.
 */
const BIOME_RARITY_WEIGHT: Partial<Record<Biome, number>> = {
  // Very common base biomes
  plains: 3,
  forest: 2.5,
  // Common warm / cold land
  desert: 1.3,
  savanna: 1.2,
  mountain: 2.1,
  snow: 1.3,
  // Rare warm/wet or special biomes
  jungle: 0.3,
  mangrove_swamp: 0.35,
  old_growth_taiga: 0.4,
  badlands: 0.2,
  mushroom_fields: 0.1,
}

/**
 * Returns the rarity weight for a biome used in selection heuristics.
 * Higher means more common (larger effective region) by dividing the distance metric.
 */
function getBiomeRarityWeight(biome: Biome, def: BiomeDefinition): number {
  return def.rarityWeight ?? BIOME_RARITY_WEIGHT[biome] ?? DEFAULT_BIOME_RARITY_WEIGHT
}

const MULTI_NOISE_KEYS: Array<keyof MultiNoise6Point> = [
  'continentalness',
  'erosion',
  'temperature',
  'humidity',
  'weirdness',
  'y',
]

/**
 * Computes squared distance between a query point and a selector in 6D multi-noise space.
 * Uses optional per-dimension weights (defaults to 1).
 */
function distSqMultiNoise(query: MultiNoise6Point, selector: MultiNoiseSelector6D): number {
  let d = 0
  for (const k of MULTI_NOISE_KEYS) {
    const w = selector.weights?.[k] ?? 1
    const diff = query[k] - selector.center[k]
    d += w * diff * diff
  }
  return d
}

/**
 * Computes squared distance between (temp, humidity) and the center of a biome's climate bounds.
 */
function distSq(temp: number, humidity: number, c: ClimateBounds): number {
  const tMid = (c.tempMin + c.tempMax) / 2
  const hMid = (c.humidityMin + c.humidityMax) / 2
  return (temp - tMid) ** 2 + (humidity - hMid) ** 2
}

/**
 * Select a land biome from 2D climate with rarity weighting (Minecraft-style).
 * Uses nearest climate center; effective distance is divided by rarity weight so
 * common biomes (plains, forest) have larger regions, rare (jungle, badlands) smaller.
 * Fallback: if no biome matches (all lack climate), returns plains.
 */
export function getLandBiomeByClimate(temp: number, humidity: number): Biome {
  let best: Biome = 'plains'
  let bestD = Infinity
  for (const b of BASE_LAND_BIOMES) {
    const def = BIOME_REGISTRY[b]
    if (!def.climate) continue
    const rawD = distSq(temp, humidity, def.climate)
    const weight = getBiomeRarityWeight(b, def)
    const d = rawD / Math.max(weight, 0.1)
    if (d < bestD) {
      bestD = d
      best = b
    }
  }
  return best
}

export interface LandBiomeBlend {
  primary: Biome
  secondary: Biome
  /** Weight for secondary biome in [0,1]. */
  t: number
}

export interface LandBiomeBlendMultiNoise {
  primary: Biome
  secondary: Biome
  /** Weight for secondary biome in [0,1]. */
  t: number
}

const PEAK_BIOMES: readonly Biome[] = ['frozen_peaks', 'jagged_peaks', 'stony_peaks']

/**
 * Return the two closest land biomes in climate space (with rarity weighting) plus a blend weight.
 * Softens biome transitions (avoid hard edges). Uses same effective distance as getLandBiomeByClimate.
 */
export function getLandBiomeBlendByClimate(temp: number, humidity: number): LandBiomeBlend {
  let best: Biome = 'plains'
  let bestD = Infinity
  let second: Biome = 'plains'
  let secondD = Infinity

  for (const b of BASE_LAND_BIOMES) {
    const def = BIOME_REGISTRY[b]
    if (!def.climate) continue
    const rawD = distSq(temp, humidity, def.climate)
    const weight = getBiomeRarityWeight(b, def)
    const d = rawD / Math.max(weight, 0.1)
    if (d < bestD) {
      second = best
      secondD = bestD
      best = b
      bestD = d
    } else if (d < secondD) {
      second = b
      secondD = d
    }
  }

  // Convert distances to a stable, bounded secondary weight.
  const denom = bestD + secondD
  const t = denom > 0 ? Math.max(0, Math.min(1, bestD / denom)) : 0
  return { primary: best, secondary: second, t }
}

/**
 * Backward-compatible alias kept for existing call sites/tests.
 * Returns land biomes only.
 */
export function getBiomeByClimate(temp: number, humidity: number): Biome {
  return getLandBiomeByClimate(temp, humidity)
}

/**
 * Select a land biome by nearest multi-noise center in 6D.
 * Only considers base land biomes (excludes ocean and height-resolved highland/peak variants).
 */
export function getLandBiomeByMultiNoise(point: MultiNoise6Point): Biome {
  let best: Biome = 'plains'
  let bestD = Infinity
  for (const b of BASE_LAND_BIOMES) {
    const def = BIOME_REGISTRY[b]
    if (!def.multiNoise) continue
    const rawD = distSqMultiNoise(point, def.multiNoise)
    const weight = getBiomeRarityWeight(b, def)
    const d = rawD / Math.max(weight, 0.1)
    if (d < bestD) {
      bestD = d
      best = b
    }
  }
  return best
}

/**
 * Return the two closest land biomes in multi-noise space plus a blend weight.
 * This is the multi-noise analogue to `getLandBiomeBlendByClimate()`.
 */
export function getLandBiomeBlendByMultiNoise(point: MultiNoise6Point): LandBiomeBlendMultiNoise {
  let best: Biome = 'plains'
  let bestD = Infinity
  let second: Biome = 'plains'
  let secondD = Infinity

  for (const b of BASE_LAND_BIOMES) {
    const def = BIOME_REGISTRY[b]
    if (!def.multiNoise) continue
    const rawD = distSqMultiNoise(point, def.multiNoise)
    const weight = getBiomeRarityWeight(b, def)
    const d = rawD / Math.max(weight, 0.1)
    if (d < bestD) {
      second = best
      secondD = bestD
      best = b
      bestD = d
    } else if (d < secondD) {
      second = b
      secondD = d
    }
  }

  const denom = bestD + secondD
  const t = denom > 0 ? Math.max(0, Math.min(1, bestD / denom)) : 0
  return { primary: best, secondary: second, t }
}

/**
 * Select a biome by nearest multi-noise center in 6D.
 * Only considers biomes that have `multiNoise` defined.
 *
 * Note: This does not replace `getLandBiomeByClimate()` yet; call sites can opt-in
 * for specific selections (e.g. peak variants).
 */
export function getBiomeByMultiNoise(point: MultiNoise6Point): Biome {
  let best: Biome = 'plains'
  let bestD = Infinity
  for (const [b, def] of Object.entries(BIOME_REGISTRY) as Array<[Biome, BiomeDefinition]>) {
    if (!def.multiNoise) continue
    const rawD = distSqMultiNoise(point, def.multiNoise)
    const weight = getBiomeRarityWeight(b, def)
    const d = rawD / Math.max(weight, 0.1)
    if (d < bestD) {
      bestD = d
      best = b
    }
  }
  return best
}

/**
 * Select one of the peak biomes by nearest multi-noise center in 6D.
 * This keeps high mountain resolution stable and avoids fallback bias toward
 * a single peak type when non-peak biomes are closer in the global selector.
 */
export function getPeakBiomeByMultiNoise(point: MultiNoise6Point): Biome {
  let best: Biome = 'frozen_peaks'
  let bestD = Infinity
  for (const b of PEAK_BIOMES) {
    const def = BIOME_REGISTRY[b]
    if (!def.multiNoise) continue
    const d = distSqMultiNoise(point, def.multiNoise)
    if (d < bestD) {
      bestD = d
      best = b
    }
  }
  return best
}
