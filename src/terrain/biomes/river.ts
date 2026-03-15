import type { TerrainParams, BiomeDefinition } from './types'

/**
 * River biome: narrow, low-lying channels that cut through inland terrain.
 * Terrain params are mostly a fallback because river shape is carved explicitly in height logic.
 */
export const riverTerrain: TerrainParams = {
  baseOffset: -2.5,
  detailAmp: 0.8,
  detailFreq: 0.011,
  flatness: 0.992,
  mountainAllowed: false,
}

/**
 * River biome block palette (Minecraft-like): grass banks with sandy/gravelly bed.
 */
export const riverDefinition: BiomeDefinition = {
  blocks: {
    surface: 'grass',
    subsurface: 'dirt',
    subsurfaceDepth: 3,
    shore: 'sand',
    underwater: 'gravel',
  },
  terrainParams: riverTerrain,
}
