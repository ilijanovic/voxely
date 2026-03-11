import type { TerrainParams, BiomeDefinition } from './types'

/**
 * Badlands biome: red sand and terracotta-like surface, hot and dry (Minecraft-style).
 */
export const badlandsTerrain: TerrainParams = {
  baseOffset: -0.5,
  detailAmp: 1.2,
  detailFreq: 0.012,
  flatness: 0.9,
  mountainAllowed: false,
}

export const badlandsDefinition: BiomeDefinition = {
  blocks: {
    surface: 'red_sand',
    subsurface: 'sandstone',
    subsurfaceDepth: 4,
    shore: 'red_sand',
    underwater: 'red_sand',
  },
  terrainParams: badlandsTerrain,
  climate: { tempMin: 0.75, tempMax: 1.0, humidityMin: 0, humidityMax: 0.25 },
  multiNoise: {
    center: {
      continentalness: 0.65,
      erosion: 0.2,
      temperature: 0.9,
      humidity: -0.8,
      weirdness: 0.0,
      y: 0.2,
    },
    weights: {
      temperature: 2.5,
      humidity: 2.5,
      continentalness: 1.2,
    },
  },
}
