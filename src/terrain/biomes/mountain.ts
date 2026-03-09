import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

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

export const mountainDefinition: BiomeDefinition = {
  blocks: {
    surface: "grass",
    subsurface: "dirt",
    subsurfaceDepth: 2,
    shore: "sand",
    underwater: "sand",
  },
  terrainParams: mountainTerrain,
  climate: { tempMin: 0.25, tempMax: 0.5, humidityMin: 0.2, humidityMax: 0.55 },
};
