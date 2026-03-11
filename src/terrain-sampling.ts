/**
 * Pure terrain sampling for the main thread: biome, height, surface block type.
 * Uses same constants/formulas as terrain/ (worker); duplicated for now (see plan Option A).
 * No THREE, no DOM. getResolvedBiome(x, z, getHeight) so game can pass its cached getHeight.
 */
import { createNoise2D } from 'simplex-noise'
import type { Biome, BlockType } from './types'
import { WATER_LEVEL } from './constants'
import {
  getBiomeByMultiNoise,
  getLandBiomeBlendByClimate,
  getLandBiomeByClimate,
} from './terrain/biomes'
import { BIOME_LAYERS, BIOME_TERRAIN, BIOME_VALUE } from './terrain/biomes'
import { getSurfaceBlockFromRules } from './terrain/surface-rules'
import { makeSeededRandom } from './terrain/utils'

const BASE_HEIGHT = 64
const CONTINENTAL_SCALE = 0.0012
const OCEAN_CONTINENTALNESS_THRESHOLD = 0.44
const EROSION_SCALE = 0.018
const EROSION_AMPLITUDE = 7
const EROSION_DETAIL_BOOST_MAX = 1.65
const EROSION_JAGGEDNESS_START = 0.25 // erosionSigned <= -0.25 starts boosting
const MOUNTAIN_MASK_SCALE = 0.003
const MOUNTAIN_HEIGHT_SCALE = 0.008
const MOUNTAIN_AMPLITUDE = 24
const MOUNTAIN_THRESHOLD = 0.3
const MOUNTAIN_BIOME_HEIGHT_BOOST = 2.1
const SNOW_BIOME_HEIGHT_BOOST = 4.5
const TEMP_SCALE = 0.001
const HUMIDITY_SCALE = 0.0012
const WEIRDNESS_SCALE = 0.0016
const WEIRDNESS_RIDGE_AMP = 6
const HIGHLAND_MEADOW_MAX = WATER_LEVEL + 10
const HIGHLAND_GROVE_MAX = WATER_LEVEL + 20
const HIGHLAND_SNOWY_SLOPES_MAX = WATER_LEVEL + 30
const COLD_HIGHLAND_TEMP_MAX = 0.42
const COLD_UPLAND_TEMP_MAX = 0.5
const HIGHLAND_VARIANT_SCALE = 0.004
const WINDSWEPT_FOREST_HUMIDITY_MIN = 0.55
const PEAK_Y_MIN = WATER_LEVEL + 30
const PEAK_Y_RANGE = 24
const HEIGHT_TRANSITION_SCALE = 0.0016
const HEIGHT_TRANSITION_AMPLITUDE = 4.5

export type GetHeightFn = (x: number, z: number) => number

