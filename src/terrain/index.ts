/**
 * Pure terrain/biome/tree logic for Web Worker chunk generation.
 * Pipeline-based: Stage 1 (heightmap + biome from climate), Stage 2 (3D carve), Stage 3 (stratigraphy), Stage 4 (features).
 */
import { createNoise2D, createNoise3D } from "simplex-noise";
import type { Biome, BlockType } from "../types";
import { CHUNK_SIZE, WATER_LEVEL, WORLD_HEIGHT } from "../constants";
import {
  BIOME_REGISTRY,
  BIOME_TERRAIN,
  getBiomeByMultiNoise,
  getLandBiomeBlendByClimate,
} from "./biomes";
import { makeSeededRandom, clamp } from "./utils";
import { runPipeline, createChunkContext } from "./pipeline";
import type { ChunkContext } from "./pipeline-types";
import { createStage1 } from "./stages/heightmap-biome";
import { createStage2 } from "./stages/carve-3d";
import { createStage3 } from "./stages/stratigraphy";
import { createStage4 } from "./stages/structures";
import { createTreeFeature } from "./features/trees";
import { localKey, typeToId, AIR_ID } from "./block-ids";

/** Block modification for a chunk: world coords + value. */
export type BlockModEntry = { bx: number; by: number; bz: number; value: BlockType | "air" };

/** Result of generateChunkData: serializable chunk data for main thread to build meshes. */
export interface ChunkDataPayload {
  chunkX: number;
  chunkZ: number;
  heightmap: number[][];
  /**
   * Transferable heightmap (row-major): heightmapBuffer[lx + lz * CHUNK_SIZE] = surfaceY.
   * Prefer this over `heightmap` on the main thread to avoid structured-clone overhead.
   */
  heightmapBuffer?: Float32Array;
  /** Flat voxel buffer (CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE bytes). Transferable. */
  buffer: Uint8Array;
  /** Optional LOD hint for the renderer. */
  lod?: "full" | "far";
  /**
   * Optional worker-generated geometry for rendering.
   * When present, the main thread can build BufferGeometries directly from these arrays.
   */
  geometryLayers?: Array<{
    /** Terrain block id (see terrain/block-ids.ts). */
    blockTypeId: number;
    /** Non-indexed triangles: 3 floats per vertex. */
    position: Float32Array;
    /** 3 floats per vertex. */
    normal: Float32Array;
    /** 2 floats per vertex. */
    uv: Float32Array;
    /**
     * Vertex counts per cube face in BoxGeometry material order:
     * [right, left, top, bottom, front, back]. Used to set geometry groups.
     */
    faceVertexCounts: Uint32Array;
  }>;
  /**
   * Optional visible block local-keys per block type (for raycast/mining/tall grass).
   * Keys are `localKey(lx, ly, lz)` using terrain's localKey convention.
   */
  visibleBlockKeysByType?: Array<{ blockTypeId: number; keys: Uint32Array }>;
  /**
   * Optional request identifier used by the main thread to discard stale worker responses.
   * When present, this must be propagated unchanged from the worker request.
   */
  requestId?: number;
}

