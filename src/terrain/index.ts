/**
 * Pure terrain/biome/tree logic for Web Worker chunk generation.
 * 12-stage pipeline (Minecraft-aligned): empty, structures_starts, structures_references,
 * noise, biomes, carvers, surface, features, initialize_light, light, spawn, full.
 */
import { createNoise2D, createNoise3D } from 'simplex-noise'
import type { Biome, BlockType } from '../types'
import {
  getPoiBiomeOverride,
  getPoiFlattenAt,
  POI_DEFAULT_FLATTEN_RADIUS,
  POI_DEFAULT_FLATTEN_TRANSITION_BLOCKS,
} from '../world-pois'
import type { WorldPoi } from '../world-pois'
import type { PoiFlattenAt } from '../world-pois'
import { getStructureOriginsInChunk } from './structures/origins'
import { getHouseDimensions, getVillageHouseSizeFromSeed } from './structures/templates/village'
import {
  CHUNK_SIZE,
  MIN_CAVE_DEPTH_BELOW_SURFACE,
  WATER_LEVEL,
  WORLD_HEIGHT,
  WORLD_MAX_Y,
  WORLD_MIN_Y,
} from '../constants'
import {
  BASE_HEIGHT,
  CAVE_THRESHOLD,
  CHEESE_SCALE_XZ,
  CHEESE_SCALE_Y,
  CHEESE_THRESHOLD,
  NOODLE_SCALE,
  NOODLE_THRESHOLD,
  COLD_HIGHLAND_TEMP_MAX,
  COLD_UPLAND_TEMP_MAX,
  EROSION_AMPLITUDE,
  EROSION_DETAIL_BOOST_MAX,
  EROSION_JAGGEDNESS_START,
  FLAT_NOISE_SCALE,
  HEIGHT_DETAIL_FBM_NORMALIZE,
  HEIGHT_DETAIL_LACUNARITY,
  HEIGHT_DETAIL_OCTAVES,
  HEIGHT_DETAIL_PERSISTENCE,
  HEIGHT_TRANSITION_AMPLITUDE,
  HEIGHT_TRANSITION_SCALE,
  HIGHLAND_GROVE_MAX,
  HIGHLAND_MEADOW_MAX,
  HIGHLAND_SNOWY_SLOPES_MAX,
  HIGHLAND_VARIANT_SCALE,
  LUKEWARM_MOUNTAIN_HUMIDITY_MIN,
  LUKEWARM_MOUNTAIN_TEMP_MIN,
  MOUNTAIN_AMPLITUDE,
  BADLANDS_MESA_HEIGHT_BOOST,
  BADLANDS_VALLEY_DEPTH,
  BADLANDS_VALLEY_RELIEF_REDUCTION,
  MOUNTAIN_BIOME_HEIGHT_BOOST,
  MOUNTAIN_HEIGHT_SCALE,
  MOUNTAIN_JAGGED_BOOST,
  MOUNTAIN_JAGGED_DETAIL_BOOST,
  MOUNTAIN_MASK_SCALE,
  MOUNTAIN_NON_CORE_BIOME_HEIGHT_BOOST,
  MOUNTAIN_PEAK_BAND_BOOST,
  MOUNTAIN_THRESHOLD,
  MOUNTAIN_TRANSITION_WIDTH,
  NOISE_COORD_WRAP,
  BEACH_MAX_HEIGHT,
  COAST_EDGE_MIN_COAST_BLEND_T,
  OVERHANG_MAX_DEPTH_BELOW_SURFACE,
  OVERHANG_DRAMATIC_MAX_DEPTH_BELOW_SURFACE,
  OVERHANG_DRAMATIC_MIN_DEPTH_BELOW_SURFACE,
  OVERHANG_DRAMATIC_MIN_SLOPE,
  OVERHANG_DRAMATIC_SCALE_XZ,
  OVERHANG_DRAMATIC_SCALE_Y,
  OVERHANG_DRAMATIC_THRESHOLD,
  OVERHANG_MIN_DEPTH_BELOW_SURFACE,
  OVERHANG_MIN_SLOPE,
  OVERHANG_SCALE_XZ,
  OVERHANG_SCALE_Y,
  OVERHANG_THRESHOLD,
  SNOWY_BEACH_MAX_HEIGHT,
  SNOWY_BEACH_MAX_TEMPERATURE,
  STONY_SHORE_MAX_HEIGHT,
  STONY_SHORE_MIN_SLOPE,
  RIVER_DEPTH_NOISE_SCALE,
  RIVER_NOISE_SCALE,
  RIVER_SECONDARY_NOISE_SCALE,
  RIVER_WARP_AMP,
  RIVER_WARP_SCALE,
  RIVER_WIDTH_NOISE_SCALE,
  JAGGED_PEAKS_EDGE_CHECK_RADIUS,
  PEAK_JAGGED_BAND_MIN,
  PEAK_JAGGED_EROSION_MAX,
  PEAK_JAGGED_FACTOR_MIN,
  PEAK_Y_MIN,
  PEAK_Y_RANGE,
  SPAWN_ORIGIN_FOREST_CONTINENTALNESS,
  SPAWN_ORIGIN_FOREST_HUMIDITY,
  SPAWN_ORIGIN_FOREST_RADIUS_SQ,
  SPAWN_ORIGIN_FOREST_TEMP,
  SNOW_BIOME_HEIGHT_BOOST,
  WINDSWEPT_FOREST_HUMIDITY_MIN,
} from './constants'
import {
  BADLANDS_BAND_SUBSURFACE_DEPTH,
  COASTAL_SUBSURFACE_GRAVEL_NOISE_MAX,
  COASTAL_SUBSURFACE_MAX_DEPTH,
  COASTAL_SUBSURFACE_SHALLOW_DEPTH,
  COASTAL_SUBSURFACE_STONY_STONE_NOISE_MIN,
  SURFACE_RIVER_BANK_OFFSET_X,
  SURFACE_RIVER_BANK_OFFSET_Z,
  SURFACE_RIVER_BANK_SCALE,
  SURFACE_DITHER_COAST_OFFSET_X,
  SURFACE_DITHER_COAST_OFFSET_Z,
  SURFACE_DITHER_COAST_SCALE,
  SURFACE_DITHER_LAND_OFFSET_X,
  SURFACE_DITHER_LAND_OFFSET_Z,
  SURFACE_DITHER_LAND_SCALE,
  SURFACE_FROZEN_PEAKS_BLOB_OFFSET_X,
  SURFACE_FROZEN_PEAKS_BLOB_OFFSET_Z,
  SURFACE_FROZEN_PEAKS_BLOB_SCALE,
  SURFACE_FROZEN_PEAKS_N_OFFSET_X,
  SURFACE_FROZEN_PEAKS_N_OFFSET_Z,
  SURFACE_FROZEN_PEAKS_N_SCALE,
} from './surface-constants'
import { getBadlandsBandNoise } from './badlands-band-noise'
import { getBadlandsBlockFromNoise, resolveSurfaceBlock } from './surface-resolver'
import {
  SNOW_LAYER_FLAT_SLOPE_MAX,
  SNOW_LAYER_MODERATE_SLOPE_MAX,
  SNOW_LAYER_STEEP_SLOPE_MIN,
} from './surface-constants'
import {
  BIOME_REGISTRY,
  BIOME_TERRAIN,
  getPeakBiomeByMultiNoise,
} from './biomes'
import {
  applySpawnOriginForestBias as applySpawnOriginBiomeBias,
  resolveBaseBiomeBlend,
} from './biome-source'
import { createClimateSampler } from './climate-sampler'
import { makeSeededRandom, clamp, wrapNoiseCoord } from './utils'
import {
  getBadlandsBlendFactor,
  getBadlandsValleyFactor,
  getMountainBlendStrength,
  getJaggedPeakFactor,
  getMacroTerrainOffset,
  getPeakBandFactor,
  getRidgeTerm,
  sampleFbm2D,
  smoothHeightKernel3x3,
  softenExtremeCliffHeight,
} from './height-shaping'
import {
  applyFrozenRiverHeight,
  carveRiverHeight,
  getRiverCarveFactor,
  shouldUseFrozenRiver,
  shouldUseRiverBiome,
} from './river-shaping'
import { runPipeline, createChunkContext } from './pipeline'
import { override as defaultOverride } from './override'
import {
  PIPELINE_NOP_STAGE_NAMES,
  type ChunkContext,
  type FeatureFn,
  type PipelineOverrideHook,
} from './pipeline-types'
import { createNoopStage } from './stages/noop'
import { createStageStructuresStarts } from './stages/structures-starts'
import { createStageNoise } from './stages/noise'
import { createStageBiomes } from './stages/biomes'
import { createStageCarvers } from './stages/carvers'
import { createStageSurface } from './stages/surface'
import { createStageFeatures } from './stages/features'
import { createOrderedFeatureList, getFeatureDensityForBiome } from './features/feature-registry'
import { createTreeFeature } from './features/trees'
import { createFernFeature } from './features/ferns'
import { createFlowersFeature } from './features/flowers'
import { createGroundFeature } from './features/ground'
import { createDeadBushFeature, createCactusFeature } from './features/desert-decor'
import {
  createSugarCaneFeature,
  createKelpFeature,
  createLilyPadFeature,
  createSeagrassFeature,
  createSeaPickleFeature,
} from './features/shore-vegetation'
import { createMushroomFeature } from './features/mushrooms'
import {
  createBambooFeature,
  createVineFeature,
  createSweetBerryBushFeature,
  createPumpkinFeature,
  createMelonFeature,
  createPinkPetalsFeature,
} from './features/extra-vegetation'
import { createOreFeature } from './features/ore'
import { localKey, typeToId, idToType, AIR_ID, isAirOrCarved } from './block-ids'
import {
  FOREST_DENSITY_SCALE,
  FOREST_DENSITY_THRESHOLD,
  TREE_PLACEMENT_SCALE,
  TREE_PLACEMENT_FOREST_THRESHOLD,
  TREE_PLACEMENT_WINDSWEPT_FOREST_THRESHOLD,
  TREE_PLACEMENT_JUNGLE_THRESHOLD,
  TREE_PLACEMENT_PLAINS_THRESHOLD,
  TREE_PLACEMENT_MOUNTAIN_THRESHOLD,
  TREE_PLACEMENT_SNOW_THRESHOLD,
  TREE_PLACEMENT_SNOWY_SLOPES_THRESHOLD,
  MEADOW_BEE_NEST_CHANCE,
  TREE_MAX_SLOPE,
  TREE_SHAPE_NOISE_SCALE,
  JUNGLE_TREE_SHAPE_OFFSET_X,
  JUNGLE_TREE_SHAPE_OFFSET_Z,
  getTreeShapeConfigForBiome,
  type TreeShapeConfig,
} from './tree-constants'

