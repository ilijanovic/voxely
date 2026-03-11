/**
 * Block type to byte id mapping for pipeline voxel buffer.
 * Terrain-only block types; order is fixed for deterministic ids.
 */
import type { BlockType } from '../types'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../constants'

export const AIR_ID = 0
/** Sentinel: position was carved by cave noise; leave as air (do not fill in stratigraphy). */
export const CARVED_ID = 255

/** All block types that can appear in terrain generation (order defines id). */
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
]

/** BlockType at id (id 0 = air, not in this array). Index = id - 1 for id >= 1. */
export const ID_TO_TYPE: (BlockType | 'air')[] = [...TERRAIN_BLOCK_TYPES]

const TYPE_TO_ID_MAP = new Map<BlockType | 'air', number>()
TERRAIN_BLOCK_TYPES.forEach((t, i) => TYPE_TO_ID_MAP.set(t, i))

export function typeToId(type: BlockType | 'air'): number {
  const id = TYPE_TO_ID_MAP.get(type)
  if (id !== undefined) return id
  return AIR_ID
}

export function idToType(id: number): BlockType | 'air' {
  if (id === 0 || id === CARVED_ID) return 'air'
  const t = TERRAIN_BLOCK_TYPES[id]
  return t ?? 'air'
}

/** Block height in world units (1 = full block). Snow layers 1–8 use 1/8 … 8/8. */
export function getBlockHeightById(id: number): number {
  if (id >= 12 && id <= 19) return (id - 11) / 8 // snow_layer_1..8 at indices 12..19
  return 1
}

/** Local key for flat voxel buffer: lx + ly*CHUNK_SIZE + lz*CHUNK_SIZE*WORLD_HEIGHT. */
export function localKey(lx: number, ly: number, lz: number): number {
  return lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * WORLD_HEIGHT
}

export const VOXEL_BUFFER_LENGTH = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE
