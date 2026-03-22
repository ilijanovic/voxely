import type { Biome } from '../types'
import {
  HEIGHT_EXTREME_CLIFF_SOFTEN_FULL,
  HEIGHT_EXTREME_CLIFF_SOFTEN_START,
  OCEAN_CONTINENTALNESS_THRESHOLD,
  MOUNTAIN_THRESHOLD,
  MOUNTAIN_TRANSITION_WIDTH,
  WEIRDNESS_JAGGED_PEAK_RAMP_SPAN,
  WEIRDNESS_JAGGED_START,
  WEIRDNESS_PEAK_BAND_CENTER,
  WEIRDNESS_PEAK_BAND_HALF_WIDTH,
  WEIRDNESS_RIDGE_AMP,
} from './constants'
import { clamp } from './utils'

/**
 * Linearly interpolates between a and b.
 *
 * @param a - Start value
 * @param b - End value
 * @param t - Blend factor in [0,1]
 * @returns Interpolated value
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Clamps a number into [0, 1].
 *
 * @param x - Input value
 * @returns Clamped value
 */
export function clamp01(x: number): number {
  return clamp(x, 0, 1)
}

/**
 * Smoothstep curve in [0, 1] for an already-normalized t.
 *
 * @param t - Input in [0,1] (values outside are clamped)
 * @returns Smoothed value in [0,1]
 */
