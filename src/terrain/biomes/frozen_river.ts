import type { TerrainParams, BiomeDefinition } from './types'

/**
 * Frozen river biome: rare icy river variant for very cold inland channels.
 * Used as a resolved river overlay, not selected directly from climate.
 */
export const frozenRiverTerrain: TerrainParams = {
  baseOffset: -2.2,
  detailAmp: 0.6,
  detailFreq: 0.01,
  flatness: 0.996,
  mountainAllowed: false,
}

/**
 * Frozen river block palette: ice surface at waterline, snowy banks, gravel bed.
 */
export const frozenRiverDefinition: BiomeDefinition = {
  blocks: {
    surface: 'snow',
    subsurface: 'dirt',
    subsurfaceDepth: 3,
    shore: 'ice',
    underwater: 'gravel',
  },
  terrainParams: frozenRiverTerrain,
}
