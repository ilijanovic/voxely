import { describe, it, expect } from 'vitest'
import { createNoise2D } from 'simplex-noise'
import { makeSeededRandom } from './utils'
import { createClimateSampler } from './climate-sampler'
import {
  COAST_BLEND_BAND,
  OCEAN_CONTINENTALNESS_THRESHOLD,
  SPAWN_ORIGIN_FOREST_CONTINENTALNESS,
  SPAWN_ORIGIN_FOREST_HUMIDITY,
  SPAWN_ORIGIN_FOREST_RADIUS_SQ,
  SPAWN_ORIGIN_FOREST_TEMP,
} from './constants'
import { getLandBiomeBlendByMultiNoise } from './biomes'
import { createTerrainSampling } from '../terrain-sampling'

/**
 * Clamps a number to [0,1].
 */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/**
 * Smoothstep on [0,1] matching terrain code.
 */
function smoothstep01(t: number): number {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

describe('biome selection parity (sampler-only)', () => {
  it('matches across two independent implementations for base biome blend', () => {
    const seed = 12345
    const sampling = createTerrainSampling(seed)

    const temperatureNoise2D = createNoise2D(makeSeededRandom(seed + 500))
    const humidityNoise2D = createNoise2D(makeSeededRandom(seed + 600))
    const continentalNoise2D = createNoise2D(makeSeededRandom(seed + 123))
    const climateWarpNoise2D = createNoise2D(makeSeededRandom(seed + 31337))
    const erosionNoise2D = createNoise2D(makeSeededRandom(seed + 202))
    const weirdnessNoise2D = createNoise2D(makeSeededRandom(seed + 909))

    const climate = createClimateSampler({
      temperatureNoise2D,
      humidityNoise2D,
      continentalNoise2D,
      climateWarpNoise2D,
      erosionNoise2D,
      weirdnessNoise2D,
    })

    /**
     * Linear interpolation.
     */
    function lerp(a: number, b: number, t: number): number {
      return a + (b - a) * t
    }

    function smooth5tap(center: number, n: number, s: number, e: number, w: number): number {
      return center * 0.5 + (n + s + e + w) * 0.125
    }

    function getContinentalnessSmoothed(x: number, z: number): number {
      return smooth5tap(
        climate.getContinentalness01(x, z),
        climate.getContinentalness01(x, z - 1),
        climate.getContinentalness01(x, z + 1),
        climate.getContinentalness01(x + 1, z),
        climate.getContinentalness01(x - 1, z),
      )
    }

    function getTemperature01(x: number, z: number): number {
      return climate.getTemperature01(x, z)
    }

    function getHumidity01(x: number, z: number): number {
      return climate.getHumidity01(x, z)
    }

    function getTemperatureSmoothed(x: number, z: number): number {
      return smooth5tap(
        getTemperature01(x, z),
        getTemperature01(x, z - 1),
        getTemperature01(x, z + 1),
        getTemperature01(x + 1, z),
        getTemperature01(x - 1, z),
      )
    }

    function getHumiditySmoothed(x: number, z: number): number {
      return smooth5tap(
        getHumidity01(x, z),
        getHumidity01(x, z - 1),
        getHumidity01(x, z + 1),
        getHumidity01(x + 1, z),
        getHumidity01(x - 1, z),
      )
    }

    function getTemperatureSignedSmoothed(x: number, z: number): number {
      return smooth5tap(
        climate.getTemperatureSigned(x, z),
        climate.getTemperatureSigned(x, z - 1),
        climate.getTemperatureSigned(x, z + 1),
        climate.getTemperatureSigned(x + 1, z),
        climate.getTemperatureSigned(x - 1, z),
      )
    }

    function getHumiditySignedSmoothed(x: number, z: number): number {
      return smooth5tap(
        climate.getHumiditySigned(x, z),
        climate.getHumiditySigned(x, z - 1),
        climate.getHumiditySigned(x, z + 1),
        climate.getHumiditySigned(x + 1, z),
        climate.getHumiditySigned(x - 1, z),
      )
    }

    function getErosionSignedSmoothed(x: number, z: number): number {
      return smooth5tap(
        climate.getErosionSigned(x, z),
        climate.getErosionSigned(x, z - 1),
        climate.getErosionSigned(x, z + 1),
        climate.getErosionSigned(x + 1, z),
        climate.getErosionSigned(x - 1, z),
      )
    }

    function getWeirdnessSignedSmoothed(x: number, z: number): number {
      return smooth5tap(
        climate.getWeirdnessSigned(x, z),
        climate.getWeirdnessSigned(x, z - 1),
        climate.getWeirdnessSigned(x, z + 1),
        climate.getWeirdnessSigned(x + 1, z),
        climate.getWeirdnessSigned(x - 1, z),
      )
    }

    /**
     * Blends (c, temp, humidity) toward forest at world origin so first POI/spawn is in forest.
     * Must match worker and main-thread sampling.
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

    function getBaseBiomeBlendAt(x: number, z: number): { primary: string; secondary: string; t: number } {
      const c = getContinentalnessSmoothed(x, z)
      const biased = applySpawnOriginForestBias(x, z, c, getTemperatureSmoothed(x, z), getHumiditySmoothed(x, z))
      const cBiased = biased.c
      const land = getLandBiomeBlendByMultiNoise({
        continentalness: cBiased,
        erosion: getErosionSignedSmoothed(x, z),
        temperature: getTemperatureSignedSmoothed(x, z),
        humidity: getHumiditySignedSmoothed(x, z),
        weirdness: getWeirdnessSignedSmoothed(x, z),
        y: 0.25,
      })

      if (cBiased < OCEAN_CONTINENTALNESS_THRESHOLD - COAST_BLEND_BAND) {
        return { primary: 'ocean', secondary: 'ocean', t: 0 }
      }
      if (cBiased > OCEAN_CONTINENTALNESS_THRESHOLD + COAST_BLEND_BAND) return land

      const tLand = smoothstep01(
        (cBiased - (OCEAN_CONTINENTALNESS_THRESHOLD - COAST_BLEND_BAND)) / (2 * COAST_BLEND_BAND),
      )
      return { primary: 'ocean', secondary: land.primary, t: tLand }
    }

    const START = -64
    const END = 64
    const STEP = 16
    for (let x = START; x <= END; x += STEP) {
      for (let z = START; z <= END; z += STEP) {
        const expected = getBaseBiomeBlendAt(x, z)
        const actual = sampling.getBiomeBlend(x, z)
        expect(actual).toEqual(expected)
      }
    }
  })
})

