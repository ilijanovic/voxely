/**
 * Single source of truth for surface height thresholds used by worker, main-thread runtime, and sampling.
 * Import from here in terrain/index.ts, game-terrain.ts, and terrain-sampling.ts so values stay in sync.
 *
 * Height bands (all relative to WATER_LEVEL = 64):
 * - MOUNTAIN_STONE_SURFACE_HEIGHT (80): mountain/windswept/meadow → stone
 * - SNOW_AT_ALTITUDE_HEIGHT (84): non-warm biomes → grass_snow (snow line)
 * - SURFACE_STONE_HEIGHT (90): global stone unless biome exempt
 * - FROZEN_PEAKS_HIGH_HEIGHT (94): frozen_peaks packed_ice/ice on steep slopes
 */
import { WATER_LEVEL } from '../constants'

/** Above this Y, mountain-like biomes use stone surface (windswept_*, meadow). */
export const MOUNTAIN_STONE_SURFACE_HEIGHT = WATER_LEVEL + 16

/** Above this Y, non-warm biomes get grass_snow (snow line). */
export const SNOW_AT_ALTITUDE_HEIGHT = WATER_LEVEL + 20

/** Above this Y, all non-peak biomes use stone surface unless exempt (e.g. frozen_peaks, jagged_peaks, jungle). */
export const SURFACE_STONE_HEIGHT = WATER_LEVEL + 26

/** Above this Y, frozen_peaks can show packed_ice/ice on steep slopes (else snow). */
export const FROZEN_PEAKS_HIGH_HEIGHT = WATER_LEVEL + 30

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
