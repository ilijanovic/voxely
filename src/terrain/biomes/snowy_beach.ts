import type { TerrainParams, BiomeDefinition } from './types'

/**
 * Snowy beach biome: cold coastal edge with snowy surface and sandy shore.
 * Used as a resolved edge biome, not selected directly from climate.
 */
export const snowyBeachTerrain: TerrainParams = {
  baseOffset: -2,
  detailAmp: 0.7,
  detailFreq: 0.011,
  flatness: 0.995,
  mountainAllowed: false,
}

export const snowyBeachDefinition: BiomeDefinition = {
  blocks: {
    surface: 'snow',
    subsurface: 'sand',
    subsurfaceDepth: 3,
    shore: 'sand',
    underwater: 'sand',
  },
  terrainParams: snowyBeachTerrain,
}
