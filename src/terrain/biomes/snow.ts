import type { TerrainParams, LayerConfig } from "./types";

export const snowTerrain: TerrainParams = {
  baseOffset: 6,
  detailAmp: 11,
  detailFreq: 0.022,
  flatness: 0.35,
  mountainAllowed: true,
};

export const snowLayers: LayerConfig = {
  surface: "snow",
  subsurface: "dirt",
  subsurfaceDepth: 2,
};
