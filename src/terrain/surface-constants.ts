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
 * Badlands banding (Minecraft-like mesa strata):
 * - world-Y drives horizontal strata
 * - low-frequency warp/noise offsets break perfectly straight lines
 */
export const BADLANDS_BAND_SCALE_XZ = 0.028
export const BADLANDS_BAND_SCALE_Y = 0.055
/** Low-frequency warp for strata offsets (in block units). */
export const BADLANDS_BAND_WARP_SCALE = 0.017
export const BADLANDS_BAND_WARP_AMPLITUDE = 2.8
export const BADLANDS_BAND_WARP_OFFSET_X = -57.2
export const BADLANDS_BAND_WARP_OFFSET_Z = 83.1
/** Blend weights for strata-vs-noise mix (must sum to 1). */
export const BADLANDS_BAND_STRATA_WEIGHT = 0.82
export const BADLANDS_BAND_NOISE_WEIGHT = 0.18
/** How deep below the surface badlands keeps terracotta bands before transitioning to stone. */
export const BADLANDS_BAND_SUBSURFACE_DEPTH = 42
/** Number of band block types (red_sand, sandstone, orange/yellow/red/white terracotta). */
export const BADLANDS_BAND_BLOCK_COUNT = 6

/** River bank material blend: mostly sand/gravel within this height above water. */
export const RIVER_BANK_SAND_MAX_HEIGHT = WATER_LEVEL + 3
/** River bank material blend extends up to this height (then default biome surface takes over). */
export const RIVER_BANK_BLEND_MAX_HEIGHT = WATER_LEVEL + 7
/** Slope threshold where river banks prefer gravel over sand. */
export const RIVER_BANK_GRAVEL_SLOPE_MIN = 3
/** Near-water river bank: noise below this value becomes gravel, otherwise sand. */
export const RIVER_BANK_NEAR_WATER_GRAVEL_NOISE_MAX = 0.38
/** Upper-bank river blend: noise below this value becomes gravel. */
export const RIVER_BANK_UPPER_GRAVEL_NOISE_MAX = 0.17
/** Upper-bank river blend: noise below this value becomes sand (above = default surface). */
export const RIVER_BANK_UPPER_SAND_NOISE_MAX = 0.48

/** River bank dither noise sampling (same detail noise channel as other surface dithers). */
export const SURFACE_RIVER_BANK_SCALE = 0.12
export const SURFACE_RIVER_BANK_OFFSET_X = -143.2
export const SURFACE_RIVER_BANK_OFFSET_Z = 214.6

/** Lower blend.t bound for land-to-land boundary dither (non-ocean). */
export const LAND_BLEND_DITHER_MIN_T = 0.02
/** Upper blend.t bound for land-to-land boundary dither (non-ocean). */
export const LAND_BLEND_DITHER_MAX_T = 0.98
/** Lower blend.t bound for desert-involved land boundary dither (keeps edges readable). */
export const LAND_BLEND_DITHER_DESERT_MIN_T = 0.22
/** Upper blend.t bound for desert-involved land boundary dither (keeps edges readable). */
export const LAND_BLEND_DITHER_DESERT_MAX_T = 0.78
