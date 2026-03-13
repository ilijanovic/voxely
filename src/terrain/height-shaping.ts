/**
 * Shared helpers for macro terrain and height shaping.
 *
 * This module intentionally contains only pure math so it can be used both by the
 * worker chunk generator (`src/terrain/index.ts`) and the main-thread sampler
 * (`src/terrain-sampling.ts`) without introducing drift.
 */
import {
  MACRO_TERRAIN_DEEP_OCEAN_MAX,
  MACRO_TERRAIN_FAR_INLAND_MIN,
  MACRO_TERRAIN_MID_INLAND_MIN,
  MACRO_TERRAIN_NEAR_INLAND_MIN,
  OCEAN_CONTINENTALNESS_THRESHOLD,
  WEIRDNESS_RIDGE_AMP,
  WEIRDNESS_VANILLA_RANGE_SCALE,
} from './constants'

/**
 * Linearly interpolates between two values.
 *
 * @param a - Start value
 * @param b - End value
 * @param t - Blend factor in [0,1] (clamped by caller when needed)
 * @returns Interpolated value
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Clamps a number to [0,1].
 *
 * @param v - Input value
 * @returns Clamped value in [0,1]
 */
export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/**
 * Smoothstep in [0,1] with clamping.
 *
 * @param t - Input value
 * @returns Smoothed value in [0,1]
 */
export function smoothstep01(t: number): number {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

/**
 * Maps signed continentalness (vanilla-aligned range) to a macro height offset.
 * This is the main lever for continents, shelves, and inland ramping.
 *
 * @param continentalnessSigned - Signed continentalness (vanilla-aligned)
 * @returns Macro height offset in blocks (relative to BASE_HEIGHT/sea level)
 */
export function getMacroTerrainOffset(continentalnessSigned: number): number {
  const c = continentalnessSigned
  const s = (a: number, b: number, v: number) => smoothstep01((v - a) / (b - a))

  // Deep ocean basin
  if (c < MACRO_TERRAIN_DEEP_OCEAN_MAX) return -24
  // Ocean shelf up to the ocean/land threshold
  if (c < OCEAN_CONTINENTALNESS_THRESHOLD)
    return lerp(
      -24,
      -10,
      s(MACRO_TERRAIN_DEEP_OCEAN_MAX, OCEAN_CONTINENTALNESS_THRESHOLD, c),
    )
  // Near-inland ramp (beach/coast band)
  if (c < MACRO_TERRAIN_NEAR_INLAND_MIN)
    return lerp(-10, 2, s(OCEAN_CONTINENTALNESS_THRESHOLD, MACRO_TERRAIN_NEAR_INLAND_MIN, c))
  // Mid inland
  if (c < MACRO_TERRAIN_MID_INLAND_MIN)
    return lerp(2, 16, s(MACRO_TERRAIN_NEAR_INLAND_MIN, MACRO_TERRAIN_MID_INLAND_MIN, c))
  // Far inland plateau
  return lerp(16, 26, s(MACRO_TERRAIN_MID_INLAND_MIN, MACRO_TERRAIN_FAR_INLAND_MIN, c))
}

/**
 * Computes the ridge contribution from weirdness (vanilla-style).
 *
 * @param weirdnessSigned - Signed weirdness (vanilla-style range)
 * @param mountainAllowedFactor - Factor in [0,1] indicating whether mountains are allowed
 * @returns Ridge height contribution in blocks
 */
export function getRidgeTerm(weirdnessSigned: number, mountainAllowedFactor: number): number {
  const ridge = 1 - Math.abs(weirdnessSigned) / WEIRDNESS_VANILLA_RANGE_SCALE
  return ridge * ridge * WEIRDNESS_RIDGE_AMP * mountainAllowedFactor
}

