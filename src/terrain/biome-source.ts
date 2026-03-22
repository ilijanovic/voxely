import type { Biome } from '../types'
import { COAST_BLEND_BAND, OCEAN_CONTINENTALNESS_THRESHOLD } from './constants'
import { getLandBiomeBlendByClimate, getLandBiomeBlendByMultiNoise } from './biomes'
import { getMacroTerrainOffset, lerp, smoothstep01, clamp01 } from './height-shaping'

/** Base vertical sample used by legacy fixed-y multi-noise selection. */
const LEGACY_MULTI_NOISE_BASE_Y = 0.25
/** Minimum multi-noise y for inland/ocean transitions. */
const BIOME_SELECTION_Y_MIN = 0.1
/** Maximum multi-noise y for inland peaks and uplands. */
const BIOME_SELECTION_Y_MAX = 0.5
/** Macro terrain floor in blocks used to normalize biome-source y. */
const BIOME_SELECTION_MACRO_MIN = -10
/** Macro terrain ceiling in blocks used to normalize biome-source y. */
const BIOME_SELECTION_MACRO_MAX = 6

export interface BiomeSourceClimatePoint {
  continentalness: number
  temperature01: number
  humidity01: number
  erosionSigned: number
  temperatureSigned: number
  humiditySigned: number
  weirdnessSigned: number
}

export interface BiomeBlendResult {
  primary: Biome
  secondary: Biome
  t: number
}

/**
 * Maps continentalness to the y dimension used by multi-noise base biome selection.
 * This keeps base-land selection closer to vanilla behavior than a fixed y value.
 */
export function getBiomeSelectionYFromContinentalness(continentalness: number): number {
  const macro = getMacroTerrainOffset(continentalness)
  const normalized = clamp01(
    (macro - BIOME_SELECTION_MACRO_MIN) / (BIOME_SELECTION_MACRO_MAX - BIOME_SELECTION_MACRO_MIN),
  )
  return lerp(BIOME_SELECTION_Y_MIN, BIOME_SELECTION_Y_MAX, normalized)
}

/**
 * Blends continentalness, temperature, and humidity near world origin toward forest.
 * This preserves the spawn-friendly start zone while keeping the rest of worldgen unchanged.
 */
export function applySpawnOriginForestBias(
  x: number,
  z: number,
  continentalness: number,
  temperature01: number,
  humidity01: number,
  radiusSq: number,
  target: { continentalness: number; temperature01: number; humidity01: number },
): { continentalness: number; temperature01: number; humidity01: number } {
  const distSq = x * x + z * z
  if (distSq >= radiusSq) return { continentalness, temperature01, humidity01 }
  const t = 1 - distSq / radiusSq
  const blendT = t * t * (3 - 2 * t)
  return {
    continentalness: lerp(continentalness, target.continentalness, blendT),
    temperature01: lerp(temperature01, target.temperature01, blendT),
    humidity01: lerp(humidity01, target.humidity01, blendT),
  }
}

/**
 * Resolves base biome blending between ocean and land biomes.
 * Uses multi-noise selection with a continentalness-derived y component by default.
 */
export function resolveBaseBiomeBlend(
  climate: BiomeSourceClimatePoint,
  useMultiNoiseBaseSelection: boolean,
): BiomeBlendResult {
  const land = useMultiNoiseBaseSelection
    ? getLandBiomeBlendByMultiNoise({
        continentalness: climate.continentalness,
        erosion: climate.erosionSigned,
        temperature: climate.temperatureSigned,
        humidity: climate.humiditySigned,
        weirdness: climate.weirdnessSigned,
        y: getLegacyMultiNoiseBaseY(),
      })
    : getLandBiomeBlendByClimate(climate.temperature01, climate.humidity01)

  if (climate.continentalness < OCEAN_CONTINENTALNESS_THRESHOLD - COAST_BLEND_BAND) {
    return { primary: 'ocean', secondary: 'ocean', t: 0 }
  }
  if (climate.continentalness > OCEAN_CONTINENTALNESS_THRESHOLD + COAST_BLEND_BAND) return land

  const tLand = smoothstep01(
    (climate.continentalness - (OCEAN_CONTINENTALNESS_THRESHOLD - COAST_BLEND_BAND)) /
      (2 * COAST_BLEND_BAND),
  )
  return { primary: 'ocean', secondary: land.primary, t: tLand }
}

/**
 * Returns the previous fixed-y point used by compatibility tests.
 */
export function getLegacyMultiNoiseBaseY(): number {
  return LEGACY_MULTI_NOISE_BASE_Y
}
