import type * as THREE from 'three'

/** Block type = registry id (string). All placeable/terrain block ids from block-registry. */
export type BlockType = string

/** Biomes for terrain and block placement. Highland biomes are height-resolved from mountain/snow regions. */
export type Biome =
  | 'plains'
  | 'ocean'
  | 'river'
  | 'frozen_river'
  | 'beach'
  | 'stony_shore'
  | 'snowy_beach'
  | 'desert'
  | 'savanna'
  | 'forest'
  | 'jungle'
  | 'mountain'
  | 'snow'
  | 'meadow'
  | 'grove'
  | 'snowy_slopes'
  | 'stony_peaks'
  | 'frozen_peaks'
  | 'jagged_peaks'
  | 'cherry_grove'
  | 'windswept_hills'
  | 'windswept_gravelly_hills'
  | 'windswept_forest'
  | 'badlands'
  | 'mushroom_fields'
  | 'mangrove_swamp'
  | 'old_growth_taiga'

/** Integer block position in world space. */
export type BlockPos = { x: number; y: number; z: number }

/** Chunk container: group with InstancedMeshes + position arrays for mining. */
export interface ChunkData {
  group: THREE.Group
  /** Chunk coordinates (for frustum/iteration without parsing key). */
  cx: number
  cz: number
  /** O(1) block lookup by local key (localKey(lx, ly, lz)). Used for voxel collision. */
  voxelMap: Map<number, BlockType>
  /** Visible block positions per block type (for raycast/mining). */
  blockPositionsByType: Map<BlockType, BlockPos[]>
  /** Surface heightmap (row-major: lx + lz * CHUNK_SIZE) for map/minimap rendering. Present when payload had heightmap. */
  heightmapBuffer?: Float32Array
  /** Biome index per column (row-major), index into terrain ALL_BIOMES. Used for map coloring. */
  biomeMapBuffer?: Uint8Array
  /** Sky light 0–15 per block (same layout as voxel localKey). Used for spawn and lighting. */
  skyLightBuffer?: Uint8Array
}

/** Tree noise caches per chunk (key: "wx,wz"). */
export type TreeNoiseCaches = {
  treePlacement: Map<string, number>
  forestDensity: Map<string, number>
}
