/**
 * Shared terrain and climate constants used by the chunk generator (worker) and
 * main-thread terrain sampling. Single source of truth to avoid worker/main-thread drift.
 */
import { WATER_LEVEL } from '../constants'

/** Base height for terrain (Vanilla 1.18+ sea level). */
export const BASE_HEIGHT = WATER_LEVEL

/**
 * Horizontal sampling scale for climate parameters (temperature/humidity/continentalness/erosion).
 * Vanilla Overworld uses the same xz_scale for these dimensions; we use a shared scale to match.
 */
export const CLIMATE_PARAM_SCALE = 0.0012

/**
 * Map raw continentalness noise [-1, 1] to vanilla range [-1.2, 1].
 * Vanilla mushroom_fields uses continentalness [-1.2, -1.05]; inland up to 1.
 */
export const CONTINENTALNESS_VANILLA_MIN = -1.2
export const CONTINENTALNESS_VANILLA_MAX = 1

/**
 * Continentalness threshold for ocean vs. land (vanilla-aligned).
 * Vanilla uses about -0.19; we bias slightly toward inland so oceans stay
 * significant but do not dominate large sampled regions.
 */
export const OCEAN_CONTINENTALNESS_THRESHOLD = -0.32

/** Width of ocean/land blend in continentalness space; wider band softens coast height edges. */
export const COAST_BLEND_BAND = 0.1
/** Minimum land-side blend weight required to classify a coastal land column as edge biome. */
export const COAST_EDGE_MIN_COAST_BLEND_T = 0.3
/** Highest surface Y where warm/temperate coasts can convert into beach. */
export const BEACH_MAX_HEIGHT = WATER_LEVEL + 8
/** Highest surface Y where rocky coasts can convert into stony_shore. */
export const STONY_SHORE_MAX_HEIGHT = WATER_LEVEL + 20
/** Minimum cardinal slope at coast for stony_shore conversion. */
export const STONY_SHORE_MIN_SLOPE = 4
/** Highest surface Y where snow coasts can convert into snowy_beach. */
export const SNOWY_BEACH_MAX_HEIGHT = WATER_LEVEL + 8
/** Max smoothed temperature for snowy_beach conversion. */
export const SNOWY_BEACH_MAX_TEMPERATURE = 0.3

/** River channel centerline noise (abs simplex) scale; lower values make longer meanders. */
export const RIVER_NOISE_SCALE = 0.0018
/** Domain-warp scale for river centerline distortion (avoid straight contour-like rivers). */
export const RIVER_WARP_SCALE = 0.0027
/** Domain-warp amplitude in blocks for river meandering. */
export const RIVER_WARP_AMP = 34
/** Width variation noise scale for river channels. */
export const RIVER_WIDTH_NOISE_SCALE = 0.0055
/** Depth variation noise scale for river beds. */
export const RIVER_DEPTH_NOISE_SCALE = 0.0041
/** Secondary river centerline scale used for confluence widening. */
export const RIVER_SECONDARY_NOISE_SCALE = 0.00195
/** River half-width threshold in abs-noise space (minimum). */
export const RIVER_WIDTH_MIN = 0.028
/** River half-width threshold in abs-noise space (maximum). */
export const RIVER_WIDTH_MAX = 0.065
/** Soft edge size around the channel threshold in abs-noise space. */
export const RIVER_EDGE_SOFTNESS = 0.014
/** Minimum overlap between primary/secondary channels before confluence widening activates. */
export const RIVER_CONFLUENCE_MIN_CORE = 0.18
/** Extra carve factor added at confluences (wider basins where channels meet). */
export const RIVER_CONFLUENCE_BOOST = 0.33
/** Continentalness lower bound where inland rivers begin to appear (suppresses deep ocean). */
export const RIVER_CONTINENTALNESS_MIN = -0.08
/** Continentalness upper bound for full river allowance inland. */
export const RIVER_CONTINENTALNESS_MAX = 0.62
/** Start fading rivers out above this absolute terrain height (pre-carve), in world Y. */
export const RIVER_ALTITUDE_FADE_START = WATER_LEVEL + 10
/** Fully fade rivers out above this absolute terrain height (pre-carve), in world Y. */
export const RIVER_ALTITUDE_FADE_END = WATER_LEVEL + 34
/** Minimum river bed depth below water level in blocks. */
export const RIVER_DEPTH_MIN = 2.5
/** Maximum river bed depth below water level in blocks. */
export const RIVER_DEPTH_MAX = 7
/** Non-linear falloff for river carving intensity (1 = linear). */
export const RIVER_CARVE_POWER = 1.15
/** Minimum river factor required to classify a column as river biome. */
export const RIVER_BIOME_FACTOR_THRESHOLD = 0.44
/** Max smoothed temperature for frozen_river eligibility. */
export const RIVER_FROZEN_TEMP_MAX = 0.19
/** River factor required for frozen_river (keeps freezing mostly in channel cores). */
export const RIVER_FROZEN_CORE_FACTOR_MIN = 0.58
/** Only low-altitude rivers can become frozen_river. */
export const RIVER_FROZEN_ALTITUDE_MAX = WATER_LEVEL + 8
/** Rare-noise threshold for frozen_river clustering in cold regions. */
export const RIVER_FROZEN_RARE_NOISE_THRESHOLD = 0.84

