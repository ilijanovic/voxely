import type { Biome, BlockType } from '../types'

export interface OreYRange {
  minY: number
  maxY: number
  peakY: number
}

export interface OreConfig extends OreYRange {
  /** Block type to place (e.g. 'coal_ore'). */
  block: BlockType
  /** 3D noise scale applied to world coords before sampling density. */
  noiseScale: number
  /** Replace up to this many stone blocks per vein. */
  veinSize: number
  /** Density threshold after multiplying by triangularWeight (higher = rarer). */
  densityThreshold: number
  /** Optional per-biome Y distribution override (e.g. more gold in badlands). */
  biomeYOverride?: Partial<Record<Biome, OreYRange>>
  /** Optional per-biome density threshold multiplier (e.g. more gold in badlands). */
  biomeThresholdMultiplier?: Partial<Record<Biome, number>>
}

/**
 * Ore configuration list used by `features/ore.ts`.
 * Values are tuned for gameplay feel and determinism rather than strict vanilla parity.
 */
export const ORE_CONFIGS: readonly OreConfig[] = [
  {
    block: 'coal_ore',
    minY: -16,
    maxY: 160,
    peakY: 64,
    noiseScale: 0.065,
    veinSize: 14,
    densityThreshold: 0.52,
    biomeThresholdMultiplier: {
      mountain: 0.92,
      windswept_hills: 0.95,
      stony_peaks: 0.95,
    },
  },
  {
    block: 'iron_ore',
    minY: -32,
    maxY: 96,
    peakY: 16,
    noiseScale: 0.06,
    veinSize: 10,
    densityThreshold: 0.56,
    biomeThresholdMultiplier: {
      mountain: 0.94,
      stony_peaks: 0.94,
    },
  },
  {
    block: 'gold_ore',
    minY: -64,
    maxY: 32,
    peakY: -16,
    noiseScale: 0.055,
    veinSize: 8,
    densityThreshold: 0.62,
    biomeThresholdMultiplier: {
      badlands: 0.82,
    },
  },
  {
    block: 'diamond_ore',
    minY: -64,
    maxY: 16,
    peakY: -48,
    noiseScale: 0.05,
    veinSize: 6,
    densityThreshold: 0.7,
  },
] as const

