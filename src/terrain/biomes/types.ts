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
