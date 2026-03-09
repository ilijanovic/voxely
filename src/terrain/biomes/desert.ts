import type { TerrainParams, LayerConfig } from "./types";

export const desertTerrain: TerrainParams = {
  baseOffset: -1.5,
  detailAmp: 0.8,
  detailFreq: 0.01,
  flatness: 0.99,
  mountainAllowed: false,
};

export const desertLayers: LayerConfig = {
  surface: "sand",
  subsurface: "sand",
  subsurfaceDepth: 3,
};
