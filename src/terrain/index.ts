/**
 * Pure terrain/biome/tree logic for Web Worker chunk generation.
 * Pipeline-based: Stage 1 (heightmap + biome from climate), Stage 2 (3D carve), Stage 3 (stratigraphy), Stage 4 (features).
 */
import { createNoise2D, createNoise3D } from "simplex-noise";
import type { Biome, BlockType } from "../types";
import { CHUNK_SIZE, WATER_LEVEL, WORLD_HEIGHT } from "../constants";
import { BIOME_REGISTRY, BIOME_TERRAIN, getBiomeByClimate } from "./biomes";
import { makeSeededRandom, clamp } from "./utils";
import { runPipeline, createChunkContext } from "./pipeline";
import { createStage1 } from "./stages/heightmap-biome";
import { createStage2 } from "./stages/carve-3d";
import { createStage3 } from "./stages/stratigraphy";
import { createStage4 } from "./stages/structures";
import { createTreeFeature } from "./features/trees";
import { localKey, typeToId, idToType, AIR_ID, CARVED_ID } from "./block-ids";

/** Block modification for a chunk: world coords + value. */
export type BlockModEntry = { bx: number; by: number; bz: number; value: BlockType | "air" };

/** Result of generateChunkData: serializable chunk data for main thread to build meshes. */
export interface ChunkDataPayload {
  chunkX: number;
  chunkZ: number;
  heightmap: number[][];
  voxelMapEntries: Array<[number, BlockType]>;
}

