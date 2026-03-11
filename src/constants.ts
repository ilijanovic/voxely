import { getSelectedResourcePack } from './resource-pack-settings'

/** World and chunk constants (shared by terrain, chunk, rendering). */
export const BLOCK_SIZE = 1
export const CHUNK_SIZE = 16

/** Default base path for block textures (built-in assets). Must match public folder: public/assets/minecraft/textures/block. */
export const DEFAULT_BLOCK_TEXTURE_PATH = '/assets/minecraft/textures/block'
/** Default base path for item textures (held items, hotbar icons for tools/weapons). */
export const DEFAULT_ITEM_TEXTURE_PATH = '/assets/minecraft/textures/items'

/**
 * Base path for block textures. Can be overridden by the selected resource pack
 * (Options UI or URL param ?resource_pack=). Packs live under public/packs/<name>/.
 */
export function getBlockTexturePath(): string {
  if (typeof window === 'undefined') return DEFAULT_BLOCK_TEXTURE_PATH
  const pack = getSelectedResourcePack()
  if (!pack) return DEFAULT_BLOCK_TEXTURE_PATH
  const normalized = pack.endsWith('/') ? pack.slice(0, -1) : pack
  return `${normalized}/assets/minecraft/textures/block`
}

/**
 * Base path for item textures (held items, weapons, tools). Uses same resource pack as block textures.
 */
export function getItemTexturePath(): string {
  if (typeof window === 'undefined') return DEFAULT_ITEM_TEXTURE_PATH
  const pack = getSelectedResourcePack()
  if (!pack) return DEFAULT_ITEM_TEXTURE_PATH
  const normalized = pack.endsWith('/') ? pack.slice(0, -1) : pack
  return `${normalized}/assets/minecraft/textures/items`
}

/** @deprecated Use getBlockTexturePath() for resource-pack support. */
export const BLOCK_TEXTURE_PATH = DEFAULT_BLOCK_TEXTURE_PATH
export const RENDER_DISTANCE = 4
export const RENDER_DISTANCE_SQ = RENDER_DISTANCE * RENDER_DISTANCE

/** World height in blocks (Y 0 to WORLD_HEIGHT), like original Minecraft. */
export const WORLD_HEIGHT = 128

/** Global water level (block Y). Same as classic Minecraft (~sea level). */
export const WATER_LEVEL = 64
/** Max block Y for filling broken blocks with water (hole in ocean/lake). Blocks at or below this Y get water when broken. */
export const WATER_FILL_MAX_Y = WATER_LEVEL

/**
 * Returns true when a block broken at the given Y should be filled with water (e.g. hole in ocean).
 */
export function shouldFillBrokenBlockWithWater(blockY: number): boolean {
  return blockY <= WATER_FILL_MAX_Y
}
/** Height of a water block in world units (Minecraft: 0.9 m; surface at WATER_LEVEL + WATER_BLOCK_HEIGHT). */
export const WATER_BLOCK_HEIGHT = 0.9
/** Offset above water surface for water plane mesh to avoid z-fighting. */
export const WATER_PLANE_Y_OFFSET = 0.05
/** Game ticks between water spread updates (Minecraft: 5 ticks = 4 blocks/sec). */
export const WATER_SPREAD_TICKS = 5
/** Maximum flow level for water (7 = flow stops after 7 blocks from source). */
export const WATER_MAX_LEVEL = 7
/** Seconds between water spread updates (WATER_SPREAD_TICKS at 20 tps). */
export const WATER_SPREAD_INTERVAL_SEC = WATER_SPREAD_TICKS / 20

/** Max stack size for most items (Minecraft: 64; some items like eggs stack to 16). */
export const MAX_STACK_SIZE = 64

/** Hotbar slot count (Minecraft: 9). */
export const HOTBAR_SLOTS = 9
/** Main inventory rows × columns (Minecraft: 3×9). */
export const MAIN_INVENTORY_ROWS = 3
export const MAIN_INVENTORY_COLS = 9
export const MAIN_INVENTORY_SLOTS = MAIN_INVENTORY_ROWS * MAIN_INVENTORY_COLS
/** 2×2 crafting grid slot count (inventory screen). */
export const CRAFTING_GRID_2X2 = 4
/** Total persistent slots: hotbar + main (crafting grid not persisted). */
export const TOTAL_PERSISTENT_SLOTS = HOTBAR_SLOTS + MAIN_INVENTORY_SLOTS

/** Default weapon given on spawn for testing (e.g. wood_sword). */
export const DEFAULT_START_WEAPON = 'wood_sword'

/** Spawn position (world block coords). */
export const SPAWN_X = 0
export const SPAWN_Z = 0

/** Max block height (world units) that the player can step over without being blocked in X/Z. 1.0 = step over any partial block (snow layers, slabs). */
export const STEP_HEIGHT = 1
/** Block height threshold: blocks with height <= this never act as walls in X/Z; player can walk onto them (e.g. snow layers, steps). */
export const STEP_BLOCK_HEIGHT = 0.5

/** Snow layer height (0–8) for terrain generation. 0 = no layer, 1–8 = layers on grass_snow/snow in snow biomes. */
export const SNOW_ACCUMULATION_HEIGHT = 1

/** Seconds of snowfall before the next batch of snow layers is added. */
export const SNOW_GROWTH_INTERVAL_SEC = 12
/** Radius (blocks) around player to consider for snow growth. */
export const SNOW_GROWTH_RADIUS = 10
/** Number of positions to try per interval (snow forms in parallel in the area). */
export const SNOW_GROWTH_CANDIDATES_PER_INTERVAL = 24

/** Max distance for melee attack vs entities (same as block break reach). */
export const ENTITY_ATTACK_DISTANCE = 5
/** Damage applied per successful weapon slash to an entity. */
export const DAMAGE_PER_SLASH = 2

/** Default URL for the multiplayer server (Socket.IO backend). */
export const MULTIPLAYER_SERVER_URL = 'http://localhost:3000'
