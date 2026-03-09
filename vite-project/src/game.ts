import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { createNoise2D } from "simplex-noise";
import type { BlockType, ChunkData, BlockPos, TreeNoiseCaches } from "./types";
export type { BlockType };
import {
  BLOCK_SIZE,
  CHUNK_SIZE,
  WATER_LEVEL,
  WATER_PLANE_Y_OFFSET,
  WORLD_HEIGHT,
  SPAWN_X,
  SPAWN_Z,
} from "./constants";
import {
  getRenderDistance,
  getRenderDistanceSq,
  getShadowsEnabled,
  getAntialias,
} from "./graphics-settings";
import { initMultiplayer, updateMultiplayer } from "./multiplayer";
import { setWorldApi } from "./world-api";
import {
  spawnEntitiesForChunk,
  despawnEntitiesInChunk,
} from "./entities/spawn";
import { updateMovement } from "./entities/movement";
import { updateAI } from "./entities/ai";
import { updateAnimation } from "./entities/animation";
import type { ChunkDataPayload, BlockModEntry } from "./terrain-core";
// ================= TERRAIN – Shared resources (reused for all chunks) =================

/** Seeded RNG for deterministic noise (same seed = same world) */
function makeSeededRandom(seed: number) {
  return function () {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

const WORLD_SEED_KEY = "voxel-world-seed";
function getOrCreateWorldSeed(): number {
  const stored = localStorage.getItem(WORLD_SEED_KEY);
  if (stored != null) {
    const n = parseInt(stored, 10);
    if (Number.isFinite(n)) return n;
  }
  const seed = (Date.now() >>> 0) ^ (Math.random() * 0xffffffff >>> 0);
  localStorage.setItem(WORLD_SEED_KEY, String(seed));
  return seed;
}
/** World seed: persisted so reloads keep same terrain; new session gets new seed. */
const WORLD_SEED = getOrCreateWorldSeed();

// --- Noise layers (seeds derived from WORLD_SEED so each reload = new terrain) ---
/** Biome distribution – very low frequency so biomes span many chunks */
const biomeNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 42));
/** Domain warp X – offsets biome noise sample position to create irregular borders */
const biomeWarpXNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 999));
/** Domain warp Z – offsets biome noise sample position in Z */
const biomeWarpZNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 1111));
/** Continental / macro terrain – broad landforms (plains, basins, highlands) */
const continentalNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 123));
/** Local terrain detail – per-biome amplitude/frequency applied here */
const detailNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 456));
/** Mountain mask – where mountains are allowed (e.g. only in certain regions) */
const mountainMaskNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 789));
/** Mountain height – actual peak shape */
const mountainHeightNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 101));
/** Erosion / valley shaping – subtracts to form valleys */
const erosionNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 202));
/** Extra smooth layer for very flat areas (plains/desert) */
const flatNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 303));
/** Forest density – low frequency, large regions (clusters + clearings). Used only in forest biome. */
const forestDensityNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 777));
/** Tree placement – per-block scale, exact tree positions. Combined with forest density in forests. */
const treePlacementNoise2D = createNoise2D(makeSeededRandom(WORLD_SEED + 888));

/** Single shared box geometry for all block types */
const sharedBlockGeometry = new THREE.BoxGeometry(
  BLOCK_SIZE,
  BLOCK_SIZE,
  BLOCK_SIZE
);

/** Shared horizontal plane for water – full block size so adjacent tiles share edges (no grid seams). */
const sharedWaterPlaneGeometry = new THREE.PlaneGeometry(
  BLOCK_SIZE,
  BLOCK_SIZE
);
sharedWaterPlaneGeometry.rotateX(-Math.PI / 2);

const textureLoader = new THREE.TextureLoader();

function setPixelFilter(tex: THREE.Texture) {
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
}

/** Shared materials – set after textures load (see init()). Grass = 6 materials for BoxGeometry faces: right, left, top, bottom, front, back. */
let sharedMaterials: {
  grass: THREE.MeshStandardMaterial[];
  dirt: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  sand: THREE.MeshStandardMaterial;
  snow: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial[];
  leaves: THREE.MeshStandardMaterial;
  bedrock: THREE.MeshStandardMaterial;
};

// ================= HOTBAR (Minecraft-Style Block-Auswahl) =================

/** Block-Typen in den 9 Hotbar-Slots (von links nach rechts). */
const HOTBAR_BLOCKS: BlockType[] = [
  "grass",
  "dirt",
  "stone",
  "sand",
  "snow",
  "wood",
  "leaves",
  "grass",
  "torch",
];

/** Anzahl pro Hotbar-Slot (Index wie HOTBAR_BLOCKS). */
const HOTBAR_COUNTS = [1, 1, 1, 1, 1, 1, 1, 1, 5]; // Fackel (Slot 8) startet mit 5

const HOTBAR_SLOTS = 9;
let selectedHotbarIndex = 0;

/** Aktuell ausgewählter Block-Typ (für Platzieren/Bauen). */
export function getSelectedBlockType(): BlockType {
  return HOTBAR_BLOCKS[selectedHotbarIndex];
}

function updateHotbarSelection(): void {
  const slots = document.querySelectorAll("#hotbar .slot");
  slots.forEach((el, i) => {
    el.classList.toggle("selected", i === selectedHotbarIndex);
  });
}

function setHotbarIndex(index: number): void {
  selectedHotbarIndex = ((index % HOTBAR_SLOTS) + HOTBAR_SLOTS) % HOTBAR_SLOTS;
  updateHotbarSelection();
}

/** Callback, wenn sich die Hotbar ändert (für UI-Sync). */
let onHotbarChange: ((blocks: BlockType[], counts: number[]) => void) | null =
  null;

/** Fügt einen aufgesammelten Block ins Inventar (Hotbar) ein. */
function addBlockToInventory(blockType: BlockType): void {
  for (let i = 0; i < HOTBAR_SLOTS; i++) {
    if (HOTBAR_BLOCKS[i] === blockType) {
      HOTBAR_COUNTS[i]++;
      onHotbarChange?.(HOTBAR_BLOCKS.slice(), HOTBAR_COUNTS.slice());
      return;
    }
  }
  const empty = HOTBAR_COUNTS.findIndex((c) => c <= 0);
  if (empty >= 0) {
    HOTBAR_BLOCKS[empty] = blockType;
    HOTBAR_COUNTS[empty] = 1;
    onHotbarChange?.(HOTBAR_BLOCKS.slice(), HOTBAR_COUNTS.slice());
  }
}

// ================= BIOMES =================

import type { Biome } from "./types";
export type { Biome };

/** Wenn gesetzt, wird beim Start eine Spawn-Position in diesem Biom gesucht (ignoriert SPAWN_X/SPAWN_Z). Sonst: null = normale Koordinaten nutzen. */
const SPAWN_BIOME: Biome | null = "forest";

/** Biome noise scale: small = large regions. ~0.002–0.004 gives very large, coherent biomes. */
const BIOME_NOISE_SCALE = 0.0008;
/** Scale for domain warp: larger = more distorted borders, 0 = perfectly smooth circles */
const BIOME_WARP_SCALE = 0.0025;
/** Strength of domain warp: how many world units the border gets pushed around */
const BIOME_WARP_STRENGTH = 80; // gentler distortion, borders still look organic

/** Continuous biome value in [0, 5] for blending (desert → plains → forest → jungle → mountain → snow). */
function getBiomeValue(x: number, z: number): number {
  // Domain warping: offset the sample point so biome borders are irregular, not smooth ellipses
  const warpX =
    biomeWarpXNoise2D(x * BIOME_WARP_SCALE, z * BIOME_WARP_SCALE) *
    BIOME_WARP_STRENGTH;
  const warpZ =
    biomeWarpZNoise2D(x * BIOME_WARP_SCALE + 5.2, z * BIOME_WARP_SCALE + 1.3) *
    BIOME_WARP_STRENGTH;
  const n = biomeNoise2D(
    (x + warpX) * BIOME_NOISE_SCALE,
    (z + warpZ) * BIOME_NOISE_SCALE
  );
  return (n + 1) * 0.5 * 5; // map [-1,1] -> [0, 5] — 6 biomes × ~0.83 units each
}

/**
 * Primary biome at world position (x, z). Deterministic, no chunk seams.
 * Desert only in flat regions (no sand mountains); mountains/forest/jungle never desert.
 */
function getBiome(x: number, z: number): Biome {
  const v = getBiomeValue(x, z);
  if (v < 0.7) {
    // No desert in mountain regions – use same mask as terrain so no "sand mountains"
    const mask =
      (mountainMaskNoise2D(x * MOUNTAIN_MASK_SCALE, z * MOUNTAIN_MASK_SCALE) +
        1) *
      0.5;
    if (mask >= MOUNTAIN_THRESHOLD) return "plains";
    return "desert";
  }
  if (v < 1.4) return "plains";
  if (v < 3.0) return "forest"; // breiterer Forest-Bereich → höhere Chance, im Wald zu spawnen
  if (v < 3.8) return "jungle";
  if (v < 4.6) return "mountain";
  return "snow";
}

/** Reused return object for getBiomeBlend (do not store reference; read and discard). */
const _biomeBlendOut: { primary: Biome; secondary: Biome; t: number } = {
  primary: "plains",
  secondary: "plains",
  t: 0,
};

/** Blend weights for two neighboring biomes (for smooth transitions). Used when 0 < blend < 1. */
function getBiomeBlend(
  x: number,
  z: number
): { primary: Biome; secondary: Biome; t: number } {
  const v = getBiomeValue(x, z);
  if (v < 0.7) {
    _biomeBlendOut.primary = "desert";
    _biomeBlendOut.secondary = "plains";
    _biomeBlendOut.t = v / 0.7;
  } else if (v < 1.4) {
    _biomeBlendOut.primary = "plains";
    _biomeBlendOut.secondary = "forest";
    _biomeBlendOut.t = (v - 0.7) / 0.7;
  } else if (v < 3.0) {
    _biomeBlendOut.primary = "forest";
    _biomeBlendOut.secondary = "jungle";
    _biomeBlendOut.t = (v - 1.4) / 1.6;
  } else if (v < 3.8) {
    _biomeBlendOut.primary = "jungle";
    _biomeBlendOut.secondary = "mountain";
    _biomeBlendOut.t = (v - 3.0) / 0.8;
  } else if (v < 4.6) {
    _biomeBlendOut.primary = "mountain";
    _biomeBlendOut.secondary = "snow";
    _biomeBlendOut.t = (v - 3.8) / 0.8;
  } else {
    _biomeBlendOut.primary = "snow";
    _biomeBlendOut.secondary = "snow";
    _biomeBlendOut.t = 1;
  }
  return _biomeBlendOut;
}

/** Per-biome: surface/subsurface block types. Sand only at water (shore/sea floor), not as biome surface. */
const BIOME_LAYERS: Record<
  Biome,
  { surface: BlockType; subsurface: BlockType; subsurfaceDepth: number }
> = {
  plains: { surface: "grass", subsurface: "dirt", subsurfaceDepth: 2 },
  desert: { surface: "sand", subsurface: "sand", subsurfaceDepth: 3 },
  forest: { surface: "grass", subsurface: "dirt", subsurfaceDepth: 2 },
  jungle: { surface: "grass", subsurface: "dirt", subsurfaceDepth: 3 },
  mountain: { surface: "grass", subsurface: "dirt", subsurfaceDepth: 2 },
  snow: { surface: "snow", subsurface: "dirt", subsurfaceDepth: 2 },
};

// ================= TERRAIN HEIGHT (multi-layer) =================
// Scaled for WORLD_HEIGHT (128) like original Minecraft; sea level at WATER_LEVEL (64).

/** Base sea level in world units (before any noise). */
const BASE_HEIGHT = 64;
/** Continental scale – very large features (valleys, highlands). */
const CONTINENTAL_SCALE = 0.0012;
const CONTINENTAL_AMPLITUDE = 20;
/** Erosion/valley scale and strength – carves valleys. */
const EROSION_SCALE = 0.018;
const EROSION_AMPLITUDE = 7;
/** Mountain mask: only where this is high do we add mountains. */
const MOUNTAIN_MASK_SCALE = 0.003;
const MOUNTAIN_HEIGHT_SCALE = 0.008;
const MOUNTAIN_AMPLITUDE = 16;
const MOUNTAIN_THRESHOLD = 0.3; // starts earlier so the ramp is longer and gentler

/** Per-biome terrain behavior: base height offset, detail amplitude, detail frequency, flatness (0=flat, 1=normal). */
const BIOME_TERRAIN: Record<
  Biome,
  {
    baseOffset: number;
    detailAmp: number;
    detailFreq: number;
    flatness: number;
    mountainAllowed: boolean;
  }
> = {
  plains: {
    baseOffset: 0,
    detailAmp: 1.3,
    detailFreq: 0.015,
    flatness: 0.97,
    mountainAllowed: false,
  },
  desert: {
    baseOffset: -1.5,
    detailAmp: 0.8,
    detailFreq: 0.01,
    flatness: 0.99,
    mountainAllowed: false,
  },
  forest: {
    baseOffset: 3,
    detailAmp: 4.5,
    detailFreq: 0.026,
    flatness: 0.7,
    mountainAllowed: true,
  },
  jungle: {
    baseOffset: 3,
    detailAmp: 9,
    detailFreq: 0.03,
    flatness: 0.5,
    mountainAllowed: true,
  },
  mountain: {
    baseOffset: 1.0,
    detailAmp: 1.2,
    detailFreq: 0.012,
    flatness: 0.85,
    mountainAllowed: true,
  },
  snow: {
    baseOffset: 6,
    detailAmp: 11,
    detailFreq: 0.022,
    flatness: 0.35,
    mountainAllowed: true,
  },
};

/**
 * Continental / macro terrain height. Broad landforms – basins and highlands.
 */
function getMacroTerrain(x: number, z: number): number {
  const n = continentalNoise2D(x * CONTINENTAL_SCALE, z * CONTINENTAL_SCALE);
  return (n + 1) * 0.5 * CONTINENTAL_AMPLITUDE; // [0, CONTINENTAL_AMPLITUDE]
}

/**
 * Local detail height for a given biome (amplitude and frequency from biome).
 */
function getLocalTerrain(x: number, z: number, biome: Biome): number {
  const params = BIOME_TERRAIN[biome];
  const n = detailNoise2D(x * params.detailFreq, z * params.detailFreq);
  const flat = flatNoise2D(x * 0.01, z * 0.01);
  const smooth = (flat + 1) * 0.5;
  const effectiveAmp =
    params.detailAmp * (params.flatness + (1 - params.flatness) * smooth);
  return n * effectiveAmp;
}

/**
 * Mountain contribution – only where mask is high and biome allows.
 * Fades out near flat-biome borders to avoid sheer cliff walls.
 */
function getMountainContribution(x: number, z: number, biome: Biome): number {
  if (!BIOME_TERRAIN[biome].mountainAllowed) return 0;

  const blend = getBiomeBlend(x, z);
  let biomeDepth = 1.0;
  if (
    blend.primary === biome &&
    !BIOME_TERRAIN[blend.secondary].mountainAllowed
  ) {
    biomeDepth = THREE.MathUtils.smoothstep(blend.t, 0.3, 0.7);
  } else if (
    blend.secondary === biome &&
    !BIOME_TERRAIN[blend.primary].mountainAllowed
  ) {
    biomeDepth = THREE.MathUtils.smoothstep(1.0 - blend.t, 0.3, 0.7);
  }
  if (biomeDepth < 0.01) return 0;

  const mask =
    (mountainMaskNoise2D(x * MOUNTAIN_MASK_SCALE, z * MOUNTAIN_MASK_SCALE) +
      1) *
    0.5;
  if (mask < MOUNTAIN_THRESHOLD) return 0;
  const t = (mask - MOUNTAIN_THRESHOLD) / (1 - MOUNTAIN_THRESHOLD);
  const mountain =
    (mountainHeightNoise2D(
      x * MOUNTAIN_HEIGHT_SCALE,
      z * MOUNTAIN_HEIGHT_SCALE
    ) +
      1) *
    0.5;
  return t * mountain * MOUNTAIN_AMPLITUDE * biomeDepth;
}

/**
 * Erosion / valley term – subtracts to form valleys.
 */
function getErosion(x: number, z: number): number {
  const n = (erosionNoise2D(x * EROSION_SCALE, z * EROSION_SCALE) + 1) * 0.5;
  return n * EROSION_AMPLITUDE;
}

/**
 * Raw terrain height at (x, z) before water level clamp. Used for blending and block type.
 */
function getRawTerrainHeight(x: number, z: number): number {
  const biome = getBiome(x, z);
  const macro = getMacroTerrain(x, z);
  const local = getLocalTerrain(x, z, biome);
  const mountain = getMountainContribution(x, z, biome);
  const erosion = getErosion(x, z);
  const h = BASE_HEIGHT + macro + local + mountain - erosion;
  return h;
}

/**
 * Smooth the terrain height by averaging with neighbors.
 * Prevents adjacent columns from differing by more than ~3 blocks (no sheer faces).
 * Uses a separate noise pass rather than recursive getHeight calls (no infinite loop).
 */
function getSmoothedHeight(x: number, z: number): number {
  const center = getRawTerrainHeight(x, z);
  const n = getRawTerrainHeight(x, z + 1);
  const s = getRawTerrainHeight(x, z - 1);
  const e = getRawTerrainHeight(x + 1, z);
  const w = getRawTerrainHeight(x - 1, z);
  return center * 0.5 + (n + s + e + w) * 0.125;
}

/** Cache terrain height per column to avoid repeated noise calculations. OPT-5: numeric key to avoid string allocs. */
const columnHeightCache = new Map<number, number>();

function columnCacheKey(bx: number, bz: number): number {
  return ((bx & 0xffff) | ((bz & 0xffff) << 16)) >>> 0;
}

