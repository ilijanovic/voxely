/**
 * Pure terrain sampling for the main thread: biome, height, surface block type.
 * Uses same constants/formulas as terrain/ (worker); duplicated for now (see plan Option A).
 * No THREE, no DOM. getResolvedBiome(x, z, getHeight) so game can pass its cached getHeight.
 */
import { createNoise2D } from "simplex-noise";
import type { Biome, BlockType } from "./types";
import { WATER_LEVEL } from "./constants";
import { getBiomeByMultiNoise, getLandBiomeByClimate } from "./terrain/biomes";
import { BIOME_LAYERS, BIOME_TERRAIN } from "./terrain/biomes";
import { makeSeededRandom } from "./terrain/utils";

const BASE_HEIGHT = 64;
const CONTINENTAL_SCALE = 0.0012;
const CONTINENTAL_AMPLITUDE = 20;
const OCEAN_CONTINENTALNESS_THRESHOLD = 0.44;
const EROSION_SCALE = 0.018;
const EROSION_AMPLITUDE = 7;
const EROSION_DETAIL_BOOST_MAX = 1.65;
const EROSION_JAGGEDNESS_START = 0.25; // erosionSigned <= -0.25 starts boosting
const MOUNTAIN_MASK_SCALE = 0.003;
const MOUNTAIN_HEIGHT_SCALE = 0.008;
const MOUNTAIN_AMPLITUDE = 24;
const MOUNTAIN_THRESHOLD = 0.3;
const MOUNTAIN_BIOME_HEIGHT_BOOST = 2.1;
const SNOW_BIOME_HEIGHT_BOOST = 4.5;
const TEMP_SCALE = 0.001;
const HUMIDITY_SCALE = 0.0012;
const WEIRDNESS_SCALE = 0.0016;
const HIGHLAND_MEADOW_MAX = WATER_LEVEL + 10;
const HIGHLAND_GROVE_MAX = WATER_LEVEL + 20;
const HIGHLAND_SNOWY_SLOPES_MAX = WATER_LEVEL + 30;
const COLD_HIGHLAND_TEMP_MAX = 0.42;
const COLD_UPLAND_TEMP_MAX = 0.5;
const PEAK_VARIANT_SCALE = 0.004;
const HIGHLAND_VARIANT_SCALE = 0.004;
const WINDSWEPT_FOREST_HUMIDITY_MIN = 0.55;
const SURFACE_STONE_HEIGHT = WATER_LEVEL + 26;
const MOUNTAIN_STONE_SURFACE_HEIGHT = WATER_LEVEL + 16;
const PEAK_Y_MIN = WATER_LEVEL + 30;
const PEAK_Y_RANGE = 24;

export type GetHeightFn = (x: number, z: number) => number;

