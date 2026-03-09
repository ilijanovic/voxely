import type { TerrainParams, LayerConfig, BiomeDefinition } from "./types";

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

export const snowDefinition: BiomeDefinition = {
  blocks: {
    surface: "snow",
    subsurface: "dirt",
    subsurfaceDepth: 2,
    shore: "sand",
    underwater: "sand",
  },
  terrainParams: snowTerrain,
  climate: { tempMin: 0, tempMax: 0.35, humidityMin: 0.2, humidityMax: 0.6 },
};