/**
 * Terrain height at world (x, z). Clamped to integer block Y. Below water level is still returned
 * as the raw height (so we can place water above it); for collision we use the solid surface.
 * Uses columnHeightCache to avoid recomputing noise for the same column.
 */
function getHeight(x: number, z: number): number {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  const key = columnCacheKey(bx, bz);
  const cached = columnHeightCache.get(key);
  if (cached !== undefined) return cached;

  const blend = getBiomeBlend(x, z);
  const blendT = blend.t;
  const blendSecondary = blend.secondary;
  let h: number;
  if (blendT >= 0.85 || blendT <= 0.15) {
    h = getSmoothedHeight(x, z);
  } else {
    const h1 = getSmoothedHeight(x, z);
    const h2 =
      BASE_HEIGHT +
      getMacroTerrain(x, z) +
      getLocalTerrain(x, z, blendSecondary) +
      getMountainContribution(x, z, blendSecondary) -
      getErosion(x, z);
    h = h1 * (1 - blendT) + h2 * blendT;
  }
  const result = Math.floor(THREE.MathUtils.clamp(h, 0, WORLD_HEIGHT));
  columnHeightCache.set(key, result);
  return result;
}

/**
 * World Y of the top face of solid terrain under the given XZ area (voxel-based).
 * NOT used for physics/grounded/jump – collision is the single authority. Only for spawn height.
 * searchMaxY: search columns from this Y down to 0 (e.g. 50 or player feet + 2).
 * Excludes leaves. When getBlockAt returns null, falls back to getHeight (terrain); use only for initial spawn.
 */
function getSurfaceYVoxel(px: number, pz: number, searchMaxY: number): number {
  const minBx = Math.ceil(px - PLAYER_HALF - 0.5);
  const maxBx = Math.floor(px + PLAYER_HALF + 0.5);
  const minBz = Math.ceil(pz - PLAYER_HALF - 0.5);
  const maxBz = Math.floor(pz + PLAYER_HALF + 0.5);
  let maxSurfaceY = -0.5;
  const top = Math.min(searchMaxY, WORLD_HEIGHT - 1);
  for (let bx = minBx; bx <= maxBx; bx++) {
    for (let bz = minBz; bz <= maxBz; bz++) {
      let columnTop = -0.5;
      for (let by = top; by >= 0; by--) {
        const type = getBlockAt(bx, by, bz);
        if (type === null) {
          columnTop = getHeight(bx, bz) + 0.5;
          break;
        }
        // Nur echten Boden zählen (kein Wood), damit wir nicht auf Baumspitzen spawnen
        if (type !== "wood" && SOLID_BLOCK_TYPES.has(type as BlockType)) {
          columnTop = by + 0.5;
          break;
        }
      }
      if (columnTop > maxSurfaceY) maxSurfaceY = columnTop;
    }
  }
  return maxSurfaceY;
}

/**
 * World Y of the top face of solid terrain at (x, z). Only for spawn – do not use for physics/grounded/jump.
 * Voxel-based: considers full foot area and only solid blocks (no leaves).
 */
function getSurfaceY(x: number, z: number): number {
  return getSurfaceYVoxel(x, z, WORLD_HEIGHT);
}

/** Surface Y for a single block column (no foot-area expansion). Used for entity spawns. */
function getColumnSurfaceY(wx: number, wz: number): number {
  const bx = Math.floor(wx);
  const bz = Math.floor(wz);
  for (let by = WORLD_HEIGHT - 1; by >= 0; by--) {
    const type = getBlockAt(bx, by, bz);
    if (type === null) return getHeight(bx, bz) + 0.5;
    if (type !== "wood" && type !== "leaves" && SOLID_BLOCK_TYPES.has(type as BlockType)) {
      return by + 0.5;
    }
  }
  return getHeight(bx, bz) + 0.5;
}

/** Mindestabstand vom Weltzentrum (0,0) beim Biom-Spawn. Kleiner = früher Treffer bei Forest. */
const SPAWN_BIOME_MIN_RADIUS = 2 * CHUNK_SIZE; // 32 Blöcke – Forest wird oft früher gefunden

/** Max. Geländehöhe für Biom-Spawn – hoch genug, damit Forest/Jungle (mountainAllowed) noch Treffer liefern; zu niedrig = nur (0,0) → Mountains. */
const SPAWN_MAX_HEIGHT = WATER_LEVEL + 38;

/** Oberflächen ab dieser Höhe werden zu Stein (getBlockTypeAt). Spawn in Grass-Biomen bevorzugt darunter. */
const SURFACE_STONE_HEIGHT = WATER_LEVEL + 26;
/** In Mountains: ab dieser Höhe ist die Oberfläche schon Stein. */
const MOUNTAIN_STONE_SURFACE_HEIGHT = WATER_LEVEL + 16;

/** Check that all 4 cardinal points 1 chunk away are also in the target biome (spawn im Biom; lockere Prüfung = mehr Treffer). */
function isBiomeSolid(wx: number, wz: number, biome: Biome): boolean {
  const r = CHUNK_SIZE * 1;
  return (
    getBiome(wx + r, wz) === biome &&
    getBiome(wx - r, wz) === biome &&
    getBiome(wx, wz + r) === biome &&
    getBiome(wx, wz - r) === biome
  );
}

/** Max-Höhe für Spawn, damit die Oberfläche Gras ist (nicht Stein). Forest/Plains/Jungle: unter SURFACE_STONE_HEIGHT; Mountain: unter MOUNTAIN_STONE_SURFACE_HEIGHT. */
function getSpawnMaxHeightForGrass(biome: Biome): number {
  if (biome === "mountain") return MOUNTAIN_STONE_SURFACE_HEIGHT - 1;
  if (biome === "forest" || biome === "plains" || biome === "jungle")
    return SURFACE_STONE_HEIGHT - 1;
  return SPAWN_MAX_HEIGHT; // desert, snow: Sand/Schnee-Oberfläche, Höhe egal
}

/** Sucht die nächste Spawn-Position im angegebenen Biom (spiralig von (0,0) nach außen). Bevorzugt Land über Wasser und Höhen mit Gras-Oberfläche (kein Stein). */
function findSpawnInBiome(biome: Biome): { x: number; z: number } {
  const step = CHUNK_SIZE;
  const maxRadius = 80 * CHUNK_SIZE;
  const maxHeightPreferGrass = getSpawnMaxHeightForGrass(biome);

  const tryFind = (maxHeight: number): { x: number; z: number } | null => {
    for (
      let radius = SPAWN_BIOME_MIN_RADIUS;
      radius <= maxRadius;
      radius += step
    ) {
      const half = radius;
      for (let x = -half; x <= half; x += step) {
        const h1 = getHeight(x, -half);
        if (
          getBiome(x, -half) === biome &&
          isBiomeSolid(x, -half, biome) &&
          h1 >= WATER_LEVEL - 1 &&
          h1 <= maxHeight
        )
          return { x, z: -half };
        if (half > 0) {
          const h2 = getHeight(x, half);
          if (
            getBiome(x, half) === biome &&
            isBiomeSolid(x, half, biome) &&
            h2 >= WATER_LEVEL - 1 &&
            h2 <= maxHeight
          )
            return { x, z: half };
        }
      }
      for (let z = -half + step; z < half; z += step) {
        const h1 = getHeight(-half, z);
        if (
          getBiome(-half, z) === biome &&
          isBiomeSolid(-half, z, biome) &&
          h1 >= WATER_LEVEL - 1 &&
          h1 <= maxHeight
        )
          return { x: -half, z };
        const h2 = getHeight(half, z);
        if (
          getBiome(half, z) === biome &&
          isBiomeSolid(half, z, biome) &&
          h2 >= WATER_LEVEL - 1 &&
          h2 <= maxHeight
        )
          return { x: half, z };
      }
    }
    return null;
  };

  // Zuerst nur Positionen, wo die Oberfläche Gras (bzw. kein Stein) ist
  const withGrass = tryFind(maxHeightPreferGrass);
  if (withGrass) return withGrass;
  // Fallback: beliebige Höhe im Biom (kann Stein/Schnee sein)
  const fallback = tryFind(SPAWN_MAX_HEIGHT);
  return fallback ?? { x: 0, z: 0 };
}

/** Whether this column is at the shore (surface at or one block above water level). */
function isShore(topY: number): boolean {
  return topY >= WATER_LEVEL - 1 && topY <= WATER_LEVEL + 1;
}

/**
 * Block type at column (wx, wz) at height y. topY = getHeight(wx, wz).
 * Handles water level: beach (sand) at shore, water above submerged terrain.
 */
function getBlockTypeAt(biome: Biome, y: number, topY: number): BlockType {
  if (y === 0) return "bedrock";
  if (y > topY) {
    if (y <= WATER_LEVEL && topY < WATER_LEVEL) return "water";
    return "stone"; // air or water – caller should not ask for y > topY except water
  }
  if (isShore(topY) && y === topY) return "sand";
  if (topY < WATER_LEVEL && y === topY) return "sand"; // sea floor
  const layers = BIOME_LAYERS[biome];
  if (y === topY) {
    const surface = layers.surface;
    if (surface === "snow" && topY <= WATER_LEVEL + 2) return "sand";
    if (biome === "mountain" && topY >= MOUNTAIN_STONE_SURFACE_HEIGHT) return "stone";
    if (topY >= SURFACE_STONE_HEIGHT) return "stone";
    if (topY >= WATER_LEVEL + 20 && biome !== "desert" && biome !== "mountain" && biome !== "jungle") return "snow";
    return surface;
  }
  if (y >= topY - layers.subsurfaceDepth) return layers.subsurface;
  return "stone";
}

// ================= TREE GENERATION (deterministic, two-noise, per-chunk, no border cutoffs) =================

/** Forest density: low frequency → large forest regions and clearings. Scale ~0.02–0.04. */
const FOREST_DENSITY_SCALE = 0.028;
/** Tree placement: higher frequency → exact positions. */
const TREE_PLACEMENT_SCALE = 0.12;
const FOREST_DENSITY_THRESHOLD = 0.0;
const TREE_PLACEMENT_FOREST_THRESHOLD = -0.1;
const TREE_PLACEMENT_JUNGLE_THRESHOLD = -0.45; // denser than forest (-0.1)
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

/** Deterministic value in [0,1] from world (x,z) for tree shape variation. */
function treeSeedValue(x: number, z: number): number {
  const n = treePlacementNoise2D(x * 0.7 + 100, z * 0.7);
  return (n + 1) * 0.5;
}

/** Layer 1: Forest density at (wx, wz). High = dense forest region, low = clearing. Only meaningful in forest biome. */
function getForestDensity(wx: number, wz: number): number {
  return forestDensityNoise2D(
    wx * FOREST_DENSITY_SCALE,
    wz * FOREST_DENSITY_SCALE
  );
}

/** Layer 2: Tree placement value at (wx, wz). Used for exact position and local-max spacing. */
function getTreePlacement(wx: number, wz: number): number {
  return treePlacementNoise2D(
    wx * TREE_PLACEMENT_SCALE,
    wz * TREE_PLACEMENT_SCALE
  );
}

function getTreePlacementCached(
  wx: number,
  wz: number,
  cache?: Map<string, number>
): number {
  if (cache) {
    const k = `${wx},${wz}`;
    let v = cache.get(k);
    if (v === undefined) {
      v = getTreePlacement(wx, wz);
      cache.set(k, v);
    }
    return v;
  }
  return getTreePlacement(wx, wz);
}

function getForestDensityCached(
  wx: number,
  wz: number,
  cache?: Map<string, number>
): number {
  if (cache) {
    const k = `${wx},${wz}`;
    let v = cache.get(k);
    if (v === undefined) {
      v = getForestDensity(wx, wz);
      cache.set(k, v);
    }
    return v;
  }
  return getForestDensity(wx, wz);
}

/** Combined pass for forest: must be in forest region (density) and pass placement threshold. */
function getTreePlacementPass(
  wx: number,
  wz: number,
  biome: Biome,
  caches?: TreeNoiseCaches
): boolean {
  const placement = getTreePlacementCached(wx, wz, caches?.treePlacement);
  if (biome === "forest") {
    const forestDensity = getForestDensityCached(wx, wz, caches?.forestDensity);
    if (forestDensity <= FOREST_DENSITY_THRESHOLD) return false;
    return placement > TREE_PLACEMENT_FOREST_THRESHOLD;
  }
  if (biome === "jungle") {
    const forestDensity = getForestDensityCached(wx, wz, caches?.forestDensity);
    if (forestDensity <= FOREST_DENSITY_THRESHOLD) return false;
    return placement > TREE_PLACEMENT_JUNGLE_THRESHOLD;
  }
  if (biome === "mountain")
    return placement > TREE_PLACEMENT_MOUNTAIN_THRESHOLD;
  if (biome === "plains") return placement > TREE_PLACEMENT_PLAINS_THRESHOLD;
  if (biome === "snow") return placement > TREE_PLACEMENT_SNOW_THRESHOLD;
  return false;
}

/** True if (wx, wz) is a local maximum of tree placement in 3×3 → min spacing, no grid. */
function isLocalTreeMax(
  wx: number,
  wz: number,
  treePlacementCache?: Map<string, number>
): boolean {
  const center = getTreePlacementCached(wx, wz, treePlacementCache);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (dx === 0 && dz === 0) continue;
      if (
        getTreePlacementCached(wx + dx, wz + dz, treePlacementCache) >= center
      )
        return false;
    }
  }
  return true;
}

/** No trees on steep terrain (cliffs). Max height difference to 4 neighbors must be ≤ TREE_MAX_SLOPE. */
function isTerrainFlatEnough(wx: number, wz: number): boolean {
  const h = getHeight(wx, wz);
  for (const [dx, dz] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    if (Math.abs(getHeight(wx + dx, wz + dz) - h) > TREE_MAX_SLOPE)
      return false;
  }
  return true;
}

/** Whether a tree should be placed at (wx, wz): grass above water, biome, two-layer noise, spacing, no cliffs. */
function shouldPlaceTree(
  wx: number,
  wz: number,
  caches?: TreeNoiseCaches
): boolean {
  const biome = getBiome(wx, wz);
  if (biome === "desert") return false;
  const topY = getHeight(wx, wz);
  if (topY < WATER_LEVEL) return false;
  if (biome === "mountain" && topY >= WATER_LEVEL + 18) return false;
  const surfaceType = getBlockTypeAt(biome, topY, topY);
  if (surfaceType !== "grass") return false;
  if (!isTerrainFlatEnough(wx, wz)) return false;
  if (!getTreePlacementPass(wx, wz, biome, caches)) return false;
  if (!isLocalTreeMax(wx, wz, caches?.treePlacement)) return false;
  return true;
}

/** Use deterministic "random" for leaf corners: skip some based on (x,z) seed. */
function shouldPlaceLeafAtCorner(
  wx: number,
  wz: number,
  lx: number,
  lz: number
): boolean {
  const v = treeSeedValue(wx + lx, wz + lz);
  return v >= 0.5;
}

/** Squared distance for sphere-like canopy (avoid sqrt). */
function leafDistSq(dx: number, dy: number, dz: number): number {
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Generate trunk + leaf block positions for a single tree. Deterministic from (wx, baseY, wz, biome).
 * Canopy is cube-like with optional sphere culling for a rounder shape.
 */
function getTreeBlocks(
  wx: number,
  baseY: number,
  wz: number,
  biome: Biome
): {
  wood: Array<{ x: number; y: number; z: number }>;
  leaves: Array<{ x: number; y: number; z: number }>;
} {
  const wood: Array<{ x: number; y: number; z: number }> = [];
  const leaves: Array<{ x: number; y: number; z: number }> = [];
  const t = treeSeedValue(wx, wz);
  const trunkHeight =
    biome === "snow"
      ? TRUNK_HEIGHT_SNOW + Math.floor(t * 2)
      : biome === "forest"
      ? TRUNK_HEIGHT_FOREST + Math.floor(t * 2)
      : biome === "jungle"
      ? TRUNK_HEIGHT_JUNGLE + Math.floor(t * 3)
      : biome === "mountain"
      ? TRUNK_HEIGHT_MOUNTAIN + Math.floor(t * 1)
      : TRUNK_HEIGHT_PLAINS + Math.floor(t * 1);
  const leafRadius =
    biome === "snow"
      ? LEAF_RADIUS_SNOW
      : biome === "forest"
      ? LEAF_RADIUS_FOREST
      : biome === "jungle"
      ? LEAF_RADIUS_JUNGLE
      : biome === "mountain"
      ? LEAF_RADIUS_MOUNTAIN
      : LEAF_RADIUS_PLAINS;
  const leafHeight =
    biome === "snow"
      ? LEAF_HEIGHT_SNOW
      : biome === "forest"
      ? LEAF_HEIGHT_FOREST
      : biome === "jungle"
      ? LEAF_HEIGHT_JUNGLE
      : biome === "mountain"
      ? LEAF_HEIGHT_MOUNTAIN
      : LEAF_HEIGHT_PLAINS;
  const topY = baseY + trunkHeight;
  const canopyCenterY = topY + Math.floor(leafHeight * 0.5);
  const maxLeafDistSq = (leafRadius + 0.5) * (leafRadius + 0.5);

  for (let h = 1; h <= trunkHeight; h++) {
    wood.push({ x: wx, y: baseY + h, z: wz });
  }
  for (let dy = 0; dy < leafHeight; dy++) {
    const y = topY + dy;
    const r = dy === leafHeight - 1 ? Math.max(0, leafRadius - 1) : leafRadius;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx === 0 && dz === 0 && dy === 0) continue;
        if (r > 0 && Math.abs(dx) === r && Math.abs(dz) === r) {
          if (!shouldPlaceLeafAtCorner(wx, wz, dx, dz)) continue;
        }
        if (
          (biome === "forest" || biome === "jungle") &&
          leafDistSq(dx, y - canopyCenterY, dz) > maxLeafDistSq
        )
          continue;
        leaves.push({ x: wx + dx, y, z: wz + dz });
      }
    }
  }
  return { wood, leaves };
}

