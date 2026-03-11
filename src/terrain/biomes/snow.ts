import type { TerrainParams, LayerConfig, BiomeDefinition } from './types'

export const snowTerrain: TerrainParams = {
  baseOffset: 6,
  detailAmp: 11,
  detailFreq: 0.022,
  flatness: 0.35,
  mountainAllowed: true,
}

export const snowLayers: LayerConfig = {
  surface: 'snow',
  subsurface: 'dirt',
  subsurfaceDepth: 3,
}

export const snowDefinition: BiomeDefinition = {
  blocks: {
    surface: 'snow',
    subsurface: 'dirt',
    subsurfaceDepth: 3,
    shore: 'sand',
    underwater: 'sand',
  },
  terrainParams: snowTerrain,
  climate: { tempMin: 0, tempMax: 0.35, humidityMin: 0.2, humidityMax: 0.6 },
  multiNoise: {
    center: {
      continentalness: 0.78,
      erosion: -0.22,
      temperature: -0.65,
      humidity: -0.2,
      weirdness: 0.1,
      y: 0.6,
    },
    weights: {
      y: 2.2,
      temperature: 2.2,
      continentalness: 1.4,
      erosion: 1.6,
    },
  },
}
