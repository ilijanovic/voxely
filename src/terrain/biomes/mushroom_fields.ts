import type { TerrainParams, BiomeDefinition } from './types'

/**
 * Mushroom Fields biome: mycelium surface, rare and humid (Minecraft-style).
 */
export const mushroomFieldsTerrain: TerrainParams = {
  baseOffset: 0,
  detailAmp: 1.0,
  detailFreq: 0.014,
  flatness: 0.95,
  mountainAllowed: false,
}

export const mushroomFieldsDefinition: BiomeDefinition = {
  blocks: {
    surface: 'mycelium',
    subsurface: 'dirt',
    subsurfaceDepth: 3,
    shore: 'sand',
    underwater: 'sand',
  },
  terrainParams: mushroomFieldsTerrain,
  climate: { tempMin: 0.5, tempMax: 0.6, humidityMin: 0.9, humidityMax: 1.0 },
  multiNoise: {
    center: {
      continentalness: 0.6,
      erosion: 0.0,
      temperature: 0.1,
      humidity: 0.9,
      weirdness: 0.0,
      y: 0.25,
    },
    weights: {
      temperature: 2,
      humidity: 2,
      continentalness: 1.2,
    },
  },
}
