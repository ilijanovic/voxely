/**
 * Block type to byte id mapping for pipeline voxel buffer.
 * Terrain-only block types; order is fixed for deterministic ids.
 */
import type { BlockType } from '../types'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../constants'

export const AIR_ID = 0
/** Sentinel: position was carved by cave noise; leave as air (do not fill in stratigraphy). */
export const CARVED_ID = 255

/** All block types that can appear in chunk data (terrain generation + player-placed). Order defines id. */
const TERRAIN_BLOCK_TYPES: (BlockType | 'air')[] = [
  'air',
  'bedrock',
  'stone',
  'dirt',
  'grass',
  'grass_snow',
  'grass_savanna',
  'sand',
  'snow',
  'gravel',
  'wood',
  'leaves',
  'snow_layer_1',
  'snow_layer_2',
  'snow_layer_3',
  'snow_layer_4',
  'snow_layer_5',
  'snow_layer_6',
  'snow_layer_7',
  'snow_layer_8',
  'door_closed',
  'door_open',
  'wheat_1',
  'wheat_2',
  'wheat_3',
  'wheat_4',
  'wheat_5',
  'wheat_6',
  'wheat_7',
  'wheat_8',
  'sandstone',
  'dead_bush',
  'cactus',
  'cactus_flower',
  // Feature blocks (flowers, ground cover) – order fixed for deterministic ids
  'dandelion',
  'poppy',
  'tulip_red',
  'tulip_orange',
  'tulip_white',
  'tulip_pink',
  'oxeye_daisy',
  'cornflower',
  'azure_bluet',
  'allium',
  'lily_of_the_valley',
  'blue_orchid',
  'tall_grass',
  'grass_path',
  'fern',
  'large_fern',
  'brown_mushroom',
  'red_mushroom',
  'lily_pad',
  'sugar_cane',
  'kelp',
  'seagrass',
  'sea_pickle',
  'vine',
  'bamboo',
  'sweet_berry_bush',
  'pumpkin',
  'melon',
  'pink_petals',
  'hay_block',
  'ice',
  'packed_ice',
  'red_sand',
  'mycelium',
  'podzol',
  'mud',
  'coarse_dirt',
  // Ores (Stage 4 feature; replace stone in valid Y range)
  'coal_ore',
  'iron_ore',
  'gold_ore',
  'diamond_ore',
  // Flowing water: source + levels 1–7 (Minecraft-style spread)
  'water_source',
  'water_flowing_1',
  'water_flowing_2',
  'water_flowing_3',
  'water_flowing_4',
  'water_flowing_5',
  'water_flowing_6',
  'water_flowing_7',
  // Player-placeable / craftable (not from terrain generation; needed for chunk payload encoding)
  'oak_planks',
  'spruce_planks',
  'birch_planks',
  'jungle_planks',
  'acacia_planks',
  'dark_oak_planks',
  'crafting_table',
  // Structure blocks (village walls, etc.)
  'bricks',
  'stone_bricks',
]

/** BlockType at id (id 0 = air, not in this array). Index = id - 1 for id >= 1. */
export const ID_TO_TYPE: (BlockType | 'air')[] = [...TERRAIN_BLOCK_TYPES]

const TYPE_TO_ID_MAP = new Map<BlockType | 'air', number>()
TERRAIN_BLOCK_TYPES.forEach((t, i) => TYPE_TO_ID_MAP.set(t, i))

/** Converts BlockType or 'air' to pipeline voxel buffer id. Unknown types map to AIR_ID. */
export function typeToId(type: BlockType | 'air'): number {
  const id = TYPE_TO_ID_MAP.get(type)
  if (id !== undefined) return id
  return AIR_ID
}

/** Converts pipeline voxel id to BlockType or 'air'. CARVED_ID and 0 return 'air'. */
export function idToType(id: number): BlockType | 'air' {
  if (id === 0 || id === CARVED_ID) return 'air'
  const t = TERRAIN_BLOCK_TYPES[id]
  return t ?? 'air'
}

/** Returns true if the voxel id represents air (AIR_ID or CARVED_ID). Use for placement checks. */
export function isAirOrCarved(id: number): boolean {
  return id === AIR_ID || id === CARVED_ID
}

/** First terrain block id for water (water_source). Used for height and fluid logic. */
export const WATER_SOURCE_ID = ((): number => {
  const idx = TERRAIN_BLOCK_TYPES.indexOf('water_source' as BlockType)
  return idx >= 0 ? idx : -1
})()

/** Block height in world units (1 = full block). Snow layers 1–8 use 1/8 … 8/8. Water source = 1, flowing 1..7 = 0.85 down to 0.55. */
export function getBlockHeightById(id: number): number {
  if (id >= 12 && id <= 19) return (id - 11) / 8 // snow_layer_1..8 at indices 12..19
  if (WATER_SOURCE_ID >= 0 && id >= WATER_SOURCE_ID && id < WATER_SOURCE_ID + 8) {
    if (id === WATER_SOURCE_ID) return 1
    return 0.9 - (id - WATER_SOURCE_ID - 1) * 0.05 // flowing 1..7
  }
  return 1
}

/** Local key for flat voxel buffer: lx + ly*CHUNK_SIZE + lz*CHUNK_SIZE*WORLD_HEIGHT. */
export function localKey(lx: number, ly: number, lz: number): number {
  return lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * WORLD_HEIGHT
}

export const VOXEL_BUFFER_LENGTH = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE
