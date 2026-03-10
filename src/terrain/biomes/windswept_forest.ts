import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

export const windsweptForestTerrain: TerrainParams = {
  baseOffset: 2,
  detailAmp: 2.2,
  detailFreq: 0.015,
  flatness: 0.65,
  mountainAllowed: true,
};

export const windsweptForestLayers: LayerConfig = {
  surface: "grass",
  subsurface: "stone",
  subsurfaceDepth: 3,
};

export const windsweptForestDefinition: BiomeDefinition = {
  blocks: {
    surface: "grass",
    subsurface: "stone",
    subsurfaceDepth: 3,
    shore: "gravel",
    underwater: "gravel",
  },
  terrainParams: windsweptForestTerrain,
};