/**
 * Generate a single tree at world position (ground block top = worldY). Returns wood and leaf positions.
 * Use this when you need tree blocks for a known root; chunk generation uses this internally.
 */
function generateTree(
  worldX: number,
  worldY: number,
  worldZ: number
): {
  wood: Array<{ x: number; y: number; z: number }>;
  leaves: Array<{ x: number; y: number; z: number }>;
} {
  const biome = getBiome(worldX, worldZ);
  return getTreeBlocks(worldX, worldY, worldZ, biome);
}

// ================= PLAYER COLLISION (voxel AABB) =================

/** Player height for camera / shadow; collision uses PLAYER_HEIGHT in voxel section. */
const playerHeight = 1.8;

/** Chunk key from chunk coordinates (string, for entity registry / save). */
function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/** Numeric chunk key for Map lookup (no allocation). */
function chunkKeyNumeric(cx: number, cz: number): number {
  return ((cx & 0xffff) << 16) | (cz & 0xffff);
}

/** Numeric block key for world (bx, by, bz). 11 bits x/z (±1024), 8 bits y (0..255). Fits in 32 bits. */
function blockKeyNumeric(bx: number, by: number, bz: number): number {
  const ix = (Math.floor(bx) + 1024) & 0x7ff;
  const iy = Math.floor(by) & 0xff;
  const iz = (Math.floor(bz) + 1024) & 0x7ff;
  return ix | (iy << 11) | (iz << 19);
}

/** Local block key within chunk (lx in [0,15], ly in [0,WORLD_HEIGHT), lz in [0,15]). */
function localKey(lx: number, ly: number, lz: number): number {
  return lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * WORLD_HEIGHT;
}

/** Decode numeric block key to coordinates (for save iteration). */
function blockKeyFromNumeric(k: number): { bx: number; by: number; bz: number } {
  const bx = (k & 0x7ff) - 1024;
  const by = (k >> 11) & 0xff;
  const bz = ((k >> 19) & 0x7ff) - 1024;
  return { bx, by, bz };
}

/** Block modification storage: numeric key -> "air" or BlockType. Persists across chunk unload/reload. */
const blockModifications = new Map<number, BlockType | "air">();

/** Invalidate height cache for a column so getHeight can be recomputed after block change. */
function invalidateColumnHeight(bx: number, bz: number): void {
  columnHeightCache.delete(columnCacheKey(bx, bz));
}

// ================= AUTOSAVE (localStorage) =================

const SAVE_KEY = "voxel-save";
const SAVE_VERSION = 2;
const AUTOSAVE_INTERVAL_MS = 10000;

/** Pending camera orientation from load; applied once after PointerLockControls is created. */
let loadedRotationY: number | null = null;
let loadedLookPitch: number | null = null;

interface SaveData {
  saveVersion: number;
  worldSeed: number;
  player: {
    x: number;
    y: number;
    z: number;
    rotationY: number;
    lookPitch: number;
  };
  removedBlocks: Array<{ x: number; y: number; z: number }>;
  placedBlocks: Array<{ x: number; y: number; z: number; type: BlockType }>;
  placedTorches?: Array<{ x: number; y: number; z: number }>;
  dayTime?: number;
}

function getPlayerState(): SaveData["player"] {
  return {
    x: player.position.x,
    y: player.position.y,
    z: player.position.z,
    rotationY: lastLookYaw,
    lookPitch: lastLookPitch,
  };
}

function saveGame(): void {
  if (!scene || !player) return;
  const removedBlocks: Array<{ x: number; y: number; z: number }> = [];
  const placedBlocks: Array<{
    x: number;
    y: number;
    z: number;
    type: BlockType;
  }> = [];
  for (const [numKey, value] of blockModifications) {
    const { bx: x, by: y, bz: z } = blockKeyFromNumeric(numKey);
    if (value === "air") removedBlocks.push({ x, y, z });
    else placedBlocks.push({ x, y, z, type: value });
  }
  const state: SaveData = {
    saveVersion: SAVE_VERSION,
    worldSeed: WORLD_SEED,
    player: getPlayerState(),
    removedBlocks,
    placedBlocks,
    placedTorches: placedTorches.map((t) => ({ x: t.x, y: t.y, z: t.z })),
    dayTime: dayTime % 1,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // quota exceeded or disabled
  }
}

const VALID_BLOCK_TYPES = new Set<string>([
  "grass",
  "dirt",
  "stone",
  "sand",
  "snow",
  "water",
  "wood",
  "leaves",
]);

function loadGame(): boolean {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  let data: SaveData;
  try {
    data = JSON.parse(raw) as SaveData;
  } catch {
    return false;
  }
  if (data.saveVersion > SAVE_VERSION || data.saveVersion < 1 || !data.player)
    return false;
  if (data.worldSeed !== WORLD_SEED) return false;

  for (const { x, y, z } of data.removedBlocks ?? []) {
    blockModifications.set(blockKeyNumeric(x, y, z), "air");
    invalidateColumnHeight(x, z);
  }
  for (const b of data.placedBlocks ?? []) {
    if (VALID_BLOCK_TYPES.has(b.type)) {
      blockModifications.set(blockKeyNumeric(b.x, b.y, b.z), b.type as BlockType);
      invalidateColumnHeight(b.x, b.z);
    }
  }

  if (typeof torchContainer !== "undefined") {
    while (placedTorches.length) placedTorches.pop();
    while (torchContainer.children.length)
      torchContainer.remove(torchContainer.children[0]);
    for (const t of data.placedTorches ?? []) {
      const group = createTorchGroup(t.x, t.y, t.z);
      torchContainer.add(group);
      placedTorches.push({ x: t.x, y: t.y, z: t.z, group });
    }
  }

  // Alle Chunks im Fußabdruck der gespeicherten Position laden (wie beim Spawn).
  if (typeof scene !== "undefined") {
    const px = data.player.x;
    const pz = data.player.z;
    const footHalf = PLAYER_HALF + 0.5;
    const minCx = Math.floor((px - footHalf) / CHUNK_SIZE);
    const maxCx = Math.floor((px + footHalf) / CHUNK_SIZE);
    const minCz = Math.floor((pz - footHalf) / CHUNK_SIZE);
    const maxCz = Math.floor((pz + footHalf) / CHUNK_SIZE);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        if (!chunks.has(chunkKeyNumeric(cx, cz))) generateChunk(scene, cx, cz);
      }
    }
  }
  const loadY = getSurfaceY(data.player.x, data.player.z);
  player.position.set(data.player.x, loadY, data.player.z);
  pendingSpawn = null;
  player.visible = true;
  lastLookYaw = data.player.rotationY;
  lastLookPitch = data.player.lookPitch;
  loadedRotationY = data.player.rotationY;
  loadedLookPitch = data.player.lookPitch;
  if (data.dayTime != null) dayTime = data.dayTime;
  return true;
}

const chunks = new Map<number, ChunkData>();

/** Web Worker for async chunk generation (avoids main-thread stutter). */
let chunkWorker: Worker | null = null;
/** Chunk key numbers we've requested from the worker but not yet received. */
const pendingChunkKeys = new Set<number>();
/** Wenn gesetzt: Spawn-Position erst setzen, wenn alle benötigten Chunks geladen sind (Worker-Lieferung abwarten). */
let pendingSpawn: { spawnX: number; spawnZ: number; chunkKeys: Set<number> } | null = null;

// ================= VOXEL BLOCK LOOKUP (for AABB collision) =================

/** Block types that are solid for player collision. Leaves and water are not solid. */
const SOLID_BLOCK_TYPES = new Set<BlockType>([
  "grass",
  "dirt",
  "stone",
  "sand",
  "snow",
  "wood",
  "bedrock",
]);

/**
 * Get block type at world block coordinates (bx, by, bz). Uses blockModifications first, then chunk voxelMap.
 * Returns null if chunk is not loaded. Uses numeric keys only (no per-call allocation).
 */
function getBlockAt(
  bx: number,
  by: number,
  bz: number
): BlockType | "air" | null {
  const ix = Math.floor(bx);
  const iy = Math.floor(by);
  const iz = Math.floor(bz);
  if (iy < 0 || iy >= WORLD_HEIGHT) return "air";
  const mod = blockModifications.get(blockKeyNumeric(ix, iy, iz));
  if (mod !== undefined) return mod;
  const cx = Math.floor(ix / CHUNK_SIZE);
  const cz = Math.floor(iz / CHUNK_SIZE);
  const data = chunks.get(chunkKeyNumeric(cx, cz));
  if (!data) return null;
  const lx = ix - data.cx * CHUNK_SIZE;
  const lz = iz - data.cz * CHUNK_SIZE;
  return data.voxelMap.get(localKey(lx, iy, lz)) ?? "air";
}

/** Whether the block at (bx, by, bz) is solid for collision. Chunk not loaded → treat as solid to avoid falling through. */
function isSolidBlock(bx: number, by: number, bz: number): boolean {
  const type = getBlockAt(bx, by, bz);
  if (type === null) return true;
  return SOLID_BLOCK_TYPES.has(type as BlockType);
}

/**
 * Fill _aabbBlockBuffer with solid block coordinates overlapping the given AABB; returns count.
 * Blocks are center-based: block at (bx, by, bz) has bounds [bx±0.5], [by±0.5], [bz±0.5].
 * AABB: center (px, py, pz), halfX/halfZ in XZ, height in Y (bottom py, top py+height).
 */
function fillBlocksInAABB(
  px: number,
  py: number,
  pz: number,
  halfX: number,
  halfZ: number,
  height: number
): number {
  _aabbBlockCount = 0;
  const minBx = Math.ceil(px - halfX - 0.5);
  const maxBx = Math.floor(px + halfX + 0.5);
  const minBy = Math.floor(py);
  const maxBy = Math.floor(py + height);
  const minBz = Math.ceil(pz - halfZ - 0.5);
  const maxBz = Math.floor(pz + halfZ + 0.5);
  for (let bx = minBx; bx <= maxBx; bx++) {
    for (let by = minBy; by <= maxBy; by++) {
      for (let bz = minBz; bz <= maxBz; bz++) {
        if (isSolidBlock(bx, by, bz)) {
          const slot = _aabbBlockBuffer[_aabbBlockCount];
          slot.bx = bx;
          slot.by = by;
          slot.bz = bz;
          _aabbBlockCount++;
        }
      }
    }
  }
  return _aabbBlockCount;
}

/** Player AABB: half extent in XZ, full height in Y. */
const PLAYER_HALF = 0.3;
const PLAYER_HEIGHT = 1.8;

/** Result of voxel AABB collision resolution. grounded is true only when we hit the top face of a block while moving downward. */
export interface CollisionResult {
  hitX: boolean;
  hitZ: boolean;
  hitYUp: boolean;
  hitYDown: boolean;
  grounded: boolean;
}

/** Pass this to resolveVoxelCollisions to record every position correction (for debugging jitter). */
export interface CollisionDebug {
  snaps: Array<{
    axis: "x" | "z" | "y";
    reason: string;
    from: number;
    to: number;
  }>;
}

/** Set to true to log collision snaps and large position deltas in the game loop (player only). Enable in console: window.__DEBUG_COLLISION = true */
let DEBUG_COLLISION = false;
declare global {
  interface Window {
    __DEBUG_COLLISION?: boolean;
  }
}
if (typeof window !== "undefined") {
  Object.defineProperty(window, "__DEBUG_COLLISION", {
    get: () => DEBUG_COLLISION,
    set: (v: boolean) => {
      DEBUG_COLLISION = v;
      console.log("[collision] DEBUG_COLLISION =", v);
    },
    configurable: true,
  });
}

/**
 * Resolve voxel AABB collisions: apply velocity per axis (X → Z → Y), push out of solid blocks, zero velocity on hit.
 * Mutates position and velocity in place. Returns collision flags; grounded is true only when landing on a block (Y down).
 * halfX, halfZ, height define the AABB (center at position, full height in Y).
 * If debug is provided, every position correction is recorded in debug.snaps (for debugging movement jitter).
 */
export function resolveVoxelCollisions(
  position: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
  dt: number,
  halfX: number,
  halfZ: number,
  height: number,
  debug?: CollisionDebug
): CollisionResult {
  const blockMin = (b: number) => b - 0.5;
  const blockMax = (b: number) => b + 0.5;
  const FLOOR_TOLERANCE = 0.05;
  const result: CollisionResult = {
    hitX: false,
    hitZ: false,
    hitYUp: false,
    hitYDown: false,
    grounded: false,
  };

  // --- X --- only resolve true side (wall) collisions; floor is handled by Y pass only
  position.x += velocity.x * dt;
  for (let iter = 0; iter < 4; iter++) {
    fillBlocksInAABB(
      position.x,
      position.y,
      position.z,
      halfX,
      halfZ,
      height
    );
    let resolved = false;
    for (let i = 0; i < _aabbBlockCount; i++) {
      const { bx, by, bz } = _aabbBlockBuffer[i];
      const zOvlp =
        Math.min(position.z + halfZ, bz + 0.5) -
        Math.max(position.z - halfZ, bz - 0.5);
      if (zOvlp <= 1e-4) continue;
      const blockMinX = blockMin(bx);
      const blockMaxX = blockMax(bx);
      const blockMaxY = blockMax(by);
      const isFloorBlock = blockMaxY <= position.y + FLOOR_TOLERANCE;
      const playerFullyAbove = position.y >= blockMaxY - FLOOR_TOLERANCE;
      // Skip only floor block we're standing on; walls at foot level stay as walls
      if (isFloorBlock && playerFullyAbove) continue;
      const playerMinX = position.x - halfX;
      const playerMaxX = position.x + halfX;
      const overlapMinX = Math.max(playerMinX, blockMinX);
      const overlapMaxX = Math.min(playerMaxX, blockMaxX);
      if (overlapMaxX - overlapMinX <= 0) continue;
      const fromX = position.x;
      if (velocity.x > 0) position.x = blockMinX - halfX;
      else if (velocity.x < 0) position.x = blockMaxX + halfX;
      else position.x = position.x < bx ? blockMinX - halfX : blockMaxX + halfX;
      debug?.snaps.push({
        axis: "x",
        reason: "wall",
        from: fromX,
        to: position.x,
      });
      velocity.x = 0;
      result.hitX = true;
      resolved = true;
      break;
    }
    if (!resolved) break;
  }

  // --- Z --- only resolve true side (wall) collisions; floor is handled by Y pass only
  position.z += velocity.z * dt;
  for (let iter = 0; iter < 4; iter++) {
    fillBlocksInAABB(
      position.x,
      position.y,
      position.z,
      halfX,
      halfZ,
      height
    );
    let resolved = false;
    for (let i = 0; i < _aabbBlockCount; i++) {
      const { bx, by, bz } = _aabbBlockBuffer[i];
      const xOvlp =
        Math.min(position.x + halfX, bx + 0.5) -
        Math.max(position.x - halfX, bx - 0.5);
      if (xOvlp <= 1e-4) continue;
      const blockMinZ = blockMin(bz);
      const blockMaxZ = blockMax(bz);
      const blockMaxY = blockMax(by);
      const isFloorBlock = blockMaxY <= position.y + FLOOR_TOLERANCE;
      const playerFullyAbove = position.y >= blockMaxY - FLOOR_TOLERANCE;
      // Skip only floor block we're standing on; walls at foot level stay as walls
      if (isFloorBlock && playerFullyAbove) continue;
      const playerMinZ = position.z - halfZ;
      const playerMaxZ = position.z + halfZ;
      const overlapMinZ = Math.max(playerMinZ, blockMinZ);
      const overlapMaxZ = Math.min(playerMaxZ, blockMaxZ);
      if (overlapMaxZ - overlapMinZ <= 0) continue;
      const fromZ = position.z;
      if (velocity.z > 0) position.z = blockMinZ - halfZ;
      else if (velocity.z < 0) position.z = blockMaxZ + halfZ;
      else position.z = position.z < bz ? blockMinZ - halfZ : blockMaxZ + halfZ;
      debug?.snaps.push({
        axis: "z",
        reason: "wall",
        from: fromZ,
        to: position.z,
      });
      velocity.z = 0;
      result.hitZ = true;
      resolved = true;
      break;
    }
    if (!resolved) break;
  }

  // --- Y --- grounded only when we land on the top face of a block. When multiple blocks overlap (e.g. floor + ceiling),
  // resolve against the correct surface only: when falling use the highest floor (max blockMaxY), when rising use the lowest ceiling (min blockMinY).
  // This prevents sink→push every frame (jitter) from resolving the "wrong" block first.
  position.y += velocity.y * dt;
  for (let iter = 0; iter < 4; iter++) {
    fillBlocksInAABB(
      position.x,
      position.y,
      position.z,
      halfX,
      halfZ,
      height
    );
    let bestBlock: { blockMinY: number; blockMaxY: number } | null = null;
    for (let i = 0; i < _aabbBlockCount; i++) {
      const { bx, by, bz } = _aabbBlockBuffer[i];
      const xOvlp =
        Math.min(position.x + halfX, bx + 0.5) -
        Math.max(position.x - halfX, bx - 0.5);
      const zOvlp =
        Math.min(position.z + halfZ, bz + 0.5) -
        Math.max(position.z - halfZ, bz - 0.5);
      if (xOvlp <= 0.001 || zOvlp <= 0.001) continue;
      const blockMinY = blockMin(by);
      const blockMaxY = blockMax(by);
      const playerMinY = position.y;
      const playerMaxY = position.y + height;
      const overlapMinY = Math.max(playerMinY, blockMinY);
      const overlapMaxY = Math.min(playerMaxY, blockMaxY);
      if (overlapMaxY - overlapMinY <= 0) continue;
      if (velocity.y > 0) {
        // Rising: choose the lowest ceiling (smallest blockMinY we overlap)
        if (!bestBlock || blockMinY < bestBlock.blockMinY)
          bestBlock = { blockMinY, blockMaxY };
      } else {
        // Falling or still: choose the highest floor (largest blockMaxY we overlap)
        if (!bestBlock || blockMaxY > bestBlock.blockMaxY)
          bestBlock = { blockMinY, blockMaxY };
      }
    }
    if (!bestBlock) break;
    const { blockMinY, blockMaxY } = bestBlock;
    const fromY = position.y;
    if (velocity.y > 0) {
      position.y = blockMinY - height;
      debug?.snaps.push({
        axis: "y",
        reason: "ceiling",
        from: fromY,
        to: position.y,
      });
      velocity.y = 0;
      result.hitYUp = true;
    } else {
      const feetBeforeResolve = position.y;
      const isFloor = feetBeforeResolve >= blockMaxY - FLOOR_TOLERANCE;
      position.y = blockMaxY;
      debug?.snaps.push({
        axis: "y",
        reason: "floor",
        from: fromY,
        to: position.y,
      });
      velocity.y = 0;
      result.hitYDown = true;
      if (isFloor) result.grounded = true;
    }
  }
  return result;
}

