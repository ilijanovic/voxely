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
};
