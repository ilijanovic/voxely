import type * as THREE from "three";

/** Block type = registry id (string). All placeable/terrain block ids from block-registry. */
export type BlockType = string;

/** Biomes for terrain and block placement. Highland biomes (meadow, grove, snowy_slopes) are height-resolved from mountain/snow. */
export type Biome = "plains" | "desert" | "forest" | "jungle" | "mountain" | "snow" | "meadow" | "grove" | "snowy_slopes";

/** Integer block position in world space. */
export type BlockPos = { x: number; y: number; z: number };

/** Chunk container: group with InstancedMeshes + position arrays for mining. */
export interface ChunkData {
  group: THREE.Group;
  /** Chunk coordinates (for frustum/iteration without parsing key). */
  cx: number;
  cz: number;
  /** O(1) block lookup by local key (localKey(lx, ly, lz)). Used for voxel collision. */
  voxelMap: Map<number, BlockType>;
  /** Visible block positions per block type (for raycast/mining). */
  blockPositionsByType: Map<BlockType, BlockPos[]>;
}

/** Tree noise caches per chunk (key: "wx,wz"). */
export type TreeNoiseCaches = {
  treePlacement: Map<string, number>;
  forestDensity: Map<string, number>;
};
