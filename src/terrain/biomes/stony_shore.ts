import type { TerrainParams, BiomeDefinition } from './types'

/**
 * Stony shore biome: rocky coastline near steep slopes (Minecraft-style).
 * Selected by coastal edge logic.
 */
export const stonyShoreTerrain: TerrainParams = {
  baseOffset: -4,
  detailAmp: 0.5,
  detailFreq: 0.01,
  flatness: 0.992,
  mountainAllowed: false,
}

export const stonyShoreDefinition: BiomeDefinition = {
  blocks: {
    surface: 'stone',
    subsurface: 'gravel',
    subsurfaceDepth: 3,
    shore: 'gravel',
    underwater: 'gravel',
  },
  terrainParams: stonyShoreTerrain,
  climate: { tempMin: 0, tempMax: 1, humidityMin: 0, humidityMax: 1 },
  multiNoise: {
    center: {
      continentalness: -0.05,
      erosion: -0.3,
      temperature: 0.0,
      humidity: 0.0,
      weirdness: 0.0,
      y: 0.1,
    },
    weights: { continentalness: 1 },
  },
}

