/**
 * Single source of truth for surface height thresholds used by worker, main-thread runtime, and sampling.
 * Import from here in terrain/index.ts, game-terrain.ts, and terrain-sampling.ts so values stay in sync.
 */
import { WATER_LEVEL } from '../constants'

/** Above this Y, mountain-like biomes use stone surface (windswept_*, meadow). */
export const MOUNTAIN_STONE_SURFACE_HEIGHT = WATER_LEVEL + 16

/** Above this Y, all non-peak biomes use stone surface unless exempt (e.g. frozen_peaks, jagged_peaks, jungle). */
export const SURFACE_STONE_HEIGHT = WATER_LEVEL + 26

/** Min cardinal height delta for jagged_peaks to show exposed stone on steep cliffs (snow on flatter surfaces). */
export const JAGGED_PEAKS_STONE_SLOPE_MIN = 6

/** Min cardinal height delta for snowy_slopes to show exposed stone on very steep cliffs. */
export const SNOWY_SLOPES_STONE_SLOPE_MIN = 9

/** Max cardinal height delta for full snow layers (flat); above this, layer count is reduced. */
export const SNOW_LAYER_FLAT_SLOPE_MAX = 2
/** Above this slope, only one snow layer is placed. */
export const SNOW_LAYER_MODERATE_SLOPE_MAX = 4
/** Above this slope, no snow layers (too steep). */
export const SNOW_LAYER_STEEP_SLOPE_MIN = 6
