import type { TerrainParams, LayerConfig, BiomeDefinition } from './types'

export const groveTerrain: TerrainParams = {
  baseOffset: 6,
  detailAmp: 11,
  detailFreq: 0.022,
  flatness: 0.35,
  mountainAllowed: true,
}

export const groveLayers: LayerConfig = {
  surface: 'grass_snow',
  subsurface: 'dirt',
  subsurfaceDepth: 3,
}

export const groveDefinition: BiomeDefinition = {
  blocks: {
    surface: 'grass_snow',
    subsurface: 'dirt',
    subsurfaceDepth: 3,
    shore: 'sand',
    underwater: 'sand',
  },
  terrainParams: groveTerrain,
}
