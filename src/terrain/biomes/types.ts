/**
 * Types for biome terrain and layer config. Used by per-biome files and the registry.
 */
import type { BlockType } from "../../types";

export interface TerrainParams {
  baseOffset: number;
  detailAmp: number;
  detailFreq: number;
  flatness: number;
  mountainAllowed: boolean;
}

export interface LayerConfig {
  surface: BlockType;
  subsurface: BlockType;
  subsurfaceDepth: number;
}

/** Block set per biome: surface, subsurface, shore (water edge), underwater (sea floor). */
export interface BiomeBlockSet {
  surface: BlockType;
  subsurface: BlockType;
  subsurfaceDepth: number;
  shore: BlockType;
  underwater: BlockType;
}

/** Optional climate bounds in [0, 1] for biome selection. Used by base biomes only. */
export interface ClimateBounds {
  tempMin: number;
  tempMax: number;
  humidityMin: number;
  humidityMax: number;
}

/** Full biome definition: blocks + terrain + optional climate (for base biomes). */
export interface BiomeDefinition {
  blocks: BiomeBlockSet;
  terrainParams: TerrainParams;
  /** Only set for base biomes (desert, plains, savanna, forest, jungle, mountain, snow). */
  climate?: ClimateBounds;
}
