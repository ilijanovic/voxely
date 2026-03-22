import { getSelectedResourcePack } from './resource-pack-settings'

/** World and chunk constants (shared by terrain, chunk, rendering). */
export const BLOCK_SIZE = 1
export const CHUNK_SIZE = 16

/** Default base path for block textures (built-in assets). Must match public folder: public/assets/minecraft/textures/block. */
export const DEFAULT_BLOCK_TEXTURE_PATH = '/assets/minecraft/textures/block'
/** Default base path for item textures (held items, hotbar icons for tools/weapons). */
export const DEFAULT_ITEM_TEXTURE_PATH = '/assets/minecraft/textures/item'

/**
 * Base path for block textures. Can be overridden by the selected resource pack
 * (Options UI or URL param ?resource_pack=). Packs live under public/packs/<name>/.
 */
export function getBlockTexturePath(): string {
  if (typeof window === 'undefined') return DEFAULT_BLOCK_TEXTURE_PATH
  const pack = getSelectedResourcePack()
  if (!pack) return DEFAULT_BLOCK_TEXTURE_PATH
  const packBase = pack.endsWith('/') ? pack.slice(0, -1) : pack
  return `${packBase}/assets/minecraft/textures/block`
}

/**
 * Base path for item textures (held items, weapons, tools). Uses same resource pack as block textures.
 */
export function getItemTexturePath(): string {
  if (typeof window === 'undefined') return DEFAULT_ITEM_TEXTURE_PATH
  const pack = getSelectedResourcePack()
  if (!pack) return DEFAULT_ITEM_TEXTURE_PATH
  const packBase = pack.endsWith('/') ? pack.slice(0, -1) : pack
  return `${packBase}/assets/minecraft/textures/item`
}

/** @deprecated Use getBlockTexturePath() for resource-pack support. */
export const BLOCK_TEXTURE_PATH = DEFAULT_BLOCK_TEXTURE_PATH
export const RENDER_DISTANCE = 4
export const RENDER_DISTANCE_SQ = RENDER_DISTANCE * RENDER_DISTANCE

/** Minimum world Y (Vanilla 1.18+). Bedrock at this level. */
export const WORLD_MIN_Y = -64
/**
 * World height in blocks (Vanilla 1.18+). Valid world Y is WORLD_MIN_Y to WORLD_MIN_Y + WORLD_HEIGHT - 1 (384 blocks).
 */
export const WORLD_HEIGHT = 384
/** Maximum world Y (inclusive). WORLD_MIN_Y + WORLD_HEIGHT - 1. */
export const WORLD_MAX_Y = WORLD_MIN_Y + WORLD_HEIGHT - 1

/** Color for the block outline shown when aiming at a block (hex). */
export const BLOCK_OUTLINE_COLOR = 0x333333
/** Scale of the block outline mesh (slightly > 1 to reduce z-fighting). */
export const BLOCK_OUTLINE_SCALE = 1.002

/**
 * Fog range is scaled with render distance (chunks). Near = start of fog; far = full fog at horizon.
 * Higher FOG_NEAR_CHUNK_FACTOR starts fog later so haze stays near the horizon instead of tinting mid-distance terrain.
 */
export const FOG_NEAR_CHUNK_FACTOR = 1.05
/** Multiplier for fog far distance in chunks (further beyond render distance to avoid a dense fog wall at high chunk distance). */
export const FOG_FAR_CHUNK_FACTOR = 1.35

/** Global water level (block Y). Vanilla 1.18+ sea level. */
export const WATER_LEVEL = 62

/** Minimum blocks of solid terrain between cave ceiling and surface. Avoids caves opening directly under grass. Vanilla reference: docs/VANILLA_BIOME_REFERENCE.md §6. */
export const MIN_CAVE_DEPTH_BELOW_SURFACE = 5
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

/** Target max health for survival (Minecraft: 20). Used when health/damage/regeneration are implemented. */
export const SURVIVAL_HEALTH_MAX = 20
/** Target max hunger for survival (Minecraft: 20). Used when hunger/food/regeneration are implemented. */
export const SURVIVAL_HUNGER_MAX = 20

/** Hotbar slot count (Minecraft: 9). */
export const HOTBAR_SLOTS = 9
/** Main inventory rows × columns (Minecraft: 3×9). */
export const MAIN_INVENTORY_ROWS = 3
export const MAIN_INVENTORY_COLS = 9
export const MAIN_INVENTORY_SLOTS = MAIN_INVENTORY_ROWS * MAIN_INVENTORY_COLS
/** 2×2 crafting grid slot count (inventory screen). */
export const CRAFTING_GRID_2X2 = 4
/** 3×3 crafting grid slot count (crafting table block UI). */
export const CRAFTING_GRID_3X3 = 9
/** Total persistent slots: hotbar + main (crafting grid not persisted). */
export const TOTAL_PERSISTENT_SLOTS = HOTBAR_SLOTS + MAIN_INVENTORY_SLOTS

/** Default weapon given on spawn for testing (e.g. wood_sword). */
export const DEFAULT_START_WEAPON = 'wood_sword'

/** Spawn position (world block coords). */
export const SPAWN_X = 0
export const SPAWN_Z = 0

/** When true, spawn is chosen above a cave (for debugging). */
export const SPAWN_ABOVE_CAVE_DEBUG = false

