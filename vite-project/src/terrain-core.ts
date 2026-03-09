/**
 * Pure terrain/biome/tree logic for Web Worker chunk generation.
 * No THREE, no DOM. Reusable by main thread for getHeight/getBiome if needed.
 */
import { createNoise2D } from "simplex-noise";
import type { Biome, BlockType } from "./types";
import {
  CHUNK_SIZE,
  WATER_LEVEL,
  WORLD_HEIGHT,
} from "./constants";

function makeSeededRandom(seed: number) {
  return function () {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Block modification for a chunk: world coords + value. */
export type BlockModEntry = { bx: number; by: number; bz: number; value: BlockType | "air" };

/** Result of generateChunkData: serializable chunk data for main thread to build meshes. */
export interface ChunkDataPayload {
  chunkX: number;
  chunkZ: number;
  heightmap: number[][];
  grassPos: Array<{ x: number; y: number; z: number }>;
  dirtPos: Array<{ x: number; y: number; z: number }>;
  stonePos: Array<{ x: number; y: number; z: number }>;
  sandPos: Array<{ x: number; y: number; z: number }>;
  snowPos: Array<{ x: number; y: number; z: number }>;
  woodPos: Array<{ x: number; y: number; z: number }>;
  leavesPos: Array<{ x: number; y: number; z: number }>;
  bedrockPos: Array<{ x: number; y: number; z: number }>;
  voxelMapEntries: Array<[number, BlockType]>; // [localKey, blockType]
}

function localKey(lx: number, ly: number, lz: number): number {
  return lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * WORLD_HEIGHT;
}

export function createChunkGenerator(seed: number) {
  const biomeNoise2D = createNoise2D(makeSeededRandom(seed + 42));
  const biomeWarpXNoise2D = createNoise2D(makeSeededRandom(seed + 999));
  const biomeWarpZNoise2D = createNoise2D(makeSeededRandom(seed + 1111));
  const continentalNoise2D = createNoise2D(makeSeededRandom(seed + 123));
  const detailNoise2D = createNoise2D(makeSeededRandom(seed + 456));
  const mountainMaskNoise2D = createNoise2D(makeSeededRandom(seed + 789));
  const mountainHeightNoise2D = createNoise2D(makeSeededRandom(seed + 101));
  const erosionNoise2D = createNoise2D(makeSeededRandom(seed + 202));
  const flatNoise2D = createNoise2D(makeSeededRandom(seed + 303));
  const forestDensityNoise2D = createNoise2D(makeSeededRandom(seed + 777));
  const treePlacementNoise2D = createNoise2D(makeSeededRandom(seed + 888));

  const BIOME_NOISE_SCALE = 0.0008;
  const BIOME_WARP_SCALE = 0.0025;
  const BIOME_WARP_STRENGTH = 80;
  const BASE_HEIGHT = 64;
  const CONTINENTAL_SCALE = 0.0012;
  const CONTINENTAL_AMPLITUDE = 20;
  const EROSION_SCALE = 0.018;
  const EROSION_AMPLITUDE = 7;
  const MOUNTAIN_MASK_SCALE = 0.003;
  const MOUNTAIN_HEIGHT_SCALE = 0.008;
  const MOUNTAIN_AMPLITUDE = 16;
  const MOUNTAIN_THRESHOLD = 0.3;
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

  const BIOME_TERRAIN: Record<Biome, { baseOffset: number; detailAmp: number; detailFreq: number; flatness: number; mountainAllowed: boolean }> = {
    plains: { baseOffset: 0, detailAmp: 1.3, detailFreq: 0.015, flatness: 0.97, mountainAllowed: false },
    desert: { baseOffset: -1.5, detailAmp: 0.8, detailFreq: 0.01, flatness: 0.99, mountainAllowed: false },
    forest: { baseOffset: 3, detailAmp: 4.5, detailFreq: 0.026, flatness: 0.7, mountainAllowed: true },
    jungle: { baseOffset: 3, detailAmp: 9, detailFreq: 0.03, flatness: 0.5, mountainAllowed: true },
    mountain: { baseOffset: 1.0, detailAmp: 1.2, detailFreq: 0.012, flatness: 0.85, mountainAllowed: true },
    snow: { baseOffset: 6, detailAmp: 11, detailFreq: 0.022, flatness: 0.35, mountainAllowed: true },
  };

  const BIOME_LAYERS: Record<Biome, { surface: BlockType; subsurface: BlockType; subsurfaceDepth: number }> = {
    plains: { surface: "grass", subsurface: "dirt", subsurfaceDepth: 2 },
    desert: { surface: "sand", subsurface: "sand", subsurfaceDepth: 3 },
    forest: { surface: "grass", subsurface: "dirt", subsurfaceDepth: 2 },
    jungle: { surface: "grass", subsurface: "dirt", subsurfaceDepth: 3 },
    mountain: { surface: "grass", subsurface: "dirt", subsurfaceDepth: 2 },
    snow: { surface: "snow", subsurface: "dirt", subsurfaceDepth: 2 },
  };

  function getBiomeValue(x: number, z: number): number {
    const warpX = biomeWarpXNoise2D(x * BIOME_WARP_SCALE, z * BIOME_WARP_SCALE) * BIOME_WARP_STRENGTH;
    const warpZ = biomeWarpZNoise2D(x * BIOME_WARP_SCALE + 5.2, z * BIOME_WARP_SCALE + 1.3) * BIOME_WARP_STRENGTH;
    const n = biomeNoise2D((x + warpX) * BIOME_NOISE_SCALE, (z + warpZ) * BIOME_NOISE_SCALE);
    return (n + 1) * 0.5 * 5;
  }

  function getBiome(x: number, z: number): Biome {
    const v = getBiomeValue(x, z);
    if (v < 0.7) {
      const mask = (mountainMaskNoise2D(x * MOUNTAIN_MASK_SCALE, z * MOUNTAIN_MASK_SCALE) + 1) * 0.5;
      if (mask >= MOUNTAIN_THRESHOLD) return "plains";
      return "desert";
    }
    if (v < 1.4) return "plains";
    if (v < 3.0) return "forest";
    if (v < 3.8) return "jungle";
    if (v < 4.6) return "mountain";
    return "snow";
  }

  function getBiomeBlend(x: number, z: number): { primary: Biome; secondary: Biome; t: number } {
    const v = getBiomeValue(x, z);
    if (v < 0.7) return { primary: "desert", secondary: "plains", t: v / 0.7 };
    if (v < 1.4) return { primary: "plains", secondary: "forest", t: (v - 0.7) / 0.7 };
    if (v < 3.0) return { primary: "forest", secondary: "jungle", t: (v - 1.4) / 1.6 };
    if (v < 3.8) return { primary: "jungle", secondary: "mountain", t: (v - 3.0) / 0.8 };
    if (v < 4.6) return { primary: "mountain", secondary: "snow", t: (v - 3.8) / 0.8 };
    return { primary: "snow", secondary: "snow", t: 1 };
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

  function getMountainContribution(x: number, z: number, biome: Biome): number {
    if (!BIOME_TERRAIN[biome].mountainAllowed) return 0;
    const blend = getBiomeBlend(x, z);
    let biomeDepth = 1.0;
    if (blend.primary === biome && !BIOME_TERRAIN[blend.secondary].mountainAllowed)
      biomeDepth = smoothstep(0.3, 0.7, blend.t);
    else if (blend.secondary === biome && !BIOME_TERRAIN[blend.primary].mountainAllowed)
      biomeDepth = smoothstep(0.3, 0.7, 1.0 - blend.t);
    if (biomeDepth < 0.01) return 0;
    const mask = (mountainMaskNoise2D(x * MOUNTAIN_MASK_SCALE, z * MOUNTAIN_MASK_SCALE) + 1) * 0.5;
    if (mask < MOUNTAIN_THRESHOLD) return 0;
    const t = (mask - MOUNTAIN_THRESHOLD) / (1 - MOUNTAIN_THRESHOLD);
    const mountain = (mountainHeightNoise2D(x * MOUNTAIN_HEIGHT_SCALE, z * MOUNTAIN_HEIGHT_SCALE) + 1) * 0.5;
    return t * mountain * MOUNTAIN_AMPLITUDE * biomeDepth;
  }

  function getErosion(x: number, z: number): number {
    const n = (erosionNoise2D(x * EROSION_SCALE, z * EROSION_SCALE) + 1) * 0.5;
    return n * EROSION_AMPLITUDE;
  }

  function getRawTerrainHeight(x: number, z: number): number {
    const biome = getBiome(x, z);
    return BASE_HEIGHT + getMacroTerrain(x, z) + getLocalTerrain(x, z, biome) + getMountainContribution(x, z, biome) - getErosion(x, z);
  }

  function getSmoothedHeight(x: number, z: number): number {
    const center = getRawTerrainHeight(x, z);
    const n = getRawTerrainHeight(x, z + 1);
    const s = getRawTerrainHeight(x, z - 1);
    const e = getRawTerrainHeight(x + 1, z);
    const w = getRawTerrainHeight(x - 1, z);
    return center * 0.5 + (n + s + e + w) * 0.125;
  }

  function getHeightUncached(x: number, z: number): number {
    const blend = getBiomeBlend(x, z);
    let h: number;
    if (blend.t >= 0.85 || blend.t <= 0.15) {
      h = getSmoothedHeight(x, z);
    } else {
      const h1 = getSmoothedHeight(x, z);
      const h2 = BASE_HEIGHT + getMacroTerrain(x, z) + getLocalTerrain(x, z, blend.secondary) + getMountainContribution(x, z, blend.secondary) - getErosion(x, z);
      h = h1 * (1 - blend.t) + h2 * blend.t;
    }
    return Math.floor(clamp(h, 0, WORLD_HEIGHT));
  }

  function getBlockMod(bx: number, by: number, bz: number, blockMods: BlockModEntry[]): BlockType | "air" | undefined {
    for (const m of blockMods) {
      if (m.bx === bx && m.by === by && m.bz === bz) return m.value;
    }
    return undefined;
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
      if (biome === "mountain" && topY >= WATER_LEVEL + 16) return "stone";
      if (topY >= WATER_LEVEL + 26) return "stone";
      if (topY >= WATER_LEVEL + 20 && biome !== "desert" && biome !== "mountain" && biome !== "jungle") return "snow";
      return surface;
    }
    if (y >= topY - layers.subsurfaceDepth) return layers.subsurface;
    return "stone";
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
    if (biome === "plains") return placement > TREE_PLACEMENT_PLAINS_THRESHOLD;
    if (biome === "snow") return placement > TREE_PLACEMENT_SNOW_THRESHOLD;
    return false;
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

  function shouldPlaceTree(wx: number, wz: number, treeCache: Map<string, number>, forestCache: Map<string, number>): boolean {
    const biome = getBiome(wx, wz);
    if (biome === "desert") return false;
    const topY = getHeightUncached(wx, wz);
    if (topY < WATER_LEVEL) return false;
    if (biome === "mountain" && topY >= WATER_LEVEL + 18) return false;
    if (getBlockTypeAt(biome, topY, topY) !== "grass") return false;
    if (!isTerrainFlatEnough(wx, wz)) return false;
    if (!getTreePlacementPass(wx, wz, biome, treeCache, forestCache)) return false;
    if (!isLocalTreeMax(wx, wz, treeCache)) return false;
    return true;
  }

  function shouldPlaceLeafAtCorner(wx: number, wz: number, lx: number, lz: number): boolean {
    return treeSeedValue(wx + lx, wz + lz) >= 0.5;
  }

  function leafDistSq(dx: number, dy: number, dz: number): number {
    return dx * dx + dy * dy + dz * dz;
  }

  function getTreeBlocks(wx: number, baseY: number, wz: number, biome: Biome): { wood: Array<{ x: number; y: number; z: number }>; leaves: Array<{ x: number; y: number; z: number }> } {
    const wood: Array<{ x: number; y: number; z: number }> = [];
    const leaves: Array<{ x: number; y: number; z: number }> = [];
    const t = treeSeedValue(wx, wz);
    const trunkHeight = biome === "snow" ? TRUNK_HEIGHT_SNOW + Math.floor(t * 2) : biome === "forest" ? TRUNK_HEIGHT_FOREST + Math.floor(t * 2) : biome === "jungle" ? TRUNK_HEIGHT_JUNGLE + Math.floor(t * 3) : biome === "mountain" ? TRUNK_HEIGHT_MOUNTAIN + Math.floor(t * 1) : TRUNK_HEIGHT_PLAINS + Math.floor(t * 1);
    const leafRadius = biome === "snow" ? LEAF_RADIUS_SNOW : biome === "forest" ? LEAF_RADIUS_FOREST : biome === "jungle" ? LEAF_RADIUS_JUNGLE : biome === "mountain" ? LEAF_RADIUS_MOUNTAIN : LEAF_RADIUS_PLAINS;
    const leafHeight = biome === "snow" ? LEAF_HEIGHT_SNOW : biome === "forest" ? LEAF_HEIGHT_FOREST : biome === "jungle" ? LEAF_HEIGHT_JUNGLE : biome === "mountain" ? LEAF_HEIGHT_MOUNTAIN : LEAF_HEIGHT_PLAINS;
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
          if ((biome === "forest" || biome === "jungle") && leafDistSq(dx, y - canopyCenterY, dz) > maxLeafDistSq) continue;
          leaves.push({ x: wx + dx, y, z: wz + dz });
        }
    }
    return { wood, leaves };
  }

  function generateChunkData(chunkX: number, chunkZ: number, blockMods: BlockModEntry[]): ChunkDataPayload {
    const worldX = chunkX * CHUNK_SIZE;
    const worldZ = chunkZ * CHUNK_SIZE;
    const heightmap: number[][] = [];
    for (let x = 0; x < CHUNK_SIZE; x++) {
      heightmap[x] = [];
      for (let z = 0; z < CHUNK_SIZE; z++) {
        heightmap[x][z] = getHeightUncached(worldX + x, worldZ + z);
      }
    }

    const grassPos: Array<{ x: number; y: number; z: number }> = [];
    const dirtPos: Array<{ x: number; y: number; z: number }> = [];
    const stonePos: Array<{ x: number; y: number; z: number }> = [];
    const sandPos: Array<{ x: number; y: number; z: number }> = [];
    const snowPos: Array<{ x: number; y: number; z: number }> = [];
    const woodPos: Array<{ x: number; y: number; z: number }> = [];
    const leavesPos: Array<{ x: number; y: number; z: number }> = [];
    const bedrockPos: Array<{ x: number; y: number; z: number }> = [];
    const voxelMapEntries: Array<[number, BlockType]> = [];

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = worldX + x;
        const wz = worldZ + z;
        const topY = heightmap[x][z];
        const biome = getBiome(wx, wz);
        for (let y = 0; y <= topY; y++) {
          let type = getBlockTypeAt(biome, y, topY);
          const mod = getBlockMod(wx, y, wz, blockMods);
          if (mod === "air") continue;
          if (mod !== undefined) type = mod;
          const pos = { x: wx, y, z: wz };
          if (type === "grass") { grassPos.push(pos); voxelMapEntries.push([localKey(x, y, z), "grass"]); }
          else if (type === "dirt") { dirtPos.push(pos); voxelMapEntries.push([localKey(x, y, z), "dirt"]); }
          else if (type === "stone") { stonePos.push(pos); voxelMapEntries.push([localKey(x, y, z), "stone"]); }
          else if (type === "sand") { sandPos.push(pos); voxelMapEntries.push([localKey(x, y, z), "sand"]); }
          else if (type === "bedrock") { bedrockPos.push(pos); voxelMapEntries.push([localKey(x, y, z), "bedrock"]); }
          else if (type === "water") { /* surface only */ }
          else { snowPos.push(pos); voxelMapEntries.push([localKey(x, y, z), "snow"]); }
        }
      }
    }

    const treePlacementCache = new Map<string, number>();
    const forestDensityCache = new Map<string, number>();
    const minX = worldX, minZ = worldZ, maxX = worldX + CHUNK_SIZE - 1, maxZ = worldZ + CHUNK_SIZE - 1;
    for (let twx = minX; twx <= maxX; twx++)
      for (let twz = minZ; twz <= maxZ; twz++) {
        treePlacementCache.set(`${twx},${twz}`, getTreePlacement(twx, twz));
        forestDensityCache.set(`${twx},${twz}`, getForestDensity(twx, twz));
      }

    for (let twx = minX; twx <= maxX; twx++) {
      for (let twz = minZ; twz <= maxZ; twz++) {
        if (!shouldPlaceTree(twx, twz, treePlacementCache, forestDensityCache)) continue;
        const baseY = getHeightUncached(twx, twz);
        const { wood, leaves } = getTreeBlocks(twx, baseY, twz, getBiome(twx, twz));
        for (const b of wood) {
          if (b.x >= worldX && b.x < worldX + CHUNK_SIZE && b.z >= worldZ && b.z < worldZ + CHUNK_SIZE && getBlockMod(b.x, b.y, b.z, blockMods) !== "air") {
            woodPos.push(b);
            voxelMapEntries.push([localKey(b.x - worldX, b.y, b.z - worldZ), "wood"]);
          }
        }
        for (const b of leaves) {
          if (b.x >= worldX && b.x < worldX + CHUNK_SIZE && b.z >= worldZ && b.z < worldZ + CHUNK_SIZE && getBlockMod(b.x, b.y, b.z, blockMods) !== "air" && b.y > getHeightUncached(b.x, b.z)) {
            leavesPos.push(b);
            voxelMapEntries.push([localKey(b.x - worldX, b.y, b.z - worldZ), "leaves"]);
          }
        }
      }
    }

    return {
      chunkX,
      chunkZ,
      heightmap,
      grassPos,
      dirtPos,
      stonePos,
      sandPos,
      snowPos,
      woodPos,
      leavesPos,
      bedrockPos,
      voxelMapEntries,
    };
  }

  return { generateChunkData };
}
