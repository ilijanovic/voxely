import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

export const savannaTerrain: TerrainParams = {
  baseOffset: -0.3,
  detailAmp: 1.1,
  detailFreq: 0.012,
  flatness: 0.98,
  mountainAllowed: false,
};

export const savannaLayers: LayerConfig = {
  surface: "grass",
  subsurface: "dirt",
  subsurfaceDepth: 2,
};

export const savannaDefinition: BiomeDefinition = {
  blocks: {
    surface: "grass_savanna",
    subsurface: "dirt",
    subsurfaceDepth: 2,
    shore: "sand",
    underwater: "sand",
  },
  terrainParams: savannaTerrain,
  climate: { tempMin: 0.55, tempMax: 0.75, humidityMin: 0.35, humidityMax: 0.55 },
};
