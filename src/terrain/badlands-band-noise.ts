import {
  BADLANDS_BAND_NOISE_WEIGHT,
  BADLANDS_BAND_SCALE_XZ,
  BADLANDS_BAND_SCALE_Y,
  BADLANDS_BAND_STRATA_WEIGHT,
  BADLANDS_BAND_WARP_AMPLITUDE,
  BADLANDS_BAND_WARP_OFFSET_X,
  BADLANDS_BAND_WARP_OFFSET_Z,
  BADLANDS_BAND_WARP_SCALE,
} from './surface-constants'

/** Upper bound below 1 so bucket index math stays stable after clamping. */
const NOISE_MAX_EXCLUSIVE = 0.999999

/**
 * Returns the fractional part of a number in [0, 1).
 *
 * @param value - Input number
 * @returns Fractional part
 */
function fract(value: number): number {
  return value - Math.floor(value)
}

/**
 * Clamps a numeric value to the inclusive [0, NOISE_MAX_EXCLUSIVE] range.
 *
 * @param value - Input value
 * @returns Clamped value
 */
function clampBandNoise(value: number): number {
  if (value < 0) return 0
  if (value > NOISE_MAX_EXCLUSIVE) return NOISE_MAX_EXCLUSIVE
  return value
}

/**
 * Shared badlands band sampler used by worker and main-thread terrain paths.
 * World Y drives horizontal strata; XZ noise adds mild warping/irregularity.
 *
 * @param wx - World X
 * @param wz - World Z
 * @param worldY - World Y for the queried block (or top surface Y)
 * @param sampleNoise2D - Deterministic noise sampler with output roughly in [-1, 1]
 * @returns Band noise in [0, 1) for block bucket selection
 */
export function getBadlandsBandNoise(
  wx: number,
  wz: number,
  worldY: number,
  sampleNoise2D: (x: number, z: number) => number,
): number {
  const warp =
    sampleNoise2D(
      wx * BADLANDS_BAND_WARP_SCALE + BADLANDS_BAND_WARP_OFFSET_X,
      wz * BADLANDS_BAND_WARP_SCALE + BADLANDS_BAND_WARP_OFFSET_Z,
    ) * BADLANDS_BAND_WARP_AMPLITUDE
  const strata = fract((worldY + warp) * BADLANDS_BAND_SCALE_Y)
  const noise =
    (sampleNoise2D(wx * BADLANDS_BAND_SCALE_XZ, wz * BADLANDS_BAND_SCALE_XZ) + 1) * 0.5
  return clampBandNoise(strata * BADLANDS_BAND_STRATA_WEIGHT + noise * BADLANDS_BAND_NOISE_WEIGHT)
}
