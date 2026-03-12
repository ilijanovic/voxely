/**
 * Shared terrain and climate constants used by the chunk generator (worker) and
 * main-thread terrain sampling. Single source of truth to avoid worker/main-thread drift.
 */
import { WATER_LEVEL } from '../constants'

/** Base height for terrain (same as classic Minecraft). */
export const BASE_HEIGHT = 64

/**
 * Horizontal sampling scale for climate parameters (temperature/humidity/continentalness/erosion).
 * Vanilla Overworld uses the same xz_scale for these dimensions; we use a shared scale to match.
 */
export const CLIMATE_PARAM_SCALE = 0.0012

/** Continentalness below this is ocean; above is land. Coast blend band applied around it. */
export const OCEAN_CONTINENTALNESS_THRESHOLD = 0.36

/** Width of ocean/land blend in continentalness space; wider band softens coast height edges. */
export const COAST_BLEND_BAND = 0.09

/** Radius (blocks) around world origin (0,0) where climate is biased toward forest. */
export const SPAWN_ORIGIN_FOREST_RADIUS = 64
export const SPAWN_ORIGIN_FOREST_RADIUS_SQ = SPAWN_ORIGIN_FOREST_RADIUS * SPAWN_ORIGIN_FOREST_RADIUS
/** Continentalness to force land at origin (above ocean threshold). */
export const SPAWN_ORIGIN_FOREST_CONTINENTALNESS = 0.5
/** Forest climate center (temp, humidity) from terrain/biomes/forest.ts. */
export const SPAWN_ORIGIN_FOREST_TEMP = 0.475
export const SPAWN_ORIGIN_FOREST_HUMIDITY = 0.7

/** Climate warp for domain rotation (Minecraft-style). */
export const CLIMATE_WARP_SCALE = 0.0014
export const CLIMATE_WARP_AMP = 42

/** Erosion noise and terrain jaggedness. */
export const EROSION_SCALE = CLIMATE_PARAM_SCALE
export const EROSION_AMPLITUDE = 7
export const EROSION_DETAIL_BOOST_MAX = 1.65
/** Erosion signed <= this starts boosting detail (jaggedness). */
export const EROSION_JAGGEDNESS_START = 0.25

/** Mountain mask and height contribution. */
export const MOUNTAIN_MASK_SCALE = 0.003
export const MOUNTAIN_HEIGHT_SCALE = 0.008
export const MOUNTAIN_AMPLITUDE = 24
export const MOUNTAIN_THRESHOLD = 0.3
/** Width of smooth transition from no mountain to full mountain contribution. */
export const MOUNTAIN_TRANSITION_WIDTH = 0.12
export const MOUNTAIN_BIOME_HEIGHT_BOOST = 2.1
export const SNOW_BIOME_HEIGHT_BOOST = 4.5

/** Weirdness dimension for ridges. */
export const WEIRDNESS_SCALE = 0.0016
export const WEIRDNESS_RIDGE_AMP = 6

/** Highland band thresholds (height above water). */
export const HIGHLAND_MEADOW_MAX = WATER_LEVEL + 10
export const HIGHLAND_GROVE_MAX = WATER_LEVEL + 20
export const HIGHLAND_SNOWY_SLOPES_MAX = WATER_LEVEL + 30

/** Temperature thresholds for cold highland/upland variants. */
export const COLD_HIGHLAND_TEMP_MAX = 0.42
export const COLD_UPLAND_TEMP_MAX = 0.5

/** Highland variant noise scale (meadow/grove/windswept/cherry). */
export const HIGHLAND_VARIANT_SCALE = 0.004

/** Humidity threshold for windswept_forest vs windswept_hills. */
export const WINDSWEPT_FOREST_HUMIDITY_MIN = 0.55

/** Height transition noise (softens height cutoffs). */
export const HEIGHT_TRANSITION_SCALE = 0.0016
export const HEIGHT_TRANSITION_AMPLITUDE = 4.5

/** Peak biome selection (frozen/jagged/stony) height range. */
export const PEAK_Y_MIN = WATER_LEVEL + 30
export const PEAK_Y_RANGE = 24

/** Flatness noise frequency for terrain smoothness; shared by height and local terrain. */
export const FLAT_NOISE_SCALE = 0.01
