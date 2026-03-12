/**
 * Ore generation constants (Vanilla Minecraft 1.18–1.20 style).
 * Triangular Y distribution, vein size, density thresholds, and biome modifiers.
 * Values scaled to WORLD_HEIGHT = 128 (Y 0..127).
 */
import type { Biome } from '../types'
import { WORLD_HEIGHT } from '../constants'

/** Per-biome Y range override (e.g. badlands gold at higher elevations). */
export interface OreYRange {
  minY: number
  maxY: number
  peakY: number
}

/** Config for one ore type: Y range, peak, vein size, density threshold, optional biome modifiers. */
export interface OreConfig {
  /** Block type to place (must be in block-ids). */
  block: 'coal_ore' | 'iron_ore' | 'gold_ore' | 'diamond_ore'
  /** Minimum Y (inclusive). */
  minY: number
  /** Maximum Y (inclusive). */
  maxY: number
  /** Y level where spawn probability is highest (triangular distribution). */
  peakY: number
  /** Max blocks per vein (blob size). */
  veinSize: number
  /** Density noise must exceed this (0..1) to allow placement. Higher = rarer. */
  densityThreshold: number
  /** Scale applied to (x,y,z) when sampling 3D density noise. */
  noiseScale: number
  /**
   * Per-biome multiplier for density threshold (0..1). Lower = more ore in that biome.
   * Vanilla 1.20: e.g. iron/coal more common in mountains, gold in badlands.
   */
  biomeThresholdMultiplier?: Partial<Record<Biome, number>>
  /**
   * Per-biome Y range override. Vanilla 1.20: gold in badlands generates at higher elevations.
   */
  biomeYOverride?: Partial<Record<Biome, OreYRange>>
}

/** Mountain-like biomes where iron and coal are more common (Vanilla 1.20). */
export const MOUNTAIN_OREOUS_BIOMES: Biome[] = [
  'mountain',
  'snowy_slopes',
  'stony_peaks',
  'frozen_peaks',
  'jagged_peaks',
  'windswept_hills',
  'windswept_gravelly_hills',
  'windswept_forest',
]

/** Coal: common, wide range. Vanilla 0..320 peak 96; scaled to 0..127 peak 96. More in mountains (1.20). */
export const COAL_ORE_CONFIG: OreConfig = {
  block: 'coal_ore',
  minY: 0,
  maxY: WORLD_HEIGHT - 1,
  peakY: 96,
  veinSize: 9,
  densityThreshold: 0.52,
  noiseScale: 0.04,
  biomeThresholdMultiplier: Object.fromEntries(
    MOUNTAIN_OREOUS_BIOMES.map((b) => [b, 0.88]),
  ) as Partial<Record<Biome, number>>,
}

/** Iron: common, full range. Vanilla -64..320 peak 64. More in mountains, often near surface (1.20). */
export const IRON_ORE_CONFIG: OreConfig = {
  block: 'iron_ore',
  minY: 0,
  maxY: WORLD_HEIGHT - 1,
  peakY: 64,
  veinSize: 9,
  densityThreshold: 0.56,
  noiseScale: 0.04,
  biomeThresholdMultiplier: Object.fromEntries(
    MOUNTAIN_OREOUS_BIOMES.map((b) => [b, 0.82]),
  ) as Partial<Record<Biome, number>>,
}

/**
 * Gold: rarer, lower only. Vanilla -64..32 peak -16; scaled to 0..32 peak 8.
 * In badlands (1.20): generates at higher elevations (we use 32..127, peak 80) and more common.
 */
export const GOLD_ORE_CONFIG: OreConfig = {
  block: 'gold_ore',
  minY: 0,
  maxY: 32,
  peakY: 8,
  veinSize: 9,
  densityThreshold: 0.62,
  noiseScale: 0.04,
  biomeThresholdMultiplier: { badlands: 0.72 },
  biomeYOverride: {
    badlands: {
      minY: 32,
      maxY: WORLD_HEIGHT - 1,
      peakY: 80,
    },
  },
}

/** Diamond: rarest, lower half. Vanilla -64..16; scaled to 0..64 peak 16. */
export const DIAMOND_ORE_CONFIG: OreConfig = {
  block: 'diamond_ore',
  minY: 0,
  maxY: 64,
  peakY: 16,
  veinSize: 8,
  densityThreshold: 0.7,
  noiseScale: 0.04,
}

/**
 * All ore configs in placement order: rarest first so rare ores take priority over common.
 */
export const ORE_CONFIGS: OreConfig[] = [
  DIAMOND_ORE_CONFIG,
  GOLD_ORE_CONFIG,
  IRON_ORE_CONFIG,
  COAL_ORE_CONFIG,
]
