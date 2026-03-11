/**
 * Types for biome terrain and layer config. Used by per-biome files and the registry.
 */
import type { BlockType } from '../../types'

/**
 * 6D multi-noise point used for biome selection (Minecraft-style multi-noise).
 * Ranges are intentionally not normalized here; the sampler is responsible for producing
 * consistent ranges per dimension (e.g. erosion/temperature in [-1..1], continentalness in [0..1]).
 */
export interface MultiNoise6Point {
  continentalness: number
  erosion: number
  temperature: number
  humidity: number
  weirdness: number
  y: number
}

export type MultiNoise6Weights = Partial<Record<keyof MultiNoise6Point, number>>

export interface MultiNoiseSelector6D {
  /** Target center in 6D noise space. */
  center: MultiNoise6Point
  /** Optional per-dimension weights; missing keys default to 1. */
  weights?: MultiNoise6Weights
}

export interface TerrainParams {
  baseOffset: number
  detailAmp: number
  detailFreq: number
  flatness: number
  mountainAllowed: boolean
}

export interface LayerConfig {
  surface: BlockType
  subsurface: BlockType
  subsurfaceDepth: number
}

/** Block set per biome: surface, subsurface, shore (water edge), underwater (sea floor). */
export interface BiomeBlockSet {
  surface: BlockType
  subsurface: BlockType
  subsurfaceDepth: number
  shore: BlockType
  underwater: BlockType
}

/** Optional climate bounds in [0, 1] for biome selection. Used by base biomes only. */
export interface ClimateBounds {
  tempMin: number
  tempMax: number
  humidityMin: number
  humidityMax: number
}

/** Full biome definition: blocks + terrain + optional climate (for base biomes). */
export interface BiomeDefinition {
  blocks: BiomeBlockSet
  terrainParams: TerrainParams
  /** Only set for base biomes (desert, plains, savanna, forest, jungle, mountain, snow). */
  climate?: ClimateBounds
  /**
   * Optional 6D multi-noise selector target for biome selection.
   * When present, the biome can be selected by nearest-center distance in 6D space.
   */
  multiNoise?: MultiNoiseSelector6D
}
