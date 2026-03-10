import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

export const meadowTerrain: TerrainParams = {
  baseOffset: 0,
  detailAmp: 1.3,
  detailFreq: 0.015,
  flatness: 0.97,
  mountainAllowed: false,
};

export const meadowLayers: LayerConfig = {
  surface: "grass",
  subsurface: "dirt",
  subsurfaceDepth: 3,
};

export const meadowDefinition: BiomeDefinition = {
  blocks: {
    surface: "grass",
    subsurface: "dirt",
    subsurfaceDepth: 3,
    shore: "sand",
    underwater: "sand",
  },
  terrainParams: meadowTerrain,
};
