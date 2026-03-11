import type { TerrainParams, LayerConfig, BiomeDefinition } from './types'

export const snowySlopesTerrain: TerrainParams = {
  baseOffset: 6,
  detailAmp: 11,
  detailFreq: 0.022,
  flatness: 0.35,
  mountainAllowed: true,
}

export const snowySlopesLayers: LayerConfig = {
  surface: 'snow',
  subsurface: 'dirt',
  subsurfaceDepth: 3,
}

export const snowySlopesDefinition: BiomeDefinition = {
  blocks: {
    surface: 'snow',
    subsurface: 'dirt',
    subsurfaceDepth: 3,
    shore: 'snow',
    underwater: 'stone',
  },
  terrainParams: snowySlopesTerrain,
}
