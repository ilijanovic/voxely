import type { TerrainParams, BiomeDefinition } from './types'

/**
 * Plains biome: flat, temperate grassland. Low erosion and high flatness for smooth terrain.
 * Grass over dirt surface; sand at shore/underwater. See docs/PLAINS_BIOME.md for full spec.
 */
export const plainsTerrain: TerrainParams = {
  baseOffset: 0,
  detailAmp: 1.3,
  detailFreq: 0.015,
  flatness: 0.97,
  mountainAllowed: false,
}

/**
 * Plains biome definition: blocks (surface/subsurface/shore), terrain params, and climate/multiNoise for selection.
 * Vanilla 1.20.2 plains.json: temperature 0.8, downfall 0.4. Climate bounds chosen so vanilla value lies inside.
 */
export const plainsDefinition: BiomeDefinition = {
  blocks: {
    surface: 'grass',
    subsurface: 'dirt',
    subsurfaceDepth: 3,
    shore: 'sand',
    underwater: 'sand',
  },
  terrainParams: plainsTerrain,
  climate: { tempMin: 0.45, tempMax: 0.8, humidityMin: 0.25, humidityMax: 0.5 },
  multiNoise: {
    center: {
      continentalness: 0.296,
      erosion: 0.05,
      temperature: 0.15,
      humidity: -0.25,
      weirdness: 0.0,
      y: 0.25,
    },
    weights: {
      temperature: 2,
      humidity: 2,
      continentalness: 1.5,
      erosion: 1.2,
    },
  },
}
