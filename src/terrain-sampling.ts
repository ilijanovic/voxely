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
  BEACH_MAX_HEIGHT,
  COAST_BLEND_BAND,
  COAST_EDGE_MIN_COAST_BLEND_T,
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
  LUKEWARM_MOUNTAIN_HUMIDITY_MIN,
  LUKEWARM_MOUNTAIN_TEMP_MIN,
  MOUNTAIN_AMPLITUDE,
  BADLANDS_MESA_HEIGHT_BOOST,
  BADLANDS_VALLEY_DEPTH,
  BADLANDS_VALLEY_RELIEF_REDUCTION,
  MOUNTAIN_BIOME_HEIGHT_BOOST,
  MOUNTAIN_HEIGHT_SCALE,
  MOUNTAIN_JAGGED_BOOST,
  MOUNTAIN_JAGGED_DETAIL_BOOST,
  MOUNTAIN_MASK_SCALE,
  MOUNTAIN_NON_CORE_BIOME_HEIGHT_BOOST,
  MOUNTAIN_PEAK_BAND_BOOST,
  MOUNTAIN_THRESHOLD,
  MOUNTAIN_TRANSITION_WIDTH,
  NOISE_COORD_WRAP,
  OCEAN_CONTINENTALNESS_THRESHOLD,
  JAGGED_PEAKS_EDGE_CHECK_RADIUS,
  PEAK_JAGGED_BAND_MIN,
  PEAK_JAGGED_EROSION_MAX,
  PEAK_JAGGED_FACTOR_MIN,
  PEAK_Y_MIN,
  PEAK_Y_RANGE,
  RIVER_DEPTH_NOISE_SCALE,
  RIVER_NOISE_SCALE,
  RIVER_SECONDARY_NOISE_SCALE,
  RIVER_WARP_AMP,
  RIVER_WARP_SCALE,
  RIVER_WIDTH_NOISE_SCALE,
  SNOWY_BEACH_MAX_HEIGHT,
  SNOWY_BEACH_MAX_TEMPERATURE,
  SPAWN_ORIGIN_FOREST_CONTINENTALNESS,
  SPAWN_ORIGIN_FOREST_HUMIDITY,
  SPAWN_ORIGIN_FOREST_RADIUS_SQ,
  SPAWN_ORIGIN_FOREST_TEMP,
  SNOW_BIOME_HEIGHT_BOOST,
  STONY_SHORE_MAX_HEIGHT,
  STONY_SHORE_MIN_SLOPE,
  WINDSWEPT_FOREST_HUMIDITY_MIN,
} from './terrain/constants'
import {
  getLandBiomeBlendByClimate,
  getLandBiomeBlendByMultiNoise,
  getPeakBiomeByMultiNoise,
} from './terrain/biomes'
import { BIOME_LAYERS, BIOME_TERRAIN, BIOME_VALUE } from './terrain/biomes'
import { getSurfaceBlockFromRules } from './terrain/surface-rules'
import { makeSeededRandom, wrapNoiseCoord } from './terrain/utils'
import { createClimateSampler } from './terrain/climate-sampler'
import {
  getBadlandsBlendFactor,
  getBadlandsValleyFactor,
  getMountainBlendStrength,
  getJaggedPeakFactor,
  getMacroTerrainOffset,
  getPeakBandFactor,
  getRidgeTerm,
  lerp,
  softenExtremeCliffHeight,
  smoothstep01,
  clamp01,
} from './terrain/height-shaping'
import {
  applyFrozenRiverHeight,
  carveRiverHeight,
  getRiverCarveFactor,
  shouldUseFrozenRiver,
  shouldUseRiverBiome,
} from './terrain/river-shaping'

export type GetHeightFn = (x: number, z: number) => number

/** Creates a 2D simplex noise function with the given seed. */
function createNoise(seed: number) {
  const raw = createNoise2D(makeSeededRandom(seed))
  return (x: number, z: number) =>
    raw(wrapNoiseCoord(x, NOISE_COORD_WRAP), wrapNoiseCoord(z, NOISE_COORD_WRAP))
}

/** River warp noise offset for decorrelating X and Z warp channels. */
const RIVER_WARP_OFFSET_X = 193.7
/** River warp noise offset for decorrelating X and Z warp channels. */
const RIVER_WARP_OFFSET_Z = -89.1
/** Secondary river signal offset so confluence widening samples a different channel family. */
const RIVER_SECONDARY_OFFSET_X = 907.3
/** Secondary river signal offset so confluence widening samples a different channel family. */
const RIVER_SECONDARY_OFFSET_Z = -611.9

