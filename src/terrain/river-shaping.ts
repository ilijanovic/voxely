import { WATER_LEVEL } from '../constants'
import { clamp } from './utils'
import { clamp01, smoothstep01, lerp } from './height-shaping'
import {
  RIVER_ALTITUDE_FADE_END,
  RIVER_ALTITUDE_FADE_START,
  RIVER_BIOME_FACTOR_THRESHOLD,
  RIVER_CONFLUENCE_BOOST,
  RIVER_CONFLUENCE_MIN_CORE,
  RIVER_CARVE_POWER,
  RIVER_CONTINENTALNESS_MAX,
  RIVER_CONTINENTALNESS_MIN,
  RIVER_DEPTH_MAX,
  RIVER_DEPTH_MIN,
  RIVER_EDGE_SOFTNESS,
  RIVER_FROZEN_ALTITUDE_MAX,
  RIVER_FROZEN_CORE_FACTOR_MIN,
  RIVER_FROZEN_RARE_NOISE_THRESHOLD,
  RIVER_FROZEN_TEMP_MAX,
  RIVER_WIDTH_MAX,
  RIVER_WIDTH_MIN,
} from './constants'

/**
 * Practical lower bound so river biome overlays do not climb too high on ridges.
 * Keeps behavior close to legacy tuning while still sourcing defaults from constants.ts.
 */
const MIN_RIVER_BIOME_FACTOR_THRESHOLD = 0.58
/** Extra clamp to keep river biomes close to sea-level valleys. */
const RIVER_NEAR_SEA_FADE_START = WATER_LEVEL + 4
/** Above this height, river-biome classification should be strongly suppressed. */
const RIVER_NEAR_SEA_FADE_END = WATER_LEVEL + 12
/** Weight of the secondary channel family in the blended carve factor. */
const RIVER_SECONDARY_CHANNEL_WEIGHT = 0.6

export interface RiverCarveFactorArgs {
  /** Absolute river signal in [0,1] (0 near centerline). */
  signalAbs: number
  /** Secondary absolute river signal in [0,1] used for confluence widening. */
  secondarySignalAbs: number
  /** Width variation in [0,1]. */
  widthNoise01: number
  /** Signed continentalness (roughly [-1,1]). Rivers should fade near/ocean. */
  continentalness: number
  /** Pre-river terrain height. */
  baseHeight: number
}

/**
 * Computes a river carve factor in [0,1] from noise signals and context.
 * Higher means "more river" (wider/deeper carve).
 *
 * @param args - River context and signals
 * @returns Carve factor in [0,1]
 */
export function getRiverCarveFactor(args: RiverCarveFactorArgs): number {
  const { signalAbs, secondarySignalAbs, widthNoise01, continentalness, baseHeight } = args

  /**
   * Base width (signal threshold) varies per column to avoid uniform channels.
   * Width is driven by constants.ts so tuning has one source of truth.
   */
  const width = lerp(RIVER_WIDTH_MIN, RIVER_WIDTH_MAX, clamp01(widthNoise01))

  const core = 1 - smoothstep01((signalAbs - width) / RIVER_EDGE_SOFTNESS)
  const secondary = 1 - smoothstep01((secondarySignalAbs - width * 0.85) / RIVER_EDGE_SOFTNESS)
  let factor = Math.max(core, secondary * RIVER_SECONDARY_CHANNEL_WEIGHT)
  const confluenceCore = Math.min(core, secondary)
  if (confluenceCore >= RIVER_CONFLUENCE_MIN_CORE) {
    factor += confluenceCore * RIVER_CONFLUENCE_BOOST
  }

  // Fade rivers close to ocean (continentalness below ~threshold).
  const oceanFade = smoothstep01(
    (continentalness - RIVER_CONTINENTALNESS_MIN) /
      (RIVER_CONTINENTALNESS_MAX - RIVER_CONTINENTALNESS_MIN),
  )
  factor *= oceanFade

  // Rivers should matter less on very high ridges (keeps peaks sharper).
  const highFade =
    1 -
    smoothstep01(
      (baseHeight - RIVER_ALTITUDE_FADE_START) /
        (RIVER_ALTITUDE_FADE_END - RIVER_ALTITUDE_FADE_START),
    )
  factor *= clamp01(highFade)
  const nearSeaFade =
    1 -
    smoothstep01(
      (baseHeight - RIVER_NEAR_SEA_FADE_START) /
        (RIVER_NEAR_SEA_FADE_END - RIVER_NEAR_SEA_FADE_START),
    )
  factor *= clamp01(nearSeaFade)

  return Math.pow(clamp01(factor), RIVER_CARVE_POWER)
}

/**
 * Returns true when a land biome should be overridden by river biomes.
 *
 * @param base - Base biome (before river overlay)
 * @param riverFactor - Output of getRiverCarveFactor
 * @returns Whether to use river biome
 */
export function shouldUseRiverBiome(base: string, riverFactor: number): boolean {
  if (base === 'ocean') return false
  return riverFactor >= Math.max(RIVER_BIOME_FACTOR_THRESHOLD, MIN_RIVER_BIOME_FACTOR_THRESHOLD)
}

/**
 * Carves river height from a base height using a carve factor and depth noise.
 *
 * @param baseHeight - Height before river carving
 * @param riverFactor - Carve factor in [0,1]
 * @param depthNoise01 - Depth variation in [0,1]
 * @returns Carved height
 */
export function carveRiverHeight(baseHeight: number, riverFactor: number, depthNoise01: number): number {
  const depth = lerp(RIVER_DEPTH_MIN, RIVER_DEPTH_MAX, clamp01(depthNoise01)) * clamp01(riverFactor)
  return baseHeight - depth
}

/**
 * Returns true when a river should become a frozen river based on temperature and clustering noise.
 *
 * @param args - Context inputs
 * @returns Whether to use frozen river
 */
export function shouldUseFrozenRiver(args: {
  temperature01: number
  riverFactor: number
  carvedHeight: number
  rareNoise01: number
}): boolean {
  const { temperature01, riverFactor, carvedHeight, rareNoise01 } = args
  if (riverFactor < RIVER_FROZEN_CORE_FACTOR_MIN) return false
  if (temperature01 > RIVER_FROZEN_TEMP_MAX) return false
  if (carvedHeight > RIVER_FROZEN_ALTITUDE_MAX) return false
  // Rare clustering makes frozen rivers appear in streaks rather than everywhere cold.
  return rareNoise01 >= RIVER_FROZEN_RARE_NOISE_THRESHOLD
}

/**
 * Applies frozen river height correction so the surface aligns with water/ice expectations.
 * Frozen rivers should not sit far below water level (helps ice rendering).
 *
 * @param height - Carved height
 * @param frozen - Whether this river column is frozen
 * @returns Adjusted height
 */
export function applyFrozenRiverHeight(height: number, frozen: boolean): number {
  if (!frozen) return height
  // Keep frozen river surface close to water level so ice appears as the top surface.
  const target = WATER_LEVEL - 1
  return clamp(Math.max(height, target), -1e9, 1e9)
}

