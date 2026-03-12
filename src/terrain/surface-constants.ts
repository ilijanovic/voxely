/**
 * Single source of truth for surface height thresholds and surface/noise tuning.
 * Import from here in terrain/index.ts, game-terrain.ts, terrain-sampling.ts, and surface-resolver so values stay in sync.
 *
 * Height bands (all relative to WATER_LEVEL = 64):
 * - MOUNTAIN_STONE_SURFACE_HEIGHT (80): mountain/windswept/meadow → stone
 * - SNOW_AT_ALTITUDE_HEIGHT (84): non-warm biomes → grass_snow (snow line)
 * - SURFACE_STONE_HEIGHT (90): global stone unless biome exempt
 * - FROZEN_PEAKS_HIGH_HEIGHT (94): frozen_peaks packed_ice/ice on steep slopes
 *
 * Dither and frozen_peaks noise scales/offsets: tune here for softer/sharp coast and land transitions.
 * Badlands band scale and count: noise-based surface/subsurface band variation.
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

/**
 * Surface dither noise: scale and offsets for coast/land blend and frozen_peaks.
 * Same seed (detailNoise2D) in worker and game-terrain; tune here for softer/sharp transitions.
 */
export const SURFACE_DITHER_COAST_SCALE = 0.11
export const SURFACE_DITHER_COAST_OFFSET_X = 19.3
export const SURFACE_DITHER_COAST_OFFSET_Z = -71.7
export const SURFACE_DITHER_LAND_SCALE = 0.13
export const SURFACE_DITHER_LAND_OFFSET_X = -33.1
export const SURFACE_DITHER_LAND_OFFSET_Z = 5.7
export const SURFACE_FROZEN_PEAKS_N_SCALE = 0.09
export const SURFACE_FROZEN_PEAKS_N_OFFSET_X = 71.3
export const SURFACE_FROZEN_PEAKS_N_OFFSET_Z = -19.7
export const SURFACE_FROZEN_PEAKS_BLOB_SCALE = 0.035
export const SURFACE_FROZEN_PEAKS_BLOB_OFFSET_X = -211.1
export const SURFACE_FROZEN_PEAKS_BLOB_OFFSET_Z = 97.7

/**
 * Badlands banding: noise-based variation (red_sand, sandstone, terracotta).
 * Sampled at (x, z, topY); pass result as badlandsBandNoise in SurfaceResolverParams.
 */
export const BADLANDS_BAND_SCALE_XZ = 0.02
export const BADLANDS_BAND_SCALE_Y = 0.08
/** Number of band block types (red_sand, sandstone, orange/yellow/red/white terracotta). */
export const BADLANDS_BAND_BLOCK_COUNT = 6