// Raycaster für Block-Abbau (Halten auf Block = "abbauen")
const raycaster = new THREE.Raycaster();
const rayOrigin = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
const BREAK_DISTANCE = 5; // maximale Reichweite zum Abbauen (in Blöcken)
const BREAK_TIME = 1.0; // Sekunden Halten bis Block abbricht

/** Aktuelles Ziel beim Halten: gleicher Block = Fortschritt, anderer Block = Reset (Weltkoordinaten, nicht Instanz-Index). */
let breakTarget: {
  chunkKeyNum: number;
  blockType: BlockType;
  x: number;
  y: number;
  z: number;
} | null = null;
let breakProgress = 0;
let isMouseDown = false;
/** Einmal pro Rechtsklick: Platzieren (Fackel oder Block) auslösen. */
let rightMouseJustPressed = false;

/** Schwebende Drop-Items nach Block-Abbau (werden aufgesammelt beim Durchlaufen). */
interface Drop {
  position: THREE.Vector3;
  blockType: BlockType;
  group: THREE.Group;
  bobPhase: number;
}
const drops: Drop[] = [];
const PICKUP_RADIUS = 1.4;
const DROP_BOB_SPEED = 3;
const DROP_BOB_HEIGHT = 0.08;

/** Platziere Fackeln: Weltposition (Mitte der Fackel) + Group (Mesh + PointLight). */
interface PlacedTorch {
  x: number;
  y: number;
  z: number;
  group: THREE.Group;
}
const placedTorches: PlacedTorch[] = [];
const PLACE_DISTANCE = 5;

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _projScreenMatrix = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _lastCameraMatrixWorld = new THREE.Matrix4();
/** Letzte an die GPU gesendete FOV (nur bei Änderung updateProjectionMatrix aufrufen). */
let _lastUploadedFov = -1;
let _frustumDirty = true;
const _chunkBox = new THREE.Box3();
const _chunkBoxMin = new THREE.Vector3();
const _chunkBoxMax = new THREE.Vector3();
const _right = new THREE.Vector3();
const _lookDir = new THREE.Vector3();
/** Zielpunkt für Third-Person: Kamera blickt auf Spieler-Mitte, damit der Char im Bildzentrum bleibt. */
const _thirdPersonLookTarget = new THREE.Vector3();
/** OPT-4: scratch for camera offset (avoids new Vector3 per frame). */
const _cameraOffset = new THREE.Vector3();

// Pre-allocated colors for sky/fog (OPT-1: avoid per-frame allocations)
const _clearDay = new THREE.Color(0x87ceeb);
const _clearGolden = new THREE.Color(0xd49a6a);
const _clearDusk = new THREE.Color(0x3a2050);
const _clearNight = new THREE.Color(0x06101e);
const _fogDay = new THREE.Color(0x8ed4f0);
const _fogGolden = new THREE.Color(0xc98f65);
const _fogDusk = new THREE.Color(0x2a1840);
const _fogNight = new THREE.Color(0x0b0f1a);
const _skyTopDay = new THREE.Color(0x4a9eda);
const _skyTopGolden = new THREE.Color(0x5a3888);
const _skyTopNight = new THREE.Color(0x03070f);
const _skyHorizonDay = new THREE.Color(0xa8ddf0);
const _skyHorizonGolden = new THREE.Color(0xe8a050);
const _skyHorizonDusk = new THREE.Color(0x4a1f5a);
const _skyHorizonNight = new THREE.Color(0x070d18);
const _skyBottomDay = new THREE.Color(0xd0eef8);
const _skyBottomGolden = new THREE.Color(0xe8aa66);
const _skyBottomNight = new THREE.Color(0x020509);
const _sunColorOrange = new THREE.Color(0xffb366);
const _sunColorWarm = new THREE.Color(0xffddaa);
const _sunDiscOrange = new THREE.Color(0xffaa55);
const _hemiAmber = new THREE.Color(0xe0a878);
const _hemiPurple = new THREE.Color(0x2a1540);
const _cloudGolden = new THREE.Color(0xe8b8a8);
const _cloudNight = new THREE.Color(0x666688);
const _clearColorTemp = new THREE.Color();

// OPT-2: reusable AABB block buffer (avoids array/object allocs in resolveVoxelCollisions)
const _aabbBlockBuffer: Array<{ bx: number; by: number; bz: number }> = [];
for (let i = 0; i < 512; i++) _aabbBlockBuffer.push({ bx: 0, by: 0, bz: 0 });
let _aabbBlockCount = 0;

// OPT-3: cache block meshes for raycasting; invalidated on chunk load/unload
let _raycastMeshCache: THREE.InstancedMesh[] = [];
let _raycastMeshDirty = true;

/**
 * Build one InstancedMesh for a list of world positions and add it to the group.
 * Material can be a single material or an array of 6 (one per BoxGeometry face: right, left, top, bottom, front, back).
 * Optional userData for raycast-based block breaking (chunkKeyNum, blockType).
 */
