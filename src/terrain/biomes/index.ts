/**
 * Biome registry: aggregates terrain params and layer config from per-biome files.
 * To add a new biome: add it to Biome in types.ts, create biomes/<name>.ts, then register below.
 */
import type { Biome } from "../../types";
import type { TerrainParams, LayerConfig } from "./types";
import { plainsTerrain, plainsLayers } from "./plains";
import { desertTerrain, desertLayers } from "./desert";
import { forestTerrain, forestLayers } from "./forest";
import { jungleTerrain, jungleLayers } from "./jungle";
import { mountainTerrain, mountainLayers } from "./mountain";
import { snowTerrain, snowLayers } from "./snow";
import { meadowTerrain, meadowLayers } from "./meadow";
import { groveTerrain, groveLayers } from "./grove";
import { snowySlopesTerrain, snowySlopesLayers } from "./snowy_slopes";

export const BIOME_TERRAIN: Record<Biome, TerrainParams> = {
  plains: plainsTerrain,
  desert: desertTerrain,
  forest: forestTerrain,
  jungle: jungleTerrain,
  mountain: mountainTerrain,
  snow: snowTerrain,
  meadow: meadowTerrain,
  grove: groveTerrain,
  snowy_slopes: snowySlopesTerrain,
};

export const BIOME_LAYERS: Record<Biome, LayerConfig> = {
  plains: plainsLayers,
  desert: desertLayers,
  forest: forestLayers,
  jungle: jungleLayers,
  mountain: mountainLayers,
  snow: snowLayers,
  meadow: meadowLayers,
  grove: groveLayers,
  snowy_slopes: snowySlopesLayers,
};