/** Creates a 2D simplex noise function with the given seed. */
function createNoise(seed: number) {
  return createNoise2D(makeSeededRandom(seed))
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function smoothstep01(t: number): number {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** 5-tap smoothing filter (center + N/S/E/W) for height blending. */
function smooth5tap(center: number, n: number, s: number, e: number, w: number): number {
  return center * 0.5 + (n + s + e + w) * 0.125
}

/**
 * Creates the main-thread terrain sampling API: getResolvedBiome, getSmoothedHeight, getBlockTypeAt, getBiomeBlend.
 * Uses same formulas as terrain/ pipeline; getHeight is injected so game can pass its cached column height.
 */
export function createTerrainSampling(seed: number) {
  const temperatureNoise2D = createNoise(seed + 500)
  const humidityNoise2D = createNoise(seed + 600)
  const continentalNoise2D = createNoise(seed + 123)
  const climateWarpNoise2D = createNoise(seed + 31337)
  const detailNoise2D = createNoise(seed + 456)
  const mountainMaskNoise2D = createNoise(seed + 789)
  const mountainHeightNoise2D = createNoise(seed + 101)
  const highlandVariantNoise2D = createNoise(seed + 1717)
  const erosionNoise2D = createNoise(seed + 202)
  const flatNoise2D = createNoise(seed + 303)
  const weirdnessNoise2D = createNoise(seed + 909)
  const heightTransitionNoise2D = createNoise(seed + 4242)

  const COAST_BLEND_BAND = 0.06
  const CLIMATE_WARP_SCALE = 0.0014
  const CLIMATE_WARP_AMP = 42

  function getClimateWarpedPos(x: number, z: number): { xw: number; zw: number } {
    const wx = climateWarpNoise2D(x * CLIMATE_WARP_SCALE, z * CLIMATE_WARP_SCALE)
    const wz = climateWarpNoise2D(x * CLIMATE_WARP_SCALE + 77.7, z * CLIMATE_WARP_SCALE - 31.3)
    return { xw: x + wx * CLIMATE_WARP_AMP, zw: z + wz * CLIMATE_WARP_AMP }
  }

  function getTemperature(x: number, z: number): number {
    const { xw, zw } = getClimateWarpedPos(x, z)
    const n = temperatureNoise2D(xw * TEMP_SCALE, zw * TEMP_SCALE)
    return (n + 1) * 0.5
  }

  function getHumidity(x: number, z: number): number {
    const { xw, zw } = getClimateWarpedPos(x, z)
    const n = humidityNoise2D(xw * HUMIDITY_SCALE, zw * HUMIDITY_SCALE)
    return (n + 1) * 0.5
  }

  function getTemperatureSigned(x: number, z: number): number {
    const { xw, zw } = getClimateWarpedPos(x, z)
    return temperatureNoise2D(xw * TEMP_SCALE, zw * TEMP_SCALE)
  }

  function getHumiditySigned(x: number, z: number): number {
    const { xw, zw } = getClimateWarpedPos(x, z)
    return humidityNoise2D(xw * HUMIDITY_SCALE, zw * HUMIDITY_SCALE)
  }

  function getTemperatureSignedSmoothed(x: number, z: number): number {
    return smooth5tap(
      getTemperatureSigned(x, z),
      getTemperatureSigned(x, z - 1),
      getTemperatureSigned(x, z + 1),
      getTemperatureSigned(x + 1, z),
      getTemperatureSigned(x - 1, z),
    )
  }

  function getHumiditySignedSmoothed(x: number, z: number): number {
    return smooth5tap(
      getHumiditySigned(x, z),
      getHumiditySigned(x, z - 1),
      getHumiditySigned(x, z + 1),
      getHumiditySigned(x + 1, z),
      getHumiditySigned(x - 1, z),
    )
  }

  function getBiomeValue(x: number, z: number): number {
    return BIOME_VALUE[getBiome(x, z)]
  }

  function getContinentalness(x: number, z: number): number {
    const n = continentalNoise2D(x * CONTINENTAL_SCALE, z * CONTINENTAL_SCALE)
    return (n + 1) * 0.5
  }

  function getBiome(x: number, z: number): Biome {
    if (getContinentalness(x, z) < OCEAN_CONTINENTALNESS_THRESHOLD) return 'ocean'
    return getLandBiomeByClimate(getTemperature(x, z), getHumidity(x, z))
  }

  const _blendOut: { primary: Biome; secondary: Biome; t: number } = {
    primary: 'plains',
    secondary: 'plains',
    t: 0,
  }

  function getBiomeBlend(x: number, z: number): { primary: Biome; secondary: Biome; t: number } {
    const c = getContinentalness(x, z)
    const land = getLandBiomeBlendByClimate(getTemperature(x, z), getHumidity(x, z))
    const USE_MULTI_NOISE_BASE_SELECTION = true
    if (USE_MULTI_NOISE_BASE_SELECTION) {
      const pick = getBiomeByMultiNoise({
        continentalness: c,
        erosion: getErosionSignedSmoothed(x, z),
        temperature: getTemperatureSignedSmoothed(x, z),
        humidity: getHumiditySignedSmoothed(x, z),
        weirdness: getWeirdnessSmoothed(x, z),
        y: 0.25,
      })
      if (pick !== 'ocean') land.primary = pick
    }

    // Blend ocean <-> land across a coastal band to avoid a hard cutoff.
    if (c < OCEAN_CONTINENTALNESS_THRESHOLD - COAST_BLEND_BAND) {
      _blendOut.primary = 'ocean'
      _blendOut.secondary = 'ocean'
      _blendOut.t = 0
      return _blendOut
    }
    if (c > OCEAN_CONTINENTALNESS_THRESHOLD + COAST_BLEND_BAND) {
      _blendOut.primary = land.primary
      _blendOut.secondary = land.secondary
      _blendOut.t = land.t
      return _blendOut
    }

    const tLand = smoothstep01(
      (c - (OCEAN_CONTINENTALNESS_THRESHOLD - COAST_BLEND_BAND)) / (2 * COAST_BLEND_BAND),
    )
    _blendOut.primary = 'ocean'
    _blendOut.secondary = land.primary
    _blendOut.t = tLand
    return _blendOut
  }

  function getMacroTerrain(x: number, z: number): number {
    const c = getContinentalness(x, z)
    const s = (a: number, b: number, v: number) => smoothstep01((v - a) / (b - a))
    if (c < 0.3) return -18
    if (c < OCEAN_CONTINENTALNESS_THRESHOLD)
      return lerp(-18, -8, s(0.3, OCEAN_CONTINENTALNESS_THRESHOLD, c))
    if (c < 0.52) return lerp(-8, 0, s(OCEAN_CONTINENTALNESS_THRESHOLD, 0.52, c))
    if (c < 0.75) return lerp(0, 14, s(0.52, 0.75, c))
    return lerp(14, 22, s(0.75, 0.95, c))
  }

  function getLocalTerrain(x: number, z: number, biome: Biome): number {
    const params = BIOME_TERRAIN[biome]
    const n = detailNoise2D(x * params.detailFreq, z * params.detailFreq)
    const flat = flatNoise2D(x * 0.01, z * 0.01)
    const smooth = (flat + 1) * 0.5
    let effectiveAmp = params.detailAmp * (params.flatness + (1 - params.flatness) * smooth)
    // Low erosion (more negative) => sharper, higher-frequency relief.
    const erosionSigned = getErosionSigned(x, z)
    const jaggednessT = smoothstep01(
      (-erosionSigned - EROSION_JAGGEDNESS_START) / (1 - EROSION_JAGGEDNESS_START),
    )
    effectiveAmp *= 1 + jaggednessT * (EROSION_DETAIL_BOOST_MAX - 1)
    return n * effectiveAmp
  }

  function getMountainContribution(x: number, z: number, biome: Biome): number {
    if (!BIOME_TERRAIN[biome].mountainAllowed) return 0
    const mask = (mountainMaskNoise2D(x * MOUNTAIN_MASK_SCALE, z * MOUNTAIN_MASK_SCALE) + 1) * 0.5
    if (mask < MOUNTAIN_THRESHOLD) return 0
    const t = (mask - MOUNTAIN_THRESHOLD) / (1 - MOUNTAIN_THRESHOLD)
    const mountain =
      (mountainHeightNoise2D(x * MOUNTAIN_HEIGHT_SCALE, z * MOUNTAIN_HEIGHT_SCALE) + 1) * 0.5
    const biomeBoost =
      biome === 'mountain'
        ? MOUNTAIN_BIOME_HEIGHT_BOOST
        : biome === 'snow'
          ? SNOW_BIOME_HEIGHT_BOOST
          : 1
    return t * mountain * MOUNTAIN_AMPLITUDE * biomeBoost
  }

  function getErosionSigned(x: number, z: number): number {
    return erosionNoise2D(x * EROSION_SCALE, z * EROSION_SCALE)
  }

  function getErosionSignedSmoothed(x: number, z: number): number {
    return smooth5tap(
      getErosionSigned(x, z),
      getErosionSigned(x, z - 1),
      getErosionSigned(x, z + 1),
      getErosionSigned(x + 1, z),
      getErosionSigned(x - 1, z),
    )
  }

  function getErosion(x: number, z: number): number {
    const n = (getErosionSigned(x, z) + 1) * 0.5
    const t = smoothstep01(n)
    return t * EROSION_AMPLITUDE
  }

  function getWeirdness(x: number, z: number): number {
    return weirdnessNoise2D(x * WEIRDNESS_SCALE, z * WEIRDNESS_SCALE)
  }

  function getWeirdnessSmoothed(x: number, z: number): number {
    return smooth5tap(
      getWeirdness(x, z),
      getWeirdness(x, z - 1),
      getWeirdness(x, z + 1),
      getWeirdness(x + 1, z),
      getWeirdness(x - 1, z),
    )
  }

  function getPeakY01(topY: number): number {
    return clamp01((topY - PEAK_Y_MIN) / PEAK_Y_RANGE)
  }

  function getHeightTransitionOffset(x: number, z: number): number {
    // Signed, low-frequency offset to avoid ruler-straight height cutoffs.
    // This intentionally does not touch getHeight()/columnHeightCache.
    return (
      heightTransitionNoise2D(x * HEIGHT_TRANSITION_SCALE, z * HEIGHT_TRANSITION_SCALE) *
      HEIGHT_TRANSITION_AMPLITUDE
    )
  }

  function getRawTerrainHeight(x: number, z: number): number {
    const blend = getBiomeBlend(x, z)
    const pA = BIOME_TERRAIN[blend.primary]
    const pB = BIOME_TERRAIN[blend.secondary]
    const t = blend.t
    const baseOffset = lerp(pA.baseOffset, pB.baseOffset, t)
    const detailAmp = lerp(pA.detailAmp, pB.detailAmp, t)
    const detailFreq = lerp(pA.detailFreq, pB.detailFreq, t)
    const flatness = lerp(pA.flatness, pB.flatness, t)
    const mountainAllowedFactor =
      (pA.mountainAllowed ? 1 : 0) * (1 - t) + (pB.mountainAllowed ? 1 : 0) * t
    const macro = getMacroTerrain(x, z)
    const n = detailNoise2D(x * detailFreq, z * detailFreq)
    const flat = flatNoise2D(x * 0.01, z * 0.01)
    const smooth = (flat + 1) * 0.5
    let effectiveAmp = detailAmp * (flatness + (1 - flatness) * smooth)
    const erosionSigned = getErosionSigned(x, z)
    const jaggednessT = smoothstep01(
      (-erosionSigned - EROSION_JAGGEDNESS_START) / (1 - EROSION_JAGGEDNESS_START),
    )
    effectiveAmp *= 1 + jaggednessT * (EROSION_DETAIL_BOOST_MAX - 1)
    const local = n * effectiveAmp

    let mountain = 0
    if (mountainAllowedFactor > 0) {
      const mask = (mountainMaskNoise2D(x * MOUNTAIN_MASK_SCALE, z * MOUNTAIN_MASK_SCALE) + 1) * 0.5
      if (mask >= MOUNTAIN_THRESHOLD) {
        const tMask = (mask - MOUNTAIN_THRESHOLD) / (1 - MOUNTAIN_THRESHOLD)
        const m =
          (mountainHeightNoise2D(x * MOUNTAIN_HEIGHT_SCALE, z * MOUNTAIN_HEIGHT_SCALE) + 1) * 0.5
        // Keep boosts for mountain/snow primary dominance, but blend softly.
        const boostA =
          blend.primary === 'mountain'
            ? MOUNTAIN_BIOME_HEIGHT_BOOST
            : blend.primary === 'snow'
              ? SNOW_BIOME_HEIGHT_BOOST
              : 1
        const boostB =
          blend.secondary === 'mountain'
            ? MOUNTAIN_BIOME_HEIGHT_BOOST
            : blend.secondary === 'snow'
              ? SNOW_BIOME_HEIGHT_BOOST
              : 1
        const boost = lerp(boostA, boostB, t)
        mountain = tMask * m * MOUNTAIN_AMPLITUDE * boost * mountainAllowedFactor
      }
    }
    const erosion = getErosion(x, z)
    const ridge = 1 - Math.abs(getWeirdness(x, z))
    const ridgeTerm = ridge * ridge * WEIRDNESS_RIDGE_AMP * mountainAllowedFactor
    return BASE_HEIGHT + baseOffset + macro + local + mountain + ridgeTerm - erosion
  }

  function getSmoothedHeight(x: number, z: number): number {
    const h00 = getRawTerrainHeight(x - 1, z - 1)
    const h01 = getRawTerrainHeight(x - 1, z)
    const h02 = getRawTerrainHeight(x - 1, z + 1)
    const h10 = getRawTerrainHeight(x, z - 1)
    const h11 = getRawTerrainHeight(x, z)
    const h12 = getRawTerrainHeight(x, z + 1)
    const h20 = getRawTerrainHeight(x + 1, z - 1)
    const h21 = getRawTerrainHeight(x + 1, z)
    const h22 = getRawTerrainHeight(x + 1, z + 1)
    return h11 * 0.25 + (h01 + h21 + h10 + h12) * 0.125 + (h00 + h02 + h20 + h22) * 0.0625
  }

  function getResolvedBiome(x: number, z: number, getHeight: GetHeightFn): Biome {
    const base = getBiome(x, z)
    const h = getHeight(x, z)
    const hFuzzy = h + getHeightTransitionOffset(x, z)
    if (base !== 'mountain' && base !== 'snow') {
      const temp = getTemperature(x, z)
      if (temp <= COLD_HIGHLAND_TEMP_MAX) {
        if (hFuzzy >= HIGHLAND_SNOWY_SLOPES_MAX + 6) return 'frozen_peaks'
        if (hFuzzy >= HIGHLAND_SNOWY_SLOPES_MAX) return 'snowy_slopes'
        if (hFuzzy >= HIGHLAND_GROVE_MAX) return 'grove'
      }
      if (temp <= COLD_UPLAND_TEMP_MAX && hFuzzy >= HIGHLAND_MEADOW_MAX + 4)
        return getHumidity(x, z) >= WINDSWEPT_FOREST_HUMIDITY_MIN
          ? 'windswept_forest'
          : 'windswept_hills'
      return base
    }
    if (hFuzzy < HIGHLAND_MEADOW_MAX) {
      const v =
        (highlandVariantNoise2D(x * HIGHLAND_VARIANT_SCALE, z * HIGHLAND_VARIANT_SCALE) + 1) * 0.5
      if (v < 0.25)
        return getHumidity(x, z) >= WINDSWEPT_FOREST_HUMIDITY_MIN
          ? 'windswept_forest'
          : 'windswept_hills'
      if (v < 0.5) return 'windswept_gravelly_hills'
      if (v < 0.75) return 'cherry_grove'
      return 'meadow'
    }
    if (hFuzzy < HIGHLAND_GROVE_MAX) {
      const v =
        (highlandVariantNoise2D(x * HIGHLAND_VARIANT_SCALE, z * HIGHLAND_VARIANT_SCALE) + 1) * 0.5
      if (v > 0.82) return 'windswept_forest'
      return 'grove'
    }
    if (hFuzzy < HIGHLAND_SNOWY_SLOPES_MAX) return 'snowy_slopes'
    const peakPick = getBiomeByMultiNoise({
      continentalness: getContinentalness(x, z),
      erosion: getErosionSignedSmoothed(x, z),
      temperature: getTemperatureSignedSmoothed(x, z),
      humidity: getHumiditySignedSmoothed(x, z),
      weirdness: getWeirdnessSmoothed(x, z),
      y: getPeakY01(hFuzzy),
    })
    if (peakPick === 'stony_peaks' || peakPick === 'frozen_peaks' || peakPick === 'jagged_peaks')
      return peakPick
    // getBiomeByMultiNoise is expected to select a peak biome in this region.
    return 'frozen_peaks'
  }

  function isShore(topY: number): boolean {
    return topY >= WATER_LEVEL - 1 && topY <= WATER_LEVEL + 1
  }

  /**
   * Simplified surface/column block type. Does not replicate full worker surface rules
   * (coast blend, land boundary dither, frozen_peaks packed_ice/ice, grass_snow neighbor).
   * For authoritative surface at a position, use chunk data or game-terrain getSurfaceBlockAt.
   */
  function getBlockTypeAt(biome: Biome, y: number, topY: number): BlockType {
    if (y === 0) return 'bedrock'
    if (y > topY) {
      if (y <= WATER_LEVEL && topY < WATER_LEVEL) return 'water'
      return 'stone'
    }
    if (isShore(topY) && y === topY) return 'sand'
    if (topY < WATER_LEVEL && y === topY) return 'sand'
    const layers = BIOME_LAYERS[biome]
    if (y === topY) {
      const surface = layers.surface
      if (surface === 'snow' && topY <= WATER_LEVEL + 2) return 'sand'
      return getSurfaceBlockFromRules(biome, topY, surface)
    }
    if (y >= topY - layers.subsurfaceDepth) return layers.subsurface
    return 'stone'
  }

  return {
    getBiomeValue,
    getBiome,
    getBiomeBlend,
    getMacroTerrain,
    getLocalTerrain,
    getMountainContribution,
    getErosion,
    getRawTerrainHeight,
    getSmoothedHeight,
    getResolvedBiome,
    getBlockTypeAt,
    isShore,
  }
}

export type TerrainSampling = ReturnType<typeof createTerrainSampling>