export function smoothstep01(t: number): number {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

/**
 * Returns a macro terrain offset from signed continentalness.
 * This is intentionally simple and stable; details come from fBm and biome params.
 *
 * @param continentalnessSigned - Signed continentalness (roughly [-1,1])
 * @returns Height offset in blocks
 */
export function getMacroTerrainOffset(continentalnessSigned: number): number {
  // Keep oceans depressed, land lifted a bit, smooth around coast threshold.
  const tLand = smoothstep01(
    (continentalnessSigned - (OCEAN_CONTINENTALNESS_THRESHOLD - 0.12)) / 0.24,
  )
  const oceanDip = -10
  const landLift = 6
  return lerp(oceanDip, landLift, tLand)
}

/**
 * Returns a blend strength multiplier for mountain contributions during biome transitions.
 *
 * @param primary - Primary biome
 * @param secondary - Secondary biome
 * @param t - Transition factor in [0,1]
 * @returns Multiplier in [0,1]
 */
export function getMountainBlendStrength(primary: Biome, secondary: Biome, t: number): number {
  const p = primary === 'mountain' || primary === 'snow' || primary === 'badlands' ? 1 : 0.7
  const s = secondary === 'mountain' || secondary === 'snow' || secondary === 'badlands' ? 1 : 0.7
  return lerp(p, s, clamp01(t))
}

/**
 * Returns a factor in [0,1] that indicates whether a transition involves badlands.
 *
 * @param primary - Primary biome
 * @param secondary - Secondary biome
 * @param t - Transition factor in [0,1]
 * @returns Badlands blend factor
 */
export function getBadlandsBlendFactor(primary: Biome, secondary: Biome, t: number): number {
  const a = primary === 'badlands' ? 1 : 0
  const b = secondary === 'badlands' ? 1 : 0
  return lerp(a, b, clamp01(t))
}

/**
 * Returns a valley factor in [0,1] for badlands based on blend factor and masking channels.
 *
 * @param badlandsBlendFactor - Output of getBadlandsBlendFactor
 * @param mountainMask01 - Mountain mask in [0,1]
 * @param erosionSigned - Signed erosion (roughly [-1,1])
 * @returns Valley factor in [0,1]
 */
export function getBadlandsValleyFactor(
  badlandsBlendFactor: number,
  mountainMask01: number,
  erosionSigned: number,
): number {
  // Valleys: strongest in badlands, weaker where mountain mask is high, stronger with higher erosion.
  const erosion01 = (erosionSigned + 1) * 0.5
  const valley = smoothstep01((erosion01 - 0.2) / 0.8) * (1 - smoothstep01((mountainMask01 - 0.5) / 0.5))
  return clamp01(badlandsBlendFactor * valley)
}

/**
 * Returns a band factor in [0,1] that gates "peak band" features from weirdness.
 *
 * @param weirdnessSigned - Signed weirdness (roughly [-1,1])
 * @returns Factor in [0,1]
 */
export function getPeakBandFactor(weirdnessSigned: number): number {
  // Ramp across the configured peak band (ties mountain peak shaping to WEIRDNESS_* constants).
  const bandStart = WEIRDNESS_PEAK_BAND_CENTER - WEIRDNESS_PEAK_BAND_HALF_WIDTH
  const bandSpan = 2 * WEIRDNESS_PEAK_BAND_HALF_WIDTH
  return smoothstep01((weirdnessSigned - bandStart) / Math.max(bandSpan, 1e-6))
}

/**
 * Returns a jagged peak factor in [0,1] from weirdness.
 *
 * @param weirdnessSigned - Signed weirdness (roughly [-1,1])
 * @returns Factor in [0,1]
 */
export function getJaggedPeakFactor(weirdnessSigned: number): number {
  return smoothstep01(
    (weirdnessSigned - WEIRDNESS_JAGGED_START) / Math.max(WEIRDNESS_JAGGED_PEAK_RAMP_SPAN, 1e-6),
  )
}

/**
 * Returns an additional ridge term that shapes mountain ridges and avoids over-regular profiles.
 *
 * @param weirdnessSigned - Signed weirdness (roughly [-1,1])
 * @param mountainAllowedFactor - Blended boolean (0..1) describing if mountains are allowed here
 * @returns Height offset in blocks
 */
export function getRidgeTerm(weirdnessSigned: number, mountainAllowedFactor: number): number {
  const ridge = (smoothstep01((weirdnessSigned + 0.2) / 1.2) - 0.5) * WEIRDNESS_RIDGE_AMP
  return ridge * clamp01(mountainAllowedFactor)
}

export interface SoftenExtremeCliffHeightArgs {
  center: number
  north: number
  south: number
  east: number
  west: number
  smoothed: number
}

/**
 * Softens extreme single-column spikes by blending toward a smoothed neighborhood height
 * when a strong cardinal cliff is detected. Keeps cliffs, but reduces one-off artifacts.
 *
 * @param args - Neighborhood heights
 * @returns Adjusted height
 */
export function softenExtremeCliffHeight(args: SoftenExtremeCliffHeightArgs): number {
  const { center, north, south, east, west, smoothed } = args
  const maxDelta = Math.max(
    Math.abs(center - north),
    Math.abs(center - south),
    Math.abs(center - east),
    Math.abs(center - west),
  )

  const cliffRange = HEIGHT_EXTREME_CLIFF_SOFTEN_FULL - HEIGHT_EXTREME_CLIFF_SOFTEN_START
  const t = smoothstep01((maxDelta - HEIGHT_EXTREME_CLIFF_SOFTEN_START) / Math.max(cliffRange, 1e-6))
  return lerp(center, smoothed, t)
}

/**
 * Returns a smooth mountain mask transition factor in [0,1] from a mountainMask noise.
 * Shared helper for parity between worker and main-thread sampling.
 *
 * @param mountainMask01 - Mountain mask in [0,1]
 * @returns Transition factor in [0,1]
 */
export function getMountainMaskTransition(mountainMask01: number): number {
  return smoothstep01((mountainMask01 - MOUNTAIN_THRESHOLD) / Math.max(MOUNTAIN_TRANSITION_WIDTH, 1e-6))
}

export interface SampleFbm2DArgs {
  x: number
  z: number
  baseFrequency: number
  octaves: number
  lacunarity: number
  persistence: number
  normalize: number
  noise2D: (x: number, z: number) => number
}

/**
 * Samples normalized 2D fBm using a shared octave policy.
 */
export function sampleFbm2D(args: SampleFbm2DArgs): number {
  const { x, z, baseFrequency, octaves, lacunarity, persistence, normalize, noise2D } = args
  let fbmSum = 0
  let frequency = baseFrequency
  let amplitude = 1
  for (let i = 0; i < octaves; i++) {
    fbmSum += noise2D(x * frequency, z * frequency) * amplitude
    frequency *= lacunarity
    amplitude *= persistence
  }
  return fbmSum / normalize
}

/**
 * Applies the shared 3x3 smoothing kernel used for terrain column heights.
 */
export function smoothHeightKernel3x3(neighbors: {
  center: number
  north: number
  south: number
  east: number
  west: number
  northWest: number
  northEast: number
  southWest: number
  southEast: number
}): number {
  return (
    neighbors.center * 0.25 +
    (neighbors.north + neighbors.south + neighbors.east + neighbors.west) * 0.125 +
    (neighbors.northWest + neighbors.northEast + neighbors.southWest + neighbors.southEast) * 0.0625
  )
}

