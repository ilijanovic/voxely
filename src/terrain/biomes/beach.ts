import type { TerrainParams, BiomeDefinition } from './types'

/**
 * Beach biome: low, sandy coastal edge between ocean and inland biomes.
 * Used as a resolved edge biome, not selected directly from climate.
 */
export const beachTerrain: TerrainParams = {
  baseOffset: -2,
  detailAmp: 0.6,
  detailFreq: 0.011,
  flatness: 0.995,
  mountainAllowed: false,
}

export const beachDefinition: BiomeDefinition = {
  blocks: {
    surface: 'sand',
    subsurface: 'sand',
    subsurfaceDepth: 4,
    shore: 'sand',
    underwater: 'sand',
  },
  terrainParams: beachTerrain,
}
