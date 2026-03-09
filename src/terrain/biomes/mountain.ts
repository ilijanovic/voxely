import type { TerrainParams, LayerConfig } from "./types";

export const mountainTerrain: TerrainParams = {
  baseOffset: 1.0,
  detailAmp: 1.2,
  detailFreq: 0.012,
  flatness: 0.85,
  mountainAllowed: true,
};

export const mountainLayers: LayerConfig = {
  surface: "grass",
  subsurface: "dirt",
  subsurfaceDepth: 2,
};
