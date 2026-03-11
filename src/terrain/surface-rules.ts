/**
 * Single source of truth for surface block rules (height-to-stone, frozen_peaks, grass_snow, etc.).
 * Pure logic only; no THREE, no DOM. Used by terrain/index.ts (worker), game-terrain.ts, and terrain-sampling.ts.
 */
import type { Biome, BlockType } from '../types'
import { WATER_LEVEL } from '../constants'
import {
  JAGGED_PEAKS_STONE_SLOPE_MIN,
  MOUNTAIN_STONE_SURFACE_HEIGHT,
  SNOWY_SLOPES_STONE_SLOPE_MIN,
  SURFACE_STONE_HEIGHT,
} from './surface-constants'
import { BIOMES_WITHOUT_GRASS_SNOW } from './tree-constants'

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
  if (
    (biome === 'mountain' ||
      biome === 'windswept_hills' ||
      biome === 'windswept_forest') &&
    topY >= MOUNTAIN_STONE_SURFACE_HEIGHT
  )
    return 'stone'
  if (biome === 'meadow' && topY >= MOUNTAIN_STONE_SURFACE_HEIGHT) return 'stone'
  if (
    topY >= SURFACE_STONE_HEIGHT &&
    biome !== 'frozen_peaks' &&
    biome !== 'jagged_peaks' &&
    biome !== 'jungle' &&
    biome !== 'badlands' &&
    biome !== 'mushroom_fields' &&
    biome !== 'mangrove_swamp' &&
    biome !== 'old_growth_taiga'
  )
    return 'stone'

  if (biome === 'frozen_peaks') {
    const slope = options.slope ?? 0
    const steep = slope >= 6
    const verySteep = slope >= 9
    const high = topY >= WATER_LEVEL + 30
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
    topY >= WATER_LEVEL + 20 &&
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
