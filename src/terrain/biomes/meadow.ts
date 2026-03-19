import type { TerrainParams, LayerConfig, BiomeDefinition } from './types'

export const meadowTerrain: TerrainParams = {
  baseOffset: 0,
  // Meadows should feel gently rolling and relatively open.
  detailAmp: 1.1,
  detailFreq: 0.015,
  flatness: 0.98,
  mountainAllowed: false,
}

export const meadowLayers: LayerConfig = {
  surface: 'grass',
  subsurface: 'dirt',
  subsurfaceDepth: 3,
}

export const meadowDefinition: BiomeDefinition = {
  blocks: {
    surface: 'grass',
    subsurface: 'dirt',
    subsurfaceDepth: 3,
    shore: 'sand',
    underwater: 'sand',
  },
  terrainParams: meadowTerrain,
}
