import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

export const plainsTerrain: TerrainParams = {
  baseOffset: 0,
  detailAmp: 1.3,
  detailFreq: 0.015,
  flatness: 0.97,
  mountainAllowed: false,
};

export const plainsLayers: LayerConfig = {
  surface: "grass",
  subsurface: "dirt",
  subsurfaceDepth: 2,
};

export const plainsDefinition: BiomeDefinition = {
  blocks: {
    surface: "grass",
    subsurface: "dirt",
    subsurfaceDepth: 2,
    shore: "sand",
    underwater: "sand",
  },
  terrainParams: plainsTerrain,
  climate: { tempMin: 0.45, tempMax: 0.7, humidityMin: 0.25, humidityMax: 0.5 },
  multiNoise: {
    center: {
      continentalness: 0.68,
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
};