function addInstancedLayer(
  group: THREE.Group,
  positions: BlockPos[],
  material: THREE.Material | THREE.Material[],
  userData?: { chunkKeyNum: number; blockType: BlockType }
): THREE.InstancedMesh | null {
  const count = positions.length;
  if (count === 0) return null;

  const mesh = new THREE.InstancedMesh(
    sharedBlockGeometry,
    material as THREE.Material,
    count
  );
  mesh.count = count;

  for (let i = 0; i < count; i++) {
    const p = positions[i];
    _position.set(p.x, p.y, p.z);
    _matrix.makeTranslation(_position.x, _position.y, _position.z);
    mesh.setMatrixAt(i, _matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (userData) mesh.userData = userData;

  group.add(mesh);
  return mesh;
}

/**
 * Build a single water surface mesh for a chunk with shared vertices at edges.
 * Grid (CHUNK_SIZE+1)×(CHUNK_SIZE+1) vertices; one quad per water cell, fewer vertices than per-quad.
 */
function buildChunkWaterGeometry(
  worldX: number,
  worldZ: number,
  heightmap?: number[][]
): THREE.BufferGeometry | null {
  const waterY = WATER_LEVEL + 0.5 + WATER_PLANE_Y_OFFSET;
  const gridSize = CHUNK_SIZE + 1;
  const positions = new Float32Array(gridSize * gridSize * 3);
  const normals = new Float32Array(gridSize * gridSize * 3);
  for (let lz = 0; lz < gridSize; lz++) {
    for (let lx = 0; lx < gridSize; lx++) {
      const i = (lx + lz * gridSize) * 3;
      positions[i] = worldX + lx;
      positions[i + 1] = waterY;
      positions[i + 2] = worldZ + lz;
      normals[i] = 0;
      normals[i + 1] = 1;
      normals[i + 2] = 0;
    }
  }
  const indices: number[] = [];
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const topY = heightmap
        ? heightmap[lx][lz]
        : getHeight(worldX + lx, worldZ + lz);
      if (topY >= WATER_LEVEL) continue;
      const i00 = lx + lz * gridSize;
      const i10 = lx + 1 + lz * gridSize;
      const i01 = lx + (lz + 1) * gridSize;
      const i11 = lx + 1 + (lz + 1) * gridSize;
      indices.push(i00, i10, i11, i00, i11, i01);
    }
  }
  if (indices.length === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

/**
 * Generate a 16×16 chunk: InstancedMesh per solid block type + one merged water mesh per chunk.
 * Water is a single surface per chunk (shared vertices at edges → no grid seams).
 */
function generateChunk(
  scene: THREE.Scene,
  chunkX: number,
  chunkZ: number
): ChunkData {
  const keyNum = chunkKeyNumeric(chunkX, chunkZ);
  const existing = chunks.get(keyNum);
  if (existing) return existing;

  const worldX = chunkX * CHUNK_SIZE;
  const worldZ = chunkZ * CHUNK_SIZE;

  const heightmap: number[][] = [];
  for (let x = 0; x < CHUNK_SIZE; x++) {
    heightmap[x] = [];
    for (let z = 0; z < CHUNK_SIZE; z++) {
      heightmap[x][z] = getHeight(worldX + x, worldZ + z);
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
  const voxelMap = new Map<number, BlockType>();

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = worldX + x;
      const wz = worldZ + z;
      const topY = heightmap[x][z];
      const biome = getBiome(wx, wz);

      for (let y = 0; y <= topY; y++) {
        let type = getBlockTypeAt(biome, y, topY);
        const mod = blockModifications.get(blockKeyNumeric(wx, y, wz));
        if (mod === "air") continue;
        if (mod !== undefined) type = mod;
        const pos = { x: wx, y, z: wz };
        if (type === "grass") {
          grassPos.push(pos);
          voxelMap.set(localKey(x, y, z), "grass");
        } else if (type === "dirt") {
          dirtPos.push(pos);
          voxelMap.set(localKey(x, y, z), "dirt");
        } else if (type === "stone") {
          stonePos.push(pos);
          voxelMap.set(localKey(x, y, z), "stone");
        } else if (type === "sand") {
          sandPos.push(pos);
          voxelMap.set(localKey(x, y, z), "sand");
        } else if (type === "bedrock") {
          bedrockPos.push(pos);
          voxelMap.set(localKey(x, y, z), "bedrock");
        } else if (type === "water") {
          // no solid water block; surface handled by merged water mesh below
        } else {
          snowPos.push(pos);
          voxelMap.set(localKey(x, y, z), "snow");
        }
      }
    }
  }

  const group = new THREE.Group();
  const minX = worldX;
  const minZ = worldZ;
  const maxX = worldX + CHUNK_SIZE - 1;
  const maxZ = worldZ + CHUNK_SIZE - 1;
  const treePlacementCache = new Map<string, number>();
  const forestDensityCache = new Map<string, number>();
  for (let twx = minX; twx <= maxX; twx++) {
    for (let twz = minZ; twz <= maxZ; twz++) {
      treePlacementCache.set(`${twx},${twz}`, getTreePlacement(twx, twz));
      forestDensityCache.set(`${twx},${twz}`, getForestDensity(twx, twz));
    }
  }
  const treeCaches: TreeNoiseCaches = {
    treePlacement: treePlacementCache,
    forestDensity: forestDensityCache,
  };
  for (let twx = minX; twx <= maxX; twx++) {
    for (let twz = minZ; twz <= maxZ; twz++) {
      if (!shouldPlaceTree(twx, twz, treeCaches)) continue;
      const baseY = getHeight(twx, twz);
      const { wood, leaves } = generateTree(twx, baseY, twz);
      for (const b of wood) {
        if (
          b.x >= worldX &&
          b.x < worldX + CHUNK_SIZE &&
          b.z >= worldZ &&
          b.z < worldZ + CHUNK_SIZE &&
          blockModifications.get(blockKeyNumeric(b.x, b.y, b.z)) !== "air"
        ) {
          woodPos.push(b);
          voxelMap.set(localKey(b.x - worldX, b.y, b.z - worldZ), "wood");
        }
      }
      for (const b of leaves) {
        if (
          b.x >= worldX &&
          b.x < worldX + CHUNK_SIZE &&
          b.z >= worldZ &&
          b.z < worldZ + CHUNK_SIZE &&
          blockModifications.get(blockKeyNumeric(b.x, b.y, b.z)) !== "air" &&
          b.y > getHeight(b.x, b.z)
        ) {
          leavesPos.push(b);
          voxelMap.set(localKey(b.x - worldX, b.y, b.z - worldZ), "leaves");
        }
      }
    }
  }

  // Face-culling: only render blocks with at least one visible face (reduces overdraw)
  const grassVisible = filterVisibleBlocks(worldX, worldZ, voxelMap, grassPos);
  const dirtVisible = filterVisibleBlocks(worldX, worldZ, voxelMap, dirtPos);
  const stoneVisible = filterVisibleBlocks(worldX, worldZ, voxelMap, stonePos);
  const sandVisible = filterVisibleBlocks(worldX, worldZ, voxelMap, sandPos);
  const snowVisible = filterVisibleBlocks(worldX, worldZ, voxelMap, snowPos);
  const woodVisible = filterVisibleBlocks(worldX, worldZ, voxelMap, woodPos);
  const leavesVisible = filterVisibleBlocks(worldX, worldZ, voxelMap, leavesPos);
  const bedrockVisible = filterVisibleBlocks(worldX, worldZ, voxelMap, bedrockPos);

  group.userData = { chunkKeyNum: keyNum, cx: chunkX, cz: chunkZ };
  addInstancedLayer(group, grassVisible, sharedMaterials.grass, {
    chunkKeyNum: keyNum,
    blockType: "grass",
  });
  addInstancedLayer(group, dirtVisible, sharedMaterials.dirt, {
    chunkKeyNum: keyNum,
    blockType: "dirt",
  });
  addInstancedLayer(group, stoneVisible, sharedMaterials.stone, {
    chunkKeyNum: keyNum,
    blockType: "stone",
  });
  addInstancedLayer(group, sandVisible, sharedMaterials.sand, {
    chunkKeyNum: keyNum,
    blockType: "sand",
  });
  addInstancedLayer(group, snowVisible, sharedMaterials.snow, {
    chunkKeyNum: keyNum,
    blockType: "snow",
  });
  addInstancedLayer(group, woodVisible, sharedMaterials.wood, {
    chunkKeyNum: keyNum,
    blockType: "wood",
  });
  addInstancedLayer(group, leavesVisible, sharedMaterials.leaves, {
    chunkKeyNum: keyNum,
    blockType: "leaves",
  });
  addInstancedLayer(group, bedrockVisible, sharedMaterials.bedrock, {
    chunkKeyNum: keyNum,
    blockType: "bedrock",
  });

  const waterGeo = buildChunkWaterGeometry(worldX, worldZ, heightmap);
  if (waterGeo) {
    const waterMesh = new THREE.Mesh(waterGeo, sharedMaterials.water);
    waterMesh.castShadow = false;
    waterMesh.receiveShadow = true;
    waterMesh.renderOrder = 2;
    waterMesh.frustumCulled = true;
    group.add(waterMesh);
  }

  scene.add(group);
  const data: ChunkData = {
    group,
    cx: chunkX,
    cz: chunkZ,
    voxelMap,
    grassPos: grassVisible,
    dirtPos: dirtVisible,
    stonePos: stoneVisible,
    sandPos: sandVisible,
    snowPos: snowVisible,
    woodPos: woodVisible,
    leavesPos: leavesVisible,
    bedrockPos: bedrockVisible,
  };
  chunks.set(keyNum, data);
  _raycastMeshDirty = true;
  _frustumDirty = true;
  return data;
}

/**
 * Apply chunk data from the Web Worker to the scene (build meshes, ChunkData, add to chunks/scene).
 * Called from worker onmessage.
 */
function applyChunkPayload(scene: THREE.Scene, payload: ChunkDataPayload): void {
  const keyNum = chunkKeyNumeric(payload.chunkX, payload.chunkZ);
  if (chunks.has(keyNum)) return;
  const worldX = payload.chunkX * CHUNK_SIZE;
  const worldZ = payload.chunkZ * CHUNK_SIZE;
  const group = new THREE.Group();
  group.userData = { chunkKeyNum: keyNum, cx: payload.chunkX, cz: payload.chunkZ };

  const voxelMap = new Map<number, BlockType>();
  for (const [k, t] of payload.voxelMapEntries) voxelMap.set(k, t);

  // Face-culling: only render blocks with at least one visible face
  const grassVisible = filterVisibleBlocks(worldX, worldZ, voxelMap, payload.grassPos);
  const dirtVisible = filterVisibleBlocks(worldX, worldZ, voxelMap, payload.dirtPos);
  const stoneVisible = filterVisibleBlocks(worldX, worldZ, voxelMap, payload.stonePos);
  const sandVisible = filterVisibleBlocks(worldX, worldZ, voxelMap, payload.sandPos);
  const snowVisible = filterVisibleBlocks(worldX, worldZ, voxelMap, payload.snowPos);
  const woodVisible = filterVisibleBlocks(worldX, worldZ, voxelMap, payload.woodPos);
  const leavesVisible = filterVisibleBlocks(worldX, worldZ, voxelMap, payload.leavesPos);
  const bedrockVisible = filterVisibleBlocks(worldX, worldZ, voxelMap, payload.bedrockPos);

  addInstancedLayer(group, grassVisible, sharedMaterials.grass, { chunkKeyNum: keyNum, blockType: "grass" });
  addInstancedLayer(group, dirtVisible, sharedMaterials.dirt, { chunkKeyNum: keyNum, blockType: "dirt" });
  addInstancedLayer(group, stoneVisible, sharedMaterials.stone, { chunkKeyNum: keyNum, blockType: "stone" });
  addInstancedLayer(group, sandVisible, sharedMaterials.sand, { chunkKeyNum: keyNum, blockType: "sand" });
  addInstancedLayer(group, snowVisible, sharedMaterials.snow, { chunkKeyNum: keyNum, blockType: "snow" });
  addInstancedLayer(group, woodVisible, sharedMaterials.wood, { chunkKeyNum: keyNum, blockType: "wood" });
  addInstancedLayer(group, leavesVisible, sharedMaterials.leaves, { chunkKeyNum: keyNum, blockType: "leaves" });
  addInstancedLayer(group, bedrockVisible, sharedMaterials.bedrock, { chunkKeyNum: keyNum, blockType: "bedrock" });

  const waterGeo = buildChunkWaterGeometry(worldX, worldZ, payload.heightmap);
  if (waterGeo) {
    const waterMesh = new THREE.Mesh(waterGeo, sharedMaterials.water);
    waterMesh.castShadow = false;
    waterMesh.receiveShadow = true;
    waterMesh.renderOrder = 2;
    waterMesh.frustumCulled = true;
    group.add(waterMesh);
  }

  const data: ChunkData = {
    group,
    cx: payload.chunkX,
    cz: payload.chunkZ,
    voxelMap,
    grassPos: grassVisible,
    dirtPos: dirtVisible,
    stonePos: stoneVisible,
    sandPos: sandVisible,
    snowPos: snowVisible,
    woodPos: woodVisible,
    leavesPos: leavesVisible,
    bedrockPos: bedrockVisible,
  };
  chunks.set(keyNum, data);
  scene.add(group);
  spawnEntitiesForChunk(scene, chunkKey(data.cx, data.cz), data.cx, data.cz);
  _raycastMeshDirty = true;
  _frustumDirty = true;
  pendingChunkKeys.delete(keyNum);
  applyPendingSpawnIfReady();
}

/** Setzt die Spawn-Position, sobald alle Chunks aus pendingSpawn geladen sind (nach Worker-Antwort). */
function applyPendingSpawnIfReady(): void {
  if (!pendingSpawn || !player) return;
  for (const keyNum of pendingSpawn.chunkKeys) {
    if (!chunks.has(keyNum)) return;
  }
  const y = getSurfaceY(pendingSpawn.spawnX, pendingSpawn.spawnZ);
  player.position.set(pendingSpawn.spawnX, y, pendingSpawn.spawnZ);
  velocityY = 0;
  velocityX = 0;
  velocityZ = 0;
  playerGrounded = true;
  player.visible = true;
  pendingSpawn = null;
}

/** Collect block modifications that affect the given chunk for the worker. */
function getBlockModsForChunk(chunkX: number, chunkZ: number): BlockModEntry[] {
  const worldX = chunkX * CHUNK_SIZE;
  const worldZ = chunkZ * CHUNK_SIZE;
  const result: BlockModEntry[] = [];
  for (const [numKey, value] of blockModifications) {
    const { bx, by, bz } = blockKeyFromNumeric(numKey);
    if (bx >= worldX && bx < worldX + CHUNK_SIZE && bz >= worldZ && bz < worldZ + CHUNK_SIZE)
      result.push({ bx, by, bz, value });
  }
  return result;
}

/**
 * Face-culling: keep only blocks that have at least one visible face (non-solid neighbor).
 * Reduces overdraw by not rendering blocks fully surrounded by solid blocks.
 */
function filterVisibleBlocks(
  worldX: number,
  worldZ: number,
  voxelMap: Map<number, BlockType>,
  positions: BlockPos[]
): BlockPos[] {
  const out: BlockPos[] = [];
  const dirs: [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  for (const pos of positions) {
    const lx = pos.x - worldX;
    const ly = pos.y;
    const lz = pos.z - worldZ;
    let visible = false;
    for (const [dx, dy, dz] of dirs) {
      const nx = lx + dx;
      const ny = ly + dy;
      const nz = lz + dz;
      if (nx < 0 || nx >= CHUNK_SIZE || ny < 0 || ny >= WORLD_HEIGHT || nz < 0 || nz >= CHUNK_SIZE) {
        visible = true;
        break;
      }
      const neighborType = voxelMap.get(localKey(nx, ny, nz));
      if (!neighborType || !SOLID_BLOCK_TYPES.has(neighborType)) {
        visible = true;
        break;
      }
    }
    if (visible) out.push(pos);
  }
  return out;
}

/** Get the positions array for a block type from ChunkData */
function getLayerPositions(
  data: ChunkData,
  blockType: BlockType
): BlockPos[] | null {
  switch (blockType) {
    case "grass":
      return data.grassPos;
    case "dirt":
      return data.dirtPos;
    case "stone":
      return data.stonePos;
    case "sand":
      return data.sandPos;
    case "snow":
      return data.snowPos;
    case "wood":
      return data.woodPos;
    case "leaves":
      return data.leavesPos;
    case "bedrock":
      return data.bedrockPos;
    default:
      return null;
  }
}

/** World block position for an instance (used so mining tracks by position, not index, after swap-with-last). */
function getBlockWorldPosition(
  chunkKeyNum: number,
  blockType: BlockType,
  instanceId: number
): BlockPos | null {
  const data = chunks.get(chunkKeyNum);
  if (!data) return null;
  const positions = getLayerPositions(data, blockType);
  if (!positions || instanceId < 0 || instanceId >= positions.length)
    return null;
  return positions[instanceId];
}

/** Get material for a block type */
function getMaterialForBlockType(
  blockType: BlockType
): THREE.Material | THREE.Material[] {
  return sharedMaterials[blockType as Exclude<BlockType, "torch">];
}

/** Bedrock cannot be destroyed or modified. */
const UNBREAKABLE_BLOCK_TYPES = new Set<BlockType>(["bedrock"]);

/** Einzelnes Material für Drop-Mesh (bei Arrays z. B. Top-Face). Fackel hat kein Voxel-Material → Fallback. */
function getMaterialForDrop(blockType: BlockType): THREE.Material {
  if (blockType === "torch") {
    const w = sharedMaterials.wood;
    return Array.isArray(w) ? w[2] : w;
  }
  if (blockType === "bedrock") return sharedMaterials.bedrock;
  const m = sharedMaterials[blockType as Exclude<BlockType, "torch" | "bedrock">];
  return Array.isArray(m) ? m[2] : m;
}

/** Erzeugt ein schwebendes Drop-Item an der Weltposition (Block-Mitte). */
function spawnDrop(
  worldX: number,
  worldY: number,
  worldZ: number,
  blockType: BlockType
): void {
  const size = 0.35;
  const geo = new THREE.BoxGeometry(size, size, size);
  const mat = getMaterialForDrop(blockType);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  group.position.set(worldX, worldY, worldZ);
  scene.add(group);
  drops.push({
    position: new THREE.Vector3(worldX, worldY, worldZ),
    blockType,
    group,
    bobPhase: Math.random() * Math.PI * 2,
  });
}

/** Erzeugt eine Fackel (Stab + Flamme + PointLight) an der Weltposition (Mitte). */
function createTorchGroup(
  worldX: number,
  worldY: number,
  worldZ: number
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(worldX, worldY, worldZ);

  const stickMat = new THREE.MeshStandardMaterial({
    color: 0x4a3728,
    roughness: 1,
  });
  const stickGeo = new THREE.BoxGeometry(0.12, 0.4, 0.12);
  const stick = new THREE.Mesh(stickGeo, stickMat);
  stick.position.y = 0.2;
  stick.castShadow = true;
  stick.receiveShadow = true;
  group.add(stick);

  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
  const flameGeo = new THREE.BoxGeometry(0.2, 0.25, 0.2);
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.y = 0.525;
  group.add(flame);

  const light = new THREE.PointLight(0xffaa44, 1.2, 12);
  light.position.y = 0.5;
  light.castShadow = false;
  group.add(light);

  return group;
}

/** Platziert eine Fackel an der angegebenen Weltposition (wenn möglich) und gibt true zurück. */
function placeTorch(worldX: number, worldY: number, worldZ: number): boolean {
  const keyNum = blockKeyNumeric(worldX, worldY, worldZ);
  if (
    placedTorches.some(
      (t) => blockKeyNumeric(t.x, t.y, t.z) === keyNum
    )
  )
    return false;
  const group = createTorchGroup(worldX, worldY, worldZ);
  if (typeof torchContainer !== "undefined") {
    torchContainer.add(group);
    placedTorches.push({ x: worldX, y: worldY, z: worldZ, group });
    return true;
  }
  return false;
}

/** Remove the InstancedMesh for one block type from the chunk group and rebuild it with current positions. */
function rebuildChunkLayer(data: ChunkData, blockType: BlockType): void {
  const keyNum = chunkKeyNumeric(data.cx, data.cz);
  const positions = getLayerPositions(data, blockType);
  if (!positions) return;

  // Remove existing mesh for this block type
  for (let i = data.group.children.length - 1; i >= 0; i--) {
    const child = data.group.children[i];
    if (
      child instanceof THREE.InstancedMesh &&
      (child.userData as { blockType?: BlockType }).blockType === blockType
    ) {
      data.group.remove(child);
      child.dispose();
      break;
    }
  }

  if (positions.length === 0) return;

  addInstancedLayer(data.group, positions, getMaterialForBlockType(blockType), {
    chunkKeyNum: keyNum,
    blockType,
  });
}

/** Find InstancedMesh for a block type in chunk group. */
function findMeshForBlockType(
  group: THREE.Group,
  blockType: BlockType
): THREE.InstancedMesh | null {
  for (let i = 0; i < group.children.length; i++) {
    const child = group.children[i];
    if (
      child instanceof THREE.InstancedMesh &&
      (child.userData as { blockType?: BlockType }).blockType === blockType
    ) {
      return child;
    }
  }
  return null;
}

/**
 * Remove one block from the world (mining / "abbauen"). Called when hold-to-break completes.
 * Spawnt ein schwebendes Drop-Item an der Block-Position.
 * O(1) update: swap-with-last on positions and instance matrix instead of rebuilding the mesh.
 * Uses world coordinates so the correct block is removed even after instance indices have changed.
 */
function breakBlock(
  chunkKeyNum: number,
  blockType: BlockType,
  worldX: number,
  worldY: number,
  worldZ: number
): void {
  if (UNBREAKABLE_BLOCK_TYPES.has(blockType)) return;
  const data = chunks.get(chunkKeyNum);
  if (!data) return;
  const positions = getLayerPositions(data, blockType);
  if (!positions) return;
  const instanceIndex = positions.findIndex(
    (p) => p.x === worldX && p.y === worldY && p.z === worldZ
  );
  if (instanceIndex === -1) return;
  const pos = positions[instanceIndex];
  blockModifications.set(blockKeyNumeric(pos.x, pos.y, pos.z), "air");
  invalidateColumnHeight(pos.x, pos.z);

  const cx = pos.x + 0.5;
  const cz = pos.z + 0.5;
  const dropSize = 0.35;
  // Tatsächliche Bodenhöhe in dieser Säule (pos.x, pos.z): erstes festes Block von pos.y-1 abwärts
  let groundY = pos.y - 1 + 0.5;
  for (let by = pos.y - 1; by >= 0; by--) {
    const t = getBlockAt(pos.x, by, pos.z);
    if (t !== null && t !== "air" && SOLID_BLOCK_TYPES.has(t as BlockType)) {
      groundY = by + 0.5;
      break;
    }
  }
  const cy = groundY + dropSize * 0.5;
  spawnDrop(cx, cy, cz, blockType);

  if (positions.length === 1) {
    positions.pop();
    rebuildChunkLayer(data, blockType);
    return;
  }

  const mesh = findMeshForBlockType(data.group, blockType);
  if (!mesh) return;

  const lastIdx = positions.length - 1;
  positions[instanceIndex] = positions[lastIdx];
  positions.pop();

  mesh.getMatrixAt(lastIdx, _matrix);
  mesh.setMatrixAt(instanceIndex, _matrix);
  mesh.count = positions.length;
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Remove a chunk from the scene and map.
 * Despawns entities in this chunk first, then removes chunk geometry.
 */
function unloadChunk(scene: THREE.Scene, keyNum: number): void {
  const data = chunks.get(keyNum);
  if (!data) return;
  despawnEntitiesInChunk(scene, chunkKey(data.cx, data.cz));

  data.group.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh &&
      obj.geometry &&
      obj.geometry !== sharedBlockGeometry
    ) {
      obj.geometry.dispose();
    }
  });
  scene.remove(data.group);
  chunks.delete(keyNum);
  _raycastMeshDirty = true;
  _frustumDirty = true;
}

/** Player chunk coords from last update – only run chunk logic when these change */
let lastPlayerChunkX: number | null = null;
let lastPlayerChunkZ: number | null = null;

/**
 * Ensure chunks around the player exist and unload chunks beyond render distance.
 * Uses circular distance (dx² + dz² <= R²) to load ~20% fewer chunks than a square.
 * Uses ChunkData.cx/cz to avoid key parsing; collects keys to unload before mutating.
 */
function updateChunks(scene: THREE.Scene, player: THREE.Group): void {
  const chunkX = Math.floor(player.position.x / CHUNK_SIZE);
  const chunkZ = Math.floor(player.position.z / CHUNK_SIZE);

  const keysBefore = new Set(chunks.keys());

  const rd = getRenderDistance();
  const rdSq = getRenderDistanceSq();
  for (let dx = -rd; dx <= rd; dx++) {
    for (let dz = -rd; dz <= rd; dz++) {
      if (dx * dx + dz * dz > rdSq) continue;
      const cx = chunkX + dx;
      const cz = chunkZ + dz;
      const keyNum = chunkKeyNumeric(cx, cz);
      if (chunks.has(keyNum)) continue;
      if (chunkWorker) {
        if (pendingChunkKeys.has(keyNum)) continue;
        pendingChunkKeys.add(keyNum);
        chunkWorker.postMessage({
          type: "generate",
          chunkX: cx,
          chunkZ: cz,
          blockMods: getBlockModsForChunk(cx, cz),
        });
      } else {
        generateChunk(scene, cx, cz);
      }
    }
  }

  const toUnload: number[] = [];
  for (const [keyNum, data] of chunks) {
    const distSq =
      (data.cx - chunkX) * (data.cx - chunkX) + (data.cz - chunkZ) * (data.cz - chunkZ);
    if (distSq > rdSq) toUnload.push(keyNum);
  }
  for (const keyNum of toUnload) unloadChunk(scene, keyNum);

  for (const [keyNum, data] of chunks) {
    if (!keysBefore.has(keyNum)) {
      spawnEntitiesForChunk(scene, chunkKey(data.cx, data.cz), data.cx, data.cz);
    }
  }
}

/** OPT-3: Return cached list of block InstancedMeshes for raycasting; rebuild only when chunks changed. */
function getRaycastMeshes(): THREE.InstancedMesh[] {
  if (!_raycastMeshDirty) return _raycastMeshCache;
  _raycastMeshCache = [];
  for (const data of chunks.values()) {
    for (const child of data.group.children) {
      if (
        child instanceof THREE.InstancedMesh &&
        (child.userData as { blockType?: BlockType }).blockType
      ) {
        _raycastMeshCache.push(child);
      }
    }
  }
  _raycastMeshDirty = false;
  return _raycastMeshCache;
}

// ================= PLAYER =================

/**
 * Creates only the player mesh group (head, body, legs, arms). Does not add to scene or set spawn.
 * Used for remote players in multiplayer; caller sets position/rotation and adds to scene.
 */
export function createPlayerMeshOnly(): THREE.Group {
  const player = new THREE.Group();

  const matSkin = new THREE.MeshStandardMaterial({ color: 0xffdbac });
  const matShirt = new THREE.MeshStandardMaterial({ color: 0x3366cc });
  const matPants = new THREE.MeshStandardMaterial({ color: 0x2244aa });

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), matSkin);
  head.position.y = 0.9;
  head.castShadow = true;
  head.receiveShadow = true;

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.2), matShirt);
  body.position.y = 0.5;
  body.castShadow = true;
  body.receiveShadow = true;

  const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), matPants);
  leg1.position.set(-0.08, 0.2, 0);
  leg1.castShadow = true;
  leg1.receiveShadow = true;

  const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), matPants);
  leg2.position.set(0.08, 0.2, 0);
  leg2.castShadow = true;
  leg2.receiveShadow = true;

  const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), matSkin);
  arm1.position.set(-0.22, 0.5, 0);
  arm1.castShadow = true;
  arm1.receiveShadow = true;

  const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), matSkin);
  arm2.position.set(0.22, 0.5, 0);
  arm2.castShadow = true;
  arm2.receiveShadow = true;

  const matFace = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  const eyeGeom = new THREE.BoxGeometry(0.08, 0.08, 0.02);
  const mouthGeom = new THREE.BoxGeometry(0.1, 0.04, 0.02);
  const leftEye = new THREE.Mesh(eyeGeom, matFace);
  leftEye.position.set(-0.1, 0.02, 0.18);
  const rightEye = new THREE.Mesh(eyeGeom, matFace);
  rightEye.position.set(0.1, 0.02, 0.18);
  const mouth = new THREE.Mesh(mouthGeom, matFace);
  mouth.position.set(0, -0.1, 0.18);
  head.add(leftEye);
  head.add(rightEye);
  head.add(mouth);

  player.add(head);
  player.add(body);
  player.add(leg1);
  player.add(leg2);
  player.add(arm1);
  player.add(arm2);

  return player;
}

function createPlayer(scene: THREE.Scene) {
  const player = createPlayerMeshOnly();
  const head = player.children[0] as THREE.Mesh;
  const body = player.children[1] as THREE.Mesh;
  const leg1 = player.children[2] as THREE.Mesh;
  const leg2 = player.children[3] as THREE.Mesh;
  const arm1 = player.children[4] as THREE.Mesh;
  const arm2 = player.children[5] as THREE.Mesh;

  let spawnX: number;
  let spawnZ: number;
  if (SPAWN_BIOME !== null) {
    const first = findSpawnInBiome(SPAWN_BIOME);
    spawnX = first.x;
    spawnZ = first.z;
    // Fallback: wenn nur (0,0) gefunden und Zentrum ist nicht das gewünschte Biom → Jungle/Forest probieren
    if (spawnX === 0 && spawnZ === 0 && getBiome(0, 0) !== SPAWN_BIOME) {
      const fallbackBiome: Biome = SPAWN_BIOME === "forest" ? "jungle" : "forest";
      const fallback = findSpawnInBiome(fallbackBiome);
      if (fallback.x !== 0 || fallback.z !== 0) {
        spawnX = fallback.x;
        spawnZ = fallback.z;
      }
    }
  } else {
    spawnX = SPAWN_X;
    spawnZ = SPAWN_Z;
  }
  columnHeightCache.clear();
  const footHalf = PLAYER_HALF + 0.5;
  const minCx = Math.floor((spawnX - footHalf) / CHUNK_SIZE);
  const maxCx = Math.floor((spawnX + footHalf) / CHUNK_SIZE);
  const minCz = Math.floor((spawnZ - footHalf) / CHUNK_SIZE);
  const maxCz = Math.floor((spawnZ + footHalf) / CHUNK_SIZE);
  const spawnChunkKeys = new Set<number>();
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cz = minCz; cz <= maxCz; cz++) {
      spawnChunkKeys.add(chunkKeyNumeric(cx, cz));
    }
  }

  if (chunkWorker) {
    // Chunks vom Worker anfordern; Position erst setzen, wenn alle da sind (applyPendingSpawnIfReady).
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const keyNum = chunkKeyNumeric(cx, cz);
        if (chunks.has(keyNum)) continue;
        if (pendingChunkKeys.has(keyNum)) continue;
        pendingChunkKeys.add(keyNum);
        chunkWorker.postMessage({
          type: "generate",
          chunkX: cx,
          chunkZ: cz,
          blockMods: getBlockModsForChunk(cx, cz),
        });
      }
    }
    pendingSpawn = { spawnX, spawnZ, chunkKeys: spawnChunkKeys };
    const tempY = getHeight(spawnX, spawnZ) + 0.5;
    player.position.set(spawnX, tempY, spawnZ);
    player.visible = false;
  } else {
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        if (!chunks.has(chunkKeyNumeric(cx, cz))) generateChunk(scene, cx, cz);
      }
    }
    const spawnY = getSurfaceY(spawnX, spawnZ);
    player.position.set(spawnX, spawnY, spawnZ);
  }

  scene.add(player);

  return { player, head, body, leg1, leg2, arm1, arm2 };
}

/**
 * Nur für Schatten in POV: unsichtbarer Körper mit gleicher Silhouette wie der Spieler.
 * Material mit colorWrite=false, depthWrite=false → in der Hauptansicht unsichtbar,
 * wirft aber in der Shadow-Pass weiterhin Schatten.
 */
function createPOVShadowBody(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    colorWrite: false,
    depthWrite: false,
  });

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat);
  head.position.y = 0.9;
  head.castShadow = true;
  head.receiveShadow = false;

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.2), mat);
  body.position.y = 0.5;
  body.castShadow = true;
  body.receiveShadow = false;

  const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), mat);
  leg1.position.set(-0.08, 0.2, 0);
  leg1.castShadow = true;
  leg1.receiveShadow = false;

  const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), mat);
  leg2.position.set(0.08, 0.2, 0);
  leg2.castShadow = true;
  leg2.receiveShadow = false;

  const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), mat);
  arm1.position.set(-0.22, 0.5, 0);
  arm1.castShadow = true;
  arm1.receiveShadow = false;

  const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), mat);
  arm2.position.set(0.22, 0.5, 0);
  arm2.castShadow = true;
  arm2.receiveShadow = false;

  group.add(head);
  group.add(body);
  group.add(leg1);
  group.add(leg2);
  group.add(arm1);
  group.add(arm2);
  return group;
}

// ================= POV HAND =================

function createPOVHands(camera: THREE.PerspectiveCamera) {
  const hands = new THREE.Group();
  hands.renderOrder = 999;
  const matSkin = new THREE.MeshStandardMaterial({
    color: 0xffdbac,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 1.0,
  });
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), matSkin);
  arm.renderOrder = 999;
  arm.position.set(0.45, -0.45, -0.65);
  arm.rotation.set(
    THREE.MathUtils.degToRad(-25),
    THREE.MathUtils.degToRad(-15),
    THREE.MathUtils.degToRad(-10)
  );
  hands.add(arm);
  camera.add(hands);
  return hands;
}

// ================= SCENE (created in init after textures load) =================

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
/** Container für alle platzierten Fackeln (Mesh + Licht). */
let torchContainer: THREE.Group;
let sunLight: THREE.DirectionalLight;
let sunMesh: THREE.Mesh;
let moonMesh: THREE.Mesh;
let stars: THREE.Points;
let sky: THREE.Mesh;
let clouds: THREE.Group;
let cloudMaterial: THREE.MeshBasicMaterial;
let player: THREE.Group;

const SUN_DISTANCE = 200;
/** Schatten-Frustum nur in Spielernähe (ca. 60 Einheiten), bessere Texeldichte, weniger Flickern. */
const SHADOW_RADIUS = 60;
/** Schatten aus, wenn Sonne zu nah am Horizont (y < 0.15) – sonst instabile Schatten. */
const SUN_SHADOW_MIN_HEIGHT = 0.15;
const _sunDirection = new THREE.Vector3(1, 1.2, 0.5).normalize();
const _sunPos = new THREE.Vector3();
const _moonPos = new THREE.Vector3();

let dayTime = 0;
const DAY_DURATION = 400;
const underwaterFog = new THREE.Color(0x0d2840);
/** Cached so fog/clear color only update when entering/leaving water. */
let wasUnderwater = false;

let ambientLight: THREE.AmbientLight;
let hemiLight: THREE.HemisphereLight;
let head: THREE.Mesh;
let body: THREE.Mesh;
let leg1: THREE.Mesh;
let leg2: THREE.Mesh;
let arm1: THREE.Mesh;
let arm2: THREE.Mesh;
let povHands: THREE.Group;
/** Nur in POV sichtbar als Schatten auf dem Boden; Mesh selbst unsichtbar (colorWrite=false). */
let povShadowBody: THREE.Group;
let controls: PointerLockControls;

const moveState = { forward: false, back: false, left: false, right: false };
let lastWPressTime = 0;
/** Aktuelle Blickrichtung (für Multiplayer: andere Spieler sehen, wohin du schaust). */
let lastLookYaw = 0;
let lastLookPitch = 0;
let isSprinting = false;
const DOUBLE_TAP_WINDOW_MS = 400;

// POV-Zoom beim Sprint: größeres FOV = „zoom out“, wirkt schneller
const FOV_NORMAL = 75;
const FOV_SPRINT = 88;
const FOV_LERP_SPEED = 6; // wie schnell FOV zum Ziel lerpt

// Maus-Sensitivität beim Sprint etwas höher (wirkt dynamischer)
const POINTER_SPEED_NORMAL = 1;
const POINTER_SPEED_SPRINT = 1.3;

// POV-Hand-Animation: Zustand wird auf Ziel gelerpt, kein Drift (Ziel = 0 oder Wackel-Offset)
let povHandAnimX = 0;
let povHandAnimY = 0;
let povHandAnimZ = 0;
const POV_HAND_LERP = 0.22; // wie schnell Richtung Ziel (0 = neutral, 1 = sofort)

// Mining: Arm schwingt beim Halten auf Block (Abbauen)
let miningSwingPhase = 0;
const POV_ARM_BASE_ROTATION_X = THREE.MathUtils.degToRad(-25);
const POV_ARM_BASE_ROTATION_Y = THREE.MathUtils.degToRad(-15);
const POV_ARM_BASE_ROTATION_Z = THREE.MathUtils.degToRad(-10);

// Third-Person: Körper-Yaw (Bewegungsrichtung), Kopf relativ dazu
let bodyYaw = 0;
const HEAD_PITCH_MAX = THREE.MathUtils.degToRad(65); // vertikale Kopfbegrenzung

/** Ob Multiplayer aktiv ist (nur dann verbinden wir mit dem Server). */
let multiplayerEnabled = false;

/** Wird von der Vue-App mit dem Canvas-Container aufgerufen (nach Mount). */
export async function initGame(
  container?: HTMLElement,
  options?: {
    multiplayer?: boolean;
    onHotbarChange?: (blocks: BlockType[], counts: number[]) => void;
  }
): Promise<void> {
  multiplayerEnabled = options?.multiplayer === true;
  onHotbarChange = options?.onHotbarChange ?? null;
  await init(container);
}

async function init(container?: HTMLElement) {
  const [
    grassTopTex,
    grassSideTex,
    dirtTex,
    stoneTex,
    sandTex,
    snowTex,
    woodTex,
    woodTopTex,
    leavesTex,
  ] = await Promise.all([
    textureLoader.loadAsync("/textures/grass_top.png"),
    textureLoader.loadAsync("/textures/grass_side.png"),
    textureLoader.loadAsync("/textures/dirt.png"),
    textureLoader.loadAsync("/textures/stone.png"),
    textureLoader.loadAsync("/textures/sand.png"),
    textureLoader.loadAsync("/textures/snow.png"),
    textureLoader.loadAsync("/textures/wood.png"),
    textureLoader.loadAsync("/textures/wood_top.png"),
    textureLoader.loadAsync("/textures/leaves.png"),
  ]);
  [
    grassTopTex,
    grassSideTex,
    dirtTex,
    stoneTex,
    sandTex,
    snowTex,
    woodTex,
    woodTopTex,
    leavesTex,
  ].forEach(setPixelFilter);

  sharedMaterials = {
    grass: [
      new THREE.MeshStandardMaterial({ map: grassSideTex, roughness: 1 }),
      new THREE.MeshStandardMaterial({ map: grassSideTex, roughness: 1 }),
      new THREE.MeshStandardMaterial({ map: grassTopTex, roughness: 1 }),
      new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1 }),
      new THREE.MeshStandardMaterial({ map: grassSideTex, roughness: 1 }),
      new THREE.MeshStandardMaterial({ map: grassSideTex, roughness: 1 }),
    ],
    dirt: new THREE.MeshStandardMaterial({
      map: dirtTex,
      roughness: 1,
    }),
    stone: new THREE.MeshStandardMaterial({
      map: stoneTex,
      roughness: 1,
    }),
    sand: new THREE.MeshStandardMaterial({
      map: sandTex,
      roughness: 1,
    }),
    snow: new THREE.MeshStandardMaterial({
      map: snowTex,
      roughness: 1,
    }),
    water: new THREE.MeshStandardMaterial({
      color: 0x3366aa,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetUnits: 1,
      polygonOffsetFactor: 1,
    }),
    wood: [
      new THREE.MeshStandardMaterial({ map: woodTex, roughness: 1 }),
      new THREE.MeshStandardMaterial({ map: woodTex, roughness: 1 }),
      new THREE.MeshStandardMaterial({ map: woodTopTex, roughness: 1 }),
      new THREE.MeshStandardMaterial({ map: woodTopTex, roughness: 1 }),
      new THREE.MeshStandardMaterial({ map: woodTex, roughness: 1 }),
      new THREE.MeshStandardMaterial({ map: woodTex, roughness: 1 }),
    ],
    leaves: new THREE.MeshStandardMaterial({
      map: leavesTex,
      roughness: 1,
      transparent: true,
      alphaTest: 0.1,
    }),
    bedrock: new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 1,
    }),
  };

  scene = new THREE.Scene();
  torchContainer = new THREE.Group();
  scene.add(torchContainer);
  scene.fog = new THREE.Fog(0x87ceeb, 80, 280);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  scene.add(camera);

  renderer = new THREE.WebGLRenderer({ antialias: getAntialias() });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = getShadowsEnabled();
  // PCFShadowMap: weiche Kanten, deutlich schneller als PCFSoftShadowMap (weniger Samples)
  renderer.shadowMap.type = THREE.PCFShadowMap;
  (container ?? document.body).appendChild(renderer.domElement);
  fpsEl = document.getElementById("fps");

  ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambientLight);
  hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x665544, 0.6);
  scene.add(hemiLight);
  // --- DirectionalLight + Schatten (Open-World, spielerzentriert) ---
  // Clipping entsteht, wenn: (1) Shadow-Camera-Ziel (target) nicht mit Spieler mitwandert,
  // (2) light/target VOR der Bewegungslogik gesetzt werden, (3) far <= Abstand Licht–Spieler,
  // (4) orthografische Breite/Höhe zu klein. Fix: target/position NACH Bewegung setzen, far > SUN_DISTANCE.
  sunLight = new THREE.DirectionalLight(0xfffaf0, 1.2);
  sunLight.castShadow = true;
  // 1024: guter Kompromiss Qualität/Performance (2048 war oft Hauptgrund für ~30 FPS)
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = SUN_DISTANCE + 80;
  sunLight.shadow.camera.left = -SHADOW_RADIUS;
  sunLight.shadow.camera.right = SHADOW_RADIUS;
  sunLight.shadow.camera.top = SHADOW_RADIUS;
  sunLight.shadow.camera.bottom = -SHADOW_RADIUS;
  sunLight.shadow.camera.updateProjectionMatrix();
  // Bias: negativ reduziert Shadow-Acne auf flachen Voxelflächen; normalBias reduziert Artefakte an Kanten.
  sunLight.shadow.bias = -0.0003;
  sunLight.shadow.normalBias = 0.008;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const sunGeometry = new THREE.SphereGeometry(12, 24, 24);
  const sunMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff4c4,
    fog: false,
  });
  sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
  sunMesh.castShadow = false;
  sunMesh.receiveShadow = false;
  scene.add(sunMesh);

  const moonGeometry = new THREE.SphereGeometry(8, 16, 16);
  const moonMaterial = new THREE.MeshBasicMaterial({
    color: 0xe6ecff,
    fog: false,
  });
  moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
  moonMesh.castShadow = false;
  moonMesh.receiveShadow = false;
  scene.add(moonMesh);

  const skyGeo = new THREE.SphereGeometry(500, 32, 32);
  skyGeo.scale(-1, 1, 1);
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying float vHeight;
      void main() {
        vHeight = normalize(position).y * 0.5 + 0.5;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uBottomColor;
      uniform float uSunHeight;
      varying float vHeight;
      void main() {
        vec3 color;
        if (vHeight < 0.5) {
          color = mix(uBottomColor, uHorizonColor, vHeight * 2.0);
        } else {
          color = mix(uHorizonColor, uTopColor, (vHeight - 0.5) * 2.0);
        }
        float sunset = smoothstep(-0.45, 0.25, uSunHeight) *
          (1.0 - smoothstep(0.25, 0.65, uSunHeight));
        sunset = min(1.0, sunset * 1.4);
        vec3 sunsetColor = vec3(1.0, 0.35, 0.05);
        float morning = smoothstep(0.08, 0.35, uSunHeight) *
          (1.0 - smoothstep(0.35, 0.75, uSunHeight));
        morning = min(1.0, morning * 1.2);
        vec3 morningColor = vec3(1.0, 0.75, 0.5);
        float horizonBand = 2.0 * min(vHeight, 1.0 - vHeight);
        color = mix(color, sunsetColor, sunset * horizonBand);
        color = mix(color, morningColor, morning * horizonBand);
        float night = clamp(-uSunHeight * 2.0, 0.0, 1.0);
        color = mix(color, vec3(0.01, 0.02, 0.05), night);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    uniforms: {
      uTopColor: { value: new THREE.Color(0x87ceeb) },
      uHorizonColor: { value: new THREE.Color(0xb8dce8) },
      uBottomColor: { value: new THREE.Color(0xdceef7) },
      uSunHeight: { value: 1.0 },
    },
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
  });
  sky = new THREE.Mesh(skyGeo, skyMat);
  sky.castShadow = false;
  sky.receiveShadow = false;
  scene.add(sky);

  clouds = new THREE.Group();
  cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const cloudHeight = 120;
  const cloudArea = 300;
  for (let i = 0; i < 40; i++) {
    const cloud = new THREE.Group();
    const blocks = 4 + Math.floor(Math.random() * 6);
    for (let j = 0; j < blocks; j++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4), cloudMaterial);
      box.castShadow = false;
      box.receiveShadow = false;
      box.position.set(
        (Math.random() - 0.5) * 12,
        0,
        (Math.random() - 0.5) * 12
      );
      cloud.add(box);
    }
    cloud.position.set(
      (Math.random() - 0.5) * cloudArea,
      cloudHeight,
      (Math.random() - 0.5) * cloudArea
    );
    clouds.add(cloud);
  }
  scene.add(clouds);

  const starGeometry = new THREE.BufferGeometry();
  const starCount = 2000;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 450;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi);
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(starPositions, 3)
  );
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1,
    sizeAttenuation: false,
    transparent: true,
  });
  stars = new THREE.Points(starGeometry, starMaterial);
  stars.castShadow = false;
  stars.receiveShadow = false;
  scene.add(stars);

  // Worker vor createPlayer, damit Spawn-Chunks vom Worker kommen und wir auf sie warten können
  if (typeof Worker !== "undefined") {
    try {
      chunkWorker = new Worker(new URL("./chunk.worker.ts", import.meta.url), {
        type: "module",
      });
      chunkWorker.postMessage({ type: "init", seed: WORLD_SEED });
      chunkWorker.onmessage = (e: MessageEvent<ChunkDataPayload>) => {
        applyChunkPayload(scene, e.data);
      };
      chunkWorker.onerror = () => {
        chunkWorker = null;
      };
    } catch {
      chunkWorker = null;
    }
  }

  const created = createPlayer(scene);
  player = created.player;
  head = created.head;
  body = created.body;
  leg1 = created.leg1;
  leg2 = created.leg2;
  arm1 = created.arm1;
  arm2 = created.arm2;

  setWorldApi({ getBlockAt, getSurfaceY, getColumnSurfaceY, getBiome });

  loadGame();

  updateChunks(scene, player);
  lastPlayerChunkX = Math.floor(player.position.x / CHUNK_SIZE);
  lastPlayerChunkZ = Math.floor(player.position.z / CHUNK_SIZE);

  if (multiplayerEnabled) {
    initMultiplayer(
      scene,
      () => ({
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        rotationY: lastLookYaw,
        lookPitch: lastLookPitch,
      }),
      { createPlayerMesh: createPlayerMeshOnly }
    );
  }

  povHands = createPOVHands(camera);

  povShadowBody = createPOVShadowBody();
  scene.add(povShadowBody);

  controls = new PointerLockControls(camera, renderer.domElement);
  if (loadedRotationY !== null && loadedLookPitch !== null) {
    camera.rotation.order = "YXZ";
    camera.rotation.y = loadedRotationY;
    camera.rotation.x = loadedLookPitch;
    camera.rotation.z = 0;
    loadedRotationY = null;
    loadedLookPitch = null;
  }
  renderer.domElement.addEventListener("click", () => {
    renderer.domElement.requestPointerLock();
  });
  document.addEventListener("mousedown", (e) => {
    if (e.button === 0) isMouseDown = true;
    if (e.button === 2) {
      e.preventDefault();
      rightMouseJustPressed = true;
    }
  });
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("mouseup", () => {
    isMouseDown = false;
    breakTarget = null;
    breakProgress = 0;
    const crackEl = document.getElementById("block-crack");
    if (crackEl) crackEl.style.visibility = "hidden";
  });
  document.addEventListener("wheel", (e) => e.preventDefault(), {
    passive: false,
  });
  document.addEventListener("keydown", (e) => {
    const scrollKeys = [
      "Space",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "PageUp",
      "PageDown",
      "Home",
      "End",
    ];
    if (
      !(
        document.activeElement &&
        (document.activeElement as HTMLElement).closest?.(
          "input, textarea, [contenteditable]"
        )
      )
    ) {
      if (scrollKeys.includes(e.code)) e.preventDefault();
    }
  });

  // Hotbar: Auswahl beim Start anzeigen + UI einmal mit aktuellem Stand füttern
  updateHotbarSelection();
  onHotbarChange?.(HOTBAR_BLOCKS.slice(), HOTBAR_COUNTS.slice());

  // Mausrad: Hotbar-Slot wechseln (wie in Minecraft)
  document.addEventListener(
    "wheel",
    (e) => {
      if (e.deltaY > 0) setHotbarIndex(selectedHotbarIndex + 1);
      else if (e.deltaY < 0) setHotbarIndex(selectedHotbarIndex - 1);
    },
    { passive: true }
  );

  setInterval(saveGame, AUTOSAVE_INTERVAL_MS);
  window.addEventListener("beforeunload", () => saveGame());

  animate();
}

