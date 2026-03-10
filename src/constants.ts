import { getSelectedResourcePack } from "./resource-pack-settings";

/** World and chunk constants (shared by terrain, chunk, rendering). */
export const BLOCK_SIZE = 1;
export const CHUNK_SIZE = 16;

/** Default base path for block textures (built-in assets). Must match public folder: public/assets/minecraft/textures/block. */
export const DEFAULT_BLOCK_TEXTURE_PATH = "/assets/minecraft/textures/block";

/**
 * Base path for block textures. Can be overridden by the selected resource pack
 * (Options UI or URL param ?resource_pack=). Packs live under public/packs/<name>/.
 */
export function getBlockTexturePath(): string {
  if (typeof window === "undefined") return DEFAULT_BLOCK_TEXTURE_PATH;
  const pack = getSelectedResourcePack();
  if (!pack) return DEFAULT_BLOCK_TEXTURE_PATH;
  const normalized = pack.endsWith("/") ? pack.slice(0, -1) : pack;
  return `${normalized}/assets/minecraft/textures/block`;
}

/** @deprecated Use getBlockTexturePath() for resource-pack support. */
export const BLOCK_TEXTURE_PATH = DEFAULT_BLOCK_TEXTURE_PATH;
export const RENDER_DISTANCE = 4;
export const RENDER_DISTANCE_SQ = RENDER_DISTANCE * RENDER_DISTANCE;

/** World height in blocks (Y 0 to WORLD_HEIGHT), like original Minecraft. */
export const WORLD_HEIGHT = 128;

/** Global water level (block Y). Same as classic Minecraft (~sea level). */
export const WATER_LEVEL = 64;
/** Height of a water block in world units (Minecraft: 0.9 m; surface at WATER_LEVEL + WATER_BLOCK_HEIGHT). */
export const WATER_BLOCK_HEIGHT = 0.9;
/** Offset above water surface for water plane mesh to avoid z-fighting. */
export const WATER_PLANE_Y_OFFSET = 0.05;

/** Max stack size for most items (Minecraft: 64; some items like eggs stack to 16). */
export const MAX_STACK_SIZE = 64;

/** Spawn position (world block coords). */
export const SPAWN_X = 0;
export const SPAWN_Z = 0;

/** Snow layer height (0–8) for terrain generation. 0 = no layer, 1–8 = layers on grass_snow/snow in snow biomes. */
export const SNOW_ACCUMULATION_HEIGHT = 1;

/** Seconds of snowfall before one layer is added (when snowing in cold biomes). Max layers = 8. */
export const SNOW_GROWTH_INTERVAL_SEC = 12;
/** Radius (blocks) around player to consider for snow growth. */
export const SNOW_GROWTH_RADIUS = 10;