/** Radius (blocks) around world origin (0,0) where climate is biased toward forest. */
export const SPAWN_ORIGIN_FOREST_RADIUS = 64
export const SPAWN_ORIGIN_FOREST_RADIUS_SQ = SPAWN_ORIGIN_FOREST_RADIUS * SPAWN_ORIGIN_FOREST_RADIUS
/** Continentalness to force land at origin (above ocean threshold; vanilla inland). */
export const SPAWN_ORIGIN_FOREST_CONTINENTALNESS = 0.3

/** Continentalness bands for macro terrain height (vanilla-aligned signed space [-1.2, 1]). */
export const MACRO_TERRAIN_DEEP_OCEAN_MAX = -0.7
export const MACRO_TERRAIN_NEAR_INLAND_MIN = 0.04
export const MACRO_TERRAIN_MID_INLAND_MIN = 0.5
export const MACRO_TERRAIN_FAR_INLAND_MIN = 0.9
/** Forest climate center (temp, humidity) from terrain/biomes/forest.ts. */
export const SPAWN_ORIGIN_FOREST_TEMP = 0.475
export const SPAWN_ORIGIN_FOREST_HUMIDITY = 0.7

/** Climate warp for domain rotation (Minecraft-style). */
export const CLIMATE_WARP_SCALE = 0.0014
export const CLIMATE_WARP_AMP = 42

/** Erosion noise and terrain jaggedness. */
export const EROSION_SCALE = CLIMATE_PARAM_SCALE
export const EROSION_AMPLITUDE = 7
export const EROSION_DETAIL_BOOST_MAX = 1.5
/** Erosion signed <= this starts boosting detail (jaggedness). */
export const EROSION_JAGGEDNESS_START = 0.25