/** Block modification for a chunk: world coords + value. */
export type BlockModEntry = { bx: number; by: number; bz: number; value: BlockType | 'air' }

/** Stable ordering of biomes for map biome buffer encoding (index = byte value in biomeMapBuffer). */
export const ALL_BIOMES: readonly Biome[] = (Object.keys(BIOME_REGISTRY) as Biome[]).sort()

/** Result of generateChunkData: serializable chunk data for main thread to build meshes. */
export interface ChunkDataPayload {
  chunkX: number
  chunkZ: number
  heightmap: number[][]
  /**
   * Transferable heightmap (row-major): heightmapBuffer[lx + lz * CHUNK_SIZE] = surfaceY.
   * Prefer this over `heightmap` on the main thread to avoid structured-clone overhead.
   */
  heightmapBuffer?: Float32Array
  /**
   * Biome per column (row-major): biomeMapBuffer[lx + lz * CHUNK_SIZE] = index into ALL_BIOMES.
   * Used by map UI for snow, forest, desert, etc.
   */
  biomeMapBuffer?: Uint8Array
  /** Flat voxel buffer (CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE bytes). Transferable. */
  buffer: Uint8Array
  /**
   * Optional worker-generated geometry for rendering.
   * When present, the main thread can build BufferGeometries directly from these arrays.
   */
  geometryLayers?: Array<{
    /** Terrain block id (see terrain/block-ids.ts). */
    blockTypeId: number
    /** Non-indexed triangles: 3 floats per vertex. */
    position: Float32Array
    /** 3 floats per vertex. */
    normal: Float32Array
    /** 2 floats per vertex. */
    uv: Float32Array
    /**
     * Optional index buffer (when present, geometry is indexed).
     * Group ranges in chunk-apply are then expressed in index counts.
     */
    index?: Uint32Array
    /**
     * Vertex counts per cube face in BoxGeometry material order:
     * [right, left, top, bottom, front, back]. Used to set geometry groups.
     * Worker face order and UV layout must match Three.js BoxGeometry so that
     * chunk-apply can use faceIndex directly as materialIndex.
     */
    faceVertexCounts: Uint32Array
  }>
  /**
   * Optional visible block local-keys per block type (for raycast/mining/tall grass).
   * Keys are `localKey(lx, ly, lz)` using terrain's localKey convention.
   */
  visibleBlockKeysByType?: Array<{ blockTypeId: number; keys: Uint32Array }>
  /**
   * Optional request identifier used by the main thread to discard stale worker responses.
   * When present, this must be propagated unchanged from the worker request.
   */
  requestId?: number
}

/**
 * Creates the chunk generator for a given seed. Returns a function that runs the full pipeline (heightmap/biome, carve, stratigraphy, features) and produces a ChunkDataPayload. Options can tune snow accumulation height.
 */
export type OverhangProfile = 'vanilla' | 'dramatic'

export interface ChunkGeneratorOptions {
  snowAccumulationHeight?: number
  /** Overhang carving profile: 'vanilla' (subtle) or 'dramatic' (stronger cliff cavities). */
  overhangProfile?: OverhangProfile
  /** Enables optional worm caves; default false for vanilla-first cave profile. */
  enableWormCarver?: boolean
  /** Enables optional overhang carving; default false for vanilla-first cave profile. */
  enableOverhangCarver?: boolean
  /** Pre-defined POIs for biome override and fixed village/NPC/mob placement. */
  pois?: WorldPoi[]
  /** Optional hook called before/after each pipeline stage; defaults to terrain/override.ts. */
  override?: PipelineOverrideHook
}

/** Temple structure side length in blocks; must match paint-structures / stage5-structures. */
const TEMPLE_SIZE = 6
/** River warp noise offset for decorrelating X and Z warp channels. */
const RIVER_WARP_OFFSET_X = 193.7
/** River warp noise offset for decorrelating X and Z warp channels. */
const RIVER_WARP_OFFSET_Z = -89.1
/** Secondary river signal offset so confluence widening samples a different channel family. */
const RIVER_SECONDARY_OFFSET_X = 907.3
/** Secondary river signal offset so confluence widening samples a different channel family. */
const RIVER_SECONDARY_OFFSET_Z = -611.9
/** Default: keep custom worm caves disabled for a vanilla-first profile. */
const ENABLE_WORM_CARVER_DEFAULT = false
/** Default: keep custom overhang carver disabled for a vanilla-first profile. */
const ENABLE_OVERHANG_CARVER_DEFAULT = false
/** Aquifer fill: water pockets can appear below this Y threshold. */
const AQUIFER_WATER_LEVEL = WATER_LEVEL - 2
/** Aquifer lower bound to avoid flooding the deepest layers. */
const AQUIFER_MIN_Y = WATER_LEVEL - 40
/** Noise scale used by the lightweight aquifer approximation. */
const AQUIFER_NOISE_SCALE = 0.035
/** Threshold for carved cells that should be water-filled. */
const AQUIFER_WATER_THRESHOLD = 0.18
/** Disable recursive village flattening by default for stable generation. */
const ENABLE_PROCEDURAL_VILLAGE_FLATTEN = false

export function createChunkGenerator(seed: number, options?: ChunkGeneratorOptions) {
  const snowAccumulationHeight = clamp(options?.snowAccumulationHeight ?? 1, 0, 8)
  const overhangProfile: OverhangProfile = options?.overhangProfile ?? 'vanilla'
  const enableWormCarver = options?.enableWormCarver ?? ENABLE_WORM_CARVER_DEFAULT
  const enableOverhangCarver = options?.enableOverhangCarver ?? ENABLE_OVERHANG_CARVER_DEFAULT
  const pois = options?.pois ?? []
  const overrideFn = options?.override ?? defaultOverride
  const getPoiOverride = (x: number, z: number): Biome | null => getPoiBiomeOverride(pois, x, z)
  /** Set during chunk generation so getHeight can apply procedural village flatten for the current chunk. */
  let currentChunkContext: { chunkX: number; chunkZ: number } | null = null
  /** Cache of procedural village (ox, oz) centers per chunk for flatten lookup. */
  const proceduralVillageCentersCache = new Map<
    string,
    Array<{ centerX: number; centerZ: number }>
  >()

  /**
   * Creates a wrapped 2D simplex sampler so very large coordinates stay stable.
   *
   * @param seedOffset - Offset added to world seed
   * @returns Wrapped 2D noise sampler
   */
  function createWrappedNoise2D(seedOffset: number): (x: number, z: number) => number {
    const raw = createNoise2D(makeSeededRandom(seed + seedOffset))
    return (x: number, z: number) =>
      raw(wrapNoiseCoord(x, NOISE_COORD_WRAP), wrapNoiseCoord(z, NOISE_COORD_WRAP))
  }

  /**
   * Creates a wrapped 3D simplex sampler (x/z wrapped, y unchanged).
   *
   * @param seedOffset - Offset added to world seed
   * @returns Wrapped 3D noise sampler
   */
  function createWrappedNoise3D(seedOffset: number): (x: number, y: number, z: number) => number {
    const raw = createNoise3D(makeSeededRandom(seed + seedOffset))
    return (x: number, y: number, z: number) =>
      raw(wrapNoiseCoord(x, NOISE_COORD_WRAP), y, wrapNoiseCoord(z, NOISE_COORD_WRAP))
  }

  const temperatureNoise2D = createWrappedNoise2D(500)
  const humidityNoise2D = createWrappedNoise2D(600)
  const continentalNoise2D = createWrappedNoise2D(123)
  const climateWarpNoise2D = createWrappedNoise2D(31337)
  const riverNoise2D = createWrappedNoise2D(1600)
  const riverWarpNoise2D = createWrappedNoise2D(1601)
  const riverWidthNoise2D = createWrappedNoise2D(1602)
  const riverDepthNoise2D = createWrappedNoise2D(1603)
  const riverFrozenNoise2D = createWrappedNoise2D(1604)
  const detailNoise2D = createWrappedNoise2D(456)
  const mountainMaskNoise2D = createWrappedNoise2D(789)
  const mountainHeightNoise2D = createWrappedNoise2D(101)
  const highlandVariantNoise2D = createWrappedNoise2D(1717)
  const erosionNoise2D = createWrappedNoise2D(202)
  const flatNoise2D = createWrappedNoise2D(303)
  const weirdnessNoise2D = createWrappedNoise2D(909)
  const forestDensityNoise2D = createWrappedNoise2D(777)
  const treePlacementNoise2D = createWrappedNoise2D(888)
  const treeShapeNoise2D = createWrappedNoise2D(999)
  const caveNoise3D = createWrappedNoise3D(400)
  const cheeseNoise3D = createWrappedNoise3D(401)
  const noodleNoiseA3D = createWrappedNoise3D(402)
  const noodleNoiseB3D = createWrappedNoise3D(403)
  const overhangNoise3D = createWrappedNoise3D(404)
  const aquiferNoise3D = createWrappedNoise3D(405)
  const oreDensityNoise3DRaw = createWrappedNoise3D(5000)
  /** Ore density in [0, 1]. Used by ore feature for vein placement (Vanilla-style). */
  const oreDensityNoise3D = (x: number, y: number, z: number) =>
    (oreDensityNoise3DRaw(x, y, z) + 1) * 0.5
  const heightTransitionNoise2D = createNoise2D(makeSeededRandom(seed + 4242))

  /** Cache of 2D noise samplers for feature placement; key = seedOffset. Returns value in [0, 1]. */
  const featureNoiseCache = new Map<number, (x: number, z: number) => number>()
  function getFeatureNoise(seedOffset: number): (x: number, z: number) => number {
    let sampler = featureNoiseCache.get(seedOffset)
    if (sampler === undefined) {
      const noise2D = createNoise2D(makeSeededRandom(seed + seedOffset))
      sampler = (x: number, z: number) =>
        (noise2D(wrapNoiseCoord(x, NOISE_COORD_WRAP), wrapNoiseCoord(z, NOISE_COORD_WRAP)) + 1) *
        0.5
      featureNoiseCache.set(seedOffset, sampler)
    }
    return sampler
  }

  /** Use Minecraft-style multi-noise for base land biome selection. */
  const USE_MULTI_NOISE_BASE_SELECTION = true

  const SNOW_BIOMES: Biome[] = [
    'snow',
    'frozen_river',
    'snowy_beach',
    'snowy_slopes',
    'frozen_peaks',
    'jagged_peaks',
    'grove',
  ]

  function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v))
  }

  function smoothstep01(t: number): number {
    const x = clamp01(t)
    return x * x * (3 - 2 * x)
  }

  function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
  }

  function smooth5tap(center: number, n: number, s: number, e: number, w: number): number {
    return center * 0.5 + (n + s + e + w) * 0.125
  }

  const climate = createClimateSampler({
    temperatureNoise2D,
    humidityNoise2D,
    continentalNoise2D,
    climateWarpNoise2D,
    erosionNoise2D,
    weirdnessNoise2D,
  })

  function getTemperature(x: number, z: number): number {
    return climate.getTemperature01(x, z)
  }

  function getTemperatureSmoothed(x: number, z: number): number {
    // Smooths sharp biome edges that come from hard temperature thresholds.
    // Keep it lightweight: 5-tap kernel (center + 4-cardinal).
    const tC = getTemperature(x, z)
    const tN = getTemperature(x, z - 1)
    const tS = getTemperature(x, z + 1)
    const tW = getTemperature(x - 1, z)
    const tE = getTemperature(x + 1, z)
    return tC * 0.5 + (tN + tS + tW + tE) * 0.125
  }

  function getHumidity(x: number, z: number): number {
    return climate.getHumidity01(x, z)
  }

  /**
   * 5-tap smoothed humidity in [0,1] for softer biome blend transitions.
   */
  function getHumiditySmoothed(x: number, z: number): number {
    const hC = getHumidity(x, z)
    const hN = getHumidity(x, z - 1)
    const hS = getHumidity(x, z + 1)
    const hW = getHumidity(x - 1, z)
    const hE = getHumidity(x + 1, z)
    return hC * 0.5 + (hN + hS + hW + hE) * 0.125
  }

  function getTemperatureSigned(x: number, z: number): number {
    return climate.getTemperatureSigned(x, z)
  }

  function getHumiditySigned(x: number, z: number): number {
    return climate.getHumiditySigned(x, z)
  }

  function getTemperatureSignedSmoothed(x: number, z: number): number {
    return smooth5tap(
      getTemperatureSigned(x, z),
      getTemperatureSigned(x, z - 1),
      getTemperatureSigned(x, z + 1),
      getTemperatureSigned(x + 1, z),
      getTemperatureSigned(x - 1, z),
    )
  }

  function getHumiditySignedSmoothed(x: number, z: number): number {
    return smooth5tap(
      getHumiditySigned(x, z),
      getHumiditySigned(x, z - 1),
      getHumiditySigned(x, z + 1),
      getHumiditySigned(x + 1, z),
      getHumiditySigned(x - 1, z),
    )
  }

  function getMacroTerrain(x: number, z: number): number {
    return getMacroTerrainOffset(getContinentalness(x, z))
  }

  function getContinentalness(x: number, z: number): number {
    return climate.getContinentalnessSigned(x, z)
  }

  /**
   * 5-tap smoothed continentalness for softer ocean/land and coast blend transitions.
   */
  function getContinentalnessSmoothed(x: number, z: number): number {
    return smooth5tap(
      getContinentalness(x, z),
      getContinentalness(x, z - 1),
      getContinentalness(x, z + 1),
      getContinentalness(x + 1, z),
      getContinentalness(x - 1, z),
    )
  }

  function getBiomeBlendAt(x: number, z: number): { primary: Biome; secondary: Biome; t: number } {
    const biased = applySpawnOriginBiomeBias(
      x,
      z,
      getContinentalnessSmoothed(x, z),
      getTemperatureSmoothed(x, z),
      getHumiditySmoothed(x, z),
      SPAWN_ORIGIN_FOREST_RADIUS_SQ,
      {
        continentalness: SPAWN_ORIGIN_FOREST_CONTINENTALNESS,
        temperature01: SPAWN_ORIGIN_FOREST_TEMP,
        humidity01: SPAWN_ORIGIN_FOREST_HUMIDITY,
      },
    )
    return resolveBaseBiomeBlend(
      {
        continentalness: biased.continentalness,
        temperature01: biased.temperature01,
        humidity01: biased.humidity01,
        erosionSigned: getErosionSignedSmoothed(x, z),
        temperatureSigned: getTemperatureSignedSmoothed(x, z),
        humiditySigned: getHumiditySignedSmoothed(x, z),
        weirdnessSigned: getWeirdnessSmoothed(x, z),
      },
      USE_MULTI_NOISE_BASE_SELECTION,
    )
  }

  /**
   * Returns the climate/ocean base biome before river overlay.
   */
  function getBaseLandBiomeAt(x: number, z: number): Biome {
    const blend = getBiomeBlendAt(x, z)
    return blend.primary === 'ocean' ? (blend.t < 0.5 ? 'ocean' : blend.secondary) : blend.primary
  }

  /**
   * Returns domain-warped coordinates for river centerline sampling.
   */
  function getRiverWarpedPos(x: number, z: number): { xw: number; zw: number } {
    const wx = riverWarpNoise2D(x * RIVER_WARP_SCALE, z * RIVER_WARP_SCALE)
    const wz = riverWarpNoise2D(
      x * RIVER_WARP_SCALE + RIVER_WARP_OFFSET_X,
      z * RIVER_WARP_SCALE + RIVER_WARP_OFFSET_Z,
    )
    return {
      xw: x + wx * RIVER_WARP_AMP,
      zw: z + wz * RIVER_WARP_AMP,
    }
  }

  /**
   * Samples absolute river centerline signal in [0,1].
   */
  function getRiverSignalAbs(x: number, z: number): number {
    const { xw, zw } = getRiverWarpedPos(x, z)
    return Math.abs(riverNoise2D(xw * RIVER_NOISE_SCALE, zw * RIVER_NOISE_SCALE))
  }

  /**
   * Samples secondary absolute river signal in [0,1] for confluence widening.
   */
  function getRiverSecondarySignalAbs(x: number, z: number): number {
    const { xw, zw } = getRiverWarpedPos(x + RIVER_SECONDARY_OFFSET_X, z + RIVER_SECONDARY_OFFSET_Z)
    return Math.abs(
      riverNoise2D(
        (xw + RIVER_SECONDARY_OFFSET_X) * RIVER_SECONDARY_NOISE_SCALE,
        (zw + RIVER_SECONDARY_OFFSET_Z) * RIVER_SECONDARY_NOISE_SCALE,
      ),
    )
  }

  /**
   * Samples river width variation in [0,1].
   */
  function getRiverWidthNoise01(x: number, z: number): number {
    return (riverWidthNoise2D(x * RIVER_WIDTH_NOISE_SCALE, z * RIVER_WIDTH_NOISE_SCALE) + 1) * 0.5
  }

  /**
   * Samples river depth variation in [0,1].
   */
  function getRiverDepthNoise01(x: number, z: number): number {
    return (riverDepthNoise2D(x * RIVER_DEPTH_NOISE_SCALE, z * RIVER_DEPTH_NOISE_SCALE) + 1) * 0.5
  }

  /**
   * Samples rare clustering noise in [0,1] used for frozen_river selection.
   */
  function getRiverFrozenNoise01(x: number, z: number): number {
    return (riverFrozenNoise2D(x * RIVER_WIDTH_NOISE_SCALE, z * RIVER_WIDTH_NOISE_SCALE) + 1) * 0.5
  }

  /**
   * Computes river carve factor from river signals, continentalness, and pre-carve height.
   */
  function getRiverFactorAt(x: number, z: number, baseHeight: number): number {
    return getRiverCarveFactor({
      signalAbs: getRiverSignalAbs(x, z),
      secondarySignalAbs: getRiverSecondarySignalAbs(x, z),
      widthNoise01: getRiverWidthNoise01(x, z),
      continentalness: getContinentalnessSmoothed(x, z),
      baseHeight,
    })
  }

  /**
   * Returns base biome including river overlay.
   */
  function getBaseBiomeAt(x: number, z: number): Biome {
    const base = getBaseLandBiomeAt(x, z)
    if (base === 'ocean') return base
    const coastalBlend = getBiomeBlendAt(x, z)
    if (
      coastalBlend.primary === 'ocean' &&
      coastalBlend.secondary !== 'ocean' &&
      coastalBlend.t >= COAST_EDGE_MIN_COAST_BLEND_T
    )
      return base
    const heightWithoutRiver = getTerrainHeightNoRiver(x, z)
    const riverFactor = getRiverFactorAt(x, z, heightWithoutRiver)
    if (!shouldUseRiverBiome(base, riverFactor)) return base
    const carvedHeight = carveRiverHeight(heightWithoutRiver, riverFactor, getRiverDepthNoise01(x, z))
    const frozen = shouldUseFrozenRiver({
      temperature01: getTemperatureSmoothed(x, z),
      riverFactor,
      carvedHeight,
      rareNoise01: getRiverFrozenNoise01(x, z),
    })
    return frozen ? 'frozen_river' : 'river'
  }

  function getErosionSigned(x: number, z: number): number {
    return climate.getErosionSigned(x, z)
  }

  function getErosionSignedSmoothed(x: number, z: number): number {
    return smooth5tap(
      getErosionSigned(x, z),
      getErosionSigned(x, z - 1),
      getErosionSigned(x, z + 1),
      getErosionSigned(x + 1, z),
      getErosionSigned(x - 1, z),
    )
  }

  function getErosion(x: number, z: number): number {
    const n = (getErosionSigned(x, z) + 1) * 0.5
    const t = smoothstep01(n)
    return t * EROSION_AMPLITUDE
  }

  function getWeirdness(x: number, z: number): number {
    return climate.getWeirdnessSigned(x, z)
  }

  function getWeirdnessSmoothed(x: number, z: number): number {
    return smooth5tap(
      getWeirdness(x, z),
      getWeirdness(x, z - 1),
      getWeirdness(x, z + 1),
      getWeirdness(x + 1, z),
      getWeirdness(x - 1, z),
    )
  }

  function getPeakY01(topY: number): number {
    return clamp01((topY - PEAK_Y_MIN) / PEAK_Y_RANGE)
  }

  function getHeightTransitionOffset(x: number, z: number): number {
    return (
      heightTransitionNoise2D(x * HEIGHT_TRANSITION_SCALE, z * HEIGHT_TRANSITION_SCALE) *
      HEIGHT_TRANSITION_AMPLITUDE
    )
  }

  /**
   * Returns true when a mountain/snow chain sits in a lukewarm climate neighborhood.
   * Used to route warm highlands toward stony peaks and non-snowy slope biomes.
   */
  function isLukewarmMountainContext(x: number, z: number): boolean {
    return (
      getTemperatureSmoothed(x, z) >= LUKEWARM_MOUNTAIN_TEMP_MIN &&
      getHumiditySmoothed(x, z) >= LUKEWARM_MOUNTAIN_HUMIDITY_MIN
    )
  }

  /**
   * Terrain height at (x,z) before river carving.
   * Blends biome terrain params from the land/ocean biome blend for smooth transitions.
   */
  function getTerrainHeightNoRiver(x: number, z: number): number {
    const blend = getBiomeBlendAt(x, z)
    const pA = BIOME_TERRAIN[blend.primary]
    const pB = BIOME_TERRAIN[blend.secondary]
    const t = blend.t
    const mountainBlendStrength = getMountainBlendStrength(blend.primary, blend.secondary, t)
    const baseOffset = lerp(pA.baseOffset, pB.baseOffset, t)
    const detailAmp = lerp(pA.detailAmp, pB.detailAmp, t)
    const detailFreq = lerp(pA.detailFreq, pB.detailFreq, t)
    const flatness = lerp(pA.flatness, pB.flatness, t)
    const mountainAllowedFactor =
      (pA.mountainAllowed ? 1 : 0) * (1 - t) + (pB.mountainAllowed ? 1 : 0) * t

    const macro = getMacroTerrain(x, z)

    const n = sampleFbm2D({
      x,
      z,
      baseFrequency: detailFreq,
      octaves: HEIGHT_DETAIL_OCTAVES,
      lacunarity: HEIGHT_DETAIL_LACUNARITY,
      persistence: HEIGHT_DETAIL_PERSISTENCE,
      normalize: HEIGHT_DETAIL_FBM_NORMALIZE,
      noise2D: detailNoise2D,
    })
    const flat = flatNoise2D(x * FLAT_NOISE_SCALE, z * FLAT_NOISE_SCALE)
    const smooth = (flat + 1) * 0.5
    let effectiveAmp = detailAmp * (flatness + (1 - flatness) * smooth)
    const erosionSigned = getErosionSigned(x, z)
    const mountainMask = (mountainMaskNoise2D(x * MOUNTAIN_MASK_SCALE, z * MOUNTAIN_MASK_SCALE) + 1) * 0.5
    const badlandsBlendFactor = getBadlandsBlendFactor(blend.primary, blend.secondary, t)
    const badlandsValleyFactor = getBadlandsValleyFactor(
      badlandsBlendFactor,
      mountainMask,
      erosionSigned,
    )
    const jaggednessT = smoothstep01(
      (-erosionSigned - EROSION_JAGGEDNESS_START) / (1 - EROSION_JAGGEDNESS_START),
    )
    const weirdnessSigned = getWeirdness(x, z)
    const peakBandFactor = getPeakBandFactor(weirdnessSigned)
    const jaggedPeakFactor = getJaggedPeakFactor(weirdnessSigned)
    effectiveAmp *=
      1 +
      jaggednessT * (EROSION_DETAIL_BOOST_MAX - 1) +
      jaggedPeakFactor * MOUNTAIN_JAGGED_DETAIL_BOOST
    effectiveAmp *= 1 - badlandsValleyFactor * BADLANDS_VALLEY_RELIEF_REDUCTION
    const local = n * effectiveAmp

    let mountain = 0
    if (mountainAllowedFactor > 0) {
      const tMaskSmooth = smoothstep01(
        (mountainMask - MOUNTAIN_THRESHOLD) / Math.max(MOUNTAIN_TRANSITION_WIDTH, 1e-6),
      )
      const tMaskRamp = clamp01((mountainMask - MOUNTAIN_THRESHOLD) / (1 - MOUNTAIN_THRESHOLD))
      if (tMaskSmooth > 0) {
        const m =
          (mountainHeightNoise2D(x * MOUNTAIN_HEIGHT_SCALE, z * MOUNTAIN_HEIGHT_SCALE) + 1) * 0.5
        const boostA =
          blend.primary === 'mountain'
            ? MOUNTAIN_BIOME_HEIGHT_BOOST
            : blend.primary === 'snow'
              ? SNOW_BIOME_HEIGHT_BOOST
              : blend.primary === 'badlands'
                ? BADLANDS_MESA_HEIGHT_BOOST
              : pA.mountainAllowed
                ? MOUNTAIN_NON_CORE_BIOME_HEIGHT_BOOST
                : 0
        const boostB =
          blend.secondary === 'mountain'
            ? MOUNTAIN_BIOME_HEIGHT_BOOST
            : blend.secondary === 'snow'
              ? SNOW_BIOME_HEIGHT_BOOST
              : blend.secondary === 'badlands'
                ? BADLANDS_MESA_HEIGHT_BOOST
              : pB.mountainAllowed
                ? MOUNTAIN_NON_CORE_BIOME_HEIGHT_BOOST
                : 0
        const boost = lerp(boostA, boostB, t)
        const mountainShapeBoost =
          1 + peakBandFactor * MOUNTAIN_PEAK_BAND_BOOST + jaggedPeakFactor * MOUNTAIN_JAGGED_BOOST
        mountain =
          tMaskSmooth *
          tMaskRamp *
          m *
          MOUNTAIN_AMPLITUDE *
          boost *
          mountainShapeBoost *
          mountainAllowedFactor *
          mountainBlendStrength
      }
    }

    const ridgeTerm = getRidgeTerm(weirdnessSigned, mountainAllowedFactor)
    const valleyDepth = badlandsValleyFactor * BADLANDS_VALLEY_DEPTH
    return BASE_HEIGHT + baseOffset + macro + local + mountain + ridgeTerm - getErosion(x, z) - valleyDepth
  }

  /**
   * Terrain height at (x,z) after river carving.
   */
  function getHeightForBase(x: number, z: number): number {
    const baseHeight = getTerrainHeightNoRiver(x, z)
    const riverFactor = getRiverFactorAt(x, z, baseHeight)
    const carvedHeight = carveRiverHeight(baseHeight, riverFactor, getRiverDepthNoise01(x, z))
    const frozen = shouldUseFrozenRiver({
      temperature01: getTemperatureSmoothed(x, z),
      riverFactor,
      carvedHeight,
      rareNoise01: getRiverFrozenNoise01(x, z),
    })
    return applyFrozenRiverHeight(carvedHeight, frozen)
  }

  /**
   * Max cardinal slope around (x, z) using final terrain height.
   * Used for coastal edge biome classification (stony_shore vs beach).
   */
  function getCoastalSlope(x: number, z: number, centerY: number): number {
    const n = getHeight(x, z - 1)
    const s = getHeight(x, z + 1)
    const w = getHeight(x - 1, z)
    const e = getHeight(x + 1, z)
    return Math.max(
      Math.abs(n - centerY),
      Math.abs(s - centerY),
      Math.abs(w - centerY),
      Math.abs(e - centerY),
    )
  }

  /**
   * Resolves coastal edge biomes (beach, stony_shore, snowy_beach) near ocean boundaries.
   * Runs after highland resolution so inland mountain/snow logic is preserved away from coasts.
   */
  function resolveCoastalEdgeBiome(
    base: Biome,
    resolved: Biome,
    x: number,
    z: number,
    topY: number,
  ): Biome {
    if (resolved === 'ocean' || resolved === 'river' || resolved === 'frozen_river') return resolved

    const blend = getBiomeBlendAt(x, z)
    if (blend.primary !== 'ocean' || blend.secondary === 'ocean') return resolved
    if (blend.t < COAST_EDGE_MIN_COAST_BLEND_T) return resolved

    const temp = getTemperatureSmoothed(x, z)
    if (topY <= SNOWY_BEACH_MAX_HEIGHT && temp <= SNOWY_BEACH_MAX_TEMPERATURE)
      return 'snowy_beach'

    const slope = getCoastalSlope(x, z, topY)
    if ((base === 'mountain' || slope >= STONY_SHORE_MIN_SLOPE) && topY <= STONY_SHORE_MAX_HEIGHT)
      return 'stony_shore'

    if (base === 'badlands' || base === 'mushroom_fields') return resolved
    if (topY <= BEACH_MAX_HEIGHT) return 'beach'
    return resolved
  }

  /**
   * Returns true when any cardinal neighbor falls below the snowy_slopes band.
   * Used to keep a guaranteed slope buffer so jagged peaks do not touch low highlands directly.
   */
  function hasLowNeighborForJaggedTransition(x: number, z: number): boolean {
    for (let d = 1; d <= JAGGED_PEAKS_EDGE_CHECK_RADIUS; d++) {
      const n = getHeight(x, z - d) + getHeightTransitionOffset(x, z - d)
      const s = getHeight(x, z + d) + getHeightTransitionOffset(x, z + d)
      const w = getHeight(x - d, z) + getHeightTransitionOffset(x - d, z)
      const e = getHeight(x + d, z) + getHeightTransitionOffset(x + d, z)
      if (Math.min(n, s, w, e) < HIGHLAND_SNOWY_SLOPES_MAX) return true
    }
    return false
  }

  function getResolvedBiomeFromHeight(base: Biome, height: number, x: number, z: number): Biome {
    const hFuzzy = height + getHeightTransitionOffset(x, z)
    if (base === 'river' || base === 'frozen_river') return base
    const lukewarmMountain =
      (base === 'mountain' || base === 'snow') && isLukewarmMountainContext(x, z)

    let resolved: Biome
    if (base !== 'mountain' && base !== 'snow') {
      const temp = getTemperatureSmoothed(x, z)
      if (temp <= COLD_HIGHLAND_TEMP_MAX) {
        if (hFuzzy >= HIGHLAND_SNOWY_SLOPES_MAX) resolved = 'snowy_slopes'
        else if (hFuzzy >= HIGHLAND_GROVE_MAX) resolved = 'grove'
        else resolved = base
      } else if (temp <= COLD_UPLAND_TEMP_MAX && hFuzzy >= HIGHLAND_MEADOW_MAX + 4) {
        resolved =
          getHumidity(x, z) >= WINDSWEPT_FOREST_HUMIDITY_MIN
            ? 'windswept_forest'
            : 'windswept_hills'
      } else {
        resolved = base
      }
    } else if (lukewarmMountain && hFuzzy < HIGHLAND_MEADOW_MAX) {
      resolved = getHumidity(x, z) >= WINDSWEPT_FOREST_HUMIDITY_MIN ? 'forest' : 'savanna'
    } else if (lukewarmMountain && hFuzzy < HIGHLAND_SNOWY_SLOPES_MAX) {
      resolved =
        getHumidity(x, z) >= WINDSWEPT_FOREST_HUMIDITY_MIN
          ? 'windswept_forest'
          : 'windswept_hills'
    } else if (hFuzzy < HIGHLAND_MEADOW_MAX) {
      const v =
        (highlandVariantNoise2D(x * HIGHLAND_VARIANT_SCALE, z * HIGHLAND_VARIANT_SCALE) + 1) * 0.5
      if (v < 0.25)
        resolved =
          getHumidity(x, z) >= WINDSWEPT_FOREST_HUMIDITY_MIN
          ? 'windswept_forest'
          : 'windswept_hills'
      else if (v < 0.5) resolved = 'windswept_gravelly_hills'
      else if (v < 0.75) resolved = 'cherry_grove'
      else resolved = 'meadow'
    } else if (hFuzzy < HIGHLAND_GROVE_MAX) {
      const v =
        (highlandVariantNoise2D(x * HIGHLAND_VARIANT_SCALE, z * HIGHLAND_VARIANT_SCALE) + 1) * 0.5
      resolved = v > 0.82 ? 'windswept_forest' : 'grove'
    } else if (hFuzzy < HIGHLAND_SNOWY_SLOPES_MAX) {
      resolved = 'snowy_slopes'
    } else if (lukewarmMountain) {
      resolved = 'stony_peaks'
    } else {
      const weirdnessSigned = getWeirdnessSmoothed(x, z)
      const peakBandFactor = getPeakBandFactor(weirdnessSigned)
      const jaggedPeakFactor = getJaggedPeakFactor(weirdnessSigned)
      const erosionSigned = getErosionSignedSmoothed(x, z)
      if (
        peakBandFactor >= PEAK_JAGGED_BAND_MIN &&
        jaggedPeakFactor >= PEAK_JAGGED_FACTOR_MIN &&
        erosionSigned <= PEAK_JAGGED_EROSION_MAX
      )
        resolved = 'jagged_peaks'
      else
        resolved = getPeakBiomeByMultiNoise({
          continentalness: getContinentalness(x, z),
          erosion: erosionSigned,
          temperature: getTemperatureSignedSmoothed(x, z),
          humidity: getHumiditySignedSmoothed(x, z),
          weirdness: weirdnessSigned,
          y: getPeakY01(hFuzzy),
        })
    }

    if (resolved === 'jagged_peaks' && hasLowNeighborForJaggedTransition(x, z)) {
      resolved = 'snowy_slopes'
    }

    return resolveCoastalEdgeBiome(base, resolved, x, z, height)
  }

  function getHeightUncached(x: number, z: number): number {
    const h00 = getHeightForBase(x - 1, z - 1)
    const h01 = getHeightForBase(x - 1, z)
    const h02 = getHeightForBase(x - 1, z + 1)
    const h10 = getHeightForBase(x, z - 1)
    const h11 = getHeightForBase(x, z)
    const h12 = getHeightForBase(x, z + 1)
    const h20 = getHeightForBase(x + 1, z - 1)
    const h21 = getHeightForBase(x + 1, z)
    const h22 = getHeightForBase(x + 1, z + 1)
    const smoothedH = smoothHeightKernel3x3({
      center: h11,
      north: h10,
      south: h12,
      east: h21,
      west: h01,
      northWest: h00,
      northEast: h20,
      southWest: h02,
      southEast: h22,
    })
    const softenedH = softenExtremeCliffHeight({
      center: h11,
      north: h10,
      south: h12,
      east: h21,
      west: h01,
      smoothed: smoothedH,
    })
    return Math.floor(clamp(softenedH, WORLD_MIN_Y, WORLD_MAX_Y))
  }

  /**
   * Height at (x, z) with only POI flatten (no procedural village flatten).
   * Used to resolve procedural village centers without circular dependency.
   */
  function getHeightOnlyPoi(x: number, z: number): number {
    const flatten = getPoiFlattenAt(pois, x, z)
    if (flatten === null) return getHeightUncached(x, z)
    const naturalCenterY = getHeightUncached(flatten.centerX, flatten.centerZ)
    const centerY = Math.max(naturalCenterY, WATER_LEVEL)
    const dx = x - flatten.centerX
    const dz = z - flatten.centerZ
    const d = Math.sqrt(dx * dx + dz * dz)
    const flatEnd = flatten.radius - flatten.transitionBlocks
    let t: number
    if (d <= flatEnd) t = 0
    else if (d >= flatten.radius) t = 1
    else t = smoothstep01((d - flatEnd) / flatten.transitionBlocks)
    const natural = getHeightUncached(x, z)
    return clamp(lerp(centerY, natural, t), WORLD_MIN_Y, WORLD_MAX_Y)
  }

  /** Resolved biome using POI-only height; used when computing procedural village centers. */
  function getResolvedBiomeOnlyPoi(x: number, z: number): Biome {
    const override = getPoiOverride(x, z)
    if (override !== null) return override
    const base = getBaseBiomeAt(x, z)
    const h = getHeightOnlyPoi(x, z)
    return getResolvedBiomeFromHeight(base, h, x, z)
  }

  /**
   * Returns procedural village (ox, oz) centers that can affect the given chunk.
   * Uses POI-only height to avoid circular dependency with getHeight.
   */
  function getProceduralVillageCentersForChunk(
    chunkX: number,
    chunkZ: number,
  ): Array<{ centerX: number; centerZ: number }> {
    const key = `${chunkX},${chunkZ}`
    let centers = proceduralVillageCentersCache.get(key)
    if (centers !== undefined) return centers
    const out: Array<{ centerX: number; centerZ: number }> = []
    for (let dcx = -1; dcx <= 1; dcx++) {
      for (let dcz = -1; dcz <= 1; dcz++) {
        const origins = getStructureOriginsInChunk(
          seed,
          chunkX + dcx,
          chunkZ + dcz,
          getHeightOnlyPoi,
          getResolvedBiomeOnlyPoi,
        )
        for (const o of origins) {
          if (o.type === 'village') out.push({ centerX: o.ox, centerZ: o.oz })
        }
      }
    }
    proceduralVillageCentersCache.set(key, out)
    return out
  }

  /**
   * Returns flatten params if (x, z) lies inside a procedural village flatten area.
   * Uses POI default radius/transition so the area around every village is always flattened.
   */
  function getProceduralFlattenAt(
    x: number,
    z: number,
    chunkX: number,
    chunkZ: number,
  ): PoiFlattenAt | null {
    const centers = getProceduralVillageCentersForChunk(chunkX, chunkZ)
    const radius = POI_DEFAULT_FLATTEN_RADIUS
    const radiusSq = radius * radius
    let best: { centerX: number; centerZ: number; distSq: number } | null = null
    for (const c of centers) {
      const dx = x - c.centerX
      const dz = z - c.centerZ
      const distSq = dx * dx + dz * dz
      if (distSq <= radiusSq && (best === null || distSq < best.distSq)) {
        best = { centerX: c.centerX, centerZ: c.centerZ, distSq }
      }
    }
    if (best === null) return null
    return {
      centerX: best.centerX,
      centerZ: best.centerZ,
      radius: POI_DEFAULT_FLATTEN_RADIUS,
      transitionBlocks: POI_DEFAULT_FLATTEN_TRANSITION_BLOCKS,
    }
  }

  /**
   * Effective flatten at (x, z): POI or procedural village, whichever center is closer.
   * Procedural flatten is only considered when currentChunkContext is set (during chunk generation).
   */
  function getFlattenAt(x: number, z: number): PoiFlattenAt | null {
    const poiFlatten = getPoiFlattenAt(pois, x, z)
    const procFlatten =
      ENABLE_PROCEDURAL_VILLAGE_FLATTEN && currentChunkContext !== null
        ? getProceduralFlattenAt(x, z, currentChunkContext.chunkX, currentChunkContext.chunkZ)
        : null
    if (poiFlatten !== null && procFlatten !== null) {
      const dPoi = (x - poiFlatten.centerX) ** 2 + (z - poiFlatten.centerZ) ** 2
      const dProc = (x - procFlatten.centerX) ** 2 + (z - procFlatten.centerZ) ** 2
      return dPoi <= dProc ? poiFlatten : procFlatten
    }
    return poiFlatten ?? procFlatten
  }

  /**
   * Height at (x, z) with POI and procedural village flatten applied: inside any village
   * flatten area, blends from center height to natural height. Village surface is
   * always solid: when the center would be underwater, the platform is raised to at least WATER_LEVEL.
   */
  function getHeight(x: number, z: number): number {
    const flatten = getFlattenAt(x, z)
    if (flatten === null) return getHeightUncached(x, z)
    const naturalCenterY = getHeightUncached(flatten.centerX, flatten.centerZ)
    const centerY = Math.max(naturalCenterY, WATER_LEVEL)
    const dx = x - flatten.centerX
    const dz = z - flatten.centerZ
    const d = Math.sqrt(dx * dx + dz * dz)
    const flatEnd = flatten.radius - flatten.transitionBlocks
    let t: number
    if (d <= flatEnd) t = 0
    else if (d >= flatten.radius) t = 1
    else t = smoothstep01((d - flatEnd) / flatten.transitionBlocks)
    const natural = getHeightUncached(x, z)
    return clamp(lerp(centerY, natural, t), WORLD_MIN_Y, WORLD_MAX_Y)
  }

  function getResolvedBiome(x: number, z: number): Biome {
    const override = getPoiOverride(x, z)
    if (override !== null) return override
    const base = getBaseBiomeAt(x, z)
    const h = getHeight(x, z)
    return getResolvedBiomeFromHeight(base, h, x, z)
  }

  /** Higher-frequency noise for per-tree shape (height, leaf size, density). Ensures nearby trees get clearly different values. */
  function treeShapeSeedValue(x: number, z: number): number {
    const n = treeShapeNoise2D(x * TREE_SHAPE_NOISE_SCALE, z * TREE_SHAPE_NOISE_SCALE)
    return (n + 1) * 0.5
  }

  function getForestDensity(wx: number, wz: number): number {
    return forestDensityNoise2D(wx * FOREST_DENSITY_SCALE, wz * FOREST_DENSITY_SCALE)
  }

  function getTreePlacement(wx: number, wz: number): number {
    return treePlacementNoise2D(wx * TREE_PLACEMENT_SCALE, wz * TREE_PLACEMENT_SCALE)
  }

  function getTreePlacementPass(
    wx: number,
    wz: number,
    biome: Biome,
    treeCache: Map<string, number>,
    forestCache: Map<string, number>,
  ): boolean {
    const placement = getTreePlacementCached(wx, wz, treeCache)
    const registryDensity = getFeatureDensityForBiome('trees', biome)
    if (registryDensity !== undefined) {
      const calibratedDensity = clamp01(
        registryDensity *
          (biome === 'forest'
            ? 0.85
            : biome === 'jungle'
              ? 0.88
              : biome === 'meadow'
                ? 1.2
                : biome === 'savanna'
                  ? 1.1
                  : 1),
      )
      if (
        (biome === 'forest' || biome === 'jungle' || biome === 'windswept_forest') &&
        getForestDensityCached(wx, wz, forestCache) <= FOREST_DENSITY_THRESHOLD
      )
        return false
      return placement > 1 - calibratedDensity
    }
    if (biome === 'forest') {
      if (getForestDensityCached(wx, wz, forestCache) <= FOREST_DENSITY_THRESHOLD) return false
      return placement > TREE_PLACEMENT_FOREST_THRESHOLD
    }
    if (biome === 'jungle') {
      if (getForestDensityCached(wx, wz, forestCache) <= FOREST_DENSITY_THRESHOLD) return false
      return placement > TREE_PLACEMENT_JUNGLE_THRESHOLD
    }
    if (biome === 'mountain') return placement > TREE_PLACEMENT_MOUNTAIN_THRESHOLD
    if (biome === 'plains' || biome === 'meadow' || biome === 'savanna' || biome === 'cherry_grove')
      return placement > TREE_PLACEMENT_PLAINS_THRESHOLD
    if (biome === 'windswept_forest') {
      if (getForestDensityCached(wx, wz, forestCache) <= FOREST_DENSITY_THRESHOLD) return false
      return placement > TREE_PLACEMENT_WINDSWEPT_FOREST_THRESHOLD
    }
    if (biome === 'snow' || biome === 'grove') return placement > TREE_PLACEMENT_SNOW_THRESHOLD
    if (biome === 'snowy_slopes') return placement > TREE_PLACEMENT_SNOWY_SLOPES_THRESHOLD
    return false
  }

  function getTreePlacementCached(wx: number, wz: number, cache: Map<string, number>): number {
    const k = `${wx},${wz}`
    let v = cache.get(k)
    if (v === undefined) {
      v = getTreePlacement(wx, wz)
      cache.set(k, v)
    }
    return v
  }

  function getForestDensityCached(wx: number, wz: number, cache: Map<string, number>): number {
    const k = `${wx},${wz}`
    let v = cache.get(k)
    if (v === undefined) {
      v = getForestDensity(wx, wz)
      cache.set(k, v)
    }
    return v
  }

  function isLocalTreeMax(wx: number, wz: number, treeCache: Map<string, number>): boolean {
    const center = getTreePlacementCached(wx, wz, treeCache)
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue
        if (getTreePlacementCached(wx + dx, wz + dz, treeCache) >= center) return false
      }
    return true
  }

  function isTerrainFlatEnough(wx: number, wz: number): boolean {
    const h = getHeight(wx, wz)
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ])
      if (Math.abs(getHeight(wx + dx, wz + dz) - h) > TREE_MAX_SLOPE) return false
    return true
  }

  /**
   * Returns whether (wx, wz) lies inside any village or temple structure footprint
   * that will be placed in this chunk, so we can skip placing trees there.
   * Uses ctx.structureOrigins when set (by structures_starts stage); otherwise falls back to cache.
   */
  function isInStructureFootprint(
    ctx: import('./pipeline-types').ChunkContext,
    wx: number,
    wz: number,
  ): boolean {
    const origins = ctx.structureOrigins ?? []
    for (const origin of origins) {
      if (origin.type === 'village') {
        const houseSize =
          origin.houseSize ?? getVillageHouseSizeFromSeed(seed, origin.ox, origin.oz)
        const { widthX, widthZ } = getHouseDimensions(origin.ox, origin.oz, houseSize)
        const halfX = Math.floor((widthX - 1) / 2)
        const halfZ = Math.floor((widthZ - 1) / 2)
        const minX = origin.ox - halfX
        const maxX = minX + widthX - 1
        const minZ = origin.oz - halfZ
        const maxZ = minZ + widthZ - 1
        if (wx >= minX && wx <= maxX && wz >= minZ && wz <= maxZ) return true
      } else {
        const minX = origin.ox - Math.floor(TEMPLE_SIZE / 2)
        const minZ = origin.oz - Math.floor(TEMPLE_SIZE / 2)
        if (wx >= minX && wx < minX + TEMPLE_SIZE && wz >= minZ && wz < minZ + TEMPLE_SIZE)
          return true
      }
    }
    return false
  }

  function shouldPlaceTree(
    ctx: import('./pipeline-types').ChunkContext,
    wx: number,
    wz: number,
    treeCache: Map<string, number>,
    forestCache: Map<string, number>,
  ): boolean {
    const lx = wx - ctx.worldX
    const lz = wz - ctx.worldZ
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return false
    if (isInStructureFootprint(ctx, wx, wz)) return false
    const biome = ctx.biomeMap[lx][lz]
    const topY = ctx.heightmap[lx][lz]
    if (biome === 'desert') return false
    if (biome === 'snow' || biome === 'grove') return false
    if (topY < WATER_LEVEL) return false
    if (biome === 'mountain' && topY >= WATER_LEVEL + 18) return false
    if (
      biome === 'stony_peaks' ||
      biome === 'frozen_peaks' ||
      biome === 'jagged_peaks' ||
      biome === 'windswept_hills' ||
      biome === 'windswept_gravelly_hills'
    )
      return false
    const surfaceLy = topY - WORLD_MIN_Y
    const surfaceId = ctx.voxelMap[localKey(lx, surfaceLy, lz)]
    const surface = surfaceId !== undefined ? idToType(surfaceId) : 'air'
    const allowedSurface =
      surface === 'grass' ||
      surface === 'grass_snow' ||
      surface === 'grass_savanna' ||
      surface === 'dirt' ||
      (biome === 'snowy_slopes' && surface === 'snow') ||
      (biome === 'old_growth_taiga' && surface === 'podzol')
    if (!allowedSurface) return false
    if (!isTerrainFlatEnough(wx, wz)) return false
    if (!getTreePlacementPass(wx, wz, biome, treeCache, forestCache)) return false
    if (!isLocalTreeMax(wx, wz, treeCache)) return false
    return true
  }

  function shouldPlaceLeafAtCorner(
    wx: number,
    wz: number,
    lx: number,
    lz: number,
    shapeOffsetX = 0,
    shapeOffsetZ = 0,
  ): boolean {
    return treeShapeSeedValue(wx + lx + shapeOffsetX, wz + lz + shapeOffsetZ) >= 0.5
  }

  function getTreeShapeConfig(biome: Biome): TreeShapeConfig {
    return getTreeShapeConfigForBiome(biome)
  }

  function getIntInRange(min: number, max: number, sample: number): number {
    const rangeMin = Math.min(min, max)
    const rangeMax = Math.max(min, max)
    const span = rangeMax - rangeMin + 1
    const index = Math.min(span - 1, Math.floor(sample * span))
    return rangeMin + index
  }

  function getFloatInRange(min: number, max: number, sample: number): number {
    const rangeMin = Math.min(min, max)
    const rangeMax = Math.max(min, max)
    return rangeMin + sample * (rangeMax - rangeMin)
  }

  function clampValue(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }

  function leafNoiseValue(wx: number, wz: number, dx: number, dy: number, dz: number): number {
    const sampleX = wx + dx * 17 + dy * 31
    const sampleZ = wz + dz * 17 - dy * 19
    return treeShapeSeedValue(sampleX, sampleZ)
  }

  function getTreeBlocks(
    wx: number,
    baseY: number,
    wz: number,
    biome: Biome,
  ): {
    wood: Array<{ x: number; y: number; z: number }>
    leaves: Array<{ x: number; y: number; z: number }>
    beeNests: Array<{ x: number; y: number; z: number }>
  } {
    const wood: Array<{ x: number; y: number; z: number }> = []
    const leaves: Array<{ x: number; y: number; z: number }> = []
    const beeNests: Array<{ x: number; y: number; z: number }> = []
    const shape = getTreeShapeConfig(biome)
    const shapeOx = biome === 'jungle' ? JUNGLE_TREE_SHAPE_OFFSET_X : 0
    const shapeOz = biome === 'jungle' ? JUNGLE_TREE_SHAPE_OFFSET_Z : 0
    const treeSeed = (dx: number, dz: number) =>
      treeShapeSeedValue(wx + dx + shapeOx, wz + dz + shapeOz)
    const giantRoll = treeSeed(83, -79)
    const isGiant = giantRoll < shape.giantChance
    const trunkHeight =
      getIntInRange(shape.trunkMin, shape.trunkMax, treeSeed(19, -23)) +
      (isGiant ? getIntInRange(1, shape.giantTrunkBonusMax, treeSeed(-97, 101)) : 0)
    const leafRadius =
      getIntInRange(shape.leafRadiusMin, shape.leafRadiusMax, treeSeed(-31, 13)) +
      (isGiant ? getIntInRange(1, shape.giantLeafRadiusBonusMax, treeSeed(61, 67)) : 0)
    const leafHeight =
      getIntInRange(shape.leafHeightMin, shape.leafHeightMax, treeSeed(7, 37)) +
      (isGiant ? getIntInRange(1, shape.giantLeafHeightBonusMax, treeSeed(-73, -89)) : 0)
    const leafDensity =
      getFloatInRange(shape.leafDensityMin, shape.leafDensityMax, treeSeed(-41, -29)) +
      (isGiant ? getFloatInRange(0, shape.giantDensityBonusMax, treeSeed(109, -113)) : 0)
    const canopyStyleSample = treeSeed(59, -47)
    const topY = baseY + trunkHeight
    const canopyCenterY = topY + Math.floor(leafHeight * 0.5)
    const maxLeafDistSq = (leafRadius + 0.5) * (leafRadius + 0.5)
    for (let h = 1; h <= trunkHeight; h++) wood.push({ x: wx, y: baseY + h, z: wz })
    for (let dy = 0; dy < leafHeight; dy++) {
      const y = topY + dy
      const layerT = leafHeight <= 1 ? 1 : dy / (leafHeight - 1)
      let isCone: boolean
      let isWide: boolean
      let isFlatTop: boolean
      let isUmbrella: boolean
      if (biome === 'jungle') {
        const j = canopyStyleSample
        isCone = j < 0.2
        isWide = j >= 0.4 && j < 0.6
        isFlatTop = j >= 0.6 && j < 0.8
        isUmbrella = j >= 0.8
      } else {
        isCone = canopyStyleSample < 0.33
        isWide = canopyStyleSample >= 0.66
        isFlatTop = false
        isUmbrella = false
      }
      let r = leafRadius
      if (isCone) {
        r = Math.max(0, leafRadius - Math.floor(layerT * (leafRadius + 1)))
      } else if (isFlatTop) {
        const mid = leafHeight * 0.5
        r =
          dy < mid
            ? leafRadius
            : Math.max(
                0,
                leafRadius - 1 - Math.floor(((dy - mid) / (leafHeight - mid)) * leafRadius),
              )
      } else if (isUmbrella) {
        r = layerT >= 0.5 ? leafRadius : Math.max(0, Math.floor(leafRadius * layerT * 2))
      } else if (isWide) {
        const extra = dy < Math.ceil(leafHeight * 0.5) ? 1 : 0
        r = leafRadius + extra - (dy === leafHeight - 1 ? 1 : 0)
      } else {
        r = leafRadius - (layerT > 0.8 ? 1 : 0)
      }
      r = Math.max(0, r)
      const densityBias = isCone
        ? -0.12 * layerT
        : isWide
          ? 0.08 * (1 - layerT)
          : isFlatTop
            ? 0.05 * (1 - layerT)
            : isUmbrella
              ? -0.05 * (1 - layerT)
              : 0
      const effectiveLeafDensity = clampValue(leafDensity + densityBias, 0.35, 0.98)
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (dx === 0 && dz === 0 && dy === 0) continue
          if (
            r > 0 &&
            Math.abs(dx) === r &&
            Math.abs(dz) === r &&
            !shouldPlaceLeafAtCorner(wx, wz, dx, dz, shapeOx, shapeOz)
          )
            continue
          if (
            (biome === 'forest' || biome === 'jungle') &&
            dx * dx + (y - canopyCenterY) ** 2 + dz * dz > maxLeafDistSq
          )
            continue
          if (
            !(dx === 0 && dz === 0) &&
            leafNoiseValue(wx + shapeOx, wz + shapeOz, dx, dy, dz) > effectiveLeafDensity
          )
            continue
          leaves.push({ x: wx + dx, y, z: wz + dz })
        }
    }
    if (biome === 'meadow' && treeSeed(211, -157) < MEADOW_BEE_NEST_CHANCE && trunkHeight >= 4) {
      const sideIndex = Math.min(3, Math.floor(treeSeed(-211, 157) * 4))
      const sideOffsets: ReadonlyArray<readonly [number, number]> = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
      const [dx, dz] = sideOffsets[sideIndex]
      const nestY = baseY + Math.max(2, trunkHeight - 2)
      beeNests.push({ x: wx + dx, y: nestY, z: wz + dz })
    }
    return { wood, leaves, beeNests }
  }

  const stageEmpty = createNoopStage(PIPELINE_NOP_STAGE_NAMES[0])
  const stageStructuresStarts = createStageStructuresStarts({
    seed,
    getHeight,
    getResolvedBiome,
    pois,
  })
  const stageStructuresReferences = createNoopStage(PIPELINE_NOP_STAGE_NAMES[1])
  const stageNoise = createStageNoise({ getHeight })
  const stageBiomes = createStageBiomes({
    getBaseBiomeAt,
    getResolvedBiomeFromHeight,
    getPoiBiomeOverride: getPoiOverride,
  })
  /** Vanilla sloped_cheese: more caves at mid depth, fewer near surface and at bedrock. Returns 0..1. y is world Y. */
  function createCheeseCaveDensityFactor(): (y: number) => number {
    const peakY = WATER_LEVEL - 16
    const yMin = WORLD_MIN_Y + 1
    const yMax = WORLD_MAX_Y
    return (y: number): number => {
      if (y <= yMin || y >= yMax) return 0
      if (y <= peakY) return (y - yMin) / (peakY - yMin)
      return (yMax - y) / (yMax - peakY)
    }
  }

  const overhangSettings =
    overhangProfile === 'dramatic'
      ? {
          scaleXZ: OVERHANG_DRAMATIC_SCALE_XZ,
          scaleY: OVERHANG_DRAMATIC_SCALE_Y,
          threshold: OVERHANG_DRAMATIC_THRESHOLD,
          minSlope: OVERHANG_DRAMATIC_MIN_SLOPE,
          minDepthBelowSurface: OVERHANG_DRAMATIC_MIN_DEPTH_BELOW_SURFACE,
          maxDepthBelowSurface: OVERHANG_DRAMATIC_MAX_DEPTH_BELOW_SURFACE,
        }
      : {
          scaleXZ: OVERHANG_SCALE_XZ,
          scaleY: OVERHANG_SCALE_Y,
          threshold: OVERHANG_THRESHOLD,
          minSlope: OVERHANG_MIN_SLOPE,
          minDepthBelowSurface: OVERHANG_MIN_DEPTH_BELOW_SURFACE,
          maxDepthBelowSurface: OVERHANG_MAX_DEPTH_BELOW_SURFACE,
        }

  const stageCarvers = createStageCarvers({
    carve3d: {
      caveNoise3D,
      carveThreshold: CAVE_THRESHOLD,
      minDepthBelowSurface: MIN_CAVE_DEPTH_BELOW_SURFACE,
      getHeightAt: getHeight,
    },
    cheese: {
      cheeseNoise3D,
      scaleXZ: CHEESE_SCALE_XZ,
      scaleY: CHEESE_SCALE_Y,
      threshold: CHEESE_THRESHOLD,
      minDepthBelowSurface: MIN_CAVE_DEPTH_BELOW_SURFACE,
      caveDensityFactor: createCheeseCaveDensityFactor(),
      getHeightAt: getHeight,
    },
    noodle: {
      noodleNoiseA3D,
      noodleNoiseB3D,
      scale: NOODLE_SCALE,
      threshold: NOODLE_THRESHOLD,
      minDepthBelowSurface: MIN_CAVE_DEPTH_BELOW_SURFACE,
      getHeightAt: getHeight,
    },
    spaghetti: {
      seed,
      radius: 1.5,
      cellSize: 48,
      steps: 32,
      maxY: WATER_LEVEL + 48,
      minDepthBelowSurface: MIN_CAVE_DEPTH_BELOW_SURFACE,
      getHeightAt: getHeight,
    },
    worm: enableWormCarver
      ? {
          seed,
          startRate: 0.08,
          cellSize: 24,
          steps: 40,
          radius: 2.5,
          maxY: WATER_LEVEL + 48,
          minDepthBelowSurface: MIN_CAVE_DEPTH_BELOW_SURFACE,
          getHeightAt: getHeight,
        }
      : undefined,
    overhang: enableOverhangCarver
      ? {
          overhangNoise3D,
          scaleXZ: overhangSettings.scaleXZ,
          scaleY: overhangSettings.scaleY,
          threshold: overhangSettings.threshold,
          minSlope: overhangSettings.minSlope,
          minDepthBelowSurface: overhangSettings.minDepthBelowSurface,
          maxDepthBelowSurface: overhangSettings.maxDepthBelowSurface,
          getHeightAt: getHeight,
        }
      : undefined,
  })

  /** Max cardinal height delta for slope (cliff) detection. */
  function getMaxSlopeDelta(x: number, z: number): number {
    const h = getHeight(x, z)
    const dN = Math.abs(getHeight(x, z - 1) - h)
    const dS = Math.abs(getHeight(x, z + 1) - h)
    const dW = Math.abs(getHeight(x - 1, z) - h)
    const dE = Math.abs(getHeight(x + 1, z) - h)
    return Math.max(dN, dS, dW, dE)
  }

  function getSurfaceBlock(ctx: ChunkContext, lx: number, lz: number): BlockType {
    const topY = ctx.heightmap[lx][lz]
    const biome = ctx.biomeMap[lx][lz]
    const wx = ctx.worldX + lx
    const wz = ctx.worldZ + lz
    const def = BIOME_REGISTRY[biome]
    const surface = def.blocks.surface

    /**
     * Inside a village flatten area (POI or procedural): use the natural surface at (wx, wz)
     * so the village blends with the terrain. If the natural surface would be underwater,
     * keep dirt so the village sits on solid ground.
     */
    const flatten = getFlattenAt(wx, wz)
    if (flatten !== null) {
      const naturalY = getHeightUncached(wx, wz)
      if (naturalY < WATER_LEVEL) return 'dirt'
      const baseBiome = getBaseBiomeAt(wx, wz)
      const resolvedBiome = getResolvedBiomeFromHeight(baseBiome, naturalY, wx, wz)
      const naturalDef = BIOME_REGISTRY[resolvedBiome]
      if (naturalY >= WATER_LEVEL - 1 && naturalY <= WATER_LEVEL + 1)
        return naturalDef.blocks.shore as BlockType
      return naturalDef.blocks.surface as BlockType
    }

    const blend = getBiomeBlendAt(wx, wz)
    const slope = getMaxSlopeDelta(wx, wz)
    const ditherNoiseCoast =
      (detailNoise2D(
        wx * SURFACE_DITHER_COAST_SCALE + SURFACE_DITHER_COAST_OFFSET_X,
        wz * SURFACE_DITHER_COAST_SCALE + SURFACE_DITHER_COAST_OFFSET_Z,
      ) +
        1) *
      0.5
    const ditherNoiseLand =
      (detailNoise2D(
        wx * SURFACE_DITHER_LAND_SCALE + SURFACE_DITHER_LAND_OFFSET_X,
        wz * SURFACE_DITHER_LAND_SCALE + SURFACE_DITHER_LAND_OFFSET_Z,
      ) +
        1) *
      0.5
    const frozenPeaksNoiseN =
      (detailNoise2D(
        wx * SURFACE_FROZEN_PEAKS_N_SCALE + SURFACE_FROZEN_PEAKS_N_OFFSET_X,
        wz * SURFACE_FROZEN_PEAKS_N_SCALE + SURFACE_FROZEN_PEAKS_N_OFFSET_Z,
      ) +
        1) *
      0.5
    const frozenPeaksNoiseBlob =
      (detailNoise2D(
        wx * SURFACE_FROZEN_PEAKS_BLOB_SCALE + SURFACE_FROZEN_PEAKS_BLOB_OFFSET_X,
        wz * SURFACE_FROZEN_PEAKS_BLOB_SCALE + SURFACE_FROZEN_PEAKS_BLOB_OFFSET_Z,
      ) +
        1) *
      0.5
    const riverBankNoise =
      (detailNoise2D(
        wx * SURFACE_RIVER_BANK_SCALE + SURFACE_RIVER_BANK_OFFSET_X,
        wz * SURFACE_RIVER_BANK_SCALE + SURFACE_RIVER_BANK_OFFSET_Z,
      ) +
        1) *
      0.5
    let hasSnowNeighbor = false
    if (surface === 'grass') {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dz === 0) continue
          if (SNOW_BIOMES.includes(getResolvedBiome(wx + dx, wz + dz))) {
            hasSnowNeighbor = true
            break
          }
        }
      }
    }
    const badlandsBandNoise =
      biome === 'badlands'
        ? getBadlandsBandNoise(wx, wz, topY, detailNoise2D)
        : undefined
    return resolveSurfaceBlock({
      topY,
      biome,
      blend,
      slope,
      frozenPeaksNoiseN,
      frozenPeaksNoiseBlob,
      hasSnowNeighbor,
      ditherNoiseCoast,
      ditherNoiseLand,
      badlandsBandNoise,
      riverBankNoise,
    })
  }

  /**
   * Returns subsurface override blocks for biome-specific depth passes.
   * Badlands keep deep terracotta bands; coastal/river biomes get shallow sand/gravel/stone variation.
   */
  function getSubsurfaceBlock(
    ctx: ChunkContext,
    lx: number,
    lz: number,
    ly: number,
  ): BlockType | null {
    const topY = ctx.heightmap[lx][lz]
    const biome = ctx.biomeMap[lx][lz]
    const depthFromSurface = topY - ly
    if (depthFromSurface <= 0) return null
    const wx = ctx.worldX + lx
    const wz = ctx.worldZ + lz

    if (biome === 'badlands') {
      if (depthFromSurface > BADLANDS_BAND_SUBSURFACE_DEPTH) return null
      const worldY = WORLD_MIN_Y + ly
      const noise = getBadlandsBandNoise(wx, wz, worldY, detailNoise2D)
      return getBadlandsBlockFromNoise(noise)
    }

    if (
      (biome === 'beach' || biome === 'snowy_beach' || biome === 'river' || biome === 'stony_shore') &&
      topY < WATER_LEVEL &&
      depthFromSurface <= COASTAL_SUBSURFACE_MAX_DEPTH
    ) {
      const coastalNoise01 =
        (detailNoise2D(
          wx * SURFACE_DITHER_LAND_SCALE + SURFACE_DITHER_LAND_OFFSET_X,
          wz * SURFACE_DITHER_LAND_SCALE + SURFACE_DITHER_LAND_OFFSET_Z,
        ) +
          1) *
        0.5
      if (biome === 'stony_shore') {
        if (
          depthFromSurface <= COASTAL_SUBSURFACE_SHALLOW_DEPTH &&
          coastalNoise01 >= COASTAL_SUBSURFACE_STONY_STONE_NOISE_MIN
        )
          return 'stone'
        return 'gravel'
      }
      if (
        depthFromSurface <= COASTAL_SUBSURFACE_SHALLOW_DEPTH &&
        coastalNoise01 < COASTAL_SUBSURFACE_GRAVEL_NOISE_MAX
      )
        return 'gravel'
      return 'sand'
    }

    return null
  }

  /**
   * Returns aquifer fill block for carved cells.
   * This is a lightweight vanilla-inspired approximation (water pockets in deep cave space).
   */
  function getAquiferBlock(
    ctx: ChunkContext,
    lx: number,
    lz: number,
    _ly: number,
    worldY: number,
  ): BlockType | null {
    if (worldY > AQUIFER_WATER_LEVEL || worldY < AQUIFER_MIN_Y) return null
    const topY = ctx.heightmap[lx][lz]
    if (worldY >= topY - 2) return null
    const wx = ctx.worldX + lx
    const wz = ctx.worldZ + lz
    const aquifer = aquiferNoise3D(
      wx * AQUIFER_NOISE_SCALE,
      worldY * AQUIFER_NOISE_SCALE,
      wz * AQUIFER_NOISE_SCALE,
    )
    return aquifer >= AQUIFER_WATER_THRESHOLD ? 'water_source' : null
  }

  const stageSurface = createStageSurface({ getSurfaceBlock, getSubsurfaceBlock, getAquiferBlock })

  const treeFeature = createTreeFeature({ shouldPlaceTree, getTreeBlocks })
  const fernFeature = createFernFeature()
  const flowersFeature = createFlowersFeature()
  const groundFeature = createGroundFeature()
  const oreFeature = createOreFeature({ oreDensityNoise3D })
  const featuresList: FeatureFn[] = createOrderedFeatureList({
    ore: oreFeature,
    trees: treeFeature,
    ferns: fernFeature,
    flowers: flowersFeature,
    ground: groundFeature,
    dead_bush: createDeadBushFeature(),
    cactus: createCactusFeature(),
    sugar_cane: createSugarCaneFeature(),
    kelp: createKelpFeature(),
    lily_pad: createLilyPadFeature(),
    seagrass: createSeagrassFeature(),
    sea_pickle: createSeaPickleFeature(),
    mushrooms: createMushroomFeature(),
    bamboo: createBambooFeature(),
    vine: createVineFeature(),
    sweet_berry_bush: createSweetBerryBushFeature(),
    pumpkin: createPumpkinFeature(),
    melon: createMelonFeature(),
    pink_petals: createPinkPetalsFeature(),
  })
  const stageFeatures = createStageFeatures({
    features: featuresList,
    paintStructuresDeps: { seed, getHeight, getResolvedBiome, pois },
  })

  const stageInitializeLight = createNoopStage(PIPELINE_NOP_STAGE_NAMES[2])
  const stageLight = createNoopStage(PIPELINE_NOP_STAGE_NAMES[3])
  const stageSpawn = createNoopStage(PIPELINE_NOP_STAGE_NAMES[4])
  const stageFull = createNoopStage(PIPELINE_NOP_STAGE_NAMES[5])

  const stages = [
    stageEmpty,
    stageStructuresStarts,
    stageStructuresReferences,
    stageNoise,
    stageBiomes,
    stageCarvers,
    stageSurface,
    stageFeatures,
    stageInitializeLight,
    stageLight,
    stageSpawn,
    stageFull,
  ]

  /** Stage names for override hook; order must match stages. */
  const PIPELINE_STAGE_NAMES = [
    'empty',
    'structures_starts',
    'structures_references',
    'noise',
    'biomes',
    'carvers',
    'surface',
    'features',
    'initialize_light',
    'light',
    'spawn',
    'full',
  ] as const

  function generateChunkData(
    chunkX: number,
    chunkZ: number,
    blockMods: BlockModEntry[],
  ): ChunkDataPayload {
    currentChunkContext = { chunkX, chunkZ }
    try {
      const ctx = createChunkContext(chunkX, chunkZ, blockMods)
      ctx.getFeatureNoise = getFeatureNoise
      runPipeline(ctx, stages, {
        override: overrideFn,
        stageNames: PIPELINE_STAGE_NAMES,
      })

      for (const m of ctx.blockMods) {
        const lx = m.bx - ctx.worldX
        const lz = m.bz - ctx.worldZ
        if (
          lx >= 0 &&
          lx < CHUNK_SIZE &&
          lz >= 0 &&
          lz < CHUNK_SIZE &&
          m.by >= WORLD_MIN_Y &&
          m.by < WORLD_MIN_Y + WORLD_HEIGHT
        ) {
          const ly = m.by - WORLD_MIN_Y
          const lk = localKey(lx, ly, lz)
          ctx.voxelMap[lk] = m.value === 'air' ? AIR_ID : typeToId(m.value)
        }
      }

      // Snow layer placement: on top of grass_snow/snow in snow biomes when air above (no trees).
      // Layer count depends on slope: flatter surfaces get more layers, steep slopes get none.
      if (snowAccumulationHeight >= 1) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const topY = ctx.heightmap[lx][lz]
            if (topY >= WORLD_MAX_Y) continue
            const surfaceLy = topY - WORLD_MIN_Y
            const surfaceLk = localKey(lx, surfaceLy, lz)
            const aboveLk = localKey(lx, surfaceLy + 1, lz)
            if (!isAirOrCarved(ctx.voxelMap[aboveLk])) continue
            const surfaceType = idToType(ctx.voxelMap[surfaceLk])
            if (surfaceType !== 'grass_snow' && surfaceType !== 'snow') continue
            const biome = ctx.biomeMap[lx][lz]
            if (!SNOW_BIOMES.includes(biome)) continue
            const dN = lz > 0 ? Math.abs(ctx.heightmap[lx][lz - 1] - topY) : 0
            const dS = lz < CHUNK_SIZE - 1 ? Math.abs(ctx.heightmap[lx][lz + 1] - topY) : 0
            const dW = lx > 0 ? Math.abs(ctx.heightmap[lx - 1][lz] - topY) : 0
            const dE = lx < CHUNK_SIZE - 1 ? Math.abs(ctx.heightmap[lx + 1][lz] - topY) : 0
            const maxSlope = Math.max(dN, dS, dW, dE)
            let layers: number
            if (maxSlope >= SNOW_LAYER_STEEP_SLOPE_MIN) layers = 0
            else if (maxSlope >= SNOW_LAYER_MODERATE_SLOPE_MAX) layers = 1
            else if (maxSlope >= SNOW_LAYER_FLAT_SLOPE_MAX)
              layers = Math.max(1, Math.floor((Math.min(snowAccumulationHeight, 8) + 1) / 2))
            else layers = Math.min(snowAccumulationHeight, 8)
            if (layers < 1) continue
            ctx.voxelMap[aboveLk] = typeToId(`snow_layer_${layers}` as BlockType)
          }
        }
      }

      const heightmapBuffer = new Float32Array(CHUNK_SIZE * CHUNK_SIZE)
      const biomeMapBuffer = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE)
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const i = lx + lz * CHUNK_SIZE
          heightmapBuffer[i] = ctx.heightmap[lx][lz]
          const biome = ctx.biomeMap[lx][lz]
          biomeMapBuffer[i] = ALL_BIOMES.indexOf(biome)
        }
      }

      return {
        chunkX: ctx.chunkX,
        chunkZ: ctx.chunkZ,
        heightmap: ctx.heightmap,
        heightmapBuffer,
        biomeMapBuffer,
        buffer: ctx.voxelMap,
      }
    } finally {
      currentChunkContext = null
    }
  }

  return {
    generateChunkData,
    getHeight,
    getResolvedBiome,
  }
}
