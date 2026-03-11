import type { TerrainParams, BiomeDefinition } from './types'

/**
 * Old Growth Taiga biome: podzol surface, cold and humid (Minecraft-style).
 */
export const oldGrowthTaigaTerrain: TerrainParams = {
  baseOffset: 2,
  detailAmp: 3,
  detailFreq: 0.02,
  flatness: 0.75,
  mountainAllowed: true,
}

export const oldGrowthTaigaDefinition: BiomeDefinition = {
  blocks: {
    surface: 'podzol',
    subsurface: 'dirt',
    subsurfaceDepth: 3,
    shore: 'sand',
    underwater: 'sand',
  },
  terrainParams: oldGrowthTaigaTerrain,
  climate: { tempMin: 0.2, tempMax: 0.4, humidityMin: 0.55, humidityMax: 0.85 },
  multiNoise: {
    center: {
      continentalness: 0.7,
      erosion: -0.1,
      temperature: -0.5,
      humidity: 0.4,
      weirdness: 0.0,
      y: 0.3,
    },
    weights: {
      temperature: 2,
      humidity: 2,
      continentalness: 1.3,
    },
  },
}
