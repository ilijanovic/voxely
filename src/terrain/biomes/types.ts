/**
 * Types for biome terrain and layer config. Used by per-biome files and the registry.
 */
import type { BlockType } from '../../types'

/**
 * 6D multi-noise point used for biome selection (Minecraft-style multi-noise).
 * Ranges are intentionally not normalized here; the sampler is responsible for producing
 * consistent ranges per dimension (vanilla-aligned: continentalness [-1.2..1], weirdness [-2..2], erosion/temperature/humidity [-1..1]).
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

/**
 * Rarity weight for climate-based selection. Higher = more common (larger effective region).
 * Default 1 when not set. Minecraft-style: plains/forest common, jungle/badlands rare.
 */
export const DEFAULT_BIOME_RARITY_WEIGHT = 1

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
  /**
   * Optional rarity weight for land biome selection. Higher = more common (effective distSq divided by this).
   * Use values &gt; 1 for common biomes (plains, forest), &lt; 1 for rare (jungle, badlands, mushroom_fields).
   */
  rarityWeight?: number
  /**
   * Optional parent biome for sub-biome / edge logic. When set, this biome may only be considered
   * when near a boundary of the parent (e.g. Jungle Edge only next to Jungle). Not yet used in selection.
   */
  parentBiome?: import('../../types').Biome
}
