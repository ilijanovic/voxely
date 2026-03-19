import type { TerrainParams, LayerConfig, BiomeDefinition } from './types'

export const savannaTerrain: TerrainParams = {
  baseOffset: -0.3,
  detailAmp: 1.1,
  detailFreq: 0.012,
  flatness: 0.98,
  mountainAllowed: false,
}

export const savannaLayers: LayerConfig = {
  surface: 'grass_savanna',
  subsurface: 'dirt',
  subsurfaceDepth: 2,
}

/**
 * Vanilla 1.20.2 savanna.json: temperature 2.0, downfall 0.0, has_precipitation false.
 * Our climate: warm, moderate humidity (vanilla 2.0 → high temp in [0,1]).
 */
export const savannaDefinition: BiomeDefinition = {
  blocks: {
    surface: 'grass_savanna',
    subsurface: 'dirt',
    subsurfaceDepth: 2,
    shore: 'sand',
    underwater: 'sand',
  },
  terrainParams: savannaTerrain,
  climate: { tempMin: 0.55, tempMax: 0.75, humidityMin: 0.35, humidityMax: 0.55 },
  multiNoise: {
    center: {
      continentalness: 0.296,
      erosion: 0.12,
      temperature: 0.3,
      humidity: -0.1,
      weirdness: 0.1,
      y: 0.25,
    },
    weights: {
      temperature: 2,
      humidity: 2,
      continentalness: 1.3,
      erosion: 1.1,
    },
  },
}
