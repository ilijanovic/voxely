import type { TerrainParams, LayerConfig } from "./types";

export const jungleTerrain: TerrainParams = {
  baseOffset: 3,
  detailAmp: 9,
  detailFreq: 0.03,
  flatness: 0.5,
  mountainAllowed: true,
};

export const jungleLayers: LayerConfig = {
  surface: "grass",
  subsurface: "dirt",
  subsurfaceDepth: 3,
};
