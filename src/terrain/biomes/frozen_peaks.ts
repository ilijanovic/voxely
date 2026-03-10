import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

export const frozenPeaksTerrain: TerrainParams = {
  baseOffset: 9,
  // Rougher micro-relief to support sharp ridges and craggy peaks.
  detailAmp: 18,
  detailFreq: 0.03,
  flatness: 0.18,
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
  multiNoise: {
    center: {
      continentalness: 0.78,
      erosion: -0.25,
      temperature: -0.72,
      humidity: 0.55,
      weirdness: 0.0,
      y: 0.86,
    },
    weights: {
      y: 3,
      temperature: 2,
      continentalness: 1.5,
      erosion: 1.5,
    },
  },
};
