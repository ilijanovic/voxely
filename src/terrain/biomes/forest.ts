import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

export const forestTerrain: TerrainParams = {
  baseOffset: 3,
  detailAmp: 4.5,
  detailFreq: 0.026,
  flatness: 0.7,
  mountainAllowed: true,
};

export const forestLayers: LayerConfig = {
  surface: "grass",
  subsurface: "dirt",
  subsurfaceDepth: 2,
};

export const forestDefinition: BiomeDefinition = {
  blocks: {
    surface: "grass",
    subsurface: "dirt",
    subsurfaceDepth: 2,
    shore: "sand",
    underwater: "sand",
  },
  terrainParams: forestTerrain,
  climate: { tempMin: 0.3, tempMax: 0.55, humidityMin: 0.5, humidityMax: 0.8 },
};
