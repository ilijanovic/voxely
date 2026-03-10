import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

export const desertTerrain: TerrainParams = {
  baseOffset: -1.5,
  detailAmp: 0.8,
  detailFreq: 0.01,
  flatness: 0.99,
  mountainAllowed: false,
};

export const desertLayers: LayerConfig = {
  surface: "sand",
  subsurface: "sand",
  subsurfaceDepth: 3,
};

export const desertDefinition: BiomeDefinition = {
  blocks: {
    surface: "sand",
    subsurface: "sand",
    subsurfaceDepth: 3,
    shore: "sand",
    underwater: "sand",
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
};
