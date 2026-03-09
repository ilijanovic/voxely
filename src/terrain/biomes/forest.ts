import type { TerrainParams, LayerConfig } from "./types";

export const forestTerrain: TerrainParams = {
  baseOffset: 3,
  detailAmp: 4.5,
  detailFreq: 0.026,
  flatness: 0.7,
  mountainAllowed: true,
};

export const forestLayers: LayerConfig = {
  surface: "grass",
  subsurface: "dirt",
  subsurfaceDepth: 2,
};
