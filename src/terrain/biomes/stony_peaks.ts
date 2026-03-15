import type { TerrainParams, LayerConfig, BiomeDefinition } from './types'

export const stonyPeaksTerrain: TerrainParams = {
  baseOffset: 8,
  detailAmp: 13,
  detailFreq: 0.024,
  flatness: 0.3,
  mountainAllowed: true,
}

export const stonyPeaksLayers: LayerConfig = {
  surface: 'stone',
  subsurface: 'stone',
  subsurfaceDepth: 3,
}

export const stonyPeaksDefinition: BiomeDefinition = {
  blocks: {
    surface: 'stone',
    subsurface: 'stone',
    subsurfaceDepth: 3,
    shore: 'gravel',
    underwater: 'gravel',
  },
  terrainParams: stonyPeaksTerrain,
  multiNoise: {
    center: {
      continentalness: 0.52,
      erosion: -0.3,
      temperature: -0.34,
      humidity: -0.18,
      weirdness: 0.22,
      y: 0.56,
    },
    weights: {
      y: 1.8,
      humidity: 1.7,
      continentalness: 1.3,
      temperature: 1.7,
      weirdness: 1.8,
      erosion: 1.2,
    },
  },
}
