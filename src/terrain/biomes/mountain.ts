import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

export const mountainTerrain: TerrainParams = {
  baseOffset: 1.0,
  detailAmp: 1.2,
  detailFreq: 0.012,
  flatness: 0.85,
  mountainAllowed: true,
};

export const mountainLayers: LayerConfig = {
  surface: "grass",
  subsurface: "dirt",
  subsurfaceDepth: 2,
};

export const mountainDefinition: BiomeDefinition = {
  blocks: {
    surface: "grass",
    subsurface: "dirt",
    subsurfaceDepth: 2,
    shore: "sand",
    underwater: "sand",
  },
  terrainParams: mountainTerrain,
  climate: { tempMin: 0.25, tempMax: 0.5, humidityMin: 0.2, humidityMax: 0.55 },
  multiNoise: {
    center: {
      continentalness: 0.78,
      erosion: -0.28,
      temperature: -0.25,
      humidity: -0.25,
      weirdness: 0.2,
      y: 0.55,
    },
    weights: {
      y: 2,
      continentalness: 1.6,
      erosion: 1.8,
      weirdness: 1.2,
      temperature: 1.4,
      humidity: 1.2,
    },
  },
};
