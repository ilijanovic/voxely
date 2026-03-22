import type { TerrainParams, BiomeDefinition } from './types'

/**
 * Frozen river biome: like river, but cold enough that the water surface freezes.
 * The biome defines block layers; the actual water/ice rendering depends on surface and water systems.
 */
export const frozenRiverTerrain: TerrainParams = {
  baseOffset: -2,
  detailAmp: 0.7,
  detailFreq: 0.012,
  flatness: 0.99,
  mountainAllowed: false,
}

export const frozenRiverDefinition: BiomeDefinition = {
  blocks: {
    surface: 'snow',
    subsurface: 'dirt',
    subsurfaceDepth: 3,
    shore: 'snow',
    underwater: 'ice',
  },
  terrainParams: frozenRiverTerrain,
  climate: { tempMin: 0, tempMax: 0.35, humidityMin: 0, humidityMax: 1 },
  multiNoise: {
    center: {
      continentalness: 0.0,
      erosion: 0.0,
      temperature: -0.7,
      humidity: 0.0,
      weirdness: 0.0,
      y: 0.1,
    },
    weights: { temperature: 2, continentalness: 1 },
  },
}

