import type { NoiseFunction2D } from 'simplex-noise'
import {
  CLIMATE_PARAM_SCALE,
  CLIMATE_WARP_AMP,
  CLIMATE_WARP_SCALE,
  CONTINENTALNESS_VANILLA_MAX,
  CONTINENTALNESS_VANILLA_MIN,
  EROSION_SCALE,
  WEIRDNESS_SCALE,
  WEIRDNESS_VANILLA_RANGE_SCALE,
} from './constants'

const CLIMATE_WARP_OFFSET_X = 77.7
const CLIMATE_WARP_OFFSET_Z = -31.3

/**
 * Noise inputs required to sample the Overworld climate parameters.
 * All functions are expected to return signed noise in [-1, 1].
 */
export interface ClimateNoiseInputs {
  /** Signed temperature noise in [-1,1]. */
  temperatureNoise2D: NoiseFunction2D
  /** Signed humidity (vegetation) noise in [-1,1]. */
  humidityNoise2D: NoiseFunction2D
  /** Signed continentalness noise in [-1,1]. */
  continentalNoise2D: NoiseFunction2D
  /** Signed warp noise in [-1,1] used to domain-warp other parameters. */
  climateWarpNoise2D: NoiseFunction2D
  /** Signed erosion noise in [-1,1]. */
  erosionNoise2D: NoiseFunction2D
  /** Signed weirdness noise in [-1,1]. */
  weirdnessNoise2D: NoiseFunction2D
}

/**
 * API surface for sampling climate parameters at world (x,z).
 * Keeps worker and main-thread sampling in lockstep.
 */
export interface ClimateSampler {
  /** Returns warped x/z used for temperature/humidity sampling. */
  getClimateWarpedPos: (x: number, z: number) => { xw: number; zw: number }
  /** Temperature in [0,1]. */
  getTemperature01: (x: number, z: number) => number
  /** Humidity in [0,1]. */
  getHumidity01: (x: number, z: number) => number
  /** Continentalness in vanilla range [-1.2, 1] (signed). */
  getContinentalnessSigned: (x: number, z: number) => number
  /** Temperature in [-1,1] (signed). */
  getTemperatureSigned: (x: number, z: number) => number
  /** Humidity in [-1,1] (signed). */
  getHumiditySigned: (x: number, z: number) => number
  /** Erosion in [-1,1] (signed). */
  getErosionSigned: (x: number, z: number) => number
  /** Weirdness in vanilla range [-2, 2] (signed). */
  getWeirdnessSigned: (x: number, z: number) => number
}

/**
 * Creates a climate sampler from seeded noise functions.
 * This is intentionally pure and deterministic: no caching and no side effects.
 */
export function createClimateSampler(inputs: ClimateNoiseInputs): ClimateSampler {
  /**
   * Converts signed noise in [-1,1] into [0,1].
   */
  function signedTo01(n: number): number {
    return (n + 1) * 0.5
  }

  /**
   * Returns a domain-warped position for climate parameters so biome boundaries
   * are less grid-aligned (Minecraft-style).
   */
  function getClimateWarpedPos(x: number, z: number): { xw: number; zw: number } {
    const wx = inputs.climateWarpNoise2D(x * CLIMATE_WARP_SCALE, z * CLIMATE_WARP_SCALE)
    const wz = inputs.climateWarpNoise2D(
      x * CLIMATE_WARP_SCALE + CLIMATE_WARP_OFFSET_X,
      z * CLIMATE_WARP_SCALE + CLIMATE_WARP_OFFSET_Z,
    )
    return { xw: x + wx * CLIMATE_WARP_AMP, zw: z + wz * CLIMATE_WARP_AMP }
  }

  /**
   * Samples signed temperature noise in [-1,1].
   */
  function getTemperatureSigned(x: number, z: number): number {
    const { xw, zw } = getClimateWarpedPos(x, z)
    return inputs.temperatureNoise2D(xw * CLIMATE_PARAM_SCALE, zw * CLIMATE_PARAM_SCALE)
  }

  /**
   * Samples signed humidity noise in [-1,1].
   */
  function getHumiditySigned(x: number, z: number): number {
    const { xw, zw } = getClimateWarpedPos(x, z)
    return inputs.humidityNoise2D(xw * CLIMATE_PARAM_SCALE, zw * CLIMATE_PARAM_SCALE)
  }

  /**
   * Maps raw noise in [-1, 1] to vanilla continentalness range [-1.2, 1].
   * Sampled without warping (keeps coast shapes stable).
   */
  function getContinentalnessSigned(x: number, z: number): number {
    const raw = inputs.continentalNoise2D(x * CLIMATE_PARAM_SCALE, z * CLIMATE_PARAM_SCALE)
    const t = (raw + 1) * 0.5
    return CONTINENTALNESS_VANILLA_MIN + t * (CONTINENTALNESS_VANILLA_MAX - CONTINENTALNESS_VANILLA_MIN)
  }

  /**
   * Samples signed erosion noise in [-1,1].
   */
  function getErosionSigned(x: number, z: number): number {
    return inputs.erosionNoise2D(x * EROSION_SCALE, z * EROSION_SCALE)
  }

  /**
   * Samples weirdness in vanilla range [-2, 2] (raw noise [-1, 1] scaled).
   */
  function getWeirdnessSigned(x: number, z: number): number {
    const raw = inputs.weirdnessNoise2D(x * WEIRDNESS_SCALE, z * WEIRDNESS_SCALE)
    return raw * WEIRDNESS_VANILLA_RANGE_SCALE
  }

  /**
   * Samples temperature in [0,1].
   */
  function getTemperature01(x: number, z: number): number {
    return signedTo01(getTemperatureSigned(x, z))
  }

  /**
   * Samples humidity in [0,1].
   */
  function getHumidity01(x: number, z: number): number {
    return signedTo01(getHumiditySigned(x, z))
  }

  return {
    getClimateWarpedPos,
    getTemperature01,
    getHumidity01,
    getContinentalnessSigned,
    getTemperatureSigned,
    getHumiditySigned,
    getErosionSigned,
    getWeirdnessSigned,
  }
}
