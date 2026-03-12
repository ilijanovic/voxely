/**
 * Pure terrain sampling for the main thread: biome, height, surface block type.
 * Uses same constants and formulas as terrain/ (worker) via shared terrain/constants.
 * No THREE, no DOM. getResolvedBiome(x, z, getHeight) so game can pass its cached getHeight.
 */
import { createNoise2D } from 'simplex-noise'
import type { Biome, BlockType } from './types'
import { WATER_LEVEL } from './constants'
import {
  BASE_HEIGHT,
  COAST_BLEND_BAND,
  COLD_HIGHLAND_TEMP_MAX,
  COLD_UPLAND_TEMP_MAX,
  EROSION_AMPLITUDE,
  EROSION_DETAIL_BOOST_MAX,
  EROSION_JAGGEDNESS_START,
  FLAT_NOISE_SCALE,
  HEIGHT_DETAIL_FBM_NORMALIZE,
  HEIGHT_DETAIL_LACUNARITY,
  HEIGHT_DETAIL_OCTAVES,
  HEIGHT_DETAIL_PERSISTENCE,
  HEIGHT_TRANSITION_AMPLITUDE,
  HEIGHT_TRANSITION_SCALE,
  HIGHLAND_GROVE_MAX,
  HIGHLAND_MEADOW_MAX,
  HIGHLAND_SNOWY_SLOPES_MAX,
  HIGHLAND_VARIANT_SCALE,
  MACRO_TERRAIN_DEEP_OCEAN_MAX,
  MACRO_TERRAIN_FAR_INLAND_MIN,
  MACRO_TERRAIN_MID_INLAND_MIN,
  MACRO_TERRAIN_NEAR_INLAND_MIN,
  MOUNTAIN_AMPLITUDE,
  MOUNTAIN_BIOME_HEIGHT_BOOST,
  MOUNTAIN_HEIGHT_SCALE,
  MOUNTAIN_MASK_SCALE,
  MOUNTAIN_THRESHOLD,
  MOUNTAIN_TRANSITION_WIDTH,
  OCEAN_CONTINENTALNESS_THRESHOLD,
  PEAK_Y_MIN,
  PEAK_Y_RANGE,
  SPAWN_ORIGIN_FOREST_CONTINENTALNESS,
  SPAWN_ORIGIN_FOREST_HUMIDITY,
  SPAWN_ORIGIN_FOREST_RADIUS_SQ,
  SPAWN_ORIGIN_FOREST_TEMP,
  SNOW_BIOME_HEIGHT_BOOST,
  WEIRDNESS_RIDGE_AMP,
  WEIRDNESS_VANILLA_RANGE_SCALE,
  WINDSWEPT_FOREST_HUMIDITY_MIN,
} from './terrain/constants'
import {
  getBiomeByMultiNoise,
  getLandBiomeBlendByClimate,
  getLandBiomeBlendByMultiNoise,
} from './terrain/biomes'
import { BIOME_LAYERS, BIOME_TERRAIN, BIOME_VALUE } from './terrain/biomes'
import { getSurfaceBlockFromRules } from './terrain/surface-rules'
import { makeSeededRandom } from './terrain/utils'
import { createClimateSampler } from './terrain/climate-sampler'

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
 * Full surface block logic (coast blend, dither, slope, frozen_peaks, snow neighbor) is in terrain/surface-resolver.ts;
 * getBlockTypeAt is a simplified path for approximate column block type only.
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

  const climate = createClimateSampler({
    temperatureNoise2D,
    humidityNoise2D,
    continentalNoise2D,
    climateWarpNoise2D,
    erosionNoise2D,
    weirdnessNoise2D,
  })

  function getTemperature(x: number, z: number): number {
    return climate.getTemperature01(x, z)
  }

  function getHumidity(x: number, z: number): number {
    return climate.getHumidity01(x, z)
  }

  /** 5-tap smoothed temperature in [0,1] for biome blend (parity with terrain/index). */
  function getTemperatureSmoothed(x: number, z: number): number {
    const tC = getTemperature(x, z)
    const tN = getTemperature(x, z - 1)
    const tS = getTemperature(x, z + 1)
    const tW = getTemperature(x - 1, z)
    const tE = getTemperature(x + 1, z)
    return tC * 0.5 + (tN + tS + tW + tE) * 0.125
  }

  /** 5-tap smoothed humidity in [0,1] for biome blend (parity with terrain/index). */
  function getHumiditySmoothed(x: number, z: number): number {
    const hC = getHumidity(x, z)
    const hN = getHumidity(x, z - 1)
    const hS = getHumidity(x, z + 1)
    const hW = getHumidity(x - 1, z)
    const hE = getHumidity(x + 1, z)
    return hC * 0.5 + (hN + hS + hW + hE) * 0.125
  }

  function getTemperatureSigned(x: number, z: number): number {
    return climate.getTemperatureSigned(x, z)
  }

  function getHumiditySigned(x: number, z: number): number {
    return climate.getHumiditySigned(x, z)
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
    return climate.getContinentalnessSigned(x, z)
  }

  /** 5-tap smoothed continentalness for ocean/land blend (parity with terrain/index). */
  function getContinentalnessSmoothed(x: number, z: number): number {
    return smooth5tap(
      getContinentalness(x, z),
      getContinentalness(x, z - 1),
      getContinentalness(x, z + 1),
      getContinentalness(x + 1, z),
      getContinentalness(x - 1, z),
    )
  }

  /**
   * Blends (c, temp, humidity) toward forest at world origin so first POI/spawn is in forest.
   * Must match terrain/index.ts spawn-origin bias.
   */
  function applySpawnOriginForestBias(
    x: number,
    z: number,
    c: number,
    temp: number,
    humidity: number,
  ): { c: number; temp: number; humidity: number } {
    const distSq = x * x + z * z
    if (distSq >= SPAWN_ORIGIN_FOREST_RADIUS_SQ) return { c, temp, humidity }
    const t = 1 - distSq / SPAWN_ORIGIN_FOREST_RADIUS_SQ
    const blendT = t * t * (3 - 2 * t)
    return {
      c: lerp(c, SPAWN_ORIGIN_FOREST_CONTINENTALNESS, blendT),
      temp: lerp(temp, SPAWN_ORIGIN_FOREST_TEMP, blendT),
      humidity: lerp(humidity, SPAWN_ORIGIN_FOREST_HUMIDITY, blendT),
    }
  }

  const _blendOut: { primary: Biome; secondary: Biome; t: number } = {
    primary: 'plains',
    secondary: 'plains',
    t: 0,
  }

  function getBiomeBlend(x: number, z: number): { primary: Biome; secondary: Biome; t: number } {
    let c = getContinentalnessSmoothed(x, z)
    let temp = getTemperatureSmoothed(x, z)
    let humidity = getHumiditySmoothed(x, z)
    const biased = applySpawnOriginForestBias(x, z, c, temp, humidity)
    c = biased.c
    const USE_MULTI_NOISE_BASE_SELECTION = true
    const land = USE_MULTI_NOISE_BASE_SELECTION
      ? getLandBiomeBlendByMultiNoise({
          continentalness: c,
          erosion: getErosionSignedSmoothed(x, z),
          temperature: getTemperatureSignedSmoothed(x, z),
          humidity: getHumiditySignedSmoothed(x, z),
          weirdness: getWeirdnessSmoothed(x, z),
          y: 0.25,
        })
      : getLandBiomeBlendByClimate(biased.temp, biased.humidity)

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

  /**
   * Base biome at (x,z). Uses smoothed climate and coast-blend logic to match worker getBaseBiomeAt.
   */
  function getBiome(x: number, z: number): Biome {
    const blend = getBiomeBlend(x, z)
    return blend.primary === 'ocean'
      ? blend.t < 0.5
        ? 'ocean'
        : blend.secondary
      : blend.primary
  }

  function getMacroTerrain(x: number, z: number): number {
    const c = getContinentalness(x, z)
    const s = (a: number, b: number, v: number) => smoothstep01((v - a) / (b - a))
    if (c < MACRO_TERRAIN_DEEP_OCEAN_MAX) return -18
    if (c < OCEAN_CONTINENTALNESS_THRESHOLD)
      return lerp(-18, -8, s(MACRO_TERRAIN_DEEP_OCEAN_MAX, OCEAN_CONTINENTALNESS_THRESHOLD, c))
    if (c < MACRO_TERRAIN_NEAR_INLAND_MIN)
      return lerp(-8, 0, s(OCEAN_CONTINENTALNESS_THRESHOLD, MACRO_TERRAIN_NEAR_INLAND_MIN, c))
    if (c < MACRO_TERRAIN_MID_INLAND_MIN)
      return lerp(0, 14, s(MACRO_TERRAIN_NEAR_INLAND_MIN, MACRO_TERRAIN_MID_INLAND_MIN, c))
    return lerp(14, 22, s(MACRO_TERRAIN_MID_INLAND_MIN, MACRO_TERRAIN_FAR_INLAND_MIN, c))
  }

  function getLocalTerrain(x: number, z: number, biome: Biome): number {
    const params = BIOME_TERRAIN[biome]
    let fbmSum = 0
    let freq = params.detailFreq
    let amp = 1
    for (let i = 0; i < HEIGHT_DETAIL_OCTAVES; i++) {
      fbmSum += detailNoise2D(x * freq, z * freq) * amp
      freq *= HEIGHT_DETAIL_LACUNARITY
      amp *= HEIGHT_DETAIL_PERSISTENCE
    }
    const n = fbmSum / HEIGHT_DETAIL_FBM_NORMALIZE
    const flat = flatNoise2D(x * FLAT_NOISE_SCALE, z * FLAT_NOISE_SCALE)
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
    const tMaskSmooth = smoothstep01(
      (mask - MOUNTAIN_THRESHOLD) / Math.max(MOUNTAIN_TRANSITION_WIDTH, 1e-6),
    )
    if (tMaskSmooth <= 0) return 0
    const t = clamp01((mask - MOUNTAIN_THRESHOLD) / (1 - MOUNTAIN_THRESHOLD))
    const mountain =
      (mountainHeightNoise2D(x * MOUNTAIN_HEIGHT_SCALE, z * MOUNTAIN_HEIGHT_SCALE) + 1) * 0.5
    const biomeBoost =
      biome === 'mountain'
        ? MOUNTAIN_BIOME_HEIGHT_BOOST
        : biome === 'snow'
          ? SNOW_BIOME_HEIGHT_BOOST
          : 1
    return tMaskSmooth * t * mountain * MOUNTAIN_AMPLITUDE * biomeBoost
  }

  function getErosionSigned(x: number, z: number): number {
    return climate.getErosionSigned(x, z)
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
    return climate.getWeirdnessSigned(x, z)
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
    let fbmSum = 0
    let freq = detailFreq
    let amp = 1
    for (let i = 0; i < HEIGHT_DETAIL_OCTAVES; i++) {
      fbmSum += detailNoise2D(x * freq, z * freq) * amp
      freq *= HEIGHT_DETAIL_LACUNARITY
      amp *= HEIGHT_DETAIL_PERSISTENCE
    }
    const n = fbmSum / HEIGHT_DETAIL_FBM_NORMALIZE
    const flat = flatNoise2D(x * FLAT_NOISE_SCALE, z * FLAT_NOISE_SCALE)
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
      const tMaskSmooth = smoothstep01(
        (mask - MOUNTAIN_THRESHOLD) / Math.max(MOUNTAIN_TRANSITION_WIDTH, 1e-6),
      )
      const tMaskRamp = clamp01((mask - MOUNTAIN_THRESHOLD) / (1 - MOUNTAIN_THRESHOLD))
      if (tMaskSmooth > 0) {
        const m =
          (mountainHeightNoise2D(x * MOUNTAIN_HEIGHT_SCALE, z * MOUNTAIN_HEIGHT_SCALE) + 1) * 0.5
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
        mountain =
          tMaskSmooth * tMaskRamp * m * MOUNTAIN_AMPLITUDE * boost * mountainAllowedFactor
      }
    }
    const erosion = getErosion(x, z)
    const ridge = 1 - Math.abs(getWeirdness(x, z)) / WEIRDNESS_VANILLA_RANGE_SCALE
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
      const temp = getTemperatureSmoothed(x, z)
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
   * Simplified surface/column block type. Does not use terrain/surface-resolver (no blend, dither, slope, frozen_peaks noise, snow neighbor).
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
    getTemperature,
    getHumidity,
    getContinentalness,
  }
}

export type TerrainSampling = ReturnType<typeof createTerrainSampling>
