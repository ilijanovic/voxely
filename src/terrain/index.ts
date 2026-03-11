/**
 * Pure terrain/biome/tree logic for Web Worker chunk generation.
 * Pipeline-based: Stage 1 (heightmap + biome), Stage 2 (carve 3D + cheese + spaghetti), Stage 3 (stratigraphy), Stage 4 (features), Stage 5 (template structures).
 */
import { createNoise2D, createNoise3D } from 'simplex-noise'
import type { Biome, BlockType } from '../types'
import {
  getPoiBiomeOverride,
  getPoiFlattenAt,
  getFixedVillageOriginsInChunk,
  POI_DEFAULT_FLATTEN_RADIUS,
  POI_DEFAULT_FLATTEN_TRANSITION_BLOCKS,
} from '../world-pois'
import type { WorldPoi } from '../world-pois'
import type { PoiFlattenAt } from '../world-pois'
import { getStructureOriginsInChunk } from './structures/origins'
import {
  getHouseDimensions,
  getVillageHouseSizeFromSeed,
} from './structures/templates/village'
import { CHUNK_SIZE, MIN_CAVE_DEPTH_BELOW_SURFACE, WATER_LEVEL, WORLD_HEIGHT } from '../constants'
import { getSurfaceBlockFromRules } from './surface-rules'
import {
  SNOW_LAYER_FLAT_SLOPE_MAX,
  SNOW_LAYER_MODERATE_SLOPE_MAX,
  SNOW_LAYER_STEEP_SLOPE_MIN,
} from './surface-constants'
import {
  BIOME_REGISTRY,
  BIOME_TERRAIN,
  getBiomeByMultiNoise,
  getLandBiomeBlendByClimate,
} from './biomes'
import { makeSeededRandom, clamp } from './utils'
import { runPipeline, createChunkContext } from './pipeline'
import type { ChunkContext } from './pipeline-types'
import { createStage1 } from './stages/heightmap-biome'
import { createStage2 } from './stages/carve-3d'
import { createStage2Cheese } from './stages/carve-cheese'
import { createStage2Spaghetti } from './stages/carve-spaghetti'
import { createStage3 } from './stages/stratigraphy'
import { createStage4 } from './stages/structures'
import { createStage5Structures } from './stages/stage5-structures'
import { createTreeFeature } from './features/trees'
import { createFernFeature } from './features/ferns'
import { createFlowersFeature } from './features/flowers'
import { createGroundFeature } from './features/ground'
import { localKey, typeToId, idToType, AIR_ID } from './block-ids'
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
export const ALL_BIOMES: readonly Biome[] = (
  Object.keys(BIOME_REGISTRY) as Biome[]
).sort()

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
export interface ChunkGeneratorOptions {
  snowAccumulationHeight?: number
  /** Pre-defined POIs for biome override and fixed village/NPC/mob placement. */
  pois?: WorldPoi[]
}

/** Temple structure side length in blocks; must match stage5-structures. */
const TEMPLE_SIZE = 6

