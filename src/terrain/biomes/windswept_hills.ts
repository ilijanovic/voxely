import type { TerrainParams, LayerConfig, BiomeDefinition } from './types'

export const windsweptHillsTerrain: TerrainParams = {
  baseOffset: 4,
  detailAmp: 6.5,
  detailFreq: 0.021,
  flatness: 0.4,
  mountainAllowed: true,
}

export const windsweptHillsLayers: LayerConfig = {
  surface: 'grass',
  subsurface: 'stone',
  subsurfaceDepth: 3,
}

export const windsweptHillsDefinition: BiomeDefinition = {
  blocks: {
    surface: 'grass',
    subsurface: 'stone',
    subsurfaceDepth: 3,
    shore: 'gravel',
    underwater: 'gravel',
  },
  terrainParams: windsweptHillsTerrain,
}
