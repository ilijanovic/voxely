import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

export const windsweptHillsTerrain: TerrainParams = {
  baseOffset: 2,
  detailAmp: 2.5,
  detailFreq: 0.014,
  flatness: 0.6,
  mountainAllowed: true,
};

export const windsweptHillsLayers: LayerConfig = {
  surface: "grass",
  subsurface: "dirt",
  subsurfaceDepth: 2,
};

export const windsweptHillsDefinition: BiomeDefinition = {
  blocks: {
    surface: "grass",
    subsurface: "dirt",
    subsurfaceDepth: 2,
    shore: "sand",
    underwater: "sand",
  },
  terrainParams: windsweptHillsTerrain,
};
