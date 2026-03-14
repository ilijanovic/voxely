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
      erosion: -0.3,
      temperature: -0.78,
      humidity: 0.22,
      weirdness: 0.72,
      y: 0.86,
    },
    weights: {
      y: 3,
      temperature: 2.4,
      continentalness: 1.5,
      erosion: 1.5,
      weirdness: 2.6,
    },
  },
}
