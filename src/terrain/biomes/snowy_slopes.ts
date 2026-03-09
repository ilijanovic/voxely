import type { TerrainParams, LayerConfig } from "./types";

export const snowySlopesTerrain: TerrainParams = {
  baseOffset: 6,
  detailAmp: 11,
  detailFreq: 0.022,
  flatness: 0.35,
  mountainAllowed: true,
};

export const snowySlopesLayers: LayerConfig = {
  surface: "snow",
  subsurface: "dirt",
  subsurfaceDepth: 2,
};
