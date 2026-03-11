import type { TerrainParams, LayerConfig, BiomeDefinition } from './types'

export const desertTerrain: TerrainParams = {
  baseOffset: -1.5,
  detailAmp: 0.8,
  detailFreq: 0.01,
  flatness: 0.97,
  mountainAllowed: false,
}

export const desertLayers: LayerConfig = {
  surface: 'sand',
  subsurface: 'sandstone',
  subsurfaceDepth: 4,
}

/**
 * Vanilla 1.20.2 desert.json: temperature 2.0, downfall 0.0, has_precipitation false.
 * Our climate uses [0,1]; we keep hot+dry band (vanilla 2.0 maps to high end of temp).
 */
export const desertDefinition: BiomeDefinition = {
  blocks: {
    surface: 'sand',
    subsurface: 'sandstone',
    subsurfaceDepth: 4,
    shore: 'sand',
    underwater: 'sand',
  },
  terrainParams: desertTerrain,
  climate: { tempMin: 0.65, tempMax: 1, humidityMin: 0, humidityMax: 0.35 },
  multiNoise: {
    center: {
      continentalness: 0.7,
      erosion: 0.1,
      temperature: 0.65,
      humidity: -0.65,
      weirdness: 0.0,
      y: 0.22,
    },
    weights: {
      temperature: 2.5,
      humidity: 2.5,
      continentalness: 1.2,
    },
  },
}
