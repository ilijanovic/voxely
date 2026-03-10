import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

export const jungleTerrain: TerrainParams = {
  baseOffset: 3,
  detailAmp: 9,
  detailFreq: 0.03,
  flatness: 0.5,
  mountainAllowed: true,
};

export const jungleLayers: LayerConfig = {
  surface: "grass",
  subsurface: "dirt",
  subsurfaceDepth: 3,
};

export const jungleDefinition: BiomeDefinition = {
  blocks: {
    surface: "grass",
    subsurface: "dirt",
    subsurfaceDepth: 3,
    shore: "sand",
    underwater: "sand",
  },
  terrainParams: jungleTerrain,
  climate: { tempMin: 0.5, tempMax: 0.75, humidityMin: 0.7, humidityMax: 1 },
  multiNoise: {
    center: {
      continentalness: 0.72,
      erosion: -0.12,
      temperature: 0.25,
      humidity: 0.7,
      weirdness: 0.05,
      y: 0.3,
    },
    weights: {
      temperature: 2,
      humidity: 2.5,
      continentalness: 1.2,
      erosion: 1.2,
    },
  },
};
