import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

export const jaggedPeaksTerrain: TerrainParams = {
  baseOffset: 10,
  detailAmp: 16,
  detailFreq: 0.027,
  flatness: 0.2,
  mountainAllowed: true,
};

export const jaggedPeaksLayers: LayerConfig = {
  surface: "snow",
  subsurface: "stone",
  subsurfaceDepth: 4,
};

export const jaggedPeaksDefinition: BiomeDefinition = {
  blocks: {
    surface: "snow",
    subsurface: "stone",
    subsurfaceDepth: 4,
    shore: "gravel",
    underwater: "stone",
  },
  terrainParams: jaggedPeaksTerrain,
  multiNoise: {
    center: {
      continentalness: 0.78,
      erosion: -0.86,
      temperature: -0.05,
      humidity: 0.25,
      weirdness: 0.35,
      y: 0.86,
    },
    weights: {
      y: 3,
      erosion: 3,
      continentalness: 1.5,
    },
  },
};