export function createChunkGenerator(seed: number, options?: ChunkGeneratorOptions) {
  const snowAccumulationHeight = clamp(options?.snowAccumulationHeight ?? 1, 0, 8)
  const pois = options?.pois ?? []
  const getPoiOverride = (x: number, z: number): Biome | null => getPoiBiomeOverride(pois, x, z)
  /** Cache of structure origins per chunk so we don't place trees inside village/temple footprints. */
  const structureOriginsCache = new Map<string, import('./structures/origins').StructureOrigin[]>()
  /** Set during chunk generation so getHeight can apply procedural village flatten for the current chunk. */
  let currentChunkContext: { chunkX: number; chunkZ: number } | null = null
  /** Cache of procedural village (ox, oz) centers per chunk for flatten lookup. */
  const proceduralVillageCentersCache = new Map<string, Array<{ centerX: number; centerZ: number }>>()
  const temperatureNoise2D = createNoise2D(makeSeededRandom(seed + 500))
  const humidityNoise2D = createNoise2D(makeSeededRandom(seed + 600))
  const continentalNoise2D = createNoise2D(makeSeededRandom(seed + 123))
  const climateWarpNoise2D = createNoise2D(makeSeededRandom(seed + 31337))
  const detailNoise2D = createNoise2D(makeSeededRandom(seed + 456))
  const mountainMaskNoise2D = createNoise2D(makeSeededRandom(seed + 789))
  const mountainHeightNoise2D = createNoise2D(makeSeededRandom(seed + 101))
  const highlandVariantNoise2D = createNoise2D(makeSeededRandom(seed + 1717))
  const erosionNoise2D = createNoise2D(makeSeededRandom(seed + 202))
  const flatNoise2D = createNoise2D(makeSeededRandom(seed + 303))
  const weirdnessNoise2D = createNoise2D(makeSeededRandom(seed + 909))
  const forestDensityNoise2D = createNoise2D(makeSeededRandom(seed + 777))
  const treePlacementNoise2D = createNoise2D(makeSeededRandom(seed + 888))
  const treeShapeNoise2D = createNoise2D(makeSeededRandom(seed + 999))
  const caveNoise3D = createNoise3D(makeSeededRandom(seed + 400))
  const cheeseNoise3D = createNoise3D(makeSeededRandom(seed + 401))
  const heightTransitionNoise2D = createNoise2D(makeSeededRandom(seed + 4242))

  /**
   * Horizontal sampling scale for climate parameters (temperature/humidity/continentalness/erosion).
   * Vanilla Minecraft samples these dimensions at the same xz_scale in the Overworld noise router.
   * Our generator is simplex-noise-on-blocks, so we keep a tuned value but share it across params
   * to match vanilla's relative behaviour (erosion shouldn't be drastically higher-frequency).
   */
  const CLIMATE_PARAM_SCALE = 0.0012
  const TEMP_SCALE = CLIMATE_PARAM_SCALE
  const HUMIDITY_SCALE = CLIMATE_PARAM_SCALE
  const BASE_HEIGHT = 64
  const CONTINENTAL_SCALE = CLIMATE_PARAM_SCALE
  const OCEAN_CONTINENTALNESS_THRESHOLD = 0.36
  /** Width of ocean/land blend in continentalness space; wider band softens coast height edges. */
  const COAST_BLEND_BAND = 0.09
  /** Radius (blocks) around world origin (0,0) where climate is biased toward forest; must match terrain-sampling. */
  const SPAWN_ORIGIN_FOREST_RADIUS = 64
  const SPAWN_ORIGIN_FOREST_RADIUS_SQ = SPAWN_ORIGIN_FOREST_RADIUS * SPAWN_ORIGIN_FOREST_RADIUS
  const SPAWN_ORIGIN_FOREST_CONTINENTALNESS = 0.5
  const SPAWN_ORIGIN_FOREST_TEMP = 0.475
  const SPAWN_ORIGIN_FOREST_HUMIDITY = 0.7
  /** Base land biome from climate only so worker and main thread agree. Multi-noise still used for peak variants. */
  const USE_MULTI_NOISE_BASE_SELECTION = false
  const CLIMATE_WARP_SCALE = 0.0014
  const CLIMATE_WARP_AMP = 42
  const EROSION_SCALE = CLIMATE_PARAM_SCALE
  const EROSION_AMPLITUDE = 7
  const EROSION_DETAIL_BOOST_MAX = 1.65
  const EROSION_JAGGEDNESS_START = 0.25
  const MOUNTAIN_MASK_SCALE = 0.003
  const MOUNTAIN_HEIGHT_SCALE = 0.008
  const MOUNTAIN_AMPLITUDE = 24
  const MOUNTAIN_THRESHOLD = 0.3
  /** Width of smooth transition from no mountain to full mountain contribution (avoids hard cliffs). */
  const MOUNTAIN_TRANSITION_WIDTH = 0.12
  const MOUNTAIN_BIOME_HEIGHT_BOOST = 2.1
  const SNOW_BIOME_HEIGHT_BOOST = 4.5
  const WEIRDNESS_SCALE = 0.0016
  const WEIRDNESS_RIDGE_AMP = 6
  const HIGHLAND_MEADOW_MAX = WATER_LEVEL + 10
  const HIGHLAND_GROVE_MAX = WATER_LEVEL + 20
  const HIGHLAND_SNOWY_SLOPES_MAX = WATER_LEVEL + 30
  const COLD_HIGHLAND_TEMP_MAX = 0.42
  const COLD_UPLAND_TEMP_MAX = 0.5
  const HIGHLAND_VARIANT_SCALE = 0.004
  const HEIGHT_TRANSITION_SCALE = 0.0016
  const HEIGHT_TRANSITION_AMPLITUDE = 4.5
  const WINDSWEPT_FOREST_HUMIDITY_MIN = 0.55
  const PEAK_Y_MIN = WATER_LEVEL + 30
  const PEAK_Y_RANGE = 24

  const SNOW_BIOMES: Biome[] = ['snow', 'snowy_slopes', 'frozen_peaks', 'jagged_peaks', 'grove']
  /** 3D noise caves: higher = less carving. Tuned for our pipeline; vanilla reference: docs/VANILLA_BIOME_REFERENCE.md §6. */
  const CAVE_THRESHOLD = 0.56

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

  function getClimateWarpedPos(x: number, z: number): { xw: number; zw: number } {
    const wx = climateWarpNoise2D(x * CLIMATE_WARP_SCALE, z * CLIMATE_WARP_SCALE)
    const wz = climateWarpNoise2D(x * CLIMATE_WARP_SCALE + 77.7, z * CLIMATE_WARP_SCALE - 31.3)
    return { xw: x + wx * CLIMATE_WARP_AMP, zw: z + wz * CLIMATE_WARP_AMP }
  }

  function getTemperature(x: number, z: number): number {
    const { xw, zw } = getClimateWarpedPos(x, z)
    const n = temperatureNoise2D(xw * TEMP_SCALE, zw * TEMP_SCALE)
    return (n + 1) * 0.5
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
    const { xw, zw } = getClimateWarpedPos(x, z)
    const n = humidityNoise2D(xw * HUMIDITY_SCALE, zw * HUMIDITY_SCALE)
    return (n + 1) * 0.5
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
    const { xw, zw } = getClimateWarpedPos(x, z)
    return temperatureNoise2D(xw * TEMP_SCALE, zw * TEMP_SCALE)
  }

  function getHumiditySigned(x: number, z: number): number {
    const { xw, zw } = getClimateWarpedPos(x, z)
    return humidityNoise2D(xw * HUMIDITY_SCALE, zw * HUMIDITY_SCALE)
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
    const c = getContinentalness(x, z)
    const s = (a: number, b: number, v: number) => smoothstep01((v - a) / (b - a))
    if (c < 0.3) return -18
    if (c < OCEAN_CONTINENTALNESS_THRESHOLD)
      return lerp(-18, -8, s(0.3, OCEAN_CONTINENTALNESS_THRESHOLD, c))
    if (c < 0.52) return lerp(-8, 0, s(OCEAN_CONTINENTALNESS_THRESHOLD, 0.52, c))
    if (c < 0.75) return lerp(0, 14, s(0.52, 0.75, c))
    return lerp(14, 22, s(0.75, 0.95, c))
  }

  function getContinentalness(x: number, z: number): number {
    const n = continentalNoise2D(x * CONTINENTAL_SCALE, z * CONTINENTAL_SCALE)
    return (n + 1) * 0.5
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

  /** Blends (c, temp, humidity) toward forest at world origin; must match terrain-sampling. */
  function applySpawnOriginForestBias(
    x: number,
    z: number,
    c: number,
    temp: number,
    humidity: number,
  ): { c: number; temp: number; humidity: number } {
    const distSq = x * x + z * z
    if (distSq >= SPAWN_ORIGIN_FOREST_RADIUS_SQ) return { c, temp, humidity }
    const t = 1 - distSq / SPAWN_ORIGIN_FOREST_RADIUS_SQ
    const blendT = t * t * (3 - 2 * t)
    return {
      c: lerp(c, SPAWN_ORIGIN_FOREST_CONTINENTALNESS, blendT),
      temp: lerp(temp, SPAWN_ORIGIN_FOREST_TEMP, blendT),
      humidity: lerp(humidity, SPAWN_ORIGIN_FOREST_HUMIDITY, blendT),
    }
  }

  function getBiomeBlendAt(x: number, z: number): { primary: Biome; secondary: Biome; t: number } {
    let c = getContinentalnessSmoothed(x, z)
    let temp = getTemperatureSmoothed(x, z)
    let humidity = getHumiditySmoothed(x, z)
    const biased = applySpawnOriginForestBias(x, z, c, temp, humidity)
    c = biased.c
    const land = getLandBiomeBlendByClimate(biased.temp, biased.humidity)
    if (USE_MULTI_NOISE_BASE_SELECTION) {
      const pick = getBiomeByMultiNoise({
        continentalness: c,
        erosion: getErosionSignedSmoothed(x, z),
        temperature: getTemperatureSignedSmoothed(x, z),
        humidity: getHumiditySignedSmoothed(x, z),
        weirdness: getWeirdnessSmoothed(x, z),
        y: 0.25,
      })
      if (pick !== 'ocean') land.primary = pick
    }
    if (c < OCEAN_CONTINENTALNESS_THRESHOLD - COAST_BLEND_BAND) {
      return { primary: 'ocean', secondary: 'ocean', t: 0 }
    }
    if (c > OCEAN_CONTINENTALNESS_THRESHOLD + COAST_BLEND_BAND) {
      return land
    }
    const tLand = smoothstep01(
      (c - (OCEAN_CONTINENTALNESS_THRESHOLD - COAST_BLEND_BAND)) / (2 * COAST_BLEND_BAND),
    )
    return { primary: 'ocean', secondary: land.primary, t: tLand }
  }

  function getBaseBiomeAt(x: number, z: number): Biome {
    const blend = getBiomeBlendAt(x, z)
    return blend.primary === 'ocean' ? (blend.t < 0.5 ? 'ocean' : blend.secondary) : blend.primary
  }

  function getErosionSigned(x: number, z: number): number {
    return erosionNoise2D(x * EROSION_SCALE, z * EROSION_SCALE)
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
    return weirdnessNoise2D(x * WEIRDNESS_SCALE, z * WEIRDNESS_SCALE)
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

  function getHeightForBase(_base: Biome, x: number, z: number): number {
    const blend = getBiomeBlendAt(x, z)
    const pA = BIOME_TERRAIN[blend.primary]
    const pB = BIOME_TERRAIN[blend.secondary]
    const t = blend.t
    const baseOffset = lerp(pA.baseOffset, pB.baseOffset, t)
    const detailAmp = lerp(pA.detailAmp, pB.detailAmp, t)
    const detailFreq = lerp(pA.detailFreq, pB.detailFreq, t)
    const flatness = lerp(pA.flatness, pB.flatness, t)
    const mountainAllowedFactor =
      (pA.mountainAllowed ? 1 : 0) * (1 - t) + (pB.mountainAllowed ? 1 : 0) * t

    const macro = getMacroTerrain(x, z)

    const n = detailNoise2D(x * detailFreq, z * detailFreq)
    const flat = flatNoise2D(x * 0.01, z * 0.01)
    const smooth = (flat + 1) * 0.5
    let effectiveAmp = detailAmp * (flatness + (1 - flatness) * smooth)
    const erosionSigned = getErosionSigned(x, z)
    const jaggednessT = smoothstep01(
      (-erosionSigned - EROSION_JAGGEDNESS_START) / (1 - EROSION_JAGGEDNESS_START),
    )
    effectiveAmp *= 1 + jaggednessT * (EROSION_DETAIL_BOOST_MAX - 1)
    const local = n * effectiveAmp

    let mountain = 0
    if (mountainAllowedFactor > 0) {
      const mask = (mountainMaskNoise2D(x * MOUNTAIN_MASK_SCALE, z * MOUNTAIN_MASK_SCALE) + 1) * 0.5
      const tMaskSmooth = smoothstep01(
        (mask - MOUNTAIN_THRESHOLD) / Math.max(MOUNTAIN_TRANSITION_WIDTH, 1e-6),
      )
      const tMaskRamp = clamp01((mask - MOUNTAIN_THRESHOLD) / (1 - MOUNTAIN_THRESHOLD))
      if (tMaskSmooth > 0) {
        const m =
          (mountainHeightNoise2D(x * MOUNTAIN_HEIGHT_SCALE, z * MOUNTAIN_HEIGHT_SCALE) + 1) * 0.5
        const boostA =
          blend.primary === 'mountain'
            ? MOUNTAIN_BIOME_HEIGHT_BOOST
            : blend.primary === 'snow'
              ? SNOW_BIOME_HEIGHT_BOOST
              : 1
        const boostB =
          blend.secondary === 'mountain'
            ? MOUNTAIN_BIOME_HEIGHT_BOOST
            : blend.secondary === 'snow'
              ? SNOW_BIOME_HEIGHT_BOOST
              : 1
        const boost = lerp(boostA, boostB, t)
        mountain =
          tMaskSmooth * tMaskRamp * m * MOUNTAIN_AMPLITUDE * boost * mountainAllowedFactor
      }
    }

    const ridge = 1 - Math.abs(getWeirdness(x, z))
    const ridgeTerm = ridge * ridge * WEIRDNESS_RIDGE_AMP * mountainAllowedFactor

    return BASE_HEIGHT + baseOffset + macro + local + mountain + ridgeTerm - getErosion(x, z)
  }

  function getResolvedBiomeFromHeight(base: Biome, height: number, x: number, z: number): Biome {
    const hFuzzy = height + getHeightTransitionOffset(x, z)
    if (base !== 'mountain' && base !== 'snow') {
      const temp = getTemperatureSmoothed(x, z)
      if (temp <= COLD_HIGHLAND_TEMP_MAX) {
        if (hFuzzy >= HIGHLAND_SNOWY_SLOPES_MAX + 6) return 'frozen_peaks'
        if (hFuzzy >= HIGHLAND_SNOWY_SLOPES_MAX) return 'snowy_slopes'
        if (hFuzzy >= HIGHLAND_GROVE_MAX) return 'grove'
      }
      if (temp <= COLD_UPLAND_TEMP_MAX && hFuzzy >= HIGHLAND_MEADOW_MAX + 4)
        return getHumidity(x, z) >= WINDSWEPT_FOREST_HUMIDITY_MIN
          ? 'windswept_forest'
          : 'windswept_hills'
      return base
    }
    if (hFuzzy < HIGHLAND_MEADOW_MAX) {
      const v =
        (highlandVariantNoise2D(x * HIGHLAND_VARIANT_SCALE, z * HIGHLAND_VARIANT_SCALE) + 1) * 0.5
      if (v < 0.25)
        return getHumidity(x, z) >= WINDSWEPT_FOREST_HUMIDITY_MIN
          ? 'windswept_forest'
          : 'windswept_hills'
      if (v < 0.5) return 'windswept_gravelly_hills'
      if (v < 0.75) return 'cherry_grove'
      return 'meadow'
    }
    if (hFuzzy < HIGHLAND_GROVE_MAX) {
      const v =
        (highlandVariantNoise2D(x * HIGHLAND_VARIANT_SCALE, z * HIGHLAND_VARIANT_SCALE) + 1) * 0.5
      if (v > 0.82) return 'windswept_forest'
      return 'grove'
    }
    if (hFuzzy < HIGHLAND_SNOWY_SLOPES_MAX) return 'snowy_slopes'
    const peakPick = getBiomeByMultiNoise({
      continentalness: getContinentalness(x, z),
      erosion: getErosionSignedSmoothed(x, z),
      temperature: getTemperatureSignedSmoothed(x, z),
      humidity: getHumiditySignedSmoothed(x, z),
      weirdness: getWeirdnessSmoothed(x, z),
      y: getPeakY01(hFuzzy),
    })
    if (peakPick === 'stony_peaks' || peakPick === 'frozen_peaks' || peakPick === 'jagged_peaks')
      return peakPick
    return 'frozen_peaks'
  }

  function getHeightUncached(x: number, z: number): number {
    const h00 = getHeightForBase(getBaseBiomeAt(x - 1, z - 1), x - 1, z - 1)
    const h01 = getHeightForBase(getBaseBiomeAt(x - 1, z), x - 1, z)
    const h02 = getHeightForBase(getBaseBiomeAt(x - 1, z + 1), x - 1, z + 1)
    const h10 = getHeightForBase(getBaseBiomeAt(x, z - 1), x, z - 1)
    const h11 = getHeightForBase(getBaseBiomeAt(x, z), x, z)
    const h12 = getHeightForBase(getBaseBiomeAt(x, z + 1), x, z + 1)
    const h20 = getHeightForBase(getBaseBiomeAt(x + 1, z - 1), x + 1, z - 1)
    const h21 = getHeightForBase(getBaseBiomeAt(x + 1, z), x + 1, z)
    const h22 = getHeightForBase(getBaseBiomeAt(x + 1, z + 1), x + 1, z + 1)
    const smoothedH =
      h11 * 0.25 + (h01 + h21 + h10 + h12) * 0.125 + (h00 + h02 + h20 + h22) * 0.0625
    return Math.floor(clamp(smoothedH, 0, WORLD_HEIGHT))
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
    return clamp(lerp(centerY, natural, t), 0, WORLD_HEIGHT)
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
  function getProceduralVillageCentersForChunk(chunkX: number, chunkZ: number): Array<{ centerX: number; centerZ: number }> {
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
  function getProceduralFlattenAt(x: number, z: number, chunkX: number, chunkZ: number): PoiFlattenAt | null {
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
      currentChunkContext !== null
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
    return clamp(lerp(centerY, natural, t), 0, WORLD_HEIGHT)
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
   */
  function isInStructureFootprint(
    ctx: import('./pipeline-types').ChunkContext,
    wx: number,
    wz: number,
  ): boolean {
    const key = `${ctx.chunkX},${ctx.chunkZ}`
    let origins = structureOriginsCache.get(key)
    if (origins === undefined) {
      const procedural = getStructureOriginsInChunk(
        seed,
        ctx.chunkX,
        ctx.chunkZ,
        getHeight,
        getResolvedBiome,
      )
      const fixed =
        pois.length > 0
          ? getFixedVillageOriginsInChunk(
              pois,
              ctx.chunkX,
              ctx.chunkZ,
              getHeight,
              getResolvedBiome,
            )
          : []
      origins = [...procedural, ...fixed]
      structureOriginsCache.set(key, origins)
    }
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
        if (
          wx >= minX &&
          wx < minX + TEMPLE_SIZE &&
          wz >= minZ &&
          wz < minZ + TEMPLE_SIZE
        )
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
    const surface = getSurfaceBlock(ctx, lx, lz)
    if (surface === 'sand') return false
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
  } {
    const wood: Array<{ x: number; y: number; z: number }> = []
    const leaves: Array<{ x: number; y: number; z: number }> = []
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
          if (!(dx === 0 && dz === 0) && leafNoiseValue(wx + shapeOx, wz + shapeOz, dx, dy, dz) > effectiveLeafDensity)
            continue
          leaves.push({ x: wx + dx, y, z: wz + dz })
        }
    }
    return { wood, leaves }
  }

  const stage1 = createStage1({
    getBaseBiomeAt,
    getHeightForBase,
    getResolvedBiomeFromHeight,
    getHeight,
    getPoiBiomeOverride: getPoiOverride,
  })

  const stage2 = createStage2({
    caveNoise3D,
    carveThreshold: CAVE_THRESHOLD,
    minDepthBelowSurface: MIN_CAVE_DEPTH_BELOW_SURFACE,
    getHeightAt: getHeight,
  })
  /** Cheese caves: vanilla cave_cheese uses constant 0.27 and xz_scale 1.0; we use threshold 0.27 (aligned) and scale 0.03 (vanilla 1.0 would be very dense; we keep lower for larger caverns). See docs/VANILLA_BIOME_REFERENCE.md §6. */
  const CHEESE_SCALE = 0.03
  const CHEESE_THRESHOLD = 0.27
  const stage2Cheese = createStage2Cheese({
    cheeseNoise3D,
    scale: CHEESE_SCALE,
    threshold: CHEESE_THRESHOLD,
    minDepthBelowSurface: MIN_CAVE_DEPTH_BELOW_SURFACE,
    getHeightAt: getHeight,
  })
  const stage2Spaghetti = createStage2Spaghetti({
    seed,
    radius: 1.5,
    cellSize: 48,
    steps: 32,
    maxY: WATER_LEVEL + 48,
    minDepthBelowSurface: MIN_CAVE_DEPTH_BELOW_SURFACE,
    getHeightAt: getHeight,
  })

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

    const getMaxSlopeDelta = (x: number, z: number): number => {
      const h = getHeight(x, z)
      // Cardinal neighbors are enough for a stable "cliff" signal.
      const dN = Math.abs(getHeight(x, z - 1) - h)
      const dS = Math.abs(getHeight(x, z + 1) - h)
      const dW = Math.abs(getHeight(x - 1, z) - h)
      const dE = Math.abs(getHeight(x + 1, z) - h)
      return Math.max(dN, dS, dW, dE)
    }

    if (topY < WATER_LEVEL) return def.blocks.underwater as BlockType
    if (topY >= WATER_LEVEL - 1 && topY <= WATER_LEVEL + 1) return def.blocks.shore as BlockType

    // Dither transitions near biome boundaries so surfaces don't flip abruptly.
    // Coastline: blend sand <-> land surface inside the coastal band.
    const blend = getBiomeBlendAt(wx, wz)
    if (blend.primary === 'ocean' && blend.secondary !== 'ocean') {
      const landSurface = BIOME_REGISTRY[blend.secondary].blocks.surface as BlockType
      const n = (detailNoise2D(wx * 0.11 + 19.3, wz * 0.11 - 71.7) + 1) * 0.5 // [0..1]
      return n < blend.t ? landSurface : 'sand'
    }

    // Land biome boundary: probabilistic surface swap based on blend weight.
    // Minecraft-style: no dithering when desert is involved — sharp sand/grass boundary.
    if (
      blend.primary !== blend.secondary &&
      blend.primary !== 'ocean' &&
      blend.secondary !== 'ocean' &&
      blend.primary !== 'desert' &&
      blend.secondary !== 'desert'
    ) {
      const a = BIOME_REGISTRY[blend.primary].blocks.surface as BlockType
      const b = BIOME_REGISTRY[blend.secondary].blocks.surface as BlockType
      if (a !== b && blend.t > 0.1 && blend.t < 0.9) {
        const n = (detailNoise2D(wx * 0.13 - 33.1, wz * 0.13 + 5.7) + 1) * 0.5
        return n < blend.t ? b : a
      }
    }

    const slope = getMaxSlopeDelta(wx, wz)
    const frozenPeaksNoiseN =
      (detailNoise2D(wx * 0.09 + 71.3, wz * 0.09 - 19.7) + 1) * 0.5
    const frozenPeaksNoiseBlob =
      (detailNoise2D(wx * 0.035 - 211.1, wz * 0.035 + 97.7) + 1) * 0.5
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
    return getSurfaceBlockFromRules(biome, topY, surface as BlockType, {
      slope,
      frozenPeaksNoiseN,
      frozenPeaksNoiseBlob,
      hasSnowNeighbor,
    })
  }

  const stage3 = createStage3({ getSurfaceBlock })

  const treeFeature = createTreeFeature({ shouldPlaceTree, getTreeBlocks })
  const fernFeature = createFernFeature()
  const flowersFeature = createFlowersFeature()
  const groundFeature = createGroundFeature()
  const stage4 = createStage4([treeFeature, fernFeature, flowersFeature, groundFeature])
  const stage5 = createStage5Structures({
    seed,
    getHeight,
    getResolvedBiome,
    pois,
  })

  const stages = [stage1, stage2, stage2Cheese, stage2Spaghetti, stage3, stage4, stage5]

  function generateChunkData(
    chunkX: number,
    chunkZ: number,
    blockMods: BlockModEntry[],
  ): ChunkDataPayload {
    currentChunkContext = { chunkX, chunkZ }
    try {
      const ctx = createChunkContext(chunkX, chunkZ, blockMods)
      runPipeline(ctx, stages)

      for (const m of ctx.blockMods) {
        const lx = m.bx - ctx.worldX
        const lz = m.bz - ctx.worldZ
        if (
          lx >= 0 &&
          lx < CHUNK_SIZE &&
          lz >= 0 &&
          lz < CHUNK_SIZE &&
          m.by >= 0 &&
          m.by < WORLD_HEIGHT
        ) {
          const lk = localKey(lx, m.by, lz)
          ctx.voxelMap[lk] = m.value === 'air' ? AIR_ID : typeToId(m.value)
        }
      }

      // Snow layer placement: on top of grass_snow/snow in snow biomes when air above (no trees).
      // Layer count depends on slope: flatter surfaces get more layers, steep slopes get none.
      if (snowAccumulationHeight >= 1) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const topY = ctx.heightmap[lx][lz]
            if (topY + 1 >= WORLD_HEIGHT) continue
            const surfaceLk = localKey(lx, topY, lz)
            const aboveLk = localKey(lx, topY + 1, lz)
            if (ctx.voxelMap[aboveLk] !== 0) continue
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
            else if (maxSlope >= SNOW_LAYER_MODERATE_SLOPE_MAX)
              layers = 1
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
