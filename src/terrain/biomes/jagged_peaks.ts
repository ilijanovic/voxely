import type { TerrainParams, LayerConfig, BiomeDefinition } from './types'

export const jaggedPeaksTerrain: TerrainParams = {
  baseOffset: 10,
  /** Slightly higher relief than before; global mountain/jagged boosts also add mass. */
  detailAmp: 17,
  detailFreq: 0.027,
  flatness: 0.2,
  mountainAllowed: true,
}

export const jaggedPeaksLayers: LayerConfig = {
  surface: 'snow',
  subsurface: 'stone',
  subsurfaceDepth: 4,
}

export const jaggedPeaksDefinition: BiomeDefinition = {
  blocks: {
    surface: 'snow',
    subsurface: 'stone',
    subsurfaceDepth: 4,
    shore: 'gravel',
    underwater: 'stone',
  },
  terrainParams: jaggedPeaksTerrain,
  multiNoise: {
    center: {
      continentalness: 0.516,
      erosion: -0.74,
      temperature: -0.28,
      humidity: 0.1,
      weirdness: -0.78,
      y: 0.66,
    },
    weights: {
      y: 2.1,
      erosion: 2.5,
      continentalness: 1.4,
      weirdness: 2.6,
      temperature: 1.4,
      humidity: 1.1,
    },
  },
}
