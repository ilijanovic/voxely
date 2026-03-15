import type { TerrainParams, LayerConfig, BiomeDefinition } from './types'

export const frozenPeaksTerrain: TerrainParams = {
  baseOffset: 9,
  // Rougher micro-relief to support sharp ridges and craggy peaks.
  detailAmp: 18,
  detailFreq: 0.03,
  flatness: 0.18,
  mountainAllowed: true,
}

export const frozenPeaksLayers: LayerConfig = {
  surface: 'snow',
  subsurface: 'stone',
  subsurfaceDepth: 3,
}

export const frozenPeaksDefinition: BiomeDefinition = {
  blocks: {
    surface: 'snow',
    subsurface: 'stone',
    subsurfaceDepth: 3,
    shore: 'snow',
    underwater: 'stone',
  },
  terrainParams: frozenPeaksTerrain,
  multiNoise: {
    center: {
      continentalness: 0.516,
      erosion: -0.25,
      temperature: -0.82,
      humidity: 0.2,
      weirdness: 1.05,
      y: 0.62,
    },
    weights: {
      y: 1.8,
      temperature: 2.3,
      continentalness: 1.4,
      erosion: 1.2,
      weirdness: 3.2,
      humidity: 1.1,
    },
  },
}