export function createChunkGenerator(seed: number) {
  const temperatureNoise2D = createNoise2D(makeSeededRandom(seed + 500));
  const humidityNoise2D = createNoise2D(makeSeededRandom(seed + 600));
  const continentalNoise2D = createNoise2D(makeSeededRandom(seed + 123));
  const detailNoise2D = createNoise2D(makeSeededRandom(seed + 456));
  const mountainMaskNoise2D = createNoise2D(makeSeededRandom(seed + 789));
  const mountainHeightNoise2D = createNoise2D(makeSeededRandom(seed + 101));
  const peakVariantNoise2D = createNoise2D(makeSeededRandom(seed + 1313));
  const highlandVariantNoise2D = createNoise2D(makeSeededRandom(seed + 1717));
  const erosionNoise2D = createNoise2D(makeSeededRandom(seed + 202));
  const flatNoise2D = createNoise2D(makeSeededRandom(seed + 303));
  const forestDensityNoise2D = createNoise2D(makeSeededRandom(seed + 777));
  const treePlacementNoise2D = createNoise2D(makeSeededRandom(seed + 888));
  const caveNoise3D = createNoise3D(makeSeededRandom(seed + 400));

  const TEMP_SCALE = 0.001;
  const HUMIDITY_SCALE = 0.0012;
  const BASE_HEIGHT = 64;
  const CONTINENTAL_SCALE = 0.0012;
  const CONTINENTAL_AMPLITUDE = 20;
  const EROSION_SCALE = 0.018;
  const EROSION_AMPLITUDE = 7;
  const MOUNTAIN_MASK_SCALE = 0.003;
  const MOUNTAIN_HEIGHT_SCALE = 0.008;
  const MOUNTAIN_AMPLITUDE = 16;
  const MOUNTAIN_THRESHOLD = 0.3;
  const MOUNTAIN_BIOME_HEIGHT_BOOST = 2.1;
  const SNOW_BIOME_HEIGHT_BOOST = 1.5;
  const HIGHLAND_MEADOW_MAX = WATER_LEVEL + 10;
  const HIGHLAND_GROVE_MAX = WATER_LEVEL + 20;
  const HIGHLAND_SNOWY_SLOPES_MAX = WATER_LEVEL + 30;
  const PEAK_VARIANT_SCALE = 0.01;
  const FOREST_DENSITY_SCALE = 0.028;
  const TREE_PLACEMENT_SCALE = 0.12;
  const FOREST_DENSITY_THRESHOLD = 0.0;
  const TREE_PLACEMENT_FOREST_THRESHOLD = -0.1;
  const TREE_PLACEMENT_JUNGLE_THRESHOLD = -0.45;
  const TREE_PLACEMENT_PLAINS_THRESHOLD = 0.93;
  const TREE_PLACEMENT_MOUNTAIN_THRESHOLD = 0.97;
  const TREE_PLACEMENT_SNOW_THRESHOLD = 0.55;
  const TREE_MAX_SLOPE = 2;
  const TRUNK_HEIGHT_PLAINS = 4;
  const TRUNK_HEIGHT_FOREST = 5;
  const TRUNK_HEIGHT_JUNGLE = 7;
  const TRUNK_HEIGHT_MOUNTAIN = 4;
  const TRUNK_HEIGHT_SNOW = 9;
  const LEAF_RADIUS_PLAINS = 2;
  const LEAF_RADIUS_FOREST = 2;
  const LEAF_RADIUS_JUNGLE = 3;
  const LEAF_RADIUS_MOUNTAIN = 1;
  const LEAF_RADIUS_SNOW = 1;
  const LEAF_HEIGHT_PLAINS = 3;
  const LEAF_HEIGHT_FOREST = 4;
  const LEAF_HEIGHT_JUNGLE = 5;
  const LEAF_HEIGHT_MOUNTAIN = 2;
  const LEAF_HEIGHT_SNOW = 6;
  const CAVE_THRESHOLD = 0.4;

  function getTemperature(x: number, z: number): number {
    const n = temperatureNoise2D(x * TEMP_SCALE, z * TEMP_SCALE);
    return (n + 1) * 0.5;
  }

  function getHumidity(x: number, z: number): number {
    const n = humidityNoise2D(x * HUMIDITY_SCALE, z * HUMIDITY_SCALE);
    return (n + 1) * 0.5;
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
    const effectiveAmp = params.detailAmp * (params.flatness + (1 - params.flatness) * smooth);
    return n * effectiveAmp;
  }

  function getMountainContributionForBase(base: Biome, x: number, z: number): number {
    if (!BIOME_TERRAIN[base].mountainAllowed) return 0;
    const mask = (mountainMaskNoise2D(x * MOUNTAIN_MASK_SCALE, z * MOUNTAIN_MASK_SCALE) + 1) * 0.5;
    if (mask < MOUNTAIN_THRESHOLD) return 0;
    const t = (mask - MOUNTAIN_THRESHOLD) / (1 - MOUNTAIN_THRESHOLD);
    const mountain = (mountainHeightNoise2D(x * MOUNTAIN_HEIGHT_SCALE, z * MOUNTAIN_HEIGHT_SCALE) + 1) * 0.5;
    const biomeBoost = base === "mountain"
      ? MOUNTAIN_BIOME_HEIGHT_BOOST
      : base === "snow"
      ? SNOW_BIOME_HEIGHT_BOOST
      : 1;
    return t * mountain * MOUNTAIN_AMPLITUDE * biomeBoost;
  }

  function getErosion(x: number, z: number): number {
    const n = (erosionNoise2D(x * EROSION_SCALE, z * EROSION_SCALE) + 1) * 0.5;
    return n * EROSION_AMPLITUDE;
  }

  function getHeightForBase(base: Biome, x: number, z: number): number {
    const params = BIOME_TERRAIN[base];
    return BASE_HEIGHT + params.baseOffset + getMacroTerrain(x, z) + getLocalTerrain(x, z, base) + getMountainContributionForBase(base, x, z) - getErosion(x, z);
  }

  function getResolvedBiomeFromHeight(base: Biome, height: number, x: number, z: number): Biome {
    if (base !== "mountain" && base !== "snow") return base;
    if (height < HIGHLAND_MEADOW_MAX) {
      const v = (highlandVariantNoise2D(x * 0.012, z * 0.012) + 1) * 0.5;
      if (v < 0.25) return "windswept_hills";
      if (v < 0.5) return "windswept_gravelly_hills";
      if (v < 0.75) return "cherry_grove";
      return "meadow";
    }
    if (height < HIGHLAND_GROVE_MAX) {
      const v = (highlandVariantNoise2D(x * 0.012, z * 0.012) + 1) * 0.5;
      if (v > 0.82) return "windswept_forest";
      return "grove";
    }
    if (height < HIGHLAND_SNOWY_SLOPES_MAX) return "snowy_slopes";
    const peakVariant = (peakVariantNoise2D(x * PEAK_VARIANT_SCALE, z * PEAK_VARIANT_SCALE) + 1) * 0.5;
    if (base === "mountain" && peakVariant < 0.55) return "stony_peaks";
    if (peakVariant < 0.82) return "frozen_peaks";
    return "jagged_peaks";
  }

  function getHeightUncached(x: number, z: number): number {
    const temp = getTemperature(x, z);
    const humidity = getHumidity(x, z);
    const base = getBiomeByClimate(temp, humidity);
    const rawH = getHeightForBase(base, x, z);
    const n = getHeightForBase(getBiomeByClimate(getTemperature(x, z + 1), getHumidity(x, z + 1)), x, z + 1);
    const s = getHeightForBase(getBiomeByClimate(getTemperature(x, z - 1), getHumidity(x, z - 1)), x, z - 1);
    const e = getHeightForBase(getBiomeByClimate(getTemperature(x + 1, z), getHumidity(x + 1, z)), x + 1, z);
    const w = getHeightForBase(getBiomeByClimate(getTemperature(x - 1, z), getHumidity(x - 1, z)), x - 1, z);
    const smoothedH = rawH * 0.5 + (n + s + e + w) * 0.125;
    return Math.floor(clamp(smoothedH, 0, WORLD_HEIGHT));
  }

  function getResolvedBiome(x: number, z: number): Biome {
    const temp = getTemperature(x, z);
    const humidity = getHumidity(x, z);
    const base = getBiomeByClimate(temp, humidity);
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
      return placement > TREE_PLACEMENT_FOREST_THRESHOLD;
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
    if (topY < WATER_LEVEL) return false;
    if (biome === "mountain" && topY >= WATER_LEVEL + 18) return false;
    if (biome === "snowy_slopes" || biome === "stony_peaks" || biome === "frozen_peaks" || biome === "jagged_peaks" || biome === "windswept_hills" || biome === "windswept_gravelly_hills") return false;
    const surface = BIOME_REGISTRY[biome].blocks.surface;
    if (surface !== "grass" && surface !== "grass_snow" && surface !== "grass_savanna") return false;
    if (!isTerrainFlatEnough(wx, wz)) return false;
    if (!getTreePlacementPass(wx, wz, biome, treeCache, forestCache)) return false;
    if (!isLocalTreeMax(wx, wz, treeCache)) return false;
    return true;
  }

  function shouldPlaceLeafAtCorner(wx: number, wz: number, lx: number, lz: number): boolean {
    return treeSeedValue(wx + lx, wz + lz) >= 0.5;
  }

  function getTreeBlocks(wx: number, baseY: number, wz: number, biome: Biome): { wood: Array<{ x: number; y: number; z: number }>; leaves: Array<{ x: number; y: number; z: number }> } {
    const wood: Array<{ x: number; y: number; z: number }> = [];
    const leaves: Array<{ x: number; y: number; z: number }> = [];
    const t = treeSeedValue(wx, wz);
    const trunkHeight = (biome === "snow" || biome === "grove") ? TRUNK_HEIGHT_SNOW + Math.floor(t * 2) : biome === "forest" ? TRUNK_HEIGHT_FOREST + Math.floor(t * 2) : biome === "jungle" ? TRUNK_HEIGHT_JUNGLE + Math.floor(t * 3) : biome === "mountain" ? TRUNK_HEIGHT_MOUNTAIN + Math.floor(t * 1) : TRUNK_HEIGHT_PLAINS + Math.floor(t * 1);
    const leafRadius = (biome === "snow" || biome === "grove") ? LEAF_RADIUS_SNOW : biome === "forest" ? LEAF_RADIUS_FOREST : biome === "jungle" ? LEAF_RADIUS_JUNGLE : biome === "mountain" ? LEAF_RADIUS_MOUNTAIN : LEAF_RADIUS_PLAINS;
    const leafHeight = (biome === "snow" || biome === "grove") ? LEAF_HEIGHT_SNOW : biome === "forest" ? LEAF_HEIGHT_FOREST : biome === "jungle" ? LEAF_HEIGHT_JUNGLE : biome === "mountain" ? LEAF_HEIGHT_MOUNTAIN : LEAF_HEIGHT_PLAINS;
    const topY = baseY + trunkHeight;
    const canopyCenterY = topY + Math.floor(leafHeight * 0.5);
    const maxLeafDistSq = (leafRadius + 0.5) * (leafRadius + 0.5);
    for (let h = 1; h <= trunkHeight; h++) wood.push({ x: wx, y: baseY + h, z: wz });
    for (let dy = 0; dy < leafHeight; dy++) {
      const y = topY + dy;
      const r = dy === leafHeight - 1 ? Math.max(0, leafRadius - 1) : leafRadius;
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (dx === 0 && dz === 0 && dy === 0) continue;
          if (r > 0 && Math.abs(dx) === r && Math.abs(dz) === r && !shouldPlaceLeafAtCorner(wx, wz, dx, dz)) continue;
          if ((biome === "forest" || biome === "jungle") && (dx * dx + (y - canopyCenterY) ** 2 + dz * dz) > maxLeafDistSq) continue;
          leaves.push({ x: wx + dx, y, z: wz + dz });
        }
    }
    return { wood, leaves };
  }

  const stage1 = createStage1({
    getTemperature,
    getHumidity,
    getBiomeByClimate,
    getHeightForBase,
    getResolvedBiomeFromHeight,
  });

  const stage2 = createStage2({
    caveNoise3D,
    carveThreshold: CAVE_THRESHOLD,
  });

  const stage3 = createStage3();

  const treeFeature = createTreeFeature({ shouldPlaceTree, getTreeBlocks });
  const stage4 = createStage4([treeFeature]);

  const stages = [stage1, stage2, stage3, stage4];

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

    const voxelMapEntries: Array<[number, BlockType]> = [];
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
          const lk = localKey(lx, ly, lz);
          const id = ctx.voxelMap[lk];
          if (id !== AIR_ID && id !== CARVED_ID) {
            const type = idToType(id);
            if (type !== "air") voxelMapEntries.push([lk, type as BlockType]);
          }
        }
      }
    }

    return {
      chunkX: ctx.chunkX,
      chunkZ: ctx.chunkZ,
      heightmap: ctx.heightmap,
      voxelMapEntries,
    };
  }

  return {
    generateChunkData,
    getHeight: getHeightUncached,
    getResolvedBiome,
  };
}
