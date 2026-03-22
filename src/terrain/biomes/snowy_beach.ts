import type { TerrainParams, BiomeDefinition } from './types'

/**
 * Snowy beach biome: cold coastline where sand is covered by snow.
 * Selected by coastal edge logic.
 */
export const snowyBeachTerrain: TerrainParams = {
  baseOffset: -4,
  detailAmp: 0.35,
  detailFreq: 0.01,
  flatness: 0.995,
  mountainAllowed: false,
}

export const snowyBeachDefinition: BiomeDefinition = {
  blocks: {
    surface: 'snow',
    subsurface: 'sand',
    subsurfaceDepth: 3,
    shore: 'snow',
    underwater: 'sand',
  },
  terrainParams: snowyBeachTerrain,
  climate: { tempMin: 0, tempMax: 0.35, humidityMin: 0.2, humidityMax: 1 },
  multiNoise: {
    center: {
      continentalness: -0.05,
      erosion: 0.0,
      temperature: -0.6,
      humidity: 0.0,
      weirdness: 0.0,
      y: 0.1,
    },
    weights: { temperature: 2, continentalness: 1 },
  },
}

