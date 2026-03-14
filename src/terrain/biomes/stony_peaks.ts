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
      continentalness: 0.516,
      erosion: -0.55,
      temperature: 0.42,
      humidity: -0.55,
      weirdness: 0.18,
      y: 0.84,
    },
    weights: {
      y: 2.8,
      humidity: 2,
      continentalness: 1.5,
      temperature: 2.1,
      weirdness: 1.8,
    },
  },
}