// Movement in world units per second (frame-rate independent)
const moveSpeed = 4.5;
const sprintSpeed = 7.2;
const airControl = 2.5;
const horizontalMaxSpeed = 6;
const horizontalMaxSpeedSprint = 7.5;
const groundFriction = 0.15; // velocity multiplier per second when on ground and not moving

// ================= PHYSICS (all per-second for frame-rate independence) =================

let velocityY = 0;
let velocityX = 0;
let velocityZ = 0;
/** Set each frame from resolveVoxelCollisions result; used for jump (Space) and next-frame friction/air control. */
let playerGrounded = false;
/** When DEBUG_COLLISION is true: skip this many frames before logging again (avoids console flood). */
let debugCollisionLogCooldown = 0;
/** Gesetzt bei Space keydown; wird zu Beginn des nächsten Frames ausgewertet, damit der Sprung sofort in der Physik ankommt. */
let jumpRequested = false;

const gravity = -18;
const jumpForce = 7.2;
const terminalVelocity = -32;

const clock = new THREE.Clock();

const eyeHeight = 1;
const cameraDistance = 6;
const cameraHeight = 2.5;

let viewMode: "first" | "third" = "first";

// ================= INPUT =================

/** Wenn der Fokus in einem Eingabefeld liegt (z. B. Chat), keine Spiel-Shortcuts ausführen. */
function isTypingFocus(): boolean {
  const el = document.activeElement;
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  if (el.isContentEditable) return true;
  return false;
}

document.addEventListener("keydown", (e) => {
  if (isTypingFocus()) return;
  switch (e.code) {
    case "Digit1":
      setHotbarIndex(0);
      break;
    case "Digit2":
      setHotbarIndex(1);
      break;
    case "Digit3":
      setHotbarIndex(2);
      break;
    case "Digit4":
      setHotbarIndex(3);
      break;
    case "Digit5":
      setHotbarIndex(4);
      break;
    case "Digit6":
      setHotbarIndex(5);
      break;
    case "Digit7":
      setHotbarIndex(6);
      break;
    case "Digit8":
      setHotbarIndex(7);
      break;
    case "Digit9":
      setHotbarIndex(8);
      break;

    case "KeyW": {
      moveState.forward = true;
      // Sprint nur bei echtem Doppeltipp (2x W schnell), nicht bei Key-Repeat (Halten)
      if (!e.repeat) {
        const now = performance.now();
        if (lastWPressTime > 0 && now - lastWPressTime < DOUBLE_TAP_WINDOW_MS) {
          isSprinting = true;
        }
        lastWPressTime = now;
      }
      break;
    }
    case "KeyS":
      moveState.back = true;
      break;
    case "KeyA":
      moveState.left = true;
      break;
    case "KeyD":
      moveState.right = true;
      break;

    case "Space": {
      if (!e.repeat) {
        jumpRequested = true;
        if (playerGrounded) velocityY = jumpForce; // sofort anwenden, wenn schon am Boden
      }
      e.preventDefault();
      break;
    }

    case "KeyV":
      viewMode = viewMode === "first" ? "third" : "first";
      break;
  }
});

document.addEventListener("keyup", (e) => {
  if (isTypingFocus()) return;
  switch (e.code) {
    case "KeyW":
      moveState.forward = false;
      isSprinting = false;
      break;
    case "KeyS":
      moveState.back = false;
      break;
    case "KeyA":
      moveState.left = false;
      break;
    case "KeyD":
      moveState.right = false;
      break;
    case "Space":
      jumpRequested = false; // beim Loslassen verwerfen, sonst Sprung beim nächsten Landen
      break;
  }
});

// ================= SHADOW CAMERA (pro Frame, nach Bewegung) =================

/**
 * Richtet die DirectionalLight-Shadow-Camera auf die aktuelle Spielerposition aus.
 * Muss NACH der Bewegungslogik, direkt vor renderer.render(), aufgerufen werden.
 * So bleibt der Schatten-Frustum um den Spieler zentriert und Schatten werden nicht geclippt.
 *
 * Wichtig für Spieler-Schatten:
 * - Target in Spieler-Mitte (y + Körperhöhe/2), damit die Ortho-View den Avatar gut erfasst.
 * - Light und Target sofort mit updateMatrixWorld() aktualisieren, damit die Shadow-Pass
 *   die richtigen Positionen nutzt (wird sonst evtl. erst im nächsten Frame übernommen).
 */
function updateShadowCameraForPlayer(
  light: THREE.DirectionalLight,
  playerPosition: THREE.Vector3,
  sunDirection: THREE.Vector3,
  sunDistance: number,
  playerHeight: number = 1.8
) {
  light.position
    .copy(playerPosition)
    .addScaledVector(sunDirection, sunDistance);
  // Shadow-Target in Körpermitte, damit Spieler-Silhouette zentriert im Shadow-Map steht
  light.target.position.set(
    playerPosition.x,
    playerPosition.y + playerHeight * 0.5,
    playerPosition.z
  );
  // Sofortige Matrix-Aktualisierung, damit die Shadow-Pass in diesem Frame die richtigen Positionen nutzt
  light.updateMatrixWorld(true);
  light.target.updateMatrixWorld(true);
}

// ================= GAME LOOP =================

// FPS-Anzeige (gleitender Durchschnitt) – Element wird in init() gesetzt, sobald DOM (Vue) bereit ist
let fpsFrameCount = 0;
let fpsLastTime = performance.now();
let fpsEl: HTMLElement | null = null;

