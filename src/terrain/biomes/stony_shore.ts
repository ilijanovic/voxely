import type { TerrainParams, BiomeDefinition } from './types'

/**
 * Stony shore biome: rocky coastal edge used on steeper shorelines.
 * Used as a resolved edge biome, not selected directly from climate.
 */
export const stonyShoreTerrain: TerrainParams = {
  baseOffset: -1,
  detailAmp: 1.2,
  detailFreq: 0.012,
  flatness: 0.9,
  mountainAllowed: false,
}

export const stonyShoreDefinition: BiomeDefinition = {
  blocks: {
    surface: 'stone',
    subsurface: 'stone',
    subsurfaceDepth: 3,
    shore: 'gravel',
    underwater: 'gravel',
  },
  terrainParams: stonyShoreTerrain,
}
