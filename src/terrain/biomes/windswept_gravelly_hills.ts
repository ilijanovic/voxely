import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

export const windsweptGravellyHillsTerrain: TerrainParams = {
  baseOffset: 2,
  detailAmp: 2.5,
  detailFreq: 0.014,
  flatness: 0.55,
  mountainAllowed: true,
};

export const windsweptGravellyHillsLayers: LayerConfig = {
  surface: "gravel",
  subsurface: "stone",
  subsurfaceDepth: 3,
};

export const windsweptGravellyHillsDefinition: BiomeDefinition = {
  blocks: {
    surface: "gravel",
    subsurface: "stone",
    subsurfaceDepth: 3,
    shore: "sand",
    underwater: "sand",
  },
  terrainParams: windsweptGravellyHillsTerrain,
};
