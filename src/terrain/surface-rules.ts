/**
 * Single source of truth for surface block rules (height-to-stone, frozen_peaks, grass_snow, etc.).
 * Pure logic only; no THREE, no DOM. Used by terrain/index.ts (worker), game-terrain.ts, and terrain-sampling.ts.
 *
 * Rule priority (order of checks; first match wins):
 * 1. Mountain/windswept/meadow stone by height (MOUNTAIN_STONE_SURFACE_HEIGHT)
 * 2. Global stone by height (SURFACE_STONE_HEIGHT) with biome exemptions
 * 3. frozen_peaks: packed_ice / ice by slope and noise, else snow
 * 4. jagged_peaks / snowy_slopes: stone on steep slope
 * 5. Snow at altitude (SNOW_AT_ALTITUDE_HEIGHT) → grass_snow for non-warm biomes
 * 6. effectiveSurface snow → grass_snow
 * 7. Savanna grass → grass_savanna
 * 8. Grass with snow neighbor → grass_snow
 * 9. Default: effectiveSurface
 */
import type { Biome, BlockType } from '../types'
import {
  FROZEN_PEAKS_HIGH_HEIGHT,
  JAGGED_PEAKS_STONE_SLOPE_MIN,
  MOUNTAIN_STONE_SURFACE_HEIGHT,
  SNOW_AT_ALTITUDE_HEIGHT,
  SNOWY_SLOPES_STONE_SLOPE_MIN,
  SURFACE_STONE_HEIGHT,
} from './surface-constants'
import { BIOMES_WITHOUT_GRASS_SNOW } from './tree-constants'

/**
 * Per-biome surface rule flags (Minecraft-style: one source of truth for which biomes get stone/snow rules).
 * Used so surface logic is data-driven instead of long if-chains.
 */
export interface SurfaceRuleBiomeConfig {
  /** If true, use stone above MOUNTAIN_STONE_SURFACE_HEIGHT (mountain, windswept_*, meadow). */
  stoneAtMountainHeight?: boolean
  /** If true, do not apply global SURFACE_STONE_HEIGHT rule (peaks, jungle, badlands, etc.). */
  exemptFromGlobalStone?: boolean
}

/** Biome → surface rule config. Only biomes with overrides are listed; others get default behaviour. */
export const BIOME_SURFACE_RULES: Partial<Record<Biome, SurfaceRuleBiomeConfig>> = {
  mountain: { stoneAtMountainHeight: true },
  windswept_hills: { stoneAtMountainHeight: true },
  windswept_forest: { stoneAtMountainHeight: true },
  meadow: { stoneAtMountainHeight: true },
  frozen_peaks: { exemptFromGlobalStone: true },
  jagged_peaks: { exemptFromGlobalStone: true },
  jungle: { exemptFromGlobalStone: true },
  badlands: { exemptFromGlobalStone: true },
  mushroom_fields: { exemptFromGlobalStone: true },
  mangrove_swamp: { exemptFromGlobalStone: true },
  old_growth_taiga: { exemptFromGlobalStone: true },
}

/** Options for context-dependent surface rules (slope, frozen_peaks noise, snow neighbor). Callers compute these. */
export interface SurfaceRulesOptions {
  /** Max cardinal height delta for cliff detection (frozen_peaks packed_ice/ice). */
  slope?: number
  /** Noise value [0..1] for frozen_peaks variation. If omitted, frozen_peaks returns snow. */
  frozenPeaksNoiseN?: number
  /** Noise value [0..1] for frozen_peaks ice blobs. If omitted, frozen_peaks returns snow. */
  frozenPeaksNoiseBlob?: number
  /** When true and effectiveSurface is grass, return grass_snow (snow biome neighbor). */
  hasSnowNeighbor?: boolean
}

/**
 * Returns the surface block for a column from biome, topY, and effective surface (after underwater/shore/blend).
 * Callers must apply underwater, shore, and blend logic first and pass the resulting effective surface here.
 */
export function getSurfaceBlockFromRules(
  biome: Biome,
  topY: number,
  effectiveSurface: BlockType,
  options: SurfaceRulesOptions = {},
): BlockType {
  const biomeRules = BIOME_SURFACE_RULES[biome]
  if (biomeRules?.stoneAtMountainHeight && topY >= MOUNTAIN_STONE_SURFACE_HEIGHT) return 'stone'
  if (
    topY >= SURFACE_STONE_HEIGHT &&
    !biomeRules?.exemptFromGlobalStone
  )
    return 'stone'

  if (biome === 'frozen_peaks') {
    const slope = options.slope ?? 0
    const steep = slope >= 6
    const verySteep = slope >= 9
    const high = topY >= FROZEN_PEAKS_HIGH_HEIGHT
    const n = options.frozenPeaksNoiseN ?? 0.5
    const blob = options.frozenPeaksNoiseBlob ?? 0.5
    if (high && (verySteep || (steep && n < 0.62))) return 'packed_ice'
    if (high && steep && blob < 0.12) return 'ice'
    return 'snow'
  }

  if (biome === 'jagged_peaks' && (options.slope ?? 0) >= JAGGED_PEAKS_STONE_SLOPE_MIN)
    return 'stone'

  if (biome === 'snowy_slopes' && (options.slope ?? 0) >= SNOWY_SLOPES_STONE_SLOPE_MIN)
    return 'stone'

  if (
    topY >= SNOW_AT_ALTITUDE_HEIGHT &&
    !BIOMES_WITHOUT_GRASS_SNOW.has(biome)
  )
    return 'grass_snow'

  if (
    effectiveSurface === 'snow' &&
    !BIOMES_WITHOUT_GRASS_SNOW.has(biome)
  )
    return 'grass_snow'
  if (biome === 'savanna' && effectiveSurface === 'grass') return 'grass_savanna'

  if (
    effectiveSurface === 'grass' &&
    options.hasSnowNeighbor === true
  )
    return 'grass_snow'

  return effectiveSurface
}
