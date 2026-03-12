import type { TerrainParams, LayerConfig, BiomeDefinition } from './types'

export const mountainTerrain: TerrainParams = {
  baseOffset: 1.0,
  detailAmp: 1.2,
  detailFreq: 0.012,
  flatness: 0.85,
  mountainAllowed: true,
}

export const mountainLayers: LayerConfig = {
  surface: 'grass',
  subsurface: 'stone',
  subsurfaceDepth: 3,
}

/**
 * Vanilla reference: windswept_hills (1.20.2) temperature 0.2, downfall 0.3. No single "mountain" biome in vanilla; we use cold, dry band.
 */
export const mountainDefinition: BiomeDefinition = {
  blocks: {
    surface: 'grass',
    subsurface: 'stone',
    subsurfaceDepth: 3,
    shore: 'gravel',
    underwater: 'gravel',
  },
  terrainParams: mountainTerrain,
  climate: { tempMin: 0.2, tempMax: 0.5, humidityMin: 0.2, humidityMax: 0.55 },
  multiNoise: {
    center: {
      continentalness: 0.516,
      erosion: -0.28,
      temperature: -0.25,
      humidity: -0.25,
      weirdness: 0.4,
      y: 0.25,
    },
    weights: {
      continentalness: 1.6,
      erosion: 1.8,
      weirdness: 1.2,
      temperature: 1.4,
      humidity: 1.2,
    },
  },
}
