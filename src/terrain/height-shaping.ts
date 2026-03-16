/**
 * Shared helpers for macro terrain and height shaping.
 *
 * This module intentionally contains only pure math so it can be used both by the
 * worker chunk generator (`src/terrain/index.ts`) and the main-thread sampler
 * (`src/terrain-sampling.ts`) without introducing drift.
 */
import {
  BADLANDS_VALLEY_EROSION_START,
  BADLANDS_VALLEY_MASK_FLOOR_MAX,
  BADLANDS_VALLEY_MASK_FLOOR_MIN,
  MACRO_TERRAIN_DEEP_OCEAN_MAX,
  MACRO_TERRAIN_FAR_INLAND_MIN,
  MACRO_TERRAIN_MID_INLAND_MIN,
  MACRO_TERRAIN_NEAR_INLAND_MIN,
  OCEAN_CONTINENTALNESS_THRESHOLD,
  WEIRDNESS_JAGGED_RIDGE_BOOST,
  WEIRDNESS_JAGGED_START,
  WEIRDNESS_PEAK_BAND_CENTER,
  WEIRDNESS_PEAK_BAND_HALF_WIDTH,
  WEIRDNESS_RIDGE_AMP,
  WEIRDNESS_VANILLA_RANGE_SCALE,
} from './constants'
import type { Biome } from '../types'

/** Single knot in a 1D macro-terrain profile spline. */
interface MacroTerrainKnot {
  /** Continentalness position in vanilla-aligned signed space. */
  c: number
  /** Height offset in blocks at this continentalness position. */
  h: number
}

/**
 * Piecewise-smooth macro profile (continentalness -> macro height).
 * Keep this ordered by `c` ascending.
 */
const MACRO_TERRAIN_SPLINE: readonly MacroTerrainKnot[] = [
  { c: -1.2, h: -24 },
  { c: MACRO_TERRAIN_DEEP_OCEAN_MAX, h: -24 },
  { c: OCEAN_CONTINENTALNESS_THRESHOLD, h: -10 },
  { c: MACRO_TERRAIN_NEAR_INLAND_MIN, h: 2 },
  { c: MACRO_TERRAIN_MID_INLAND_MIN, h: 16 },
  { c: MACRO_TERRAIN_FAR_INLAND_MIN, h: 26 },
  { c: 1, h: 26 },
]

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
 * Returns how strongly the weirdness signal falls into a mountain peak band.
 *
 * @param weirdnessSigned - Signed weirdness in vanilla-aligned range
 * @returns Peak-band factor in [0, 1]
 */
export function getPeakBandFactor(weirdnessSigned: number): number {
  const normalized = Math.abs(weirdnessSigned) / WEIRDNESS_VANILLA_RANGE_SCALE
  const distance = Math.abs(normalized - WEIRDNESS_PEAK_BAND_CENTER)
  return clamp01(1 - distance / WEIRDNESS_PEAK_BAND_HALF_WIDTH)
}

/**
 * Returns an extra factor for sharp negative-weirdness mountain ridges.
 *
 * @param weirdnessSigned - Signed weirdness in vanilla-aligned range
 * @returns Jagged ridge factor in [0, 1]
 */
export function getJaggedPeakFactor(weirdnessSigned: number): number {
  const normalized = weirdnessSigned / WEIRDNESS_VANILLA_RANGE_SCALE
  return smoothstep01((-normalized - WEIRDNESS_JAGGED_START) / (1 - WEIRDNESS_JAGGED_START))
}

/**
 * Returns how much of a biome blend belongs to badlands.
 *
 * @param primary - Primary biome
 * @param secondary - Secondary biome
 * @param t - Secondary blend weight in [0,1]
 * @returns Badlands blend factor in [0,1]
 */
export function getBadlandsBlendFactor(primary: Biome, secondary: Biome, t: number): number {
  const primaryWeight = primary === 'badlands' ? 1 - t : 0
  const secondaryWeight = secondary === 'badlands' ? t : 0
  return clamp01(primaryWeight + secondaryWeight)
}

/**
 * Computes badlands valley-floor factor from biome blend, mountain mask, and erosion.
 * Higher output means stronger flattening/lowering for basin floors.
 *
 * @param badlandsBlendFactor - Badlands presence in the biome blend [0,1]
 * @param mountainMask - Mountain mask sample in [0,1]
 * @param erosionSigned - Signed erosion noise in [-1,1]
 * @returns Valley-floor factor in [0,1]
 */
export function getBadlandsValleyFactor(
  badlandsBlendFactor: number,
  mountainMask: number,
  erosionSigned: number,
): number {
  if (badlandsBlendFactor <= 0) return 0
  const floorMaskWidth = Math.max(BADLANDS_VALLEY_MASK_FLOOR_MAX - BADLANDS_VALLEY_MASK_FLOOR_MIN, 1e-6)
  const lowMaskT = smoothstep01((BADLANDS_VALLEY_MASK_FLOOR_MAX - mountainMask) / floorMaskWidth)
  const erosionWidth = Math.max(1 - BADLANDS_VALLEY_EROSION_START, 1e-6)
  const erosionT = smoothstep01((erosionSigned - BADLANDS_VALLEY_EROSION_START) / erosionWidth)
  return clamp01(badlandsBlendFactor * lowMaskT * erosionT)
}

/**
 * Samples a piecewise smoothstep curve from ordered control points.
 *
 * @param points - Ordered spline knots (ascending x)
 * @param x - Query position
 * @returns Interpolated y value
 */
function samplePiecewiseSmoothSpline(points: readonly MacroTerrainKnot[], x: number): number {
  const first = points[0]
  const last = points[points.length - 1]
  if (x <= first.c) return first.h
  if (x >= last.c) return last.h

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (x > b.c) continue
    const width = b.c - a.c
    if (width <= 1e-9) return b.h
    const t = smoothstep01((x - a.c) / width)
    return lerp(a.h, b.h, t)
  }
  return last.h
}

/**
 * Maps signed continentalness (vanilla-aligned range) to a macro height offset.
 * This is the main lever for continents, shelves, and inland ramping.
 *
 * @param continentalnessSigned - Signed continentalness (vanilla-aligned)
 * @returns Macro height offset in blocks (relative to BASE_HEIGHT/sea level)
 */
export function getMacroTerrainOffset(continentalnessSigned: number): number {
  return samplePiecewiseSmoothSpline(MACRO_TERRAIN_SPLINE, continentalnessSigned)
}

/**
 * Computes the ridge contribution from weirdness (vanilla-style).
 *
 * @param weirdnessSigned - Signed weirdness (vanilla-style range)
 * @param mountainAllowedFactor - Factor in [0,1] indicating whether mountains are allowed
 * @returns Ridge height contribution in blocks
 */
export function getRidgeTerm(weirdnessSigned: number, mountainAllowedFactor: number): number {
  const peakBand = getPeakBandFactor(weirdnessSigned)
  const jagged = getJaggedPeakFactor(weirdnessSigned)
  return (
    peakBand *
    peakBand *
    (1 + jagged * WEIRDNESS_JAGGED_RIDGE_BOOST) *
    WEIRDNESS_RIDGE_AMP *
    mountainAllowedFactor
  )
}