function createNoise(seed: number) {
  return createNoise2D(makeSeededRandom(seed));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep01(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

export function createTerrainSampling(seed: number) {
  const temperatureNoise2D = createNoise(seed + 500);
  const humidityNoise2D = createNoise(seed + 600);
  const continentalNoise2D = createNoise(seed + 123);
  const detailNoise2D = createNoise(seed + 456);
  const mountainMaskNoise2D = createNoise(seed + 789);
  const mountainHeightNoise2D = createNoise(seed + 101);
  const peakVariantNoise2D = createNoise(seed + 1313);
  const highlandVariantNoise2D = createNoise(seed + 1717);
  const erosionNoise2D = createNoise(seed + 202);
  const flatNoise2D = createNoise(seed + 303);
  const weirdnessNoise2D = createNoise(seed + 909);

  function getTemperature(x: number, z: number): number {
    const n = temperatureNoise2D(x * TEMP_SCALE, z * TEMP_SCALE);
    return (n + 1) * 0.5;
  }

  function getHumidity(x: number, z: number): number {
    const n = humidityNoise2D(x * HUMIDITY_SCALE, z * HUMIDITY_SCALE);
    return (n + 1) * 0.5;
  }

  function getTemperatureSigned(x: number, z: number): number {
    return temperatureNoise2D(x * TEMP_SCALE, z * TEMP_SCALE);
  }

  function getHumiditySigned(x: number, z: number): number {
    return humidityNoise2D(x * HUMIDITY_SCALE, z * HUMIDITY_SCALE);
  }

  function getBiomeValue(x: number, z: number): number {
    const biome = getBiome(x, z);
    if (biome === "ocean") return 0;
    if (biome === "desert") return 0;
    if (biome === "plains") return 1;
    if (biome === "savanna") return 2;
    if (biome === "forest") return 3;
    if (biome === "jungle") return 4;
    if (biome === "mountain") return 5;
    return 6;
  }

  function getContinentalness(x: number, z: number): number {
    const n = continentalNoise2D(x * CONTINENTAL_SCALE, z * CONTINENTAL_SCALE);
    return (n + 1) * 0.5;
  }

  function getBiome(x: number, z: number): Biome {
    if (getContinentalness(x, z) < OCEAN_CONTINENTALNESS_THRESHOLD) return "ocean";
    return getLandBiomeByClimate(getTemperature(x, z), getHumidity(x, z));
  }

  const _blendOut: { primary: Biome; secondary: Biome; t: number } = {
    primary: "plains",
    secondary: "plains",
    t: 0,
  };

  function getBiomeBlend(x: number, z: number): { primary: Biome; secondary: Biome; t: number } {
    const b = getBiome(x, z);
    _blendOut.primary = b;
    _blendOut.secondary = b;
    _blendOut.t = 0;
    return _blendOut;
  }

  function getMacroTerrain(x: number, z: number): number {
    const n = continentalNoise2D(x * CONTINENTAL_SCALE, z * CONTINENTAL_SCALE);
    return (n + 1) * 0.5 * CONTINENTAL_AMPLITUDE;
  }

  function getLocalTerrain(x: number, z: number, biome: Biome): number {
    const params = BIOME_TERRAIN[biome];
    const n = detailNoise2D(x * params.detailFreq, z * params.detailFreq);
    const flat = flatNoise2D(x * 0.01, z * 0.01);
    const smooth = (flat + 1) * 0.5;
    let effectiveAmp =
      params.detailAmp * (params.flatness + (1 - params.flatness) * smooth);
    // Low erosion (more negative) => sharper, higher-frequency relief.
    const erosionSigned = getErosionSigned(x, z);
    const jaggednessT = smoothstep01(((-erosionSigned) - EROSION_JAGGEDNESS_START) / (1 - EROSION_JAGGEDNESS_START));
    effectiveAmp *= 1 + jaggednessT * (EROSION_DETAIL_BOOST_MAX - 1);
    return n * effectiveAmp;
  }

  function getMountainContribution(x: number, z: number, biome: Biome): number {
    if (!BIOME_TERRAIN[biome].mountainAllowed) return 0;
    const mask =
      (mountainMaskNoise2D(x * MOUNTAIN_MASK_SCALE, z * MOUNTAIN_MASK_SCALE) + 1) * 0.5;
    if (mask < MOUNTAIN_THRESHOLD) return 0;
    const t = (mask - MOUNTAIN_THRESHOLD) / (1 - MOUNTAIN_THRESHOLD);
    const mountain =
      (mountainHeightNoise2D(x * MOUNTAIN_HEIGHT_SCALE, z * MOUNTAIN_HEIGHT_SCALE) + 1) * 0.5;
    const biomeBoost =
      biome === "mountain"
        ? MOUNTAIN_BIOME_HEIGHT_BOOST
        : biome === "snow"
          ? SNOW_BIOME_HEIGHT_BOOST
          : 1;
    return t * mountain * MOUNTAIN_AMPLITUDE * biomeBoost;
  }

  function getErosionSigned(x: number, z: number): number {
    return erosionNoise2D(x * EROSION_SCALE, z * EROSION_SCALE);
  }

  function getErosion(x: number, z: number): number {
    const n = (getErosionSigned(x, z) + 1) * 0.5;
    return n * EROSION_AMPLITUDE;
  }

  function getWeirdness(x: number, z: number): number {
    return weirdnessNoise2D(x * WEIRDNESS_SCALE, z * WEIRDNESS_SCALE);
  }

  function getPeakY01(topY: number): number {
    return clamp01((topY - PEAK_Y_MIN) / PEAK_Y_RANGE);
  }

  function getRawTerrainHeight(x: number, z: number): number {
    const biome = getBiome(x, z);
    const params = BIOME_TERRAIN[biome];
    const macro = getMacroTerrain(x, z);
    const local = getLocalTerrain(x, z, biome);
    const mountain = getMountainContribution(x, z, biome);
    const erosion = getErosion(x, z);
    return BASE_HEIGHT + params.baseOffset + macro + local + mountain - erosion;
  }

  function getSmoothedHeight(x: number, z: number): number {
    const h00 = getRawTerrainHeight(x - 1, z - 1);
    const h01 = getRawTerrainHeight(x - 1, z);
    const h02 = getRawTerrainHeight(x - 1, z + 1);
    const h10 = getRawTerrainHeight(x, z - 1);
    const h11 = getRawTerrainHeight(x, z);
    const h12 = getRawTerrainHeight(x, z + 1);
    const h20 = getRawTerrainHeight(x + 1, z - 1);
    const h21 = getRawTerrainHeight(x + 1, z);
    const h22 = getRawTerrainHeight(x + 1, z + 1);
    return (
      h11 * 0.25 +
      (h01 + h21 + h10 + h12) * 0.125 +
      (h00 + h02 + h20 + h22) * 0.0625
    );
  }

  function getResolvedBiome(x: number, z: number, getHeight: GetHeightFn): Biome {
    const base = getBiome(x, z);
    const h = getHeight(x, z);
    if (base !== "mountain" && base !== "snow") {
      const temp = getTemperature(x, z);
      if (temp <= COLD_HIGHLAND_TEMP_MAX) {
        if (h >= HIGHLAND_SNOWY_SLOPES_MAX + 6) return "frozen_peaks";
        if (h >= HIGHLAND_SNOWY_SLOPES_MAX) return "snowy_slopes";
        if (h >= HIGHLAND_GROVE_MAX) return "grove";
      }
      if (temp <= COLD_UPLAND_TEMP_MAX && h >= HIGHLAND_MEADOW_MAX + 4)
        return getHumidity(x, z) >= WINDSWEPT_FOREST_HUMIDITY_MIN ? "windswept_forest" : "windswept_hills";
      return base;
    }
    if (h < HIGHLAND_MEADOW_MAX) {
      const v = (highlandVariantNoise2D(x * HIGHLAND_VARIANT_SCALE, z * HIGHLAND_VARIANT_SCALE) + 1) * 0.5;
      if (v < 0.25)
        return getHumidity(x, z) >= WINDSWEPT_FOREST_HUMIDITY_MIN ? "windswept_forest" : "windswept_hills";
      if (v < 0.5) return "windswept_gravelly_hills";
      if (v < 0.75) return "cherry_grove";
      return "meadow";
    }
    if (h < HIGHLAND_GROVE_MAX) {
      const v = (highlandVariantNoise2D(x * HIGHLAND_VARIANT_SCALE, z * HIGHLAND_VARIANT_SCALE) + 1) * 0.5;
      if (v > 0.82) return "windswept_forest";
      return "grove";
    }
    if (h < HIGHLAND_SNOWY_SLOPES_MAX) return "snowy_slopes";
    const peakPick = getBiomeByMultiNoise({
      continentalness: getContinentalness(x, z),
      erosion: getErosionSigned(x, z),
      temperature: getTemperatureSigned(x, z),
      humidity: getHumiditySigned(x, z),
      weirdness: getWeirdness(x, z),
      y: getPeakY01(h),
    });
    if (peakPick === "stony_peaks" || peakPick === "frozen_peaks" || peakPick === "jagged_peaks")
      return peakPick;
    // Fallback to legacy distribution if multi-noise yields a non-peak biome.
    const peakVariant =
      (peakVariantNoise2D(x * PEAK_VARIANT_SCALE, z * PEAK_VARIANT_SCALE) + 1) * 0.5;
    if (base === "mountain" && peakVariant < 0.55) return "stony_peaks";
    if (peakVariant < 0.82) return "frozen_peaks";
    return "jagged_peaks";
  }

  function isShore(topY: number): boolean {
    return topY >= WATER_LEVEL - 1 && topY <= WATER_LEVEL + 1;
  }

  function getBlockTypeAt(biome: Biome, y: number, topY: number): BlockType {
    if (y === 0) return "bedrock";
    if (y > topY) {
      if (y <= WATER_LEVEL && topY < WATER_LEVEL) return "water";
      return "stone";
    }
    if (isShore(topY) && y === topY) return "sand";
    if (topY < WATER_LEVEL && y === topY) return "sand";
    const layers = BIOME_LAYERS[biome];
    if (y === topY) {
      const surface = layers.surface;
      if (surface === "snow" && topY <= WATER_LEVEL + 2) return "sand";
      if (
        (biome === "mountain" ||
          biome === "windswept_hills" ||
          biome === "windswept_forest") &&
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
      return surface;
    }
    if (y >= topY - layers.subsurfaceDepth) return layers.subsurface;
    return "stone";
  }

  return {
    getBiomeValue,
    getBiome,
    getBiomeBlend,
    getMacroTerrain,
    getLocalTerrain,
    getMountainContribution,
    getErosion,
    getRawTerrainHeight,
    getSmoothedHeight,
    getResolvedBiome,
    getBlockTypeAt,
    isShore,
  };
}

export type TerrainSampling = ReturnType<typeof createTerrainSampling>;
