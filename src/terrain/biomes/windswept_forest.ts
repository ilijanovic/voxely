import type { TerrainParams, LayerConfig, BiomeDefinition } from './types'

export const windsweptForestTerrain: TerrainParams = {
  baseOffset: 4,
  detailAmp: 6,
  detailFreq: 0.02,
  flatness: 0.45,
  mountainAllowed: true,
}

export const windsweptForestLayers: LayerConfig = {
  surface: 'grass',
  subsurface: 'stone',
  subsurfaceDepth: 3,
}

export const windsweptForestDefinition: BiomeDefinition = {
  blocks: {
    surface: 'grass',
    subsurface: 'stone',
    subsurfaceDepth: 3,
    shore: 'gravel',
    underwater: 'gravel',
  },
  terrainParams: windsweptForestTerrain,
}
