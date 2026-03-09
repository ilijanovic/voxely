import type { TerrainParams, LayerConfig } from "./types";

export const plainsTerrain: TerrainParams = {
  baseOffset: 0,
  detailAmp: 1.3,
  detailFreq: 0.015,
  flatness: 0.97,
  mountainAllowed: false,
};

export const plainsLayers: LayerConfig = {
  surface: "grass",
  subsurface: "dirt",
  subsurfaceDepth: 2,
};
