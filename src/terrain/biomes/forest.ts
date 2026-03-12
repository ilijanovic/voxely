import type { TerrainParams, LayerConfig, BiomeDefinition } from './types'

export const forestTerrain: TerrainParams = {
  baseOffset: 3,
  detailAmp: 4.5,
  detailFreq: 0.026,
  flatness: 0.7,
  mountainAllowed: true,
}

export const forestLayers: LayerConfig = {
  surface: 'grass',
  subsurface: 'dirt',
  subsurfaceDepth: 3,
}

/**
 * Vanilla 1.20.2 forest.json: temperature 0.7, downfall 0.8. Climate bounds include vanilla temp; high humidity matches downfall.
 */
export const forestDefinition: BiomeDefinition = {
  blocks: {
    surface: 'grass',
    subsurface: 'dirt',
    subsurfaceDepth: 3,
    shore: 'sand',
    underwater: 'sand',
  },
  terrainParams: forestTerrain,
  /** Cool, wet band. Center (0.4, 0.7) keeps forest distinct from mountain (cool/dry) and jungle (warm/wet). */
  climate: { tempMin: 0.25, tempMax: 0.7, humidityMin: 0.55, humidityMax: 0.85 },
  /** Used only for peak-variant and optional blend; base selection is climate-based. Aligned with climate center in signed space. */
  multiNoise: {
    center: {
      continentalness: 0.384,
      erosion: -0.05,
      temperature: -0.2,
      humidity: 0.4,
      weirdness: 0.0,
      y: 0.3,
    },
    weights: {
      temperature: 2,
      humidity: 2,
      continentalness: 1.3,
      erosion: 1.2,
    },
  },
}
