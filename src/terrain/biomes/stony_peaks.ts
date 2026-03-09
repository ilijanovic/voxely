import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

export const stonyPeaksTerrain: TerrainParams = {
  baseOffset: 8,
  detailAmp: 13,
  detailFreq: 0.024,
  flatness: 0.3,
  mountainAllowed: true,
};

export const stonyPeaksLayers: LayerConfig = {
  surface: "stone",
  subsurface: "stone",
  subsurfaceDepth: 3,
};

export const stonyPeaksDefinition: BiomeDefinition = {
  blocks: {
    surface: "stone",
    subsurface: "stone",
    subsurfaceDepth: 3,
    shore: "sand",
    underwater: "sand",
  },
  terrainParams: stonyPeaksTerrain,
};
