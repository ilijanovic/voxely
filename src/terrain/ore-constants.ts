/**
 * Ore generation constants (Vanilla Minecraft 1.18–style).
 * Triangular Y distribution, vein size, and density thresholds.
 * Values scaled to WORLD_HEIGHT = 128 (Y 0..127).
 */
import { WORLD_HEIGHT } from '../constants'

/** Config for one ore type: Y range, peak, vein size, and density threshold. */
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
}

/** Coal: common, wide range. Vanilla 0..320 peak 96; scaled to 0..127 peak 96. */
export const COAL_ORE_CONFIG: OreConfig = {
  block: 'coal_ore',
  minY: 0,
  maxY: WORLD_HEIGHT - 1,
  peakY: 96,
  veinSize: 9,
  densityThreshold: 0.52,
  noiseScale: 0.04,
}

/** Iron: common, full range. Vanilla -64..320; scaled to 0..127 peak 64. */
export const IRON_ORE_CONFIG: OreConfig = {
  block: 'iron_ore',
  minY: 0,
  maxY: WORLD_HEIGHT - 1,
  peakY: 64,
  veinSize: 9,
  densityThreshold: 0.56,
  noiseScale: 0.04,
}

/** Gold: rarer, lower only. Vanilla -64..32 peak -16; scaled to 0..32 peak 8. */
export const GOLD_ORE_CONFIG: OreConfig = {
  block: 'gold_ore',
  minY: 0,
  maxY: 32,
  peakY: 8,
  veinSize: 9,
  densityThreshold: 0.62,
  noiseScale: 0.04,
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
