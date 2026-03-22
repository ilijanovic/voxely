import type { TerrainParams, BiomeDefinition } from './types'

/**
 * Beach biome: sandy coastline. Selected by coastal edge logic, not by climate directly.
 */
export const beachTerrain: TerrainParams = {
  baseOffset: -4,
  detailAmp: 0.35,
  detailFreq: 0.01,
  flatness: 0.995,
  mountainAllowed: false,
}

export const beachDefinition: BiomeDefinition = {
  blocks: {
    surface: 'sand',
    subsurface: 'sand',
    subsurfaceDepth: 4,
    shore: 'sand',
    underwater: 'sand',
  },
  terrainParams: beachTerrain,
  climate: { tempMin: 0, tempMax: 1, humidityMin: 0, humidityMax: 1 },
  multiNoise: {
    center: {
      continentalness: -0.05,
      erosion: 0.0,
      temperature: 0.0,
      humidity: 0.0,
      weirdness: 0.0,
      y: 0.1,
    },
    weights: { continentalness: 1 },
  },
}

