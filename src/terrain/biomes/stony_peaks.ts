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
      erosion: -0.26,
      // Warmer than frozen/jagged peak centers so lukewarm mountain peaks prefer stony_peaks.
      temperature: 0.08,
      humidity: 0.24,
      weirdness: 0.22,
      y: 0.58,
    },
    weights: {
      y: 1.8,
      humidity: 1.5,
      continentalness: 1.3,
      temperature: 1.5,
      weirdness: 1.8,
      erosion: 1.2,
    },
  },
}