/** Max block height (world units) that the player can step over without being blocked in X/Z. 1.0 = step over any partial block (snow layers, slabs). */
export const STEP_HEIGHT = 1
/** Max climb height for step-up when grounded (Minecraft: ~0.6). Only obstacles lower than this can be stepped onto; full blocks (1.0) are not step-up-able. */
export const STEP_UP_MAX_CLIMB = 0.6
/** Block height threshold: blocks with height <= this never act as walls in X/Z; player can walk onto them (e.g. snow layers, steps). */
export const STEP_BLOCK_HEIGHT = 0.5

/** Torch point light: intensity (brightness at source). */
export const TORCH_LIGHT_INTENSITY = 7
/** Torch point light: max distance in world units (light reaches this far). */
export const TORCH_LIGHT_DISTANCE = 72
/** Torch point light: decay exponent (lower = softer falloff, wider spread). Three.js default is 2. */
export const TORCH_LIGHT_DECAY = 1.5

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
/** Duration in seconds for the red hurt flash on entities when hit (Minecraft-style). */
export const HURT_FLASH_DURATION_SECONDS = 0.22
/** Red color (hex) used to tint entity mesh during hurt flash. */
export const HURT_FLASH_RED = 0xcc0000
/** Horizontal knockback speed (blocks/sec) applied to entities when hit (Minecraft-style push-back). */
export const KNOCKBACK_HORIZONTAL_SPEED = 5
/** Vertical knockback speed (blocks/sec) applied when hit (short upward pop). */
export const KNOCKBACK_VERTICAL_SPEED = 2.5
/** Damage applied per successful weapon slash to an entity (default when weapon type unknown). */
export const DAMAGE_PER_SLASH = 2
/** Base damage per weapon type (e.g. sword). Used for melee damage calculation. */
export const WEAPON_BASE_DAMAGE: Record<string, number> = {
  sword: 2,
}
/** Full map overlay: chunks visible in each direction from player. */
export const FULL_MAP_RADIUS_CHUNKS = 12
/** Full map zoom factor: minimum (zoomed out). */
export const FULL_MAP_ZOOM_MIN = 0.25
/** Full map zoom factor: maximum (zoomed in). */
export const FULL_MAP_ZOOM_MAX = 4
/** When the player enters a chunk, this many chunks in each direction are also discovered on the map (e.g. 2 = 5×5 area). */
export const MAP_DISCOVER_RADIUS_CHUNKS = 2
/** Map color for water (surface at or below WATER_LEVEL). */
export const MAP_COLOR_WATER = '#3a7eb8'
/** Map color for low terrain (above water, low elevation). */
export const MAP_COLOR_LOW = '#6b8c5d'
/** Map color for mid terrain. */
export const MAP_COLOR_MID = '#8b7355'
/** Map color for high terrain. */
export const MAP_COLOR_HIGH = '#9a9a9a'
/** Map color for discovered but unloaded chunks (fog). */
export const MAP_COLOR_FOG = '#5a5a5a'
/** Map color for undiscovered area. */
export const MAP_COLOR_UNDISCOVERED = '#2a2a2a'

/** Autosave interval for localStorage saves (milliseconds). */
export const AUTOSAVE_INTERVAL_MS = 10000
/** Map color per biome name for full map (snow, forest, desert, etc.). Fallback used if biome missing. */
export const MAP_BIOME_COLORS: Record<string, string> = {
  plains: '#6b8c5d',
  ocean: '#3a7eb8',
  river: '#4a8ec6',
  frozen_river: '#b7d8ee',
  beach: '#e3d39a',
  stony_shore: '#8f8f8f',
  snowy_beach: '#dfe7ed',
  desert: '#e3d39a',
  savanna: '#bdb25f',
  forest: '#4a7c47',
  jungle: '#2d5016',
  mountain: '#8b7355',
  snow: '#e8e8e8',
  meadow: '#7cb369',
  grove: '#6b8c5d',
  snowy_slopes: '#c8d4d8',
  stony_peaks: '#9a9a9a',
  frozen_peaks: '#e0e6eb',
  jagged_peaks: '#8b8b8b',
  cherry_grove: '#e8b4bc',
  windswept_hills: '#8b7355',
  windswept_gravelly_hills: '#8b8b7a',
  windswept_forest: '#5a6b4a',
  badlands: '#c47850',
  mushroom_fields: '#8b6b8b',
  mangrove_swamp: '#5a6b3a',
  old_growth_taiga: '#4a5d3a',
}

/** Default URL for the multiplayer server (Socket.IO backend). */
export const MULTIPLAYER_SERVER_URL = 'http://localhost:3000'

/** Max player level (WoW Classic–style). */
export const MAX_LEVEL = 60
/** How long the level-up overlay is shown (ms). Non-blocking; does not interrupt gameplay. */
export const LEVEL_UP_DISPLAY_MS = 2500

/** Maximum player health (Minecraft-style hearts). */
export const PLAYER_MAX_HEALTH = 20
/** Maximum player hunger/food level (Minecraft-style). */
export const PLAYER_MAX_HUNGER = 20

/** Quest NPC icon: yellow exclamation (quest available). */
export const QUEST_ICON_COLOR_AVAILABLE = '#ffcc00'
/** Quest NPC icon: gray exclamation (quest in progress). */
export const QUEST_ICON_COLOR_IN_PROGRESS = '#888888'
/** Quest NPC icon: yellow question mark (turn-in ready). */
export const QUEST_ICON_COLOR_TURN_IN = '#ffcc00'