export function createChunkGenerator(seed: number) {
  const temperatureNoise2D = createNoise2D(makeSeededRandom(seed + 500));
  const humidityNoise2D = createNoise2D(makeSeededRandom(seed + 600));
  const continentalNoise2D = createNoise2D(makeSeededRandom(seed + 123));
  const climateWarpNoise2D = createNoise2D(makeSeededRandom(seed + 31337));
  const detailNoise2D = createNoise2D(makeSeededRandom(seed + 456));
  const mountainMaskNoise2D = createNoise2D(makeSeededRandom(seed + 789));
  const mountainHeightNoise2D = createNoise2D(makeSeededRandom(seed + 101));
  const highlandVariantNoise2D = createNoise2D(makeSeededRandom(seed + 1717));
  const erosionNoise2D = createNoise2D(makeSeededRandom(seed + 202));
  const flatNoise2D = createNoise2D(makeSeededRandom(seed + 303));
  const weirdnessNoise2D = createNoise2D(makeSeededRandom(seed + 909));
  const forestDensityNoise2D = createNoise2D(makeSeededRandom(seed + 777));
  const treePlacementNoise2D = createNoise2D(makeSeededRandom(seed + 888));
  const caveNoise3D = createNoise3D(makeSeededRandom(seed + 400));
  const heightTransitionNoise2D = createNoise2D(makeSeededRandom(seed + 4242));

  const TEMP_SCALE = 0.001;
  const HUMIDITY_SCALE = 0.0012;
  const BASE_HEIGHT = 64;
  const CONTINENTAL_SCALE = 0.0012;
  const OCEAN_CONTINENTALNESS_THRESHOLD = 0.44;
  const COAST_BLEND_BAND = 0.06;
  const USE_MULTI_NOISE_BASE_SELECTION = true;
  const CLIMATE_WARP_SCALE = 0.0014;
  const CLIMATE_WARP_AMP = 42;
  const EROSION_SCALE = 0.018;
  const EROSION_AMPLITUDE = 7;
  const EROSION_DETAIL_BOOST_MAX = 1.65;
  const EROSION_JAGGEDNESS_START = 0.25;
  const MOUNTAIN_MASK_SCALE = 0.003;
  const MOUNTAIN_HEIGHT_SCALE = 0.008;
  const MOUNTAIN_AMPLITUDE = 24;
  const MOUNTAIN_THRESHOLD = 0.3;
  const MOUNTAIN_BIOME_HEIGHT_BOOST = 2.1;
  const SNOW_BIOME_HEIGHT_BOOST = 4.5;
  const WEIRDNESS_SCALE = 0.0016;
  const WEIRDNESS_RIDGE_AMP = 6;
  const HIGHLAND_MEADOW_MAX = WATER_LEVEL + 10;
  const HIGHLAND_GROVE_MAX = WATER_LEVEL + 20;
  const HIGHLAND_SNOWY_SLOPES_MAX = WATER_LEVEL + 30;
  const COLD_HIGHLAND_TEMP_MAX = 0.42;
  const COLD_UPLAND_TEMP_MAX = 0.5;
  const HIGHLAND_VARIANT_SCALE = 0.004;
  const HEIGHT_TRANSITION_SCALE = 0.0016;
  const HEIGHT_TRANSITION_AMPLITUDE = 4.5;
  const FOREST_DENSITY_SCALE = 0.028;
  const TREE_PLACEMENT_SCALE = 0.12;
  const FOREST_DENSITY_THRESHOLD = 0.0;
  const TREE_PLACEMENT_FOREST_THRESHOLD = -0.1;
  const TREE_PLACEMENT_WINDSWEPT_FOREST_THRESHOLD = 0.0;
  const TREE_PLACEMENT_JUNGLE_THRESHOLD = -0.65;
  const TREE_PLACEMENT_PLAINS_THRESHOLD = 0.93;
  const TREE_PLACEMENT_MOUNTAIN_THRESHOLD = 0.97;
  const TREE_PLACEMENT_SNOW_THRESHOLD = 0.55;
  const WINDSWEPT_FOREST_HUMIDITY_MIN = 0.55;
  const MOUNTAIN_STONE_SURFACE_HEIGHT = WATER_LEVEL + 16;
  const SURFACE_STONE_HEIGHT = WATER_LEVEL + 26;
  const TREE_MAX_SLOPE = 2;
  const PEAK_Y_MIN = WATER_LEVEL + 30;
  const PEAK_Y_RANGE = 24;

  const SNOW_BIOMES: Biome[] = ["snow", "snowy_slopes", "frozen_peaks", "jagged_peaks", "grove"];
  type TreeShapeConfig = {
    trunkMin: number;
    trunkMax: number;
    leafRadiusMin: number;
    leafRadiusMax: number;
    leafHeightMin: number;
    leafHeightMax: number;
    leafDensityMin: number;
    leafDensityMax: number;
    giantChance: number;
    giantTrunkBonusMax: number;
    giantLeafRadiusBonusMax: number;
    giantLeafHeightBonusMax: number;
    giantDensityBonusMax: number;
  };

  const TREE_SHAPE_DEFAULT: TreeShapeConfig = {
    trunkMin: 4,
    trunkMax: 8,
    leafRadiusMin: 1,
    leafRadiusMax: 3,
    leafHeightMin: 3,
    leafHeightMax: 6,
    leafDensityMin: 0.58,
    leafDensityMax: 0.92,
    giantChance: 0.03,
    giantTrunkBonusMax: 5,
    giantLeafRadiusBonusMax: 2,
    giantLeafHeightBonusMax: 3,
    giantDensityBonusMax: 0.05,
  };
  const TREE_SHAPE_FOREST: TreeShapeConfig = {
    trunkMin: 5,
    trunkMax: 10,
    leafRadiusMin: 2,
    leafRadiusMax: 4,
    leafHeightMin: 4,
    leafHeightMax: 7,
    leafDensityMin: 0.62,
    leafDensityMax: 0.96,
    giantChance: 0.06,
    giantTrunkBonusMax: 6,
    giantLeafRadiusBonusMax: 2,
    giantLeafHeightBonusMax: 3,
    giantDensityBonusMax: 0.04,
  };
  const TREE_SHAPE_JUNGLE: TreeShapeConfig = {
    trunkMin: 8,
    trunkMax: 14,
    leafRadiusMin: 3,
    leafRadiusMax: 6,
    leafHeightMin: 6,
    leafHeightMax: 11,
    leafDensityMin: 0.78,
    leafDensityMax: 0.98,
    giantChance: 0.1,
    giantTrunkBonusMax: 8,
    giantLeafRadiusBonusMax: 2,
    giantLeafHeightBonusMax: 4,
    giantDensityBonusMax: 0.03,
  };
  const TREE_SHAPE_MOUNTAIN: TreeShapeConfig = {
    trunkMin: 4,
    trunkMax: 7,
    leafRadiusMin: 1,
    leafRadiusMax: 3,
    leafHeightMin: 2,
    leafHeightMax: 5,
    leafDensityMin: 0.45,
    leafDensityMax: 0.82,
    giantChance: 0.02,
    giantTrunkBonusMax: 4,
    giantLeafRadiusBonusMax: 1,
    giantLeafHeightBonusMax: 2,
    giantDensityBonusMax: 0.06,
  };
  const TREE_SHAPE_SNOW: TreeShapeConfig = {
    trunkMin: 8,
    trunkMax: 14,
    leafRadiusMin: 1,
    leafRadiusMax: 3,
    leafHeightMin: 5,
    leafHeightMax: 9,
    leafDensityMin: 0.55,
    leafDensityMax: 0.90,
    giantChance: 0.05,
    giantTrunkBonusMax: 7,
    giantLeafRadiusBonusMax: 2,
    giantLeafHeightBonusMax: 3,
    giantDensityBonusMax: 0.05,
  };
  const CAVE_THRESHOLD = 0.4;

  function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
  }

  function smoothstep01(t: number): number {
    const x = clamp01(t);
    return x * x * (3 - 2 * x);
  }

  function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  function smooth5tap(center: number, n: number, s: number, e: number, w: number): number {
    return center * 0.5 + (n + s + e + w) * 0.125;
  }

  function getClimateWarpedPos(x: number, z: number): { xw: number; zw: number } {
    const wx = climateWarpNoise2D(x * CLIMATE_WARP_SCALE, z * CLIMATE_WARP_SCALE);
    const wz = climateWarpNoise2D(x * CLIMATE_WARP_SCALE + 77.7, z * CLIMATE_WARP_SCALE - 31.3);
    return { xw: x + wx * CLIMATE_WARP_AMP, zw: z + wz * CLIMATE_WARP_AMP };
  }

  function getTemperature(x: number, z: number): number {
    const { xw, zw } = getClimateWarpedPos(x, z);
    const n = temperatureNoise2D(xw * TEMP_SCALE, zw * TEMP_SCALE);
    return (n + 1) * 0.5;
  }

  function getTemperatureSmoothed(x: number, z: number): number {
    // Smooths sharp biome edges that come from hard temperature thresholds.
    // Keep it lightweight: 5-tap kernel (center + 4-cardinal).
    const tC = getTemperature(x, z);
    const tN = getTemperature(x, z - 1);
    const tS = getTemperature(x, z + 1);
    const tW = getTemperature(x - 1, z);
    const tE = getTemperature(x + 1, z);
    return tC * 0.5 + (tN + tS + tW + tE) * 0.125;
  }

  function getHumidity(x: number, z: number): number {
    const { xw, zw } = getClimateWarpedPos(x, z);
    const n = humidityNoise2D(xw * HUMIDITY_SCALE, zw * HUMIDITY_SCALE);
    return (n + 1) * 0.5;
  }

  function getTemperatureSigned(x: number, z: number): number {
    const { xw, zw } = getClimateWarpedPos(x, z);
    return temperatureNoise2D(xw * TEMP_SCALE, zw * TEMP_SCALE);
  }

  function getHumiditySigned(x: number, z: number): number {
    const { xw, zw } = getClimateWarpedPos(x, z);
    return humidityNoise2D(xw * HUMIDITY_SCALE, zw * HUMIDITY_SCALE);
  }

  function getTemperatureSignedSmoothed(x: number, z: number): number {
    return smooth5tap(
      getTemperatureSigned(x, z),
      getTemperatureSigned(x, z - 1),
      getTemperatureSigned(x, z + 1),
      getTemperatureSigned(x + 1, z),
      getTemperatureSigned(x - 1, z)
    );
  }

  function getHumiditySignedSmoothed(x: number, z: number): number {
    return smooth5tap(
      getHumiditySigned(x, z),
      getHumiditySigned(x, z - 1),
      getHumiditySigned(x, z + 1),
      getHumiditySigned(x + 1, z),
      getHumiditySigned(x - 1, z)
    );
  }

  function getMacroTerrain(x: number, z: number): number {
    const c = getContinentalness(x, z);
    const s = (a: number, b: number, v: number) => smoothstep01((v - a) / (b - a));
    if (c < 0.3) return -18;
    if (c < OCEAN_CONTINENTALNESS_THRESHOLD) return lerp(-18, -8, s(0.3, OCEAN_CONTINENTALNESS_THRESHOLD, c));
    if (c < 0.52) return lerp(-8, 0, s(OCEAN_CONTINENTALNESS_THRESHOLD, 0.52, c));
    if (c < 0.75) return lerp(0, 14, s(0.52, 0.75, c));
    return lerp(14, 22, s(0.75, 0.95, c));
  }

  function getContinentalness(x: number, z: number): number {
    const n = continentalNoise2D(x * CONTINENTAL_SCALE, z * CONTINENTAL_SCALE);
    return (n + 1) * 0.5;
  }

  function getBiomeBlendAt(x: number, z: number): { primary: Biome; secondary: Biome; t: number } {
    const c = getContinentalness(x, z);
    const land = getLandBiomeBlendByClimate(getTemperature(x, z), getHumidity(x, z));
    if (USE_MULTI_NOISE_BASE_SELECTION) {
      const pick = getBiomeByMultiNoise({
        continentalness: c,
        erosion: getErosionSignedSmoothed(x, z),
        temperature: getTemperatureSignedSmoothed(x, z),
        humidity: getHumiditySignedSmoothed(x, z),
        weirdness: getWeirdnessSmoothed(x, z),
        y: 0.25,
      });
      if (pick !== "ocean") land.primary = pick;
    }
    if (c < OCEAN_CONTINENTALNESS_THRESHOLD - COAST_BLEND_BAND) {
      return { primary: "ocean", secondary: "ocean", t: 0 };
    }
    if (c > OCEAN_CONTINENTALNESS_THRESHOLD + COAST_BLEND_BAND) {
      return land;
    }
    const tLand = smoothstep01(
      (c - (OCEAN_CONTINENTALNESS_THRESHOLD - COAST_BLEND_BAND)) / (2 * COAST_BLEND_BAND)
    );
    return { primary: "ocean", secondary: land.primary, t: tLand };
  }

  function getBaseBiomeAt(x: number, z: number): Biome {
    const blend = getBiomeBlendAt(x, z);
    return blend.primary === "ocean" ? (blend.t < 0.5 ? "ocean" : blend.secondary) : blend.primary;
  }

  function getErosionSigned(x: number, z: number): number {
    return erosionNoise2D(x * EROSION_SCALE, z * EROSION_SCALE);
  }

  function getErosionSignedSmoothed(x: number, z: number): number {
    return smooth5tap(
      getErosionSigned(x, z),
      getErosionSigned(x, z - 1),
      getErosionSigned(x, z + 1),
      getErosionSigned(x + 1, z),
      getErosionSigned(x - 1, z)
    );
  }

  function getErosion(x: number, z: number): number {
    const n = (getErosionSigned(x, z) + 1) * 0.5;
    const t = smoothstep01(n);
    return t * EROSION_AMPLITUDE;
  }

  function getWeirdness(x: number, z: number): number {
    return weirdnessNoise2D(x * WEIRDNESS_SCALE, z * WEIRDNESS_SCALE);
  }

  function getWeirdnessSmoothed(x: number, z: number): number {
    return smooth5tap(
      getWeirdness(x, z),
      getWeirdness(x, z - 1),
      getWeirdness(x, z + 1),
      getWeirdness(x + 1, z),
      getWeirdness(x - 1, z)
    );
  }

  function getPeakY01(topY: number): number {
    return clamp01((topY - PEAK_Y_MIN) / PEAK_Y_RANGE);
  }

  function getHeightTransitionOffset(x: number, z: number): number {
    return (
      heightTransitionNoise2D(x * HEIGHT_TRANSITION_SCALE, z * HEIGHT_TRANSITION_SCALE) *
      HEIGHT_TRANSITION_AMPLITUDE
    );
  }

  function getHeightForBase(_base: Biome, x: number, z: number): number {
    const blend = getBiomeBlendAt(x, z);
    const pA = BIOME_TERRAIN[blend.primary];
    const pB = BIOME_TERRAIN[blend.secondary];
    const t = blend.t;
    const baseOffset = lerp(pA.baseOffset, pB.baseOffset, t);
    const detailAmp = lerp(pA.detailAmp, pB.detailAmp, t);
    const detailFreq = lerp(pA.detailFreq, pB.detailFreq, t);
    const flatness = lerp(pA.flatness, pB.flatness, t);
    const mountainAllowedFactor =
      (pA.mountainAllowed ? 1 : 0) * (1 - t) + (pB.mountainAllowed ? 1 : 0) * t;

    const macro = getMacroTerrain(x, z);

    const n = detailNoise2D(x * detailFreq, z * detailFreq);
    const flat = flatNoise2D(x * 0.01, z * 0.01);
    const smooth = (flat + 1) * 0.5;
    let effectiveAmp = detailAmp * (flatness + (1 - flatness) * smooth);
    const erosionSigned = getErosionSigned(x, z);
    const jaggednessT = smoothstep01(
      ((-erosionSigned) - EROSION_JAGGEDNESS_START) / (1 - EROSION_JAGGEDNESS_START)
    );
    effectiveAmp *= 1 + jaggednessT * (EROSION_DETAIL_BOOST_MAX - 1);
    const local = n * effectiveAmp;

    let mountain = 0;
    if (mountainAllowedFactor > 0) {
      const mask =
        (mountainMaskNoise2D(x * MOUNTAIN_MASK_SCALE, z * MOUNTAIN_MASK_SCALE) + 1) * 0.5;
      if (mask >= MOUNTAIN_THRESHOLD) {
        const tMask = (mask - MOUNTAIN_THRESHOLD) / (1 - MOUNTAIN_THRESHOLD);
        const m =
          (mountainHeightNoise2D(x * MOUNTAIN_HEIGHT_SCALE, z * MOUNTAIN_HEIGHT_SCALE) + 1) *
          0.5;
        const boostA =
          blend.primary === "mountain"
            ? MOUNTAIN_BIOME_HEIGHT_BOOST
            : blend.primary === "snow"
              ? SNOW_BIOME_HEIGHT_BOOST
              : 1;
        const boostB =
          blend.secondary === "mountain"
            ? MOUNTAIN_BIOME_HEIGHT_BOOST
            : blend.secondary === "snow"
              ? SNOW_BIOME_HEIGHT_BOOST
              : 1;
        const boost = lerp(boostA, boostB, t);
        mountain = tMask * m * MOUNTAIN_AMPLITUDE * boost * mountainAllowedFactor;
      }
    }

    const ridge = 1 - Math.abs(getWeirdness(x, z));
    const ridgeTerm = ridge * ridge * WEIRDNESS_RIDGE_AMP * mountainAllowedFactor;

    return BASE_HEIGHT + baseOffset + macro + local + mountain + ridgeTerm - getErosion(x, z);
  }

  function getResolvedBiomeFromHeight(base: Biome, height: number, x: number, z: number): Biome {
    const hFuzzy = height + getHeightTransitionOffset(x, z);
    if (base !== "mountain" && base !== "snow") {
      const temp = getTemperatureSmoothed(x, z);
      if (temp <= COLD_HIGHLAND_TEMP_MAX) {
        if (hFuzzy >= HIGHLAND_SNOWY_SLOPES_MAX + 6) return "frozen_peaks";
        if (hFuzzy >= HIGHLAND_SNOWY_SLOPES_MAX) return "snowy_slopes";
        if (hFuzzy >= HIGHLAND_GROVE_MAX) return "grove";
      }
      if (temp <= COLD_UPLAND_TEMP_MAX && hFuzzy >= HIGHLAND_MEADOW_MAX + 4)
        return getHumidity(x, z) >= WINDSWEPT_FOREST_HUMIDITY_MIN ? "windswept_forest" : "windswept_hills";
      return base;
    }
    if (hFuzzy < HIGHLAND_MEADOW_MAX) {
      const v = (highlandVariantNoise2D(x * HIGHLAND_VARIANT_SCALE, z * HIGHLAND_VARIANT_SCALE) + 1) * 0.5;
      if (v < 0.25)
        return getHumidity(x, z) >= WINDSWEPT_FOREST_HUMIDITY_MIN ? "windswept_forest" : "windswept_hills";
      if (v < 0.5) return "windswept_gravelly_hills";
      if (v < 0.75) return "cherry_grove";
      return "meadow";
    }
    if (hFuzzy < HIGHLAND_GROVE_MAX) {
      const v = (highlandVariantNoise2D(x * HIGHLAND_VARIANT_SCALE, z * HIGHLAND_VARIANT_SCALE) + 1) * 0.5;
      if (v > 0.82) return "windswept_forest";
      return "grove";
    }
    if (hFuzzy < HIGHLAND_SNOWY_SLOPES_MAX) return "snowy_slopes";
    const peakPick = getBiomeByMultiNoise({
      continentalness: getContinentalness(x, z),
      erosion: getErosionSignedSmoothed(x, z),
      temperature: getTemperatureSignedSmoothed(x, z),
      humidity: getHumiditySignedSmoothed(x, z),
      weirdness: getWeirdnessSmoothed(x, z),
      y: getPeakY01(hFuzzy),
    });
    if (peakPick === "stony_peaks" || peakPick === "frozen_peaks" || peakPick === "jagged_peaks")
      return peakPick;
    return "frozen_peaks";
  }

  function getHeightUncached(x: number, z: number): number {
    const h00 = getHeightForBase(getBaseBiomeAt(x - 1, z - 1), x - 1, z - 1);
    const h01 = getHeightForBase(getBaseBiomeAt(x - 1, z), x - 1, z);
    const h02 = getHeightForBase(getBaseBiomeAt(x - 1, z + 1), x - 1, z + 1);
    const h10 = getHeightForBase(getBaseBiomeAt(x, z - 1), x, z - 1);
    const h11 = getHeightForBase(getBaseBiomeAt(x, z), x, z);
    const h12 = getHeightForBase(getBaseBiomeAt(x, z + 1), x, z + 1);
    const h20 = getHeightForBase(getBaseBiomeAt(x + 1, z - 1), x + 1, z - 1);
    const h21 = getHeightForBase(getBaseBiomeAt(x + 1, z), x + 1, z);
    const h22 = getHeightForBase(getBaseBiomeAt(x + 1, z + 1), x + 1, z + 1);
    const smoothedH =
      h11 * 0.25 +
      (h01 + h21 + h10 + h12) * 0.125 +
      (h00 + h02 + h20 + h22) * 0.0625;
    return Math.floor(clamp(smoothedH, 0, WORLD_HEIGHT));
  }

  function getResolvedBiome(x: number, z: number): Biome {
    const base = getBaseBiomeAt(x, z);
    const h = getHeightUncached(x, z);
    return getResolvedBiomeFromHeight(base, h, x, z);
  }

  function treeSeedValue(x: number, z: number): number {
    const n = treePlacementNoise2D(x * 0.7 + 100, z * 0.7);
    return (n + 1) * 0.5;
  }

  function getForestDensity(wx: number, wz: number): number {
    return forestDensityNoise2D(wx * FOREST_DENSITY_SCALE, wz * FOREST_DENSITY_SCALE);
  }

  function getTreePlacement(wx: number, wz: number): number {
    return treePlacementNoise2D(wx * TREE_PLACEMENT_SCALE, wz * TREE_PLACEMENT_SCALE);
  }

  function getTreePlacementPass(wx: number, wz: number, biome: Biome, treeCache: Map<string, number>, forestCache: Map<string, number>): boolean {
    const placement = getTreePlacementCached(wx, wz, treeCache);
    if (biome === "forest") {
      if (getForestDensityCached(wx, wz, forestCache) <= FOREST_DENSITY_THRESHOLD) return false;
      return placement > TREE_PLACEMENT_FOREST_THRESHOLD;
    }
    if (biome === "jungle") {
      if (getForestDensityCached(wx, wz, forestCache) <= FOREST_DENSITY_THRESHOLD) return false;
      return placement > TREE_PLACEMENT_JUNGLE_THRESHOLD;
    }
    if (biome === "mountain") return placement > TREE_PLACEMENT_MOUNTAIN_THRESHOLD;
    if (biome === "plains" || biome === "meadow" || biome === "savanna" || biome === "cherry_grove") return placement > TREE_PLACEMENT_PLAINS_THRESHOLD;
    if (biome === "windswept_forest") {
      if (getForestDensityCached(wx, wz, forestCache) <= FOREST_DENSITY_THRESHOLD) return false;
      return placement > TREE_PLACEMENT_WINDSWEPT_FOREST_THRESHOLD;
    }
    if (biome === "snow" || biome === "grove") return placement > TREE_PLACEMENT_SNOW_THRESHOLD;
    return false;
  }

  function getTreePlacementCached(wx: number, wz: number, cache: Map<string, number>): number {
    const k = `${wx},${wz}`;
    let v = cache.get(k);
    if (v === undefined) {
      v = getTreePlacement(wx, wz);
      cache.set(k, v);
    }
    return v;
  }

  function getForestDensityCached(wx: number, wz: number, cache: Map<string, number>): number {
    const k = `${wx},${wz}`;
    let v = cache.get(k);
    if (v === undefined) {
      v = getForestDensity(wx, wz);
      cache.set(k, v);
    }
    return v;
  }

  function isLocalTreeMax(wx: number, wz: number, treeCache: Map<string, number>): boolean {
    const center = getTreePlacementCached(wx, wz, treeCache);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        if (getTreePlacementCached(wx + dx, wz + dz, treeCache) >= center) return false;
      }
    return true;
  }

  function isTerrainFlatEnough(wx: number, wz: number): boolean {
    const h = getHeightUncached(wx, wz);
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
      if (Math.abs(getHeightUncached(wx + dx, wz + dz) - h) > TREE_MAX_SLOPE) return false;
    return true;
  }

  function shouldPlaceTree(
    ctx: import("./pipeline-types").ChunkContext,
    wx: number,
    wz: number,
    treeCache: Map<string, number>,
    forestCache: Map<string, number>
  ): boolean {
    const lx = wx - ctx.worldX;
    const lz = wz - ctx.worldZ;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return false;
    const biome = ctx.biomeMap[lx][lz];
    const topY = ctx.heightmap[lx][lz];
    if (biome === "desert") return false;
    if (biome === "snow" || biome === "grove") return false;
    if (topY < WATER_LEVEL) return false;
    if (biome === "mountain" && topY >= WATER_LEVEL + 18) return false;
    if (biome === "snowy_slopes" || biome === "stony_peaks" || biome === "frozen_peaks" || biome === "jagged_peaks" || biome === "windswept_hills" || biome === "windswept_gravelly_hills") return false;
    const surface = getSurfaceBlock(ctx, lx, lz);
    if (
      surface !== "grass" &&
      surface !== "grass_snow" &&
      surface !== "grass_savanna" &&
      surface !== "dirt"
    )
      return false;
    if (!isTerrainFlatEnough(wx, wz)) return false;
    if (!getTreePlacementPass(wx, wz, biome, treeCache, forestCache)) return false;
    if (!isLocalTreeMax(wx, wz, treeCache)) return false;
    return true;
  }

  function shouldPlaceLeafAtCorner(wx: number, wz: number, lx: number, lz: number): boolean {
    return treeSeedValue(wx + lx, wz + lz) >= 0.5;
  }

  function getTreeShapeConfig(biome: Biome): TreeShapeConfig {
    if (biome === "snow" || biome === "grove") return TREE_SHAPE_SNOW;
    if (biome === "forest" || biome === "windswept_forest") return TREE_SHAPE_FOREST;
    if (biome === "jungle") return TREE_SHAPE_JUNGLE;
    if (biome === "mountain") return TREE_SHAPE_MOUNTAIN;
    return TREE_SHAPE_DEFAULT;
  }

  function getIntInRange(min: number, max: number, sample: number): number {
    const rangeMin = Math.min(min, max);
    const rangeMax = Math.max(min, max);
    return rangeMin + Math.floor(sample * (rangeMax - rangeMin + 1));
  }

  function getFloatInRange(min: number, max: number, sample: number): number {
    const rangeMin = Math.min(min, max);
    const rangeMax = Math.max(min, max);
    return rangeMin + sample * (rangeMax - rangeMin);
  }

  function clampValue(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function leafNoiseValue(wx: number, wz: number, dx: number, dy: number, dz: number): number {
    const sampleX = wx + dx * 17 + dy * 31;
    const sampleZ = wz + dz * 17 - dy * 19;
    return treeSeedValue(sampleX, sampleZ);
  }

  function getTreeBlocks(wx: number, baseY: number, wz: number, biome: Biome): { wood: Array<{ x: number; y: number; z: number }>; leaves: Array<{ x: number; y: number; z: number }> } {
    const wood: Array<{ x: number; y: number; z: number }> = [];
    const leaves: Array<{ x: number; y: number; z: number }> = [];
    const shape = getTreeShapeConfig(biome);
    const giantRoll = treeSeedValue(wx + 83, wz - 79);
    const isGiant = giantRoll < shape.giantChance;
    const trunkHeight = getIntInRange(shape.trunkMin, shape.trunkMax, treeSeedValue(wx + 19, wz - 23))
      + (isGiant ? getIntInRange(1, shape.giantTrunkBonusMax, treeSeedValue(wx - 97, wz + 101)) : 0);
    const leafRadius = getIntInRange(shape.leafRadiusMin, shape.leafRadiusMax, treeSeedValue(wx - 31, wz + 13))
      + (isGiant ? getIntInRange(1, shape.giantLeafRadiusBonusMax, treeSeedValue(wx + 61, wz + 67)) : 0);
    const leafHeight = getIntInRange(shape.leafHeightMin, shape.leafHeightMax, treeSeedValue(wx + 7, wz + 37))
      + (isGiant ? getIntInRange(1, shape.giantLeafHeightBonusMax, treeSeedValue(wx - 73, wz - 89)) : 0);
    const leafDensity = getFloatInRange(shape.leafDensityMin, shape.leafDensityMax, treeSeedValue(wx - 41, wz - 29))
      + (isGiant ? getFloatInRange(0, shape.giantDensityBonusMax, treeSeedValue(wx + 109, wz - 113)) : 0);
    const canopyStyleSample = treeSeedValue(wx + 59, wz - 47);
    const topY = baseY + trunkHeight;
    const canopyCenterY = topY + Math.floor(leafHeight * 0.5);
    const maxLeafDistSq = (leafRadius + 0.5) * (leafRadius + 0.5);
    for (let h = 1; h <= trunkHeight; h++) wood.push({ x: wx, y: baseY + h, z: wz });
    for (let dy = 0; dy < leafHeight; dy++) {
      const y = topY + dy;
      const layerT = leafHeight <= 1 ? 1 : dy / (leafHeight - 1);
      const isCone = canopyStyleSample < 0.33;
      const isWide = canopyStyleSample >= 0.66;
      let r = leafRadius;
      if (isCone) {
        r = Math.max(0, leafRadius - Math.floor(layerT * (leafRadius + 1)));
      } else if (isWide) {
        const extra = dy < Math.ceil(leafHeight * 0.5) ? 1 : 0;
        r = leafRadius + extra - (dy === leafHeight - 1 ? 1 : 0);
      } else {
        r = leafRadius - (layerT > 0.8 ? 1 : 0);
      }
      r = Math.max(0, r);
      const densityBias = isCone ? -0.12 * layerT : isWide ? 0.08 * (1 - layerT) : 0;
      const effectiveLeafDensity = clampValue(leafDensity + densityBias, 0.35, 0.98);
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (dx === 0 && dz === 0 && dy === 0) continue;
          if (r > 0 && Math.abs(dx) === r && Math.abs(dz) === r && !shouldPlaceLeafAtCorner(wx, wz, dx, dz)) continue;
          if ((biome === "forest" || biome === "jungle") && (dx * dx + (y - canopyCenterY) ** 2 + dz * dz) > maxLeafDistSq) continue;
          if (!(dx === 0 && dz === 0) && leafNoiseValue(wx, wz, dx, dy, dz) > effectiveLeafDensity) continue;
          leaves.push({ x: wx + dx, y, z: wz + dz });
        }
    }
    return { wood, leaves };
  }

  const stage1 = createStage1({
    getBaseBiomeAt,
    getHeightForBase,
    getResolvedBiomeFromHeight,
    getHeight: getHeightUncached,
  });

  const stage2 = createStage2({
    caveNoise3D,
    carveThreshold: CAVE_THRESHOLD,
  });

  function getSurfaceBlock(ctx: ChunkContext, lx: number, lz: number): BlockType {
    const topY = ctx.heightmap[lx][lz];
    const biome = ctx.biomeMap[lx][lz];
    const wx = ctx.worldX + lx;
    const wz = ctx.worldZ + lz;
    const def = BIOME_REGISTRY[biome];
    const surface = def.blocks.surface;

    const getMaxSlopeDelta = (x: number, z: number): number => {
      const h = getHeightUncached(x, z);
      // Cardinal neighbors are enough for a stable "cliff" signal.
      const dN = Math.abs(getHeightUncached(x, z - 1) - h);
      const dS = Math.abs(getHeightUncached(x, z + 1) - h);
      const dW = Math.abs(getHeightUncached(x - 1, z) - h);
      const dE = Math.abs(getHeightUncached(x + 1, z) - h);
      return Math.max(dN, dS, dW, dE);
    };

    if (topY < WATER_LEVEL) return def.blocks.underwater as BlockType;
    if (topY >= WATER_LEVEL - 1 && topY <= WATER_LEVEL + 1) return def.blocks.shore as BlockType;

    // Dither transitions near biome boundaries so surfaces don't flip abruptly.
    // Coastline: blend sand <-> land surface inside the coastal band.
    const blend = getBiomeBlendAt(wx, wz);
    if (blend.primary === "ocean" && blend.secondary !== "ocean") {
      const landSurface = BIOME_REGISTRY[blend.secondary].blocks.surface as BlockType;
      const n = (detailNoise2D(wx * 0.11 + 19.3, wz * 0.11 - 71.7) + 1) * 0.5; // [0..1]
      return n < blend.t ? landSurface : "sand";
    }

    // Land biome boundary: probabilistic surface swap based on blend weight.
    if (blend.primary !== blend.secondary && blend.primary !== "ocean" && blend.secondary !== "ocean") {
      const a = BIOME_REGISTRY[blend.primary].blocks.surface as BlockType;
      const b = BIOME_REGISTRY[blend.secondary].blocks.surface as BlockType;
      if (a !== b && blend.t > 0.1 && blend.t < 0.9) {
        const n = (detailNoise2D(wx * 0.13 - 33.1, wz * 0.13 + 5.7) + 1) * 0.5;
        return n < blend.t ? b : a;
      }
    }

    if (
      (biome === "mountain" || biome === "windswept_hills" || biome === "windswept_forest") &&
      topY >= MOUNTAIN_STONE_SURFACE_HEIGHT
    )
      return "stone";
    if (biome === "meadow" && topY >= MOUNTAIN_STONE_SURFACE_HEIGHT) return "stone";
    if (
      topY >= SURFACE_STONE_HEIGHT &&
      biome !== "frozen_peaks" &&
      biome !== "jagged_peaks"
    )
      return "stone";

    // Frozen peaks: snow cover + packed ice cliffs (glaciers) at steep, high elevations.
    if (biome === "frozen_peaks") {
      const slope = getMaxSlopeDelta(wx, wz);
      const steep = slope >= 6;
      const verySteep = slope >= 9;
      const high = topY >= WATER_LEVEL + 30;
      const n = (detailNoise2D(wx * 0.09 + 71.3, wz * 0.09 - 19.7) + 1) * 0.5; // [0..1]
      const blob = (detailNoise2D(wx * 0.035 - 211.1, wz * 0.035 + 97.7) + 1) * 0.5;

      if (high && (verySteep || (steep && n < 0.62))) return "packed_ice";
      if (high && steep && blob < 0.12) return "ice";
      return "snow";
    }

    if (
      topY >= WATER_LEVEL + 20 &&
      biome !== "desert" &&
      biome !== "savanna" &&
      biome !== "mountain" &&
      biome !== "jungle" &&
      biome !== "cherry_grove" &&
      biome !== "windswept_forest" &&
      biome !== "meadow" &&
      biome !== "plains"
    )
      return "grass_snow";

    if (surface === "snow") return "grass_snow";
    if (biome === "savanna" && surface === "grass") return "grass_savanna";

    if (surface === "grass") {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dz === 0) continue;
          const n = getResolvedBiome(wx + dx, wz + dz);
          if (SNOW_BIOMES.includes(n)) return "grass_snow";
        }
      }
    }
    return surface as BlockType;
  }

  const stage3 = createStage3({ getSurfaceBlock });

  const treeFeature = createTreeFeature({ shouldPlaceTree, getTreeBlocks });
  const stage4 = createStage4([treeFeature]);

  const stages = [stage1, stage2, stage3, stage4];

  function generateChunkHeightmap(chunkX: number, chunkZ: number): Pick<ChunkDataPayload, "chunkX" | "chunkZ" | "heightmap" | "heightmapBuffer" | "buffer"> {
    const ctx = createChunkContext(chunkX, chunkZ, []);
    stage1(ctx);
    const heightmapBuffer = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        heightmapBuffer[lx + lz * CHUNK_SIZE] = ctx.heightmap[lx][lz];
      }
    }
    return {
      chunkX: ctx.chunkX,
      chunkZ: ctx.chunkZ,
      heightmap: ctx.heightmap,
      heightmapBuffer,
      buffer: new Uint8Array(0),
    };
  }

  function generateChunkData(chunkX: number, chunkZ: number, blockMods: BlockModEntry[]): ChunkDataPayload {
    const ctx = createChunkContext(chunkX, chunkZ, blockMods);
    runPipeline(ctx, stages);

    for (const m of ctx.blockMods) {
      const lx = m.bx - ctx.worldX;
      const lz = m.bz - ctx.worldZ;
      if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && m.by >= 0 && m.by < WORLD_HEIGHT) {
        const lk = localKey(lx, m.by, lz);
        ctx.voxelMap[lk] = m.value === "air" ? AIR_ID : typeToId(m.value);
      }
    }

    const heightmapBuffer = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        heightmapBuffer[lx + lz * CHUNK_SIZE] = ctx.heightmap[lx][lz];
      }
    }

    return {
      chunkX: ctx.chunkX,
      chunkZ: ctx.chunkZ,
      heightmap: ctx.heightmap,
      heightmapBuffer,
      buffer: ctx.voxelMap,
    };
  }

  return {
    generateChunkData,
    generateChunkHeightmap,
    getHeight: getHeightUncached,
    getResolvedBiome,
  };
}
