import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

export const frozenPeaksTerrain: TerrainParams = {
  baseOffset: 9,
  detailAmp: 14,
  detailFreq: 0.023,
  flatness: 0.28,
  mountainAllowed: true,
};

export const frozenPeaksLayers: LayerConfig = {
  surface: "snow",
  subsurface: "stone",
  subsurfaceDepth: 3,
};

export const frozenPeaksDefinition: BiomeDefinition = {
  blocks: {
    surface: "snow",
    subsurface: "stone",
    subsurfaceDepth: 3,
    shore: "sand",
    underwater: "sand",
  },
  terrainParams: frozenPeaksTerrain,
};
