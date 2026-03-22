import type { TerrainParams, BiomeDefinition } from './types'

/**
 * River biome: carved channels through land. Flat terrain params because actual carving
 * is handled by river-shaping; this biome mostly defines block layers (sand/gravel).
 */
export const riverTerrain: TerrainParams = {
  baseOffset: -2,
  detailAmp: 0.7,
  detailFreq: 0.012,
  flatness: 0.99,
  mountainAllowed: false,
}

export const riverDefinition: BiomeDefinition = {
  blocks: {
    surface: 'sand',
    subsurface: 'dirt',
    subsurfaceDepth: 3,
    shore: 'sand',
    underwater: 'sand',
  },
  terrainParams: riverTerrain,
  // Not selected by climate directly in our system (river overlay), but keep bounds reasonable.
  climate: { tempMin: 0, tempMax: 1, humidityMin: 0, humidityMax: 1 },
  multiNoise: {
    center: {
      continentalness: 0.0,
      erosion: 0.0,
      temperature: 0.0,
      humidity: 0.0,
      weirdness: 0.0,
      y: 0.1,
    },
    weights: { continentalness: 1 },
  },
}

