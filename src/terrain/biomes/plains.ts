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
};