function animate() {
  requestAnimationFrame(animate);

  // Sobald alle Spawn-Chunks vom Worker da sind, Spawn-Höhe setzen (verhindert Spawn in der Luft)
  applyPendingSpawnIfReady();

  const dt = Math.min(clock.getDelta(), 0.1);
  const time = performance.now() * 0.001;

  // FPS berechnen und anzeigen (ca. 1× pro Sekunde aktualisieren)
  fpsFrameCount++;
  const fpsElapsed = time * 1000 - fpsLastTime;
  if (fpsElapsed >= 500) {
    const fps = Math.round((fpsFrameCount * 1000) / fpsElapsed);
    if (fpsEl) fpsEl.textContent = `${fps} FPS`;
    fpsFrameCount = 0;
    fpsLastTime = time * 1000;
  }

  dayTime += dt / DAY_DURATION;
  const sunAngle = dayTime * Math.PI * 2;
  _sunDirection.set(Math.cos(sunAngle), Math.sin(sunAngle), 0.3).normalize();
  const sunHeight = _sunDirection.y;
  const daylight = Math.max(0, sunHeight);
  // ── Time-of-day phase weights (all [0,1]) ─────────────────────────────
  // goldenHour: peaks when sun is right at the horizon (height ≈ 0), fades over ±0.30
  const goldenHour = Math.max(0, 1 - (sunHeight * sunHeight) / 0.09);
  // clamp so it's only active when sun is somewhat near horizon, not full midnight
  const sunriseSet = goldenHour * Math.max(0, 1 + sunHeight / 0.35);
  // twilight: between sun fully set (-0.25) and horizon (0), stays partly lit
  const twilight = THREE.MathUtils.clamp(1 + sunHeight / 0.25, 0, 1);
  // night ramps from 0 (horizon) to 1 (deep night) — gentler slope than before
  const night = THREE.MathUtils.clamp(-sunHeight * 2.2, 0, 1);
  // Underwater: strong blue fog. Only update fog/clear when entering/leaving water to avoid per-frame work.
  const eyeY =
    player.position.y + (viewMode === "first" ? eyeHeight : cameraHeight);
  const waterSurfaceY = WATER_LEVEL + 0.5;
  const isUnderwater = eyeY < waterSurfaceY;

  if (isUnderwater !== wasUnderwater) {
    wasUnderwater = isUnderwater;
    if (isUnderwater) {
      renderer.setClearColor(underwaterFog);
      if (scene.fog && "far" in scene.fog) {
        scene.fog.color.copy(underwaterFog);
        scene.fog.near = 2;
        scene.fog.far = 35;
      }
      const skyMatUnderwater = sky.material as THREE.ShaderMaterial;
      skyMatUnderwater.uniforms.uTopColor.value.set(0x02040a);
      skyMatUnderwater.uniforms.uHorizonColor.value.set(0x05070f);
      skyMatUnderwater.uniforms.uBottomColor.value.set(0x0d2840);
    }
  }
  if (!isUnderwater) {
    // Clear colour: sky blue → warm orange (golden hour) → dark purple (dusk) → deep night
    _clearColorTemp
      .copy(_clearDay)
      .lerp(_clearGolden, sunriseSet)
      .lerp(_clearDusk, twilight * night * 0.8)
      .lerp(_clearNight, Math.pow(night, 1.4));
    renderer.setClearColor(_clearColorTemp);

    if (scene.fog && "far" in scene.fog) {
      scene.fog.color
        .copy(_fogDay)
        .lerp(_fogGolden, sunriseSet)
        .lerp(_fogDusk, twilight * night * 0.8)
        .lerp(_fogNight, Math.pow(night, 1.4));
      scene.fog.near = 80;
      scene.fog.far = 280;
    }
  }

  ambientLight.intensity = isUnderwater ? 0.15 : 0.05 + daylight * 0.45;
  hemiLight.intensity = isUnderwater ? 0.4 : 0.05 + daylight * 0.7;

  if (!isUnderwater) {
    _sunPos.copy(player.position).addScaledVector(_sunDirection, SUN_DISTANCE);
    sunMesh.position.copy(_sunPos);

    // Sun dims smoothly; warm orange during golden hour
    sunLight.intensity = Math.max(0, sunHeight) * 1.8 + sunriseSet * 0.4;
    sunLight.color
      .set(0xfffaf0) // white-yellow midday
      .lerp(_sunColorOrange, sunriseSet) // soft orange at horizon
      .lerp(_sunColorWarm, Math.max(0, sunHeight) * 0.3); // warm tint during day
    (sunMesh.material as THREE.MeshBasicMaterial).color
      .set(0xfff4c4)
      .lerp(_sunDiscOrange, sunriseSet); // sun disc soft orange
    // Hemi sky colour: blue (day) → warm amber (golden) → purple (dusk)
    hemiLight.color
      .set(0x87ceeb)
      .lerp(_hemiAmber, sunriseSet)
      .lerp(_hemiPurple, Math.pow(night, 0.7));
    sunLight.castShadow = _sunDirection.y >= SUN_SHADOW_MIN_HEIGHT;
    sunMesh.visible = _sunDirection.y > -0.2;

    const moonDirection = _sunDirection.clone().multiplyScalar(-1);
    _moonPos.copy(player.position).addScaledVector(moonDirection, SUN_DISTANCE);
    moonMesh.position.copy(_moonPos);
    moonMesh.visible = _sunDirection.y < 0;

    stars.position.copy(player.position);
    const nightAmount = Math.pow(Math.max(0, -_sunDirection.y), 1.8);
    (stars.material as THREE.PointsMaterial).opacity = nightAmount;

    const skyMat = sky.material as THREE.ShaderMaterial;
    skyMat.uniforms.uSunHeight.value = _sunDirection.y;

    // ── Sky top (zenith) colour ────────────────────────────────────────
    // Day: Minecraft blue → Golden: deep blue-purple → Night: near-black space
    _clearColorTemp
      .copy(_skyTopDay)
      .lerp(_skyTopGolden, sunriseSet * 0.8)
      .lerp(_skyTopNight, Math.pow(night, 1.1));
    skyMat.uniforms.uTopColor.value.copy(_clearColorTemp);

    // ── Horizon colour ────────────────────────────────────────────────
    // Day: hazy light blue → Golden: warm orange → Dusk: muted purple → Night: dark blue
    _clearColorTemp
      .copy(_skyHorizonDay)
      .lerp(_skyHorizonGolden, sunriseSet)
      .lerp(_skyHorizonDusk, Math.max(0, night - 0.2) * twilight)
      .lerp(_skyHorizonNight, Math.pow(night, 1.3));
    skyMat.uniforms.uHorizonColor.value.copy(_clearColorTemp);

    // ── Sky bottom (below horizon inside sphere) ──────────────────────
    _clearColorTemp
      .copy(_skyBottomDay)
      .lerp(_skyBottomGolden, sunriseSet)
      .lerp(_skyBottomNight, Math.pow(night, 1.1));
    skyMat.uniforms.uBottomColor.value.copy(_clearColorTemp);

    clouds.position.copy(player.position);
    clouds.position.x += 0.01;
    cloudMaterial.opacity = 0.6 + daylight * 0.35;
    cloudMaterial.color
      .set(0xffffff)
      .lerp(_cloudGolden, sunriseSet)
      .lerp(_cloudNight, night);
  } else {
    sunMesh.visible = false;
    moonMesh.visible = false;
    stars.visible = false;
    clouds.visible = false;
  }
  sky.position.copy(player.position);

  const playerChunkX = Math.floor(player.position.x / CHUNK_SIZE);
  const playerChunkZ = Math.floor(player.position.z / CHUNK_SIZE);

  if (lastPlayerChunkX !== playerChunkX || lastPlayerChunkZ !== playerChunkZ) {
    updateChunks(scene, player);
    lastPlayerChunkX = playerChunkX;
    lastPlayerChunkZ = playerChunkZ;
  }

  _direction.set(0, 0, 0);
  controls.getDirection(_direction);
  _direction.y = 0;
  if (_direction.lengthSq() > 0) _direction.normalize();

  _right.crossVectors(_direction, camera.up).normalize();

  const speed = isSprinting && moveState.forward ? sprintSpeed : moveSpeed;
  const maxSpeed = isSprinting ? horizontalMaxSpeedSprint : horizontalMaxSpeed;

  // POV-FOV: beim Sprint etwas zoomen (größeres FOV = schnellerer Eindruck)
  const targetFov = isSprinting && moveState.forward ? FOV_SPRINT : FOV_NORMAL;
  camera.fov += (targetFov - camera.fov) * Math.min(1, FOV_LERP_SPEED * dt);
  // Projektion nur bei spürbarer FOV-Änderung neu hochladen (spart GPU-Arbeit im Ruhezustand)
  if (Math.abs(camera.fov - _lastUploadedFov) > 0.05) {
    camera.updateProjectionMatrix();
    _lastUploadedFov = camera.fov;
  }

  // Maus-Sensitivität beim Sprint etwas höher
  const targetPointerSpeed =
    isSprinting && moveState.forward
      ? POINTER_SPEED_SPRINT
      : POINTER_SPEED_NORMAL;
  controls.pointerSpeed +=
    (targetPointerSpeed - controls.pointerSpeed) *
    Math.min(1, FOV_LERP_SPEED * dt);

  // Freeze physics while waiting for authoritative spawn chunks from the worker
  if (pendingSpawn) {
    velocityX = 0;
    velocityY = 0;
    velocityZ = 0;
    playerGrounded = true;
  }

  // Desired horizontal velocity in units per second
  let wishX = 0;
  let wishZ = 0;
  if (!pendingSpawn && moveState.forward) {
    wishX += _direction.x * speed;
    wishZ += _direction.z * speed;
  }
  if (!pendingSpawn && moveState.back) {
    wishX -= _direction.x * moveSpeed;
    wishZ -= _direction.z * moveSpeed;
  }
  if (!pendingSpawn && moveState.right) {
    wishX += _right.x * speed;
    wishZ += _right.z * speed;
  }
  if (!pendingSpawn && moveState.left) {
    wishX -= _right.x * speed;
    wishZ -= _right.z * speed;
  }

  // Jump-Buffer: Sprung zu Beginn des Frames anwenden (reagiert sofort, kein 1-Frame-Lag)
  if (jumpRequested && playerGrounded) {
    velocityY = jumpForce;
    jumpRequested = false;
  }

  const onGround = playerGrounded;

  if (onGround) {
    velocityX = wishX;
    velocityZ = wishZ;
    if (wishX === 0 && wishZ === 0) {
      velocityX *= Math.pow(groundFriction, dt);
      velocityZ *= Math.pow(groundFriction, dt);
    }
  } else {
    velocityX += wishX * airControl * dt;
    velocityZ += wishZ * airControl * dt;
    const len = Math.sqrt(velocityX * velocityX + velocityZ * velocityZ);
    if (len > maxSpeed) {
      const s = maxSpeed / len;
      velocityX *= s;
      velocityZ *= s;
    }
  }

  // Apply gravity only when not grounded to avoid Y sink→push every frame (micro-jitter on ground)
  if (!playerGrounded) {
    velocityY += gravity * dt;
    if (velocityY < terminalVelocity) velocityY = terminalVelocity;
  }

  const vel = { x: velocityX, y: velocityY, z: velocityZ };
  const prevPos = DEBUG_COLLISION
    ? { x: player.position.x, y: player.position.y, z: player.position.z }
    : null;
  const collisionDebug: CollisionDebug | undefined = DEBUG_COLLISION
    ? { snaps: [] }
    : undefined;
  const collisionResult = resolveVoxelCollisions(
    player.position,
    vel,
    dt,
    PLAYER_HALF,
    PLAYER_HALF,
    PLAYER_HEIGHT,
    collisionDebug
  );
  velocityX = vel.x;
  velocityY = vel.y;
  velocityZ = vel.z;
  playerGrounded = collisionResult.grounded;

  if (DEBUG_COLLISION && prevPos && collisionDebug) {
    const dx = player.position.x - prevPos.x;
    const dy = player.position.y - prevPos.y;
    const dz = player.position.z - prevPos.z;
    const largeDelta =
      Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02 || Math.abs(dz) > 0.02;
    if (
      debugCollisionLogCooldown <= 0 &&
      (collisionDebug.snaps.length > 0 || largeDelta)
    ) {
      console.log("[collision]", {
        delta: { x: dx.toFixed(4), y: dy.toFixed(4), z: dz.toFixed(4) },
        vel: { x: vel.x.toFixed(3), y: vel.y.toFixed(3), z: vel.z.toFixed(3) },
        grounded: collisionResult.grounded,
        snaps: collisionDebug.snaps.map(
          (s) => `${s.axis}:${s.reason} ${s.from.toFixed(3)}→${s.to.toFixed(3)}`
        ),
      });
      debugCollisionLogCooldown = 20;
    }
    if (debugCollisionLogCooldown > 0) debugCollisionLogCooldown--;
  }

  updateAI(
    { x: player.position.x, y: player.position.y, z: player.position.z },
    dt
  );
  updateMovement(dt, (pos, v, d, hx, hz, height) => {
    resolveVoxelCollisions(pos, v, d, hx, hz, height);
  });
  updateAnimation(time);

  controls.getDirection(_lookDir);

  // Blickrichtung: Yaw (horizontal) und Pitch (vertikal), Pitch begrenzt
  const lookYaw = Math.atan2(_lookDir.x, -_lookDir.z);
  const lookPitchRaw = -Math.asin(THREE.MathUtils.clamp(_lookDir.y, -1, 1));
  const lookPitch = THREE.MathUtils.clamp(
    lookPitchRaw,
    -HEAD_PITCH_MAX,
    HEAD_PITCH_MAX
  );
  lastLookYaw = lookYaw;
  lastLookPitch = lookPitch;

  if (viewMode === "first") {
    head.visible = false;
    body.visible = false;
    leg1.visible = false;
    leg2.visible = false;
    arm1.visible = false;
    arm2.visible = false;

    povHands.visible = true;

    // POV-Schattenkörper: Position = Spieler, Kopf-Rotation = Blickrichtung, nur als Schatten sichtbar
    povShadowBody.visible = true;
    povShadowBody.position.copy(player.position);
    (povShadowBody.children[0] as THREE.Mesh).rotation.copy(head.rotation);

    // First-Person: Kopf = Blickrichtung (kein Körper-Rotation)
    head.rotation.y = lookYaw;
    head.rotation.x = lookPitch;

    // POV-Hände: Lauf-Wackeln oder Mining-Schwung (Halten auf Block)
    const isMining = breakTarget !== null;
    const povArm = povHands.children[0] as THREE.Mesh;
    if (isMining) {
      miningSwingPhase += dt;
      // Arm schwingt vor und zurück wie beim Abbauen
      const swing = Math.sin(miningSwingPhase * 14) * 0.52;
      povArm.rotation.x = POV_ARM_BASE_ROTATION_X + swing;
      povArm.rotation.y = POV_ARM_BASE_ROTATION_Y;
      povArm.rotation.z = POV_ARM_BASE_ROTATION_Z;
      // Leichtes Zurückziehen der Hand beim Schwingen
      const pullZ = 0.02 + Math.max(0, Math.sin(miningSwingPhase * 14)) * 0.04;
      povHands.position.set(0, 0, pullZ);
      povHands.rotation.z = 0;
    } else {
      miningSwingPhase = 0;
      povArm.rotation.x = POV_ARM_BASE_ROTATION_X;
      povArm.rotation.y = POV_ARM_BASE_ROTATION_Y;
      povArm.rotation.z = POV_ARM_BASE_ROTATION_Z;
      const isMoving =
        moveState.forward ||
        moveState.back ||
        moveState.left ||
        moveState.right;
      const wiggleSpeed = 14;
      const wiggleAmount = 0.028;
      const targetX = isMoving ? Math.cos(time * wiggleSpeed * 0.7) * 0.012 : 0;
      const targetY = isMoving
        ? Math.sin(time * wiggleSpeed * 0.5) * -0.008
        : 0;
      const targetZ = isMoving
        ? Math.sin(time * wiggleSpeed) * wiggleAmount
        : 0;
      povHandAnimX += (targetX - povHandAnimX) * POV_HAND_LERP;
      povHandAnimY += (targetY - povHandAnimY) * POV_HAND_LERP;
      povHandAnimZ += (targetZ - povHandAnimZ) * POV_HAND_LERP;
      povHands.position.set(povHandAnimX, povHandAnimY, 0);
      povHands.rotation.z = povHandAnimZ;
    }

    _cameraOffset.set(0, eyeHeight, 0);
    camera.position.copy(player.position).add(_cameraOffset);
  } else {
    head.visible = true;
    body.visible = true;
    leg1.visible = true;
    leg2.visible = true;
    arm1.visible = true;
    arm2.visible = true;

    povHands.visible = false;

    povShadowBody.visible = false;

    // Third-Person: Körper in Bewegungsrichtung, Kopf relativ zum Körper
    const isMovingThird =
      moveState.forward || moveState.back || moveState.left || moveState.right;
    const velLenSq = velocityX * velocityX + velocityZ * velocityZ;
    if (isMovingThird && velLenSq > 1e-6) {
      bodyYaw = Math.atan2(velocityX, velocityZ);
    } else {
      bodyYaw = lookYaw; // stehen: Körper folgt Blick
    }
    player.rotation.y = bodyYaw;
    const headYawRel = lookYaw - bodyYaw;
    head.rotation.y =
      THREE.MathUtils.euclideanModulo(headYawRel + Math.PI, Math.PI * 2) -
      Math.PI;
    head.rotation.x = lookPitch;

    // Arm-Schwung beim Laufen (gegenphasig wie Gehen)
    const isMoving =
      moveState.forward || moveState.back || moveState.left || moveState.right;
    const armSwingAmount = 0.35;
    const armSwingSpeed = 14;
    if (isMoving) {
      arm1.rotation.z = Math.sin(time * armSwingSpeed) * armSwingAmount;
      arm2.rotation.z = -Math.sin(time * armSwingSpeed) * armSwingAmount;
    } else {
      arm1.rotation.z *= 0.85;
      arm2.rotation.z *= 0.85;
    }

    _lookDir.y = 0;
    _lookDir.normalize();
    _cameraOffset.set(0, cameraHeight, 0);
    camera.position
      .copy(player.position)
      .add(_cameraOffset)
      .addScaledVector(_lookDir, -cameraDistance);
    // Kamera immer auf Spieler-Mitte richten → Char bleibt beim Umschauen im Zentrum (Fadenkreuz)
    _thirdPersonLookTarget.set(
      player.position.x,
      player.position.y + playerHeight * 0.5,
      player.position.z
    );
    camera.lookAt(_thirdPersonLookTarget);
  }

  // Schwebende Drops: Hover-Animation + Aufsammeln beim Durchlaufen
  const cx = player.position.x;
  const cy = player.position.y + playerHeight * 0.5;
  const cz = player.position.z;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    // Nur nach oben bobbend, damit die Unterseite auf dem Boden bleibt (kein Schweben)
    const bob =
      Math.max(0, Math.sin(time * DROP_BOB_SPEED + d.bobPhase)) *
      DROP_BOB_HEIGHT;
    d.group.position.y = d.position.y + bob;
    d.group.rotation.y = time * 0.8 + d.bobPhase * 0.5;
    const dx = d.position.x - cx;
    const dy = d.position.y - cy;
    const dz = d.position.z - cz;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < PICKUP_RADIUS * PICKUP_RADIUS) {
      addBlockToInventory(d.blockType);
      scene.remove(d.group);
      d.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry) obj.geometry.dispose();
      });
      drops.splice(i, 1);
    }
  }

  // Platzieren (Rechtsklick): Fackel oder Block
  if (
    rightMouseJustPressed &&
    document.pointerLockElement === renderer.domElement &&
    camera
  ) {
    rightMouseJustPressed = false;
    rayOrigin.copy(camera.position);
    camera.getWorldDirection(rayDirection);
    raycaster.set(rayOrigin, rayDirection);
    raycaster.far = PLACE_DISTANCE;
    const blockMeshesPlace = getRaycastMeshes();
    const placeHits = raycaster.intersectObjects(blockMeshesPlace);
    const placeHit = placeHits[0];
    if (
      placeHit &&
      placeHit.object instanceof THREE.InstancedMesh &&
      placeHit.instanceId !== undefined &&
      placeHit.face
    ) {
      _direction
        .copy(placeHit.face.normal)
        .transformDirection(placeHit.object.matrixWorld);
      const placeX = placeHit.point.x + _direction.x * 0.5;
      const placeY = placeHit.point.y + _direction.y * 0.5;
      const placeZ = placeHit.point.z + _direction.z * 0.5;
      const distSq =
        (placeX - camera.position.x) ** 2 +
        (placeY - camera.position.y) ** 2 +
        (placeZ - camera.position.z) ** 2;
      if (distSq <= PLACE_DISTANCE * PLACE_DISTANCE) {
        const sel = getSelectedBlockType();
        const count = HOTBAR_COUNTS[selectedHotbarIndex] ?? 0;
        if (sel === "torch" && count > 0) {
          if (placeTorch(placeX, placeY, placeZ)) {
            HOTBAR_COUNTS[selectedHotbarIndex]--;
            onHotbarChange?.(HOTBAR_BLOCKS.slice(), HOTBAR_COUNTS.slice());
          }
        } else if (sel !== "torch" && count > 0 && SOLID_BLOCK_TYPES.has(sel)) {
          const adjX = Math.floor(placeHit.point.x + _direction.x * 0.01);
          const adjY = Math.floor(placeHit.point.y + _direction.y * 0.01);
          const adjZ = Math.floor(placeHit.point.z + _direction.z * 0.01);
          const at = getBlockAt(adjX, adjY, adjZ);
          const keyNum = blockKeyNumeric(adjX, adjY, adjZ);
          if ((at === null || at === "air") && !blockModifications.has(keyNum)) {
            blockModifications.set(keyNum, sel);
            invalidateColumnHeight(adjX, adjZ);
            const ckx = Math.floor(adjX / CHUNK_SIZE);
            const ckz = Math.floor(adjZ / CHUNK_SIZE);
            chunks.delete(chunkKeyNumeric(ckx, ckz));
            _raycastMeshDirty = true;
            HOTBAR_COUNTS[selectedHotbarIndex]--;
            onHotbarChange?.(HOTBAR_BLOCKS.slice(), HOTBAR_COUNTS.slice());
          }
        }
      }
    }
  }

  // Block-Abbau: Halten auf Block (Raycast von Kamera-Mitte, nur bei Pointer Lock)
  if (
    document.pointerLockElement === renderer.domElement &&
    isMouseDown &&
    camera
  ) {
    rayOrigin.copy(camera.position);
    camera.getWorldDirection(rayDirection);
    raycaster.set(rayOrigin, rayDirection);
    raycaster.far = BREAK_DISTANCE;

    const blockMeshes = getRaycastMeshes();
    const hits = raycaster.intersectObjects(blockMeshes);
    const hit = hits[0];
    if (
      hit &&
      hit.object instanceof THREE.InstancedMesh &&
      hit.instanceId !== undefined
    ) {
      const ud = hit.object.userData as {
        chunkKeyNum: number;
        blockType: BlockType;
      };
      const chunkKeyNum = ud.chunkKeyNum;
      const blockType = ud.blockType;
      const instanceId = hit.instanceId;
      const pos = getBlockWorldPosition(chunkKeyNum, blockType, instanceId);
      if (!pos) {
        breakTarget = null;
        breakProgress = 0;
        const crackEl = document.getElementById("block-crack");
        if (crackEl) crackEl.style.visibility = "hidden";
      } else if (
        breakTarget &&
        breakTarget.chunkKeyNum === chunkKeyNum &&
        breakTarget.blockType === blockType &&
        breakTarget.x === pos.x &&
        breakTarget.y === pos.y &&
        breakTarget.z === pos.z
      ) {
        breakProgress += dt;
        if (breakProgress >= BREAK_TIME) {
          breakBlock(chunkKeyNum, blockType, pos.x, pos.y, pos.z);
          breakTarget = null;
          breakProgress = 0;
          const crackEl = document.getElementById("block-crack");
          if (crackEl) crackEl.style.visibility = "hidden";
        }
      } else {
        if (!UNBREAKABLE_BLOCK_TYPES.has(blockType)) {
          breakTarget = { chunkKeyNum, blockType, x: pos.x, y: pos.y, z: pos.z };
          breakProgress = dt;
        } else {
          breakTarget = null;
          breakProgress = 0;
        }
      }
    } else {
      breakTarget = null;
      breakProgress = 0;
    }
  } else if (!isMouseDown) {
    breakTarget = null;
    breakProgress = 0;
  }

  // Block-Riss-Overlay (Minecraft-Style): 10 Stufen, je mehr Fortschritt desto stärker die Risse
  const crackEl = document.getElementById("block-crack");
  if (crackEl) {
    const visible = breakTarget !== null;
    crackEl.style.visibility = visible ? "visible" : "hidden";
    if (visible) {
      const progress = Math.min(1, breakProgress / BREAK_TIME);
      const stage = Math.min(9, Math.floor(progress * 10));
      crackEl.style.backgroundPosition = `0 ${-stage * 10}%`;
      crackEl.setAttribute("data-stage", String(stage));
    }
  }

  updateShadowCameraForPlayer(
    sunLight,
    player.position,
    _sunDirection,
    SUN_DISTANCE,
    playerHeight
  );

  if (!camera.matrixWorld.equals(_lastCameraMatrixWorld)) {
    _lastCameraMatrixWorld.copy(camera.matrixWorld);
    _frustumDirty = true;
  }
  if (_frustumDirty) {
    _frustumDirty = false;
    _projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    _frustum.setFromProjectionMatrix(_projScreenMatrix);
    for (const data of chunks.values()) {
      const worldX = data.cx * CHUNK_SIZE;
      const worldZ = data.cz * CHUNK_SIZE;
      _chunkBoxMin.set(worldX, 0, worldZ);
      _chunkBoxMax.set(worldX + CHUNK_SIZE, WORLD_HEIGHT, worldZ + CHUNK_SIZE);
      _chunkBox.set(_chunkBoxMin, _chunkBoxMax);
      data.group.visible = _frustum.intersectsBox(_chunkBox);
    }
  }

  if (multiplayerEnabled) updateMultiplayer(dt);
  renderer.render(scene, camera);
}

// ================= RESIZE =================

window.addEventListener("resize", () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ================= GRAFIK-OPTIONEN (zur Laufzeit) =================

/** Wird vom Optionen-Menü aufgerufen, wenn Grafik-Einstellungen geändert wurden. */
export function applyGraphicsSettings(): void {
  if (!renderer || !sunLight) return;
  renderer.shadowMap.enabled = getShadowsEnabled();
  sunLight.shadow.camera.left = -SHADOW_RADIUS;
  sunLight.shadow.camera.right = SHADOW_RADIUS;
  sunLight.shadow.camera.top = SHADOW_RADIUS;
  sunLight.shadow.camera.bottom = -SHADOW_RADIUS;
  sunLight.shadow.camera.updateProjectionMatrix();
}