/** Mountain mask and height contribution. */
export const MOUNTAIN_MASK_SCALE = 0.0022
export const MOUNTAIN_HEIGHT_SCALE = 0.008
export const MOUNTAIN_AMPLITUDE = 34
export const MOUNTAIN_THRESHOLD = 0.34
/** Width of smooth transition from no mountain to full mountain contribution. */
export const MOUNTAIN_TRANSITION_WIDTH = 0.22
export const MOUNTAIN_BIOME_HEIGHT_BOOST = 2.2
export const SNOW_BIOME_HEIGHT_BOOST = 3.8
/** Extra mountain contribution for badlands to form mesa walls/plateaus. */
export const BADLANDS_MESA_HEIGHT_BOOST = 2.9
/** Mountain-mask range where badlands valley-floor flattening starts and reaches full effect. */
export const BADLANDS_VALLEY_MASK_FLOOR_MIN = 0.08
export const BADLANDS_VALLEY_MASK_FLOOR_MAX = 0.4
/** Erosion threshold where badlands basin flattening starts (higher erosion => flatter valley floors). */
export const BADLANDS_VALLEY_EROSION_START = 0.02
/** Additional height reduction (blocks) for badlands valley floors. */
export const BADLANDS_VALLEY_DEPTH = 8.5
/** Reduces local relief in badlands valley floors so basins look flatter. */
export const BADLANDS_VALLEY_RELIEF_REDUCTION = 0.62
/** Non-core mountain-enabled biomes (forest, jungle, taiga) get reduced mountain strength. */
export const MOUNTAIN_NON_CORE_BIOME_HEIGHT_BOOST = 0.9
/** Additional height gain when the weirdness signal is in a peak band. */
export const MOUNTAIN_PEAK_BAND_BOOST = 0.7
/** Extra height gain for sharp negative-weirdness mountain ridges. */
export const MOUNTAIN_JAGGED_BOOST = 0.55
/** Extra local-relief gain for jagged mountain ridges. */
export const MOUNTAIN_JAGGED_DETAIL_BOOST = 0.3

/** Weirdness dimension for ridges. Vanilla uses [-2, 2]; we scale raw noise by this. */
export const WEIRDNESS_SCALE = 0.0016
export const WEIRDNESS_VANILLA_RANGE_SCALE = 2
export const WEIRDNESS_RIDGE_AMP = 5.8
/** Approximate center of the vanilla peaks-and-valleys ridge bands in normalized weirdness space. */
export const WEIRDNESS_PEAK_BAND_CENTER = 0.58
/** Half-width of the peak band around WEIRDNESS_PEAK_BAND_CENTER. */
export const WEIRDNESS_PEAK_BAND_HALF_WIDTH = 0.42
/** Normalized weirdness threshold where negative weirdness starts looking jagged. */
export const WEIRDNESS_JAGGED_START = 0.08
/** Extra ridge gain applied to the negative-weirdness jagged branch. */
export const WEIRDNESS_JAGGED_RIDGE_BOOST = 0.65

/** Highland band thresholds (height above water). */
export const HIGHLAND_MEADOW_MAX = WATER_LEVEL + 10
export const HIGHLAND_GROVE_MAX = WATER_LEVEL + 18
export const HIGHLAND_SNOWY_SLOPES_MAX = WATER_LEVEL + 28

/** Temperature thresholds for cold highland/upland variants. */
export const COLD_HIGHLAND_TEMP_MAX = 0.42
export const COLD_UPLAND_TEMP_MAX = 0.5

/** Minimum smoothed temperature for lukewarm mountain routing to stony peaks. */
export const LUKEWARM_MOUNTAIN_TEMP_MIN = 0.4
/** Minimum smoothed humidity for lukewarm mountain routing (savanna/forest/jungle neighborhood). */
export const LUKEWARM_MOUNTAIN_HUMIDITY_MIN = 0.35

/** Highland variant noise scale (meadow/grove/windswept/cherry). */
export const HIGHLAND_VARIANT_SCALE = 0.004

/** Humidity threshold for windswept_forest vs windswept_hills. */
export const WINDSWEPT_FOREST_HUMIDITY_MIN = 0.55

/** Height transition noise (softens height cutoffs). */
export const HEIGHT_TRANSITION_SCALE = 0.0016
export const HEIGHT_TRANSITION_AMPLITUDE = 4.5

/** Peak biome selection (frozen/jagged/stony) height range. */
export const PEAK_Y_MIN = WATER_LEVEL + 28
export const PEAK_Y_RANGE = 18
/** Minimum peak-band factor before the sharp jagged branch can win peak selection. */
export const PEAK_JAGGED_BAND_MIN = 0.5
/** Minimum jagged factor before a peak is classified as jagged. */
export const PEAK_JAGGED_FACTOR_MIN = 0.55
/** Jagged peaks prefer low erosion (sharper terrain). */
export const PEAK_JAGGED_EROSION_MAX = -0.35

