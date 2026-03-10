import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

export const oceanTerrain: TerrainParams = {
  baseOffset: -12,
  detailAmp: 0.4,
  detailFreq: 0.01,
  flatness: 0.995,
  mountainAllowed: false,
};

export const oceanLayers: LayerConfig = {
  surface: "sand",
  subsurface: "sand",
  subsurfaceDepth: 4,
};

export const oceanDefinition: BiomeDefinition = {
  blocks: {
    surface: "sand",
    subsurface: "sand",
    subsurfaceDepth: 4,
    shore: "sand",
    underwater: "sand",
  },
  terrainParams: oceanTerrain,
  climate: { tempMin: 0.3, tempMax: 0.75, humidityMin: 0.75, humidityMax: 1 },
  multiNoise: {
    center: {
      continentalness: 0.25,
      erosion: 0.0,
      temperature: 0.0,
      humidity: 0.5,
      weirdness: 0.0,
      y: 0.1,
    },
    weights: {
      continentalness: 3,
      humidity: 1.2,
    },
  },
};
