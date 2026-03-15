/**
 * Shared pure helpers for river carving and river-biome assignment.
 * Used by both worker terrain generation and main-thread terrain sampling.
 */
import type { Biome } from '../types'
import { WATER_LEVEL } from '../constants'
import {
  RIVER_ALTITUDE_FADE_END,
  RIVER_ALTITUDE_FADE_START,
  RIVER_BIOME_FACTOR_THRESHOLD,
  RIVER_CARVE_POWER,
  RIVER_CONTINENTALNESS_MAX,
  RIVER_CONTINENTALNESS_MIN,
  RIVER_DEPTH_MAX,
  RIVER_DEPTH_MIN,
  RIVER_EDGE_SOFTNESS,
  RIVER_WIDTH_MAX,
  RIVER_WIDTH_MIN,
} from './constants'
import { clamp01, lerp, smoothstep01 } from './height-shaping'

/** Inputs required to compute river-carve strength at one column. */
export interface RiverCarveInputs {
  /** Absolute river centerline signal in [0, 1] (typically abs(noise)). Lower means closer to the channel center. */
  signalAbs: number
  /** Width variation noise in [0, 1]. */
  widthNoise01: number
  /** Continentalness (vanilla-aligned signed range). */
  continentalness: number
  /** Pre-carve terrain height (world Y). */
  baseHeight: number
}

/**
 * Computes channel occupancy from absolute centerline noise and width variation.
 *
 * @param signalAbs - Absolute river signal (abs noise)
 * @param widthNoise01 - Width variation in [0,1]
 * @returns Channel factor in [0,1] (1 = channel core)
 */
export function getRiverChannelFactor(signalAbs: number, widthNoise01: number): number {
  const width = lerp(RIVER_WIDTH_MIN, RIVER_WIDTH_MAX, clamp01(widthNoise01))
  const inner = Math.max(0, width - RIVER_EDGE_SOFTNESS)
  const outer = width + RIVER_EDGE_SOFTNESS
  return 1 - smoothstep01((signalAbs - inner) / Math.max(outer - inner, 1e-6))
}

/**
 * Computes how much rivers are allowed at this column based on macro terrain context.
 *
 * @param continentalness - Signed continentalness
 * @param baseHeight - Pre-carve terrain height (world Y)
 * @returns Allowance factor in [0,1]
 */
export function getRiverAllowanceFactor(continentalness: number, baseHeight: number): number {
  const landAllowance = smoothstep01(
    (continentalness - RIVER_CONTINENTALNESS_MIN) /
      Math.max(RIVER_CONTINENTALNESS_MAX - RIVER_CONTINENTALNESS_MIN, 1e-6),
  )
  const altitudeFade =
    1 -
    smoothstep01(
      (baseHeight - RIVER_ALTITUDE_FADE_START) /
        Math.max(RIVER_ALTITUDE_FADE_END - RIVER_ALTITUDE_FADE_START, 1e-6),
    )
  return clamp01(landAllowance * altitudeFade)
}

/**
 * Computes final river factor for carving/biome assignment.
 *
 * @param inputs - River shaping inputs for one column
 * @returns River factor in [0,1]
 */
export function getRiverCarveFactor(inputs: RiverCarveInputs): number {
  const channel = getRiverChannelFactor(inputs.signalAbs, inputs.widthNoise01)
  const allowance = getRiverAllowanceFactor(inputs.continentalness, inputs.baseHeight)
  return clamp01(channel * allowance)
}

/**
 * Applies river carving to terrain height by lowering toward a depth target below sea level.
 * Never raises terrain; returns the original height when riverFactor is zero.
 *
 * @param baseHeight - Pre-carve terrain height (world Y)
 * @param riverFactor - River factor in [0,1]
 * @param depthNoise01 - Depth variation in [0,1]
 * @returns Carved terrain height
 */
export function carveRiverHeight(
  baseHeight: number,
  riverFactor: number,
  depthNoise01: number,
): number {
  if (riverFactor <= 0) return baseHeight
  const depth = lerp(RIVER_DEPTH_MIN, RIVER_DEPTH_MAX, clamp01(depthNoise01))
  const targetFloor = WATER_LEVEL - depth
  const carveStrength = Math.pow(clamp01(riverFactor), RIVER_CARVE_POWER)
  const carved = lerp(baseHeight, Math.min(baseHeight, targetFloor), carveStrength)
  return Math.min(baseHeight, carved)
}

/**
 * Returns whether a column should resolve to the river biome.
 *
 * @param baseBiome - Non-river base biome selected from climate/ocean logic
 * @param riverFactor - River factor in [0,1]
 * @returns True when the column should be classified as river
 */
export function shouldUseRiverBiome(baseBiome: Biome, riverFactor: number): boolean {
  if (baseBiome === 'ocean') return false
  return riverFactor >= RIVER_BIOME_FACTOR_THRESHOLD
}