/** Flatness noise frequency for terrain smoothness; shared by height and local terrain. */
export const FLAT_NOISE_SCALE = 0.01

/**
 * Multi-octave (fBm) policy for terrain detail noise (Minecraft-style).
 * Octave i has higher frequency (lacunarity^i) and lower amplitude (persistence^i).
 */
export const HEIGHT_DETAIL_OCTAVES = 3
/** Frequency multiplier per octave; each octave samples at lacunarity × previous frequency. */
export const HEIGHT_DETAIL_LACUNARITY = 2
/** Amplitude multiplier per octave; each octave contributes persistence × previous amplitude. */
export const HEIGHT_DETAIL_PERSISTENCE = 0.5
/**
 * Normalization so fBm sum stays in a similar range to single-octave noise.
 * Equal to (1 - persistence^octaves) / (1 - persistence).
 */
export const HEIGHT_DETAIL_FBM_NORMALIZE =
  (1 - Math.pow(HEIGHT_DETAIL_PERSISTENCE, HEIGHT_DETAIL_OCTAVES)) / (1 - HEIGHT_DETAIL_PERSISTENCE)

/** Default scale for feature placement noise (vegetation, decoration). Same world seed yields deterministic patches. */
export const FEATURE_PLACEMENT_NOISE_SCALE = 0.05

/**
 * Cave carving (Minecraft-aligned). Single source of truth for worker and main thread.
 * Vanilla reference: docs/VANILLA_BIOME_REFERENCE.md §6 and vanilla_terrain_cave_reference.json.
 */
/** 3D noise caves: carve where caveNoise3D(x,y,z) > threshold. Higher = less carving. */
export const CAVE_THRESHOLD = 0.56
/** Cheese caves: horizontal noise scale (x, z). Vanilla cave_cheese xz_scale 1.0; we use 0.03. */
export const CHEESE_SCALE_XZ = 0.03
/** Cheese caves: vertical noise scale (y). Vanilla y_scale 2/3 of xz; smaller = taller blobs. */
export const CHEESE_SCALE_Y = CHEESE_SCALE_XZ * (2 / 3)
/** Cheese caves: carve where cheeseNoise3D(x*scaleXZ, y*scaleY, z*scaleXZ) > threshold. Vanilla uses 0.27. */
export const CHEESE_THRESHOLD = 0.27

/** Noodle caves: noise sampling scale (higher = thinner tunnels). */
export const NOODLE_SCALE = 0.04
/** Noodle caves: carve where both ridged values (1 - |noise|) exceed this threshold. */
export const NOODLE_THRESHOLD = 0.5

/**
 * Overhang carver: density-like near-surface carving on steep slopes.
 * This approximates 3D density overhang silhouettes while keeping the 2D heightmap base terrain.
 */
/** Overhang carver horizontal sampling scale. */
export const OVERHANG_SCALE_XZ = 0.032
/** Overhang carver vertical sampling scale. */
export const OVERHANG_SCALE_Y = 0.075
/** Overhang carver base threshold (higher => fewer overhang cavities). */
export const OVERHANG_THRESHOLD = 0.69
/** Minimum local slope (max cardinal delta) required before overhang carving activates. */
export const OVERHANG_MIN_SLOPE = 4
/** Start overhang carving this many blocks below the surface. */
export const OVERHANG_MIN_DEPTH_BELOW_SURFACE = 3
/** Stop overhang carving this many blocks below the surface. */
export const OVERHANG_MAX_DEPTH_BELOW_SURFACE = 12

/**
 * Numerical stability (Far Lands): at very large |x|/|z|, floating point can degrade.
 * Use integer-based hashing for discrete decisions (feature placement); for noise sampling,
 * optionally wrap coordinates so noise inputs stay in a bounded range (e.g. ±NOISE_COORD_WRAP).
 * When implementing large-world support, call wrapNoiseCoord() before passing coords to noise.
 */
export const NOISE_COORD_WRAP = 1 << 20