// clamp01/smoothstep01/lerp are shared via terrain/height-shaping to avoid drift.

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
  const riverNoise2D = createNoise(seed + 1600)
  const riverWarpNoise2D = createNoise(seed + 1601)
  const riverWidthNoise2D = createNoise(seed + 1602)
  const riverDepthNoise2D = createNoise(seed + 1603)
  const riverFrozenNoise2D = createNoise(seed + 1604)
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
   * Returns the climate/ocean base biome before river overlay.
   */
  function getBaseLandBiome(x: number, z: number): Biome {
    const blend = getBiomeBlend(x, z)
    return blend.primary === 'ocean' ? (blend.t < 0.5 ? 'ocean' : blend.secondary) : blend.primary
  }

  /**
   * Returns domain-warped coordinates for river centerline sampling.
   */
  function getRiverWarpedPos(x: number, z: number): { xw: number; zw: number } {
    const wx = riverWarpNoise2D(x * RIVER_WARP_SCALE, z * RIVER_WARP_SCALE)
    const wz = riverWarpNoise2D(
      x * RIVER_WARP_SCALE + RIVER_WARP_OFFSET_X,
      z * RIVER_WARP_SCALE + RIVER_WARP_OFFSET_Z,
    )
    return { xw: x + wx * RIVER_WARP_AMP, zw: z + wz * RIVER_WARP_AMP }
  }

  /**
   * Samples absolute river centerline signal in [0,1].
   */
  function getRiverSignalAbs(x: number, z: number): number {
    const { xw, zw } = getRiverWarpedPos(x, z)
    return Math.abs(riverNoise2D(xw * RIVER_NOISE_SCALE, zw * RIVER_NOISE_SCALE))
  }

  /**
   * Samples secondary absolute river signal in [0,1] for confluence widening.
   */
  function getRiverSecondarySignalAbs(x: number, z: number): number {
    const { xw, zw } = getRiverWarpedPos(x + RIVER_SECONDARY_OFFSET_X, z + RIVER_SECONDARY_OFFSET_Z)
    return Math.abs(
      riverNoise2D(
        (xw + RIVER_SECONDARY_OFFSET_X) * RIVER_SECONDARY_NOISE_SCALE,
        (zw + RIVER_SECONDARY_OFFSET_Z) * RIVER_SECONDARY_NOISE_SCALE,
      ),
    )
  }

  /**
   * Samples river width variation in [0,1].
   */
  function getRiverWidthNoise01(x: number, z: number): number {
    return (riverWidthNoise2D(x * RIVER_WIDTH_NOISE_SCALE, z * RIVER_WIDTH_NOISE_SCALE) + 1) * 0.5
  }

  /**
   * Samples river depth variation in [0,1].
   */
  function getRiverDepthNoise01(x: number, z: number): number {
    return (riverDepthNoise2D(x * RIVER_DEPTH_NOISE_SCALE, z * RIVER_DEPTH_NOISE_SCALE) + 1) * 0.5
  }

  /**
   * Samples rare clustering noise in [0,1] used for frozen_river selection.
   */
  function getRiverFrozenNoise01(x: number, z: number): number {
    return (riverFrozenNoise2D(x * RIVER_WIDTH_NOISE_SCALE, z * RIVER_WIDTH_NOISE_SCALE) + 1) * 0.5
  }

  /**
   * Computes river carve factor from river signals, continentalness, and pre-carve height.
   */
  function getRiverFactorAt(x: number, z: number, baseHeight: number): number {
    return getRiverCarveFactor({
      signalAbs: getRiverSignalAbs(x, z),
      secondarySignalAbs: getRiverSecondarySignalAbs(x, z),
      widthNoise01: getRiverWidthNoise01(x, z),
      continentalness: getContinentalnessSmoothed(x, z),
      baseHeight,
    })
  }

  /**
   * Base biome at (x,z) with river overlay, matching worker logic.
   */
  function getBiome(x: number, z: number): Biome {
    const base = getBaseLandBiome(x, z)
    if (base === 'ocean') return base
    const coastalBlend = getBiomeBlend(x, z)
    if (
      coastalBlend.primary === 'ocean' &&
      coastalBlend.secondary !== 'ocean' &&
      coastalBlend.t >= COAST_EDGE_MIN_COAST_BLEND_T
    )
      return base
    const heightWithoutRiver = getRawTerrainHeightNoRiver(x, z)
    const riverFactor = getRiverFactorAt(x, z, heightWithoutRiver)
    if (!shouldUseRiverBiome(base, riverFactor)) return base
    const carvedHeight = carveRiverHeight(heightWithoutRiver, riverFactor, getRiverDepthNoise01(x, z))
    const frozen = shouldUseFrozenRiver({
      temperature01: getTemperatureSmoothed(x, z),
      riverFactor,
      carvedHeight,
      rareNoise01: getRiverFrozenNoise01(x, z),
    })
    return frozen ? 'frozen_river' : 'river'
  }

  function getMacroTerrain(x: number, z: number): number {
    return getMacroTerrainOffset(getContinentalness(x, z))
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

  /**
   * Returns true when a mountain/snow chain sits in a lukewarm climate neighborhood.
   * Used to route warm highlands toward stony peaks and non-snowy slope biomes.
   */
  function isLukewarmMountainContext(x: number, z: number): boolean {
    return (
      getTemperatureSmoothed(x, z) >= LUKEWARM_MOUNTAIN_TEMP_MIN &&
      getHumiditySmoothed(x, z) >= LUKEWARM_MOUNTAIN_HUMIDITY_MIN
    )
  }

  /**
   * Terrain height at (x,z) before river carving.
   */
  function getRawTerrainHeightNoRiver(x: number, z: number): number {
    const blend = getBiomeBlend(x, z)
    const pA = BIOME_TERRAIN[blend.primary]
    const pB = BIOME_TERRAIN[blend.secondary]
    const t = blend.t
    const mountainBlendStrength = getMountainBlendStrength(blend.primary, blend.secondary, t)
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
    const mountainMask = (mountainMaskNoise2D(x * MOUNTAIN_MASK_SCALE, z * MOUNTAIN_MASK_SCALE) + 1) * 0.5
    const badlandsBlendFactor = getBadlandsBlendFactor(blend.primary, blend.secondary, t)
    const badlandsValleyFactor = getBadlandsValleyFactor(
      badlandsBlendFactor,
      mountainMask,
      erosionSigned,
    )
    const jaggednessT = smoothstep01(
      (-erosionSigned - EROSION_JAGGEDNESS_START) / (1 - EROSION_JAGGEDNESS_START),
    )
    const weirdnessSigned = getWeirdness(x, z)
    const peakBandFactor = getPeakBandFactor(weirdnessSigned)
    const jaggedPeakFactor = getJaggedPeakFactor(weirdnessSigned)
    effectiveAmp *=
      1 +
      jaggednessT * (EROSION_DETAIL_BOOST_MAX - 1) +
      jaggedPeakFactor * MOUNTAIN_JAGGED_DETAIL_BOOST
    effectiveAmp *= 1 - badlandsValleyFactor * BADLANDS_VALLEY_RELIEF_REDUCTION
    const local = n * effectiveAmp

    let mountain = 0
    if (mountainAllowedFactor > 0) {
      const tMaskSmooth = smoothstep01(
        (mountainMask - MOUNTAIN_THRESHOLD) / Math.max(MOUNTAIN_TRANSITION_WIDTH, 1e-6),
      )
      const tMaskRamp = clamp01((mountainMask - MOUNTAIN_THRESHOLD) / (1 - MOUNTAIN_THRESHOLD))
      if (tMaskSmooth > 0) {
        const m =
          (mountainHeightNoise2D(x * MOUNTAIN_HEIGHT_SCALE, z * MOUNTAIN_HEIGHT_SCALE) + 1) * 0.5
        const boostA =
          blend.primary === 'mountain'
            ? MOUNTAIN_BIOME_HEIGHT_BOOST
            : blend.primary === 'snow'
              ? SNOW_BIOME_HEIGHT_BOOST
              : blend.primary === 'badlands'
                ? BADLANDS_MESA_HEIGHT_BOOST
              : pA.mountainAllowed
                ? MOUNTAIN_NON_CORE_BIOME_HEIGHT_BOOST
                : 0
        const boostB =
          blend.secondary === 'mountain'
            ? MOUNTAIN_BIOME_HEIGHT_BOOST
            : blend.secondary === 'snow'
              ? SNOW_BIOME_HEIGHT_BOOST
              : blend.secondary === 'badlands'
                ? BADLANDS_MESA_HEIGHT_BOOST
              : pB.mountainAllowed
                ? MOUNTAIN_NON_CORE_BIOME_HEIGHT_BOOST
                : 0
        const boost = lerp(boostA, boostB, t)
        const mountainShapeBoost =
          1 + peakBandFactor * MOUNTAIN_PEAK_BAND_BOOST + jaggedPeakFactor * MOUNTAIN_JAGGED_BOOST
        mountain =
          tMaskSmooth *
          tMaskRamp *
          m *
          MOUNTAIN_AMPLITUDE *
          boost *
          mountainShapeBoost *
          mountainAllowedFactor *
          mountainBlendStrength
      }
    }
    const erosion = getErosion(x, z)
    const ridgeTerm = getRidgeTerm(weirdnessSigned, mountainAllowedFactor)
    const valleyDepth = badlandsValleyFactor * BADLANDS_VALLEY_DEPTH
    return BASE_HEIGHT + baseOffset + macro + local + mountain + ridgeTerm - erosion - valleyDepth
  }

  /**
   * Terrain height at (x,z) after river carving.
   */
  function getRawTerrainHeight(x: number, z: number): number {
    const baseHeight = getRawTerrainHeightNoRiver(x, z)
    const riverFactor = getRiverFactorAt(x, z, baseHeight)
    const carvedHeight = carveRiverHeight(baseHeight, riverFactor, getRiverDepthNoise01(x, z))
    const frozen = shouldUseFrozenRiver({
      temperature01: getTemperatureSmoothed(x, z),
      riverFactor,
      carvedHeight,
      rareNoise01: getRiverFrozenNoise01(x, z),
    })
    return applyFrozenRiverHeight(carvedHeight, frozen)
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
    const smoothed =
      h11 * 0.25 + (h01 + h21 + h10 + h12) * 0.125 + (h00 + h02 + h20 + h22) * 0.0625
    return softenExtremeCliffHeight({
      center: h11,
      north: h10,
      south: h12,
      east: h21,
      west: h01,
      smoothed,
    })
  }

  /**
   * Max cardinal slope around (x, z) using the provided height sampler.
   * Used for coastal edge biome classification (stony_shore vs beach).
   */
  function getCoastalSlope(x: number, z: number, centerY: number, getHeight: GetHeightFn): number {
    const n = getHeight(x, z - 1)
    const s = getHeight(x, z + 1)
    const w = getHeight(x - 1, z)
    const e = getHeight(x + 1, z)
    return Math.max(
      Math.abs(n - centerY),
      Math.abs(s - centerY),
      Math.abs(w - centerY),
      Math.abs(e - centerY),
    )
  }

  /**
   * Resolves coastal edge biomes (beach, stony_shore, snowy_beach) near ocean boundaries.
   * Runs after highland resolution so inland mountain/snow logic is preserved away from coasts.
   */
  function resolveCoastalEdgeBiome(
    base: Biome,
    resolved: Biome,
    x: number,
    z: number,
    topY: number,
    getHeight: GetHeightFn,
  ): Biome {
    if (resolved === 'ocean' || resolved === 'river' || resolved === 'frozen_river') return resolved

    const blend = getBiomeBlend(x, z)
    if (blend.primary !== 'ocean' || blend.secondary === 'ocean') return resolved
    if (blend.t < COAST_EDGE_MIN_COAST_BLEND_T) return resolved

    const temp = getTemperatureSmoothed(x, z)
    if (topY <= SNOWY_BEACH_MAX_HEIGHT && temp <= SNOWY_BEACH_MAX_TEMPERATURE)
      return 'snowy_beach'

    const slope = getCoastalSlope(x, z, topY, getHeight)
    if ((base === 'mountain' || slope >= STONY_SHORE_MIN_SLOPE) && topY <= STONY_SHORE_MAX_HEIGHT)
      return 'stony_shore'

    if (base === 'badlands' || base === 'mushroom_fields') return resolved
    if (topY <= BEACH_MAX_HEIGHT) return 'beach'
    return resolved
  }

  /**
   * Returns true when any cardinal neighbor falls below the snowy_slopes band.
   * Used to keep a guaranteed slope buffer so jagged peaks do not touch low highlands directly.
   */
  function hasLowNeighborForJaggedTransition(x: number, z: number, getHeight: GetHeightFn): boolean {
    for (let d = 1; d <= JAGGED_PEAKS_EDGE_CHECK_RADIUS; d++) {
      const n = getHeight(x, z - d) + getHeightTransitionOffset(x, z - d)
      const s = getHeight(x, z + d) + getHeightTransitionOffset(x, z + d)
      const w = getHeight(x - d, z) + getHeightTransitionOffset(x - d, z)
      const e = getHeight(x + d, z) + getHeightTransitionOffset(x + d, z)
      if (Math.min(n, s, w, e) < HIGHLAND_SNOWY_SLOPES_MAX) return true
    }
    return false
  }

  function getResolvedBiome(x: number, z: number, getHeight: GetHeightFn): Biome {
    const base = getBiome(x, z)
    const h = getHeight(x, z)
    const hFuzzy = h + getHeightTransitionOffset(x, z)
    if (base === 'river' || base === 'frozen_river') return base
    const lukewarmMountain =
      (base === 'mountain' || base === 'snow') && isLukewarmMountainContext(x, z)

    let resolved: Biome
    if (base !== 'mountain' && base !== 'snow') {
      const temp = getTemperatureSmoothed(x, z)
      if (temp <= COLD_HIGHLAND_TEMP_MAX) {
        if (hFuzzy >= HIGHLAND_SNOWY_SLOPES_MAX) resolved = 'snowy_slopes'
        else if (hFuzzy >= HIGHLAND_GROVE_MAX) resolved = 'grove'
        else resolved = base
      } else if (temp <= COLD_UPLAND_TEMP_MAX && hFuzzy >= HIGHLAND_MEADOW_MAX + 4) {
        resolved =
          getHumidity(x, z) >= WINDSWEPT_FOREST_HUMIDITY_MIN
            ? 'windswept_forest'
            : 'windswept_hills'
      } else {
        resolved = base
      }
    } else if (lukewarmMountain && hFuzzy < HIGHLAND_MEADOW_MAX) {
      resolved = getHumidity(x, z) >= WINDSWEPT_FOREST_HUMIDITY_MIN ? 'forest' : 'savanna'
    } else if (lukewarmMountain && hFuzzy < HIGHLAND_SNOWY_SLOPES_MAX) {
      resolved =
        getHumidity(x, z) >= WINDSWEPT_FOREST_HUMIDITY_MIN
          ? 'windswept_forest'
          : 'windswept_hills'
    } else if (hFuzzy < HIGHLAND_MEADOW_MAX) {
      const v =
        (highlandVariantNoise2D(x * HIGHLAND_VARIANT_SCALE, z * HIGHLAND_VARIANT_SCALE) + 1) * 0.5
      if (v < 0.25)
        resolved =
          getHumidity(x, z) >= WINDSWEPT_FOREST_HUMIDITY_MIN
          ? 'windswept_forest'
          : 'windswept_hills'
      else if (v < 0.5) resolved = 'windswept_gravelly_hills'
      else if (v < 0.75) resolved = 'cherry_grove'
      else resolved = 'meadow'
    } else if (hFuzzy < HIGHLAND_GROVE_MAX) {
      const v =
        (highlandVariantNoise2D(x * HIGHLAND_VARIANT_SCALE, z * HIGHLAND_VARIANT_SCALE) + 1) * 0.5
      resolved = v > 0.82 ? 'windswept_forest' : 'grove'
    } else if (hFuzzy < HIGHLAND_SNOWY_SLOPES_MAX) {
      resolved = 'snowy_slopes'
    } else if (lukewarmMountain) {
      resolved = 'stony_peaks'
    } else {
      const weirdnessSigned = getWeirdnessSmoothed(x, z)
      const peakBandFactor = getPeakBandFactor(weirdnessSigned)
      const jaggedPeakFactor = getJaggedPeakFactor(weirdnessSigned)
      const erosionSigned = getErosionSignedSmoothed(x, z)
      if (
        peakBandFactor >= PEAK_JAGGED_BAND_MIN &&
        jaggedPeakFactor >= PEAK_JAGGED_FACTOR_MIN &&
        erosionSigned <= PEAK_JAGGED_EROSION_MAX
      )
        resolved = 'jagged_peaks'
      else
        resolved = getPeakBiomeByMultiNoise({
          continentalness: getContinentalness(x, z),
          erosion: erosionSigned,
          temperature: getTemperatureSignedSmoothed(x, z),
          humidity: getHumiditySignedSmoothed(x, z),
          weirdness: weirdnessSigned,
          y: getPeakY01(hFuzzy),
        })
    }

    if (resolved === 'jagged_peaks' && hasLowNeighborForJaggedTransition(x, z, getHeight)) {
      resolved = 'snowy_slopes'
    }

    return resolveCoastalEdgeBiome(base, resolved, x, z, h, getHeight)
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
