import type { TerrainParams, BiomeDefinition } from './types'

/**
 * Mangrove Swamp biome: mud surface, warm and very wet (Minecraft-style).
 */
export const mangroveSwampTerrain: TerrainParams = {
  baseOffset: -0.8,
  detailAmp: 0.6,
  detailFreq: 0.01,
  flatness: 0.98,
  mountainAllowed: false,
}

export const mangroveSwampDefinition: BiomeDefinition = {
  blocks: {
    surface: 'mud',
    subsurface: 'dirt',
    subsurfaceDepth: 4,
    shore: 'mud',
    underwater: 'mud',
  },
  terrainParams: mangroveSwampTerrain,
  climate: { tempMin: 0.6, tempMax: 0.85, humidityMin: 0.75, humidityMax: 1.0 },
  multiNoise: {
    center: {
      continentalness: 0.1,
      erosion: -0.2,
      temperature: 0.5,
      humidity: 0.85,
      weirdness: 0.0,
      y: 0.2,
    },
    weights: {
      temperature: 2,
      humidity: 2.5,
      continentalness: 1.2,
    },
  },
}
